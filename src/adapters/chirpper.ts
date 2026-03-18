import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

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

  async runSmoke(page: Page, inviteUrl: string): Promise<SmokeResult> {
    const homepageUrl = new URL("/", this.baseUrl).toString();
    const successSignals: string[] = [];

    await page.goto(homepageUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.title.includes("Chirpper"));
    await page.getByRole("link", { name: "Home", exact: true }).waitFor();
    await page.getByRole("link", { name: "Invites", exact: true }).waitFor();
    successSignals.push("homepage_title:chirpper");
    successSignals.push("homepage_nav:home");
    successSignals.push("homepage_nav:invites");

    const restoredIdentity = buildRestoredIdentity();
    await page.evaluate((identity) => {
      window.localStorage.setItem("chirpper_identity_token", JSON.stringify(identity));
    }, restoredIdentity);
    successSignals.push("identity_seeded:local_storage");

    await page.goto(inviteUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("heading", { name: "Claim this invite" }).waitFor();
    successSignals.push("invite_heading:claim_this_invite");

    await page.getByRole("button", { name: "Save invite for later" }).click();

    await page.waitForURL(/\/token(\?|$)/);
    successSignals.push("redirect:/token");

    const inviteWalletText = page.getByText(/Unlock the invite wallet/i);
    await inviteWalletText.waitFor();
    successSignals.push("token_copy:unlock_invite_wallet");

    return {
      ok: true,
      homepageUrl,
      inviteUrl,
      finalUrl: page.url(),
      successSignals
    };
  }
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
