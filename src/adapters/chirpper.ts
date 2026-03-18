import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";

export interface StructuredLogEvent {
  runId: string;
  adapter: "chirpper";
  level: "info" | "error";
  step: string;
  status: "started" | "passed" | "failed";
  timestamp: string;
  details?: Record<string, unknown>;
}

export interface HealthcheckResult {
  ok: boolean;
  status: number;
  url: string;
  payload: unknown;
}

export interface SmokeResult {
  ok: boolean;
  homepageUrl: string;
  inviteUrl: string;
  finalUrl: string;
  successSignals: string[];
  testBranch: SmokeTestBranch;
  sessionMode: SmokeSessionMode;
  tokenStatePersisted: boolean;
  screenshots: SmokeScreenshot[];
  consoleErrors: CapturedConsoleError[];
  networkErrors: CapturedNetworkError[];
  journeyEvents: JourneyEvent[];
  journeyVerdict: JourneyVerdict;
}

export type SmokeTestBranch = "existing_token_claim" | "new_visitor_invite_claim";

export type SmokeSessionMode = "restored_identity" | "new_identity";

export interface JourneyEvent {
  timestamp: string;
  type: "milestone" | "branch" | "block";
  name: string;
  details?: Record<string, unknown>;
}

export interface JourneyVerdict {
  appReachable: boolean;
  homepageLoaded: boolean;
  inviteFlowCompleted: boolean;
  tokenStatePersisted: boolean;
  sessionMode: SmokeSessionMode;
  firstTimeVisitor: boolean;
  identityCreated: boolean;
  inviteUnderstood: boolean;
  nextActionClear: boolean;
}

export interface SmokeScreenshot {
  label: "homepage" | "final_state";
  path: string;
}

export interface CapturedConsoleError {
  type: string;
  text: string;
  location?: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
}

export interface CapturedNetworkError {
  url: string;
  status: number;
  method: string;
  resourceType: string;
}

export interface SmokeArtifactsOptions {
  screenshotDir: string;
  screenshotBaseName: string;
}

export interface RunSmokeOptions extends SmokeArtifactsOptions {
  testBranch: SmokeTestBranch;
}

interface RestoredIdentity {
  tokenId: string;
  keyPhrase: string;
  createdAt: number;
  acknowledgedAt: number;
}

export interface ChirpperAdapterOptions {
  baseUrl: string;
  chirpperDir: string;
  headless?: boolean;
  timeoutMs?: number;
}

export interface SmokeContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export class ChirpperAdapter {
  readonly baseUrl: string;
  readonly chirpperDir: string;
  readonly headless: boolean;
  readonly timeoutMs: number;

  constructor(options: ChirpperAdapterOptions) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl);
    this.chirpperDir = options.chirpperDir;
    this.headless = options.headless ?? true;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  createRunId(): string {
    return randomUUID();
  }

  async healthcheck(): Promise<HealthcheckResult> {
    const url = new URL("/api/health", this.baseUrl).toString();
    const response = await fetch(url, {
      headers: {
        accept: "application/json"
      }
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      url,
      payload
    };
  }

  async validateInvite(token: string): Promise<InviteValidationResult> {
    const url = new URL("/api/invites/validate", this.baseUrl);
    url.searchParams.set("token", token);

    const response = await fetch(url, {
      headers: {
        accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Invite validation failed with status ${response.status}.`);
    }

    const payload = (await response.json()) as Partial<InviteValidationResult>;
    return {
      ok: Boolean(payload.ok),
      consumed: Boolean(payload.consumed),
      expired: Boolean(payload.expired),
      claimed: Boolean(payload.claimed)
    };
  }

  async createRootInvite(): Promise<string> {
    const dockerContainer = this.findDockerContainerForBaseUrl();
    const inviteUrl = dockerContainer
      ? this.createRootInviteInDocker(dockerContainer)
      : this.createRootInviteOnHost();

    const validationUrl = new URL(inviteUrl);
    const token = validationUrl.pathname.split("/").filter(Boolean).at(-1);
    if (!token) {
      throw new Error(`Generated invite URL did not contain a token: ${inviteUrl}`);
    }

    const validation = await this.validateInvite(token);
    if (!validation.ok) {
      throw new Error(
        `Generated invite was not accepted by Chirpper validation: ${inviteUrl}`
      );
    }

    return inviteUrl;
  }

  private createRootInviteOnHost(): string {
    const result = this.runCommand("npm", ["run", "invite:root", "--", "--local"], {
      cwd: this.chirpperDir,
      env: {
        ...process.env,
        SITE_ORIGIN: this.baseUrl
      }
    });

    if (result.status !== 0) {
      throw new Error(
        `Unable to create local Chirpper invite on host.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
    }

    return extractInviteUrl(`${result.stdout}\n${result.stderr}`);
  }

  private createRootInviteInDocker(containerName: string): string {
    const result = this.runCommand(
      "docker",
      [
        "exec",
        "-e",
        `SITE_ORIGIN=${this.baseUrl}`,
        containerName,
        "sh",
        "-lc",
        "cd /app && npm run invite:root -- --local"
      ],
      { cwd: this.chirpperDir }
    );

    if (result.status !== 0) {
      throw new Error(
        `Unable to create local Chirpper invite in Docker container ${containerName}.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
    }

    return extractInviteUrl(`${result.stdout}\n${result.stderr}`);
  }

  private findDockerContainerForBaseUrl(): string | null {
    const base = new URL(this.baseUrl);
    const hostname = base.hostname;
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return null;
    }

    const port = base.port || (base.protocol === "https:" ? "443" : "80");
    const result = this.runCommand(
      "docker",
      ["ps", "--format", "{{.Names}}\t{{.Ports}}"],
      { cwd: this.chirpperDir }
    );

    if (result.status !== 0) {
      return null;
    }

    for (const line of result.stdout.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }

      const [name, ports = ""] = line.split("\t");
      if (ports.includes(`:${port}->`)) {
        return name.trim();
      }
    }

    return null;
  }

  private runCommand(
    command: string,
    args: string[],
    options: { cwd: string; env?: NodeJS.ProcessEnv }
  ): SpawnResult {
    const result = spawnSync(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      encoding: "utf8"
    });

    return {
      status: result.status,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? ""
    };
  }

  async openBrowser(): Promise<SmokeContext> {
    const browser = await chromium.launch({
      headless: this.headless
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(this.timeoutMs);
    page.setDefaultTimeout(this.timeoutMs);
    return { browser, context, page };
  }

  async runSmoke(page: Page, inviteUrl: string, options: RunSmokeOptions): Promise<SmokeResult> {
    const homepageUrl = new URL("/", this.baseUrl).toString();
    const successSignals: string[] = [];
    const consoleErrors: CapturedConsoleError[] = [];
    const networkErrors: CapturedNetworkError[] = [];
    const screenshots: SmokeScreenshot[] = [];
    const journeyEvents: JourneyEvent[] = [];

    page.on("console", (message) => {
      if (message.type() !== "error") {
        return;
      }

      const location = message.location();
      consoleErrors.push({
        type: message.type(),
        text: message.text(),
        location: location.url || location.lineNumber || location.columnNumber
          ? {
              url: location.url,
              lineNumber: location.lineNumber,
              columnNumber: location.columnNumber
            }
          : undefined
      });
    });

    page.on("response", (response) => {
      if (response.status() < 400) {
        return;
      }

      networkErrors.push({
        url: response.url(),
        status: response.status(),
        method: response.request().method(),
        resourceType: response.request().resourceType()
      });
    });

    try {
      switch (options.testBranch) {
        case "new_visitor_invite_claim":
          return await this.runNewVisitorInviteClaim(page, inviteUrl, {
            homepageUrl,
            successSignals,
            screenshots,
            consoleErrors,
            networkErrors,
            journeyEvents,
            artifacts: options
          });
        case "existing_token_claim":
        default:
          return await this.runExistingTokenClaim(page, inviteUrl, {
            homepageUrl,
            successSignals,
            screenshots,
            consoleErrors,
            networkErrors,
            journeyEvents,
            artifacts: options
          });
      }
    } catch (error) {
      const tokenStatePersisted = await this.hasPersistedIdentity(page).catch(() => false);
      if (!screenshots.some((screenshot) => screenshot.label === "final_state")) {
        try {
          screenshots.push(
            await this.captureScreenshot(page, options, "final_state")
          );
        } catch {
          // Best-effort only. The failure artifact should still be written.
        }
      }

      const homepageLoaded = successSignals.includes("homepage_title:chirpper");
      const inviteUnderstood =
        successSignals.includes("invite_understanding:explanation_visible") ||
        journeyEvents.some((event) => event.name === "existing_invite_explainer_visible");
      const nextActionClear =
        successSignals.includes("next_action:explained") ||
        journeyEvents.some((event) => event.name === "next_action_selected");
      const inviteFlowCompleted =
        successSignals.includes("token_copy:unlock_invite_wallet") ||
        successSignals.includes("token_page:visible");
      const identityCreated = successSignals.includes("identity_created:claimed_invite");
      const sessionMode =
        options.testBranch === "new_visitor_invite_claim"
          ? "new_identity"
          : "restored_identity";

      return {
        ok: false,
        homepageUrl,
        inviteUrl,
        finalUrl: page.url(),
        successSignals,
        testBranch: options.testBranch,
        sessionMode,
        tokenStatePersisted,
        screenshots,
        consoleErrors,
        networkErrors,
        journeyEvents: appendJourneyEvent(journeyEvents, {
          type: "block",
          name: "journey_failed",
          details: {
            error: error instanceof Error ? error.message : "Unknown smoke journey failure."
          }
        }),
        journeyVerdict: {
          appReachable: homepageLoaded,
          homepageLoaded,
          inviteFlowCompleted,
          tokenStatePersisted,
          sessionMode,
          firstTimeVisitor: options.testBranch === "new_visitor_invite_claim",
          identityCreated,
          inviteUnderstood,
          nextActionClear
        }
      };
    }
  }

  private async runExistingTokenClaim(
    page: Page,
    inviteUrl: string,
    state: RunSmokeState
  ): Promise<SmokeResult> {
    await this.loadHomepage(page, state);
    appendJourneyEvent(state.journeyEvents, {
      type: "branch",
      name: "journey_selected",
      details: {
        testBranch: "existing_token_claim"
      }
    });

    const restoredIdentity = buildRestoredIdentity();
    await page.evaluate((identity) => {
      window.localStorage.setItem("chirpper_identity_token", JSON.stringify(identity));
    }, restoredIdentity);
    state.successSignals.push("identity_seeded:local_storage");
    appendJourneyEvent(state.journeyEvents, {
      type: "milestone",
      name: "restored_identity_seeded",
      details: {
        tokenId: restoredIdentity.tokenId
      }
    });

    await page.goto(inviteUrl, { waitUntil: "domcontentloaded" });
    await this.requireVisible(
      page.getByRole("heading", { name: "Claim this invite" }),
      state.journeyEvents,
      "existing_invite_heading_visible"
    );
    await this.requireVisible(
      page.getByText(/Claiming adds the invite to your wallet\./i),
      state.journeyEvents,
      "existing_invite_explainer_visible"
    );
    state.successSignals.push("invite_heading:claim_this_invite");
    appendJourneyEvent(state.journeyEvents, {
      type: "branch",
      name: "visitor_mode_detected",
      details: {
        sessionMode: "restored_identity"
      }
    });
    appendJourneyEvent(state.journeyEvents, {
      type: "branch",
      name: "next_action_selected",
      details: {
        action: "save_invite_for_later"
      }
    });

    await page.getByRole("button", { name: "Save invite for later" }).click();
    await page.waitForURL(/\/token(\?|$)/);
    await this.requireVisible(
      page.getByText(/Unlock the invite wallet/i),
      state.journeyEvents,
      "existing_final_token_page_visible"
    );
    state.successSignals.push("redirect:/token");
    state.successSignals.push("token_copy:unlock_invite_wallet");
    state.screenshots.push(
      await this.captureScreenshot(page, state.artifacts, "final_state")
    );

    const tokenStatePersisted = await this.hasPersistedIdentity(page);
    const journeyVerdict: JourneyVerdict = {
      appReachable: true,
      homepageLoaded: true,
      inviteFlowCompleted: true,
      tokenStatePersisted,
      sessionMode: "restored_identity",
      firstTimeVisitor: false,
      identityCreated: false,
      inviteUnderstood: true,
      nextActionClear: true
    };

    return {
      ok:
        tokenStatePersisted &&
        state.consoleErrors.length === 0 &&
        state.networkErrors.length === 0,
      homepageUrl: state.homepageUrl,
      inviteUrl,
      finalUrl: page.url(),
      successSignals: state.successSignals,
      testBranch: "existing_token_claim",
      sessionMode: "restored_identity",
      tokenStatePersisted,
      screenshots: state.screenshots,
      consoleErrors: state.consoleErrors,
      networkErrors: state.networkErrors,
      journeyEvents: state.journeyEvents,
      journeyVerdict
    };
  }

  private async runNewVisitorInviteClaim(
    page: Page,
    inviteUrl: string,
    state: RunSmokeState
  ): Promise<SmokeResult> {
    await this.loadHomepage(page, state);
    const cleanContext = await this.readIdentityState(page);
    if (cleanContext.hasStoredIdentity || cleanContext.hasSessionCookie) {
      appendJourneyEvent(state.journeyEvents, {
        type: "block",
        name: "clean_context_check_failed",
        details: cleanContext
      });
      throw new Error("New visitor journey did not start from a clean browser context.");
    }
    appendJourneyEvent(state.journeyEvents, {
      type: "milestone",
      name: "clean_context_verified",
      details: cleanContext
    });
    state.successSignals.push("clean_context:no_identity");
    appendJourneyEvent(state.journeyEvents, {
      type: "branch",
      name: "journey_selected",
      details: {
        testBranch: "new_visitor_invite_claim"
      }
    });

    await page.goto(inviteUrl, { waitUntil: "domcontentloaded" });
    await this.requireVisible(
      page.getByRole("heading", { name: "Claim this Chirpper invite" }),
      state.journeyEvents,
      "new_visitor_invite_heading_visible"
    );
    state.successSignals.push("invite_heading:claim_this_chirpper_invite");
    appendJourneyEvent(state.journeyEvents, {
      type: "branch",
      name: "visitor_mode_detected",
      details: {
        sessionMode: "new_identity"
      }
    });

    await this.requireVisible(
      page.getByText(/Opening this page only lets you review the invitation\./i),
      state.journeyEvents,
      "invite_review_explanation_visible"
    );
    await this.requireVisible(
      page.getByText(/Nothing becomes yours until you claim it\./i),
      state.journeyEvents,
      "invite_claim_importance_visible"
    );
    await this.requireVisible(
      page.getByRole("heading", { name: "Future token and key phrase" }),
      state.journeyEvents,
      "future_identity_panel_visible"
    );
    await this.requireVisible(
      page.getByText(/Both buttons below claim this invite and add it to your wallet\./i),
      state.journeyEvents,
      "next_action_explainer_visible"
    );
    state.successSignals.push("invite_understanding:explanation_visible");
    state.successSignals.push("identity_preview:visible");
    state.successSignals.push("next_action:explained");

    await page.getByLabel("I saved my token and key phrase.").check();
    appendJourneyEvent(state.journeyEvents, {
      type: "milestone",
      name: "identity_acknowledged"
    });
    appendJourneyEvent(state.journeyEvents, {
      type: "branch",
      name: "next_action_selected",
      details: {
        action: "save_invite_for_later"
      }
    });

    await page.getByRole("button", { name: "Save invite for later" }).click();
    await page.waitForURL(/\/token\?invite_saved=1$/);
    state.successSignals.push("redirect:/token");
    state.successSignals.push("identity_created:claimed_invite");
    await this.requireVisible(
      page.getByRole("heading", { name: "Token Page" }),
      state.journeyEvents,
      "new_visitor_final_token_page_visible"
    );
    state.successSignals.push("token_page:visible");
    state.screenshots.push(
      await this.captureScreenshot(page, state.artifacts, "final_state")
    );

    const tokenStatePersisted = await this.hasPersistedIdentity(page);
    if (tokenStatePersisted) {
      appendJourneyEvent(state.journeyEvents, {
        type: "milestone",
        name: "identity_persisted_after_claim"
      });
    }

    const journeyVerdict: JourneyVerdict = {
      appReachable: true,
      homepageLoaded: true,
      inviteFlowCompleted: true,
      tokenStatePersisted,
      sessionMode: "new_identity",
      firstTimeVisitor: true,
      identityCreated: tokenStatePersisted,
      inviteUnderstood: true,
      nextActionClear: true
    };

    return {
      ok:
        tokenStatePersisted &&
        state.consoleErrors.length === 0 &&
        state.networkErrors.length === 0,
      homepageUrl: state.homepageUrl,
      inviteUrl,
      finalUrl: page.url(),
      successSignals: state.successSignals,
      testBranch: "new_visitor_invite_claim",
      sessionMode: "new_identity",
      tokenStatePersisted,
      screenshots: state.screenshots,
      consoleErrors: state.consoleErrors,
      networkErrors: state.networkErrors,
      journeyEvents: state.journeyEvents,
      journeyVerdict
    };
  }

  private async loadHomepage(page: Page, state: RunSmokeState): Promise<void> {
    await page.goto(state.homepageUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.title.includes("Chirpper"));
    await this.requireVisible(
      page.getByRole("link", { name: "Home", exact: true }),
      state.journeyEvents,
      "homepage_home_nav_visible"
    );
    await this.requireVisible(
      page.getByRole("link", { name: "Invites", exact: true }),
      state.journeyEvents,
      "homepage_invites_nav_visible"
    );
    state.screenshots.push(
      await this.captureScreenshot(page, state.artifacts, "homepage")
    );
    state.successSignals.push("homepage_title:chirpper");
    state.successSignals.push("homepage_nav:home");
    state.successSignals.push("homepage_nav:invites");
    appendJourneyEvent(state.journeyEvents, {
      type: "milestone",
      name: "homepage_loaded",
      details: {
        url: page.url()
      }
    });
  }

  private async requireVisible(
    locator: Locator,
    journeyEvents: JourneyEvent[],
    eventName: string
  ): Promise<void> {
    try {
      await locator.waitFor();
      appendJourneyEvent(journeyEvents, {
        type: "milestone",
        name: eventName
      });
    } catch (error) {
      appendJourneyEvent(journeyEvents, {
        type: "block",
        name: eventName,
        details: {
          error: error instanceof Error ? error.message : "Element did not become visible."
        }
      });
      throw error;
    }
  }

  private async hasPersistedIdentity(page: Page): Promise<boolean> {
    return page.evaluate(() =>
      window.localStorage.getItem("chirpper_identity_token") !== null
    );
  }

  private async readIdentityState(page: Page): Promise<{
    hasStoredIdentity: boolean;
    hasSessionCookie: boolean;
  }> {
    const hasStoredIdentity = await this.hasPersistedIdentity(page);
    const cookies = await page.context().cookies(this.baseUrl);
    return {
      hasStoredIdentity,
      hasSessionCookie: cookies.some((cookie) => cookie.name.includes("chirpper-session"))
    };
  }

  private async captureScreenshot(
    page: Page,
    artifacts: SmokeArtifactsOptions,
    label: SmokeScreenshot["label"]
  ): Promise<SmokeScreenshot> {
    const filename = `${artifacts.screenshotBaseName}-${label}.png`;
    const outputPath = path.join(artifacts.screenshotDir, filename);
    await page.screenshot({
      path: outputPath,
      fullPage: true
    });

    return {
      label,
      path: outputPath
    };
  }
}

interface RunSmokeState {
  homepageUrl: string;
  successSignals: string[];
  screenshots: SmokeScreenshot[];
  consoleErrors: CapturedConsoleError[];
  networkErrors: CapturedNetworkError[];
  journeyEvents: JourneyEvent[];
  artifacts: SmokeArtifactsOptions;
}

export function createDefaultChirpperDir(): string {
  return path.resolve(process.cwd(), "..", "chirpper");
}

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

interface InviteValidationResult {
  ok: boolean;
  consumed: boolean;
  expired: boolean;
  claimed: boolean;
}

interface SpawnResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function extractInviteUrl(output: string): string {
  const match = output.match(/Root invite URL:\s*(https?:\/\/\S+)/i);
  if (!match) {
    throw new Error(`Could not parse root invite URL from Chirpper output:\n${output}`);
  }

  return match[1];
}

function buildRestoredIdentity(): RestoredIdentity {
  const keyPhrase = "amber apple atlas bamboo beacon birch";
  const normalizedKeyPhrase = keyPhrase.toLowerCase().replace(/\s+/g, " ").trim();
  const tokenId = createHash("sha256")
    .update(`chirpper-token:${normalizedKeyPhrase}`)
    .digest("hex")
    .slice(0, 20);
  const now = Date.now();

  return {
    tokenId,
    keyPhrase,
    createdAt: now,
    acknowledgedAt: now
  };
}

function appendJourneyEvent(
  journeyEvents: JourneyEvent[],
  event: Omit<JourneyEvent, "timestamp">
): JourneyEvent[] {
  journeyEvents.push({
    timestamp: new Date().toISOString(),
    ...event
  });
  return journeyEvents;
}
