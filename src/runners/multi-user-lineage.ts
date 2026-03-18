import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import type { Browser, BrowserContext, Page } from "playwright";
import {
  ChirpperAdapter,
  type CapturedConsoleError,
  type CapturedNetworkError,
  createDefaultChirpperDir,
  type StructuredLogEvent
} from "../adapters/chirpper.js";

loadEnv();

const baseUrl = process.env.CHIRPPER_BASE_URL ?? "http://localhost:3000";
const chirpperDir =
  process.env.CHIRPPER_DIR ?? createDefaultChirpperDir();
const headless = process.env.HEADLESS !== "false";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "30000");
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);
const runsDir = path.join(projectRoot, "artifacts", "runs");

const adapter = new ChirpperAdapter({
  baseUrl,
  chirpperDir,
  headless,
  timeoutMs
});

type StepStatus = "passed" | "failed";

interface RunStepRecord {
  step: string;
  status: StepStatus;
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
  error?: string;
}

interface IdentityEvidence {
  actor: "A" | "B" | "C";
  token_id: string;
  identity_persisted: boolean;
  urls_reached: string[];
}

interface InviteEdgeEvidence {
  from: "A" | "B";
  to: "B" | "C";
  invite_url: string;
  source_post_id: string;
  source_post_url: string;
}

interface ContentEvidence {
  actor: "A" | "B";
  kind: "post" | "comment";
  id: string;
  url: string;
  summary: string;
  target_post_id?: string;
}

interface InteractionEvidence {
  actor: "C";
  kind: "upvote_comment";
  target_id: string;
  target_url: string;
  observed: boolean;
}

interface ScreenshotArtifact {
  label:
    | "homepage"
    | "first_claim_success"
    | "second_claim_success"
    | "final_activity_state";
  path: string;
}

interface LineageEvidence {
  lineage_established: boolean;
  multi_user_flow_completed: boolean;
  trust_graph_signal_observed: boolean;
  identities_involved: number;
  invite_edges_completed: number;
  content_objects_created: number;
  interactions_completed: number;
  lineage_summary: string[];
  identities: IdentityEvidence[];
  invite_edges: InviteEdgeEvidence[];
  content_objects: ContentEvidence[];
  interactions: InteractionEvidence[];
}

interface RunVerdict {
  app_reachable: boolean;
  lineage_established: boolean;
  multi_user_flow_completed: boolean;
  trust_graph_signal_observed: boolean;
  identities_involved: number;
  invite_edges_completed: number;
  content_objects_created: number;
  interactions_completed: number;
  overall_pass: boolean;
}

interface RunEvaluation {
  journey_status: "pass" | "blocked" | "broken";
  blocker_type: "none" | "invite_generation" | "persistence" | "interaction" | "unknown";
  user_value_score: 0 | 1 | 2 | 3 | 4 | 5;
  trust_graph_readiness: 0 | 1 | 2 | 3 | 4 | 5;
  recommended_priority: "fix_now" | "fix_soon" | "monitor";
  site_readiness: "not_ready" | "ready_for_invited_entry" | "ready_for_scale";
  readiness_reason: string;
  lineage_established: boolean;
  multi_user_flow_completed: boolean;
  trust_graph_signal_observed: boolean;
  identities_involved: number;
  invite_edges_completed: number;
  content_objects_created: number;
  interactions_completed: number;
}

interface RunArtifact {
  runId: string;
  adapter: "chirpper";
  runType: "multi_user_lineage_smoke";
  sunGitCommit: string | null;
  chirpperBaseUrl: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  stepsAttempted: string[];
  stepsSucceeded: string[];
  stepsFailed: string[];
  stepResults: RunStepRecord[];
  screenshotsTaken: ScreenshotArtifact[];
  consoleErrors: CapturedConsoleError[];
  networkErrors: CapturedNetworkError[];
  finalUrl: string | null;
  failureMessage: string | null;
  lineage: LineageEvidence;
  verdict: RunVerdict;
  evaluation: RunEvaluation;
}

interface ParticipantSession {
  actor: "A" | "B" | "C";
  page: Page;
  urlsReached: string[];
  tokenId: string;
  keyPhrase: string;
}

interface CreatedPost {
  postId: string;
  postUrl: string;
  title: string;
}

async function main() {
  const runId = adapter.createRunId();
  const runStartedAt = new Date();
  const artifactStem = formatArtifactStem(runStartedAt);
  const jsonArtifactPath = path.join(runsDir, `${artifactStem}.json`);
  const markdownArtifactPath = path.join(runsDir, `${artifactStem}.md`);
  const screenshots: ScreenshotArtifact[] = [];
  const consoleErrors: CapturedConsoleError[] = [];
  const networkErrors: CapturedNetworkError[] = [];
  const stepRecords: RunStepRecord[] = [];
  let finalUrl: string | null = null;
  let failureMessage: string | null = null;
  let lineage: LineageEvidence = emptyLineageEvidence();

  const log = (event: Omit<StructuredLogEvent, "runId" | "adapter" | "timestamp">) => {
    const payload: StructuredLogEvent = {
      runId,
      adapter: "chirpper",
      timestamp: new Date().toISOString(),
      ...event
    };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  };

  try {
    await mkdir(runsDir, { recursive: true });

    log({
      level: "info",
      step: "config",
      status: "passed",
      details: {
        baseUrl,
        chirpperDir: path.resolve(chirpperDir),
        headless,
        timeoutMs
      }
    });
    recordImmediateStep(stepRecords, "config", "passed");

    const health = await timed("healthcheck", log, stepRecords, () =>
      adapter.healthcheck()
    );
    if (!health.ok) {
      throw new Error(`Healthcheck failed with status ${health.status}.`);
    }

    const rootInviteUrl = await timed("setup_root_invite", log, stepRecords, () =>
      adapter.createRootInvite()
    );

    const smokeContext = await timed("open_browser", log, stepRecords, () =>
      adapter.openBrowser()
    );

    try {
      attachPageTelemetry(smokeContext.page, consoleErrors, networkErrors);

      await timed("run_lineage_flow", log, stepRecords, () =>
        runLineageFlow({
          browser: smokeContext.browser,
          pageA: smokeContext.page,
          rootInviteUrl,
          screenshots,
          consoleErrors,
          networkErrors,
          artifactStem,
          lineage
        })
      );
      finalUrl = smokeContext.page.url();
    } finally {
      await smokeContext.browser.close().catch(() => undefined);
    }
  } catch (error) {
    failureMessage =
      error instanceof Error
        ? error.message
        : "Unknown multi-user lineage runner error.";
    process.exitCode = 1;
  } finally {
    const endedAt = new Date();
    const artifact = buildArtifact({
      runId,
      runStartedAt,
      endedAt,
      stepRecords,
      screenshots,
      consoleErrors,
      networkErrors,
      finalUrl,
      failureMessage,
      lineage
    });

    await writeFile(jsonArtifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await writeFile(markdownArtifactPath, `${renderMarkdownScorecard(artifact)}\n`, "utf8");

    log({
      level: "info",
      step: "artifacts",
      status: "passed",
      details: {
        jsonArtifactPath,
        markdownArtifactPath
      }
    });
  }
}

async function runLineageFlow(input: {
  browser: Browser;
  pageA: Page;
  rootInviteUrl: string;
  screenshots: ScreenshotArtifact[];
  consoleErrors: CapturedConsoleError[];
  networkErrors: CapturedNetworkError[];
  artifactStem: string;
  lineage: LineageEvidence;
}): Promise<LineageEvidence> {
  const {
    browser,
    pageA,
    rootInviteUrl,
    screenshots,
    consoleErrors,
    networkErrors,
    artifactStem,
    lineage
  } = input;

  const contextsToClose: BrowserContext[] = [];
  const runSuffix = artifactStem.slice(-8);

  const makePage = async (): Promise<Page> => {
    const context = await browser.newContext();
    contextsToClose.push(context);
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(timeoutMs);
    page.setDefaultTimeout(timeoutMs);
    attachPageTelemetry(page, consoleErrors, networkErrors);
    return page;
  };

  try {
    await pageA.goto(new URL("/", baseUrl).toString(), { waitUntil: "domcontentloaded" });
    await pageA.getByRole("link", { name: "Home", exact: true }).waitFor();
    screenshots.push(
      await captureScreenshot(pageA, artifactStem, "homepage")
    );

    const pageB = await makePage();
    const pageC = await makePage();

    const actorA = await claimAndContinueToPosting(pageA, rootInviteUrl, "A");
    const postA = await publishPost(
      actorA.page,
      `SUN root ${runSuffix}`,
      `Root lineage post ${runSuffix}.`
    );
    actorA.urlsReached.push(postA.postUrl);
    lineage.identities.push({
      actor: "A",
      token_id: actorA.tokenId,
      identity_persisted: await hasPersistedIdentity(actorA.page),
      urls_reached: [...actorA.urlsReached]
    });
    lineage.content_objects.push({
      actor: "A",
      kind: "post",
      id: postA.postId,
      url: postA.postUrl,
      summary: postA.title
    });

    await boostPostForInviteRewards(browser, postA.postUrl, consoleErrors, networkErrors);
    const inviteForB = await unlockWalletAndRevealInvite(actorA.page, actorA.keyPhrase);
    lineage.invite_edges.push({
      from: "A",
      to: "B",
      invite_url: inviteForB,
      source_post_id: postA.postId,
      source_post_url: postA.postUrl
    });

    const actorB = await claimAndContinueToPosting(pageB, inviteForB, "B");
    screenshots.push(
      await captureScreenshot(actorB.page, artifactStem, "first_claim_success")
    );
    const postB = await publishPost(
      actorB.page,
      `SUN middle ${runSuffix}`,
      `Middle lineage post ${runSuffix}.`
    );
    actorB.urlsReached.push(postB.postUrl);
    lineage.identities.push({
      actor: "B",
      token_id: actorB.tokenId,
      identity_persisted: await hasPersistedIdentity(actorB.page),
      urls_reached: [...actorB.urlsReached]
    });
    lineage.content_objects.push({
      actor: "B",
      kind: "post",
      id: postB.postId,
      url: postB.postUrl,
      summary: postB.title
    });

    await boostPostForInviteRewards(browser, postB.postUrl, consoleErrors, networkErrors);
    const inviteForC = await unlockWalletAndRevealInvite(actorB.page, actorB.keyPhrase);
    lineage.invite_edges.push({
      from: "B",
      to: "C",
      invite_url: inviteForC,
      source_post_id: postB.postId,
      source_post_url: postB.postUrl
    });

    const actorC = await claimAndSaveForLater(pageC, inviteForC, "C");
    screenshots.push(
      await captureScreenshot(actorC.page, artifactStem, "second_claim_success")
    );
    lineage.identities.push({
      actor: "C",
      token_id: actorC.tokenId,
      identity_persisted: await hasPersistedIdentity(actorC.page),
      urls_reached: [...actorC.urlsReached]
    });

    const commentText = `SUN lineage comment ${runSuffix}`;
    const createdComment = await createComment(actorB.page, postA.postUrl, commentText);
    lineage.content_objects.push({
      actor: "B",
      kind: "comment",
      id: createdComment.commentId,
      url: postA.postUrl,
      summary: commentText,
      target_post_id: postA.postId
    });

    const voteObserved = await upvoteComment(actorC.page, postA.postUrl, commentText);
    lineage.interactions.push({
      actor: "C",
      kind: "upvote_comment",
      target_id: createdComment.commentId,
      target_url: postA.postUrl,
      observed: voteObserved
    });
    screenshots.push(
      await captureScreenshot(actorC.page, artifactStem, "final_activity_state")
    );

    lineage.lineage_summary = [
      "A -> B -> C",
      `post created by A: ${postA.postId}`,
      `post created by B: ${postB.postId}`,
      `comment created by B on A's post: ${createdComment.commentId}`,
      "reaction created by C on B's comment"
    ];
    lineage.lineage_established = lineage.invite_edges.length === 2;
    lineage.multi_user_flow_completed =
      lineage.identities.length === 3 && lineage.content_objects.length >= 3;
    lineage.trust_graph_signal_observed = voteObserved;
    lineage.identities_involved = lineage.identities.length;
    lineage.invite_edges_completed = lineage.invite_edges.length;
    lineage.content_objects_created = lineage.content_objects.length;
    lineage.interactions_completed = lineage.interactions.filter((item) => item.observed).length;

    return lineage;
  } finally {
    for (const context of contextsToClose) {
      await context.close().catch(() => undefined);
    }
  }
}

async function claimAndContinueToPosting(
  page: Page,
  inviteUrl: string,
  actor: "A" | "B"
): Promise<ParticipantSession> {
  const localInviteUrl = normalizeToLocalUrl(inviteUrl);
  await page.goto(localInviteUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Claim this Chirpper invite" }).waitFor();

  const cards = page.locator(".chirpper-token-card");
  const tokenId = ((await cards.nth(0).locator("code").textContent()) ?? "").trim();
  const keyPhrase = ((await cards.nth(1).locator("code").textContent()) ?? "").trim();
  if (!tokenId || !keyPhrase) {
    throw new Error(`Unable to read ${actor} token identity from invite page.`);
  }

  await page.getByLabel("I saved my token and key phrase.").check();
  await page.getByRole("button", { name: "Continue to posting" }).click();
  await page.getByRole("heading", { name: "Publish a Post" }).waitFor();

  return {
    actor,
    page,
    urlsReached: [localInviteUrl, normalizeToLocalUrl(page.url())],
    tokenId,
    keyPhrase
  };
}

async function claimAndSaveForLater(
  page: Page,
  inviteUrl: string,
  actor: "C"
): Promise<ParticipantSession> {
  const localInviteUrl = normalizeToLocalUrl(inviteUrl);
  await page.goto(localInviteUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Claim this Chirpper invite" }).waitFor();

  const cards = page.locator(".chirpper-token-card");
  const tokenId = ((await cards.nth(0).locator("code").textContent()) ?? "").trim();
  const keyPhrase = ((await cards.nth(1).locator("code").textContent()) ?? "").trim();
  if (!tokenId || !keyPhrase) {
    throw new Error("Unable to read C token identity from invite page.");
  }

  await page.getByLabel("I saved my token and key phrase.").check();
  await page.getByRole("button", { name: "Save invite for later" }).click();
  await page.waitForURL(/\/token(\?invite_saved=1)?$/);

  return {
    actor,
    page,
    urlsReached: [localInviteUrl, normalizeToLocalUrl(page.url())],
    tokenId,
    keyPhrase
  };
}

async function publishPost(page: Page, title: string, body: string): Promise<CreatedPost> {
  await page.locator("#title").fill(title);
  await page.locator("#body").fill(body);
  await page.getByRole("button", { name: "Use Invite" }).click();
  await page.waitForURL(/\/p\/[^/?#]+/);
  const postUrl = normalizeToLocalUrl(page.url());
  const postId = postUrl.split("/").filter(Boolean).at(-1) ?? "";
  if (!postId) {
    throw new Error("Post creation finished without a post id in the URL.");
  }
  if (normalizeToLocalUrl(page.url()) !== page.url()) {
    await page.goto(postUrl, { waitUntil: "domcontentloaded" });
  }
  return { postId, postUrl, title };
}

async function boostPostForInviteRewards(
  browser: Browser,
  postUrl: string,
  consoleErrors: CapturedConsoleError[],
  networkErrors: CapturedNetworkError[]
): Promise<void> {
  const contexts: BrowserContext[] = [];
  try {
    for (let index = 0; index < 3; index += 1) {
      const context = await browser.newContext();
      contexts.push(context);
      const page = await context.newPage();
      page.setDefaultNavigationTimeout(timeoutMs);
      page.setDefaultTimeout(timeoutMs);
      attachPageTelemetry(page, consoleErrors, networkErrors);
      await page.goto(postUrl, { waitUntil: "domcontentloaded" });
      const upvoteButton = page.getByRole("button", { name: "Upvote" }).first();
      await upvoteButton.click();
      await page.waitForTimeout(750);
    }
  } finally {
    for (const context of contexts) {
      await context.close().catch(() => undefined);
    }
  }
}

async function unlockWalletAndRevealInvite(page: Page, keyPhrase: string): Promise<string> {
  await page.goto(new URL("/token", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "Invite Wallet" }).waitFor();
  await page.locator("#wallet-key-phrase").fill(keyPhrase);
  await page.getByRole("button", { name: /Unlock invite wallet|Refresh invite wallet/i }).click();
  await page.locator(".token-wallet-card").first().waitFor();
  await page.getByRole("button", { name: "Send Invite" }).first().click();
  await page.waitForTimeout(1500);
  const walletErrors = await page.locator(".error-text").allTextContents();
  if (walletErrors.length > 0) {
    throw new Error(walletErrors.join(" | "));
  }
  await page.locator(".token-wallet-card code").first().waitFor();
  const inviteUrl = normalizeToLocalUrl(
    ((await page.locator(".token-wallet-card code").first().textContent()) ?? "").trim()
  );
  if (!inviteUrl) {
    throw new Error("Invite URL did not render after revealing the wallet invite.");
  }
  return inviteUrl;
}

async function createComment(
  page: Page,
  postUrl: string,
  commentText: string
): Promise<{ commentId: string }> {
  await page.goto(postUrl, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Add comment").waitFor();
  await page.locator("#comment-body").fill(commentText);
  await page.getByRole("button", { name: "Post comment" }).click();
  const commentNode = page.locator("li.echo-node").filter({ hasText: commentText }).first();
  await commentNode.waitFor();
  const domId = (await commentNode.getAttribute("id")) ?? "";
  const commentId = domId.replace(/^chirp-/, "");
  if (!commentId) {
    throw new Error("Comment posted, but comment id was not discoverable.");
  }
  return { commentId };
}

async function upvoteComment(
  page: Page,
  postUrl: string,
  commentText: string
): Promise<boolean> {
  await page.goto(postUrl, { waitUntil: "domcontentloaded" });
  const commentNode = page.locator("li.echo-node").filter({ hasText: commentText }).first();
  await commentNode.waitFor();
  const upvoteButton = commentNode.getByRole("button", { name: "Upvote" });
  await upvoteButton.click();
  await page.waitForFunction(
    (text) => {
      const nodes = Array.from(document.querySelectorAll("li.echo-node"));
      const target = nodes.find((node) => node.textContent?.includes(String(text)));
      const button = target?.querySelector('button[aria-label="Upvote"]');
      return Boolean(button?.classList.contains("vote-selected"));
    },
    commentText
  );
  return true;
}

async function hasPersistedIdentity(page: Page): Promise<boolean> {
  return page.evaluate(() =>
    window.localStorage.getItem("chirpper_identity_token") !== null
  );
}

function attachPageTelemetry(
  page: Page,
  consoleErrors: CapturedConsoleError[],
  networkErrors: CapturedNetworkError[]
): void {
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
}

async function captureScreenshot(
  page: Page,
  artifactStem: string,
  label: ScreenshotArtifact["label"]
): Promise<ScreenshotArtifact> {
  const outputPath = path.join(runsDir, `${artifactStem}-${label}.png`);
  await page.screenshot({
    path: outputPath,
    fullPage: true
  });
  return {
    label,
    path: path.basename(outputPath)
  };
}

async function timed<T>(
  step: string,
  log: (event: Omit<StructuredLogEvent, "runId" | "adapter" | "timestamp">) => void,
  stepRecords: RunStepRecord[],
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = new Date();
  log({ level: "info", step, status: "started" });
  try {
    const result = await fn();
    stepRecords.push({
      step,
      status: "passed",
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt.getTime()
    });
    log({
      level: "info",
      step,
      status: "passed",
      details: {
        elapsedMs: Date.now() - startedAt.getTime()
      }
    });
    return result;
  } catch (error) {
    stepRecords.push({
      step,
      status: "failed",
      startedAt: startedAt.toISOString(),
      endedAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt.getTime(),
      error: error instanceof Error ? error.message : "Unknown step error."
    });
    log({
      level: "error",
      step,
      status: "failed",
      details: {
        elapsedMs: Date.now() - startedAt.getTime(),
        error: error instanceof Error ? error.message : "Unknown step error."
      }
    });
    throw error;
  }
}

function recordImmediateStep(
  stepRecords: RunStepRecord[],
  step: string,
  status: StepStatus,
  error?: string
): void {
  const timestamp = new Date().toISOString();
  stepRecords.push({
    step,
    status,
    startedAt: timestamp,
    endedAt: timestamp,
    elapsedMs: 0,
    error
  });
}

function buildArtifact(input: {
  runId: string;
  runStartedAt: Date;
  endedAt: Date;
  stepRecords: RunStepRecord[];
  screenshots: ScreenshotArtifact[];
  consoleErrors: CapturedConsoleError[];
  networkErrors: CapturedNetworkError[];
  finalUrl: string | null;
  failureMessage: string | null;
  lineage: LineageEvidence;
}): RunArtifact {
  const stepsAttempted = input.stepRecords.map((record) => record.step);
  const stepsSucceeded = input.stepRecords
    .filter((record) => record.status === "passed")
    .map((record) => record.step);
  const stepsFailed = input.stepRecords
    .filter((record) => record.status === "failed")
    .map((record) => record.step);
  const lineage = {
    ...input.lineage,
    identities_involved: input.lineage.identities.length,
    invite_edges_completed: input.lineage.invite_edges.length,
    content_objects_created: input.lineage.content_objects.length,
    interactions_completed: input.lineage.interactions.filter((item) => item.observed).length
  };

  const verdict: RunVerdict = {
    app_reachable: stepsSucceeded.includes("healthcheck"),
    lineage_established: lineage.lineage_established,
    multi_user_flow_completed: lineage.multi_user_flow_completed,
    trust_graph_signal_observed: lineage.trust_graph_signal_observed,
    identities_involved: lineage.identities_involved,
    invite_edges_completed: lineage.invite_edges_completed,
    content_objects_created: lineage.content_objects_created,
    interactions_completed: lineage.interactions_completed,
    overall_pass:
      lineage.lineage_established &&
      lineage.multi_user_flow_completed &&
      lineage.trust_graph_signal_observed &&
      stepsFailed.length === 0 &&
      input.consoleErrors.length === 0 &&
      input.networkErrors.length === 0
  };

  const evaluation = evaluateArtifact(verdict, input.failureMessage);

  return {
    runId: input.runId,
    adapter: "chirpper",
    runType: "multi_user_lineage_smoke",
    sunGitCommit: getSunGitCommit(),
    chirpperBaseUrl: baseUrl,
    startedAt: input.runStartedAt.toISOString(),
    endedAt: input.endedAt.toISOString(),
    durationMs: input.endedAt.getTime() - input.runStartedAt.getTime(),
    stepsAttempted,
    stepsSucceeded,
    stepsFailed,
    stepResults: input.stepRecords,
    screenshotsTaken: input.screenshots,
    consoleErrors: input.consoleErrors,
    networkErrors: input.networkErrors,
    finalUrl: input.finalUrl,
    failureMessage: input.failureMessage,
    lineage,
    verdict,
    evaluation
  };
}

function evaluateArtifact(
  verdict: RunVerdict,
  failureMessage: string | null
): RunEvaluation {
  const blockerType: RunEvaluation["blocker_type"] =
    !verdict.lineage_established
      ? "invite_generation"
      : !verdict.multi_user_flow_completed
        ? "persistence"
        : !verdict.trust_graph_signal_observed
          ? "interaction"
          : failureMessage
            ? "unknown"
            : "none";

  const journeyStatus: RunEvaluation["journey_status"] = verdict.overall_pass
    ? "pass"
    : verdict.app_reachable
      ? "blocked"
      : "broken";

  return {
    journey_status: journeyStatus,
    blocker_type: blockerType,
    user_value_score: verdict.overall_pass ? 5 : verdict.lineage_established ? 3 : 1,
    trust_graph_readiness: verdict.overall_pass ? 5 : verdict.lineage_established ? 3 : 1,
    recommended_priority: verdict.overall_pass ? "monitor" : "fix_now",
    site_readiness: verdict.overall_pass
      ? "ready_for_scale"
      : verdict.app_reachable
        ? "ready_for_invited_entry"
        : "not_ready",
    readiness_reason: verdict.overall_pass
      ? "Three-identity lineage, persistence, and trust-graph interaction all completed."
      : blockerType === "invite_generation"
        ? "Invite lineage could not be established across the three-user flow."
        : blockerType === "interaction"
          ? "Lineage existed, but the trust-graph interaction signal was not observed."
          : "The multi-user lineage flow did not complete.",
    lineage_established: verdict.lineage_established,
    multi_user_flow_completed: verdict.multi_user_flow_completed,
    trust_graph_signal_observed: verdict.trust_graph_signal_observed,
    identities_involved: verdict.identities_involved,
    invite_edges_completed: verdict.invite_edges_completed,
    content_objects_created: verdict.content_objects_created,
    interactions_completed: verdict.interactions_completed
  };
}

function renderMarkdownScorecard(artifact: RunArtifact): string {
  const screenshotLines =
    artifact.screenshotsTaken.length > 0
      ? artifact.screenshotsTaken
          .map((screenshot) => `- ${screenshot.label}: ${screenshot.path}`)
          .join("\n")
      : "- none";

  return [
    `# SUN Multi-User Lineage Scorecard`,
    ``,
    `- Run ID: \`${artifact.runId}\``,
    `- Started: \`${artifact.startedAt}\``,
    `- Ended: \`${artifact.endedAt}\``,
    `- SUN commit: \`${artifact.sunGitCommit ?? "unknown"}\``,
    `- Chirpper base URL: \`${artifact.chirpperBaseUrl}\``,
    `- Overall pass: \`${artifact.verdict.overall_pass}\``,
    `- Final URL: \`${artifact.finalUrl ?? "n/a"}\``,
    ``,
    `## Evaluation`,
    ``,
    `- journey_status: \`${artifact.evaluation.journey_status}\``,
    `- blocker_type: \`${artifact.evaluation.blocker_type}\``,
    `- site_readiness: \`${artifact.evaluation.site_readiness}\``,
    `- lineage_established: \`${artifact.evaluation.lineage_established}\``,
    `- multi_user_flow_completed: \`${artifact.evaluation.multi_user_flow_completed}\``,
    `- trust_graph_signal_observed: \`${artifact.evaluation.trust_graph_signal_observed}\``,
    `- identities_involved: \`${artifact.evaluation.identities_involved}\``,
    `- invite_edges_completed: \`${artifact.evaluation.invite_edges_completed}\``,
    `- content_objects_created: \`${artifact.evaluation.content_objects_created}\``,
    `- interactions_completed: \`${artifact.evaluation.interactions_completed}\``,
    `- readiness_reason: ${artifact.evaluation.readiness_reason}`,
    ``,
    `## Lineage Summary`,
    ``,
    ...artifact.lineage.lineage_summary.map((line) => `- ${line}`),
    ``,
    `## Screenshots`,
    ``,
    screenshotLines,
    ``,
    `## Evidence Counts`,
    ``,
    `- console_errors: \`${artifact.consoleErrors.length}\``,
    `- network_4xx_5xx: \`${artifact.networkErrors.length}\``,
    artifact.failureMessage ? `- failure: ${artifact.failureMessage}` : `- failure: none`
  ].join("\n");
}

function emptyLineageEvidence(): LineageEvidence {
  return {
    lineage_established: false,
    multi_user_flow_completed: false,
    trust_graph_signal_observed: false,
    identities_involved: 0,
    invite_edges_completed: 0,
    content_objects_created: 0,
    interactions_completed: 0,
    lineage_summary: [],
    identities: [],
    invite_edges: [],
    content_objects: [],
    interactions: []
  };
}

function formatArtifactStem(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/:/g, "-");
}

function getSunGitCommit(): string | null {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: projectRoot,
    encoding: "utf8"
  });

  if (result.status !== 0) {
    return null;
  }

  return result.stdout.trim() || null;
}

function normalizeToLocalUrl(value: string): string {
  const parsed = new URL(value, baseUrl);
  return new URL(
    `${parsed.pathname}${parsed.search}${parsed.hash}`,
    baseUrl
  ).toString();
}

void main();
