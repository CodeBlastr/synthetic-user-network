import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import {
  ChirpperAdapter,
  type CapturedConsoleError,
  type CapturedNetworkError,
  createDefaultChirpperDir,
  type JourneyEvent,
  type SmokeResult,
  type SmokeScreenshot,
  type SmokeTestBranch,
  type StructuredLogEvent
} from "../adapters/chirpper.js";

loadEnv();

const baseUrl = process.env.CHIRPPER_BASE_URL ?? "http://localhost:3000";
const chirpperDir =
  process.env.CHIRPPER_DIR ?? createDefaultChirpperDir();
const headless = process.env.HEADLESS !== "false";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "30000");
const testBranch = parseSmokeTestBranch(
  process.env.SUN_SMOKE_PATH ?? process.env.SMOKE_TEST_BRANCH
);
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

async function main() {
  const runId = adapter.createRunId();
  const runStartedAt = new Date();
  const startedAt = runStartedAt.getTime();
  const artifactStem = formatArtifactStem(runStartedAt);
  const jsonArtifactPath = path.join(runsDir, `${artifactStem}.json`);
  const markdownArtifactPath = path.join(runsDir, `${artifactStem}.md`);
  let browserClosed = false;
  let smokeContext: Awaited<ReturnType<typeof adapter.openBrowser>> | null = null;
  let healthcheckOk = false;
  let smokeResult: SmokeResult | null = null;
  let inviteUrl: string | null = null;
  let failureMessage: string | null = null;
  let currentPageUrl: string | null = null;
  const stepRecords: RunStepRecord[] = [];

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

    recordImmediateStep(stepRecords, "config", "passed");
    log({
      level: "info",
      step: "config",
      status: "passed",
      details: {
        baseUrl,
        chirpperDir: path.resolve(chirpperDir),
        testBranch,
        headless,
        timeoutMs
      }
    });

    const health = await timed("healthcheck", log, stepRecords, () =>
      adapter.healthcheck()
    );
    healthcheckOk = health.ok;
    if (!health.ok) {
      throw new Error(`Healthcheck failed with status ${health.status}.`);
    }

    inviteUrl = await timed("setup_invite", log, stepRecords, () =>
      adapter.createRootInvite()
    );

    smokeContext = await timed("open_browser", log, stepRecords, () =>
      adapter.openBrowser()
    );
    const activeSmokeContext = smokeContext;
    const activeInviteUrl = inviteUrl;
    smokeResult = await timed("browser_smoke", log, stepRecords, () =>
      adapter.runSmoke(activeSmokeContext.page, activeInviteUrl, {
        testBranch,
        screenshotDir: runsDir,
        screenshotBaseName: artifactStem
      })
    );
    currentPageUrl = activeSmokeContext.page.url();
    if (!smokeResult.ok) {
      throw new Error(buildSmokeFailureMessage(smokeResult));
    }

    await activeSmokeContext.browser.close();
    browserClosed = true;

    log({
      level: "info",
      step: "summary",
      status: "passed",
      details: {
        elapsedMs: Date.now() - startedAt,
        healthcheck: health,
        smoke: smokeResult
      }
    });
  } catch (error) {
    failureMessage =
      error instanceof Error
        ? error.message
        : "Unknown SUN smoke runner error.";
    currentPageUrl = currentPageUrl ?? smokeContext?.page.url() ?? null;

    if (smokeContext && !browserClosed) {
      await smokeContext.browser.close().catch(() => undefined);
    }

    log({
      level: "error",
      step: "summary",
      status: "failed",
      details: {
        elapsedMs: Date.now() - startedAt,
        error: failureMessage
      }
    });
    process.exitCode = 1;
  } finally {
    const endedAt = new Date();
    const runArtifact = buildRunArtifact({
      runId,
      runStartedAt,
      endedAt,
      jsonArtifactPath,
      healthcheckOk,
      baseUrl,
      stepRecords,
      smokeResult,
      inviteUrl,
      currentPageUrl,
      failureMessage
    });

    await writeFile(
      jsonArtifactPath,
      `${JSON.stringify(runArtifact, null, 2)}\n`,
      "utf8"
    );
    await writeFile(
      markdownArtifactPath,
      `${renderMarkdownScorecard(runArtifact)}\n`,
      "utf8"
    );

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

async function timed<T>(
  step: string,
  log: (event: Omit<StructuredLogEvent, "runId" | "adapter" | "timestamp">) => void,
  stepRecords: RunStepRecord[],
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = new Date();
  log({
    level: "info",
    step,
    status: "started"
  });

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
        elapsedMs: Date.now() - startedAt.getTime(),
        result
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

void main();

interface RunStepRecord {
  step: string;
  status: "passed" | "failed";
  startedAt: string;
  endedAt: string;
  elapsedMs: number;
  error?: string;
}

interface RunVerdict {
  app_reachable: boolean;
  homepage_loaded: boolean;
  invite_flow_completed: boolean;
  token_state_persisted: boolean;
  session_mode: string;
  first_time_visitor: boolean;
  identity_created: boolean;
  invite_understood: boolean;
  next_action_clear: boolean;
  overall_pass: boolean;
}

interface RunEvaluation {
  journey_status: "pass" | "blocked" | "confusing" | "broken";
  blocker_type:
    | "session_bootstrap"
    | "invite_copy"
    | "navigation"
    | "persistence"
    | "unknown";
  user_value_score: 0 | 1 | 2 | 3 | 4 | 5;
  trust_graph_readiness: 0 | 1 | 2 | 3 | 4 | 5;
  recommended_priority: "fix_now" | "fix_soon" | "monitor";
  site_readiness: "not_ready" | "ready_for_invited_entry" | "ready_for_scale";
  readiness_reason: string;
}

interface RunArtifact {
  runId: string;
  adapter: "chirpper";
  runType: "smoke";
  sunGitCommit: string | null;
  chirpperBaseUrl: string;
  testBranch: SmokeTestBranch;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  stepsAttempted: string[];
  stepsSucceeded: string[];
  stepsFailed: string[];
  stepResults: RunStepRecord[];
  inviteUrl: string | null;
  finalUrl: string | null;
  screenshotsTaken: SmokeScreenshot[];
  consoleErrors: CapturedConsoleError[];
  networkErrors: CapturedNetworkError[];
  journeyEvents: JourneyEvent[];
  failureMessage: string | null;
  verdict: RunVerdict;
  evaluation: RunEvaluation;
}

function buildRunArtifact(input: {
  runId: string;
  runStartedAt: Date;
  endedAt: Date;
  jsonArtifactPath: string;
  healthcheckOk: boolean;
  baseUrl: string;
  stepRecords: RunStepRecord[];
  smokeResult: SmokeResult | null;
  inviteUrl: string | null;
  currentPageUrl: string | null;
  failureMessage: string | null;
}): RunArtifact {
  const homepageLoaded = input.smokeResult?.journeyVerdict.homepageLoaded ?? false;
  const inviteFlowCompleted = input.smokeResult?.journeyVerdict.inviteFlowCompleted ?? false;
  const tokenStatePersisted = input.smokeResult?.journeyVerdict.tokenStatePersisted ?? false;
  const sessionMode = input.smokeResult?.journeyVerdict.sessionMode ?? "unknown";
  const stepsAttempted = input.stepRecords.map((record) => record.step);
  const stepsSucceeded = input.stepRecords
    .filter((record) => record.status === "passed")
    .map((record) => record.step);
  const stepsFailed = input.stepRecords
    .filter((record) => record.status === "failed")
    .map((record) => record.step);
  const consoleErrors = input.smokeResult?.consoleErrors ?? [];
  const networkErrors = input.smokeResult?.networkErrors ?? [];
  const firstTimeVisitor = input.smokeResult?.journeyVerdict.firstTimeVisitor ?? false;
  const identityCreated = input.smokeResult?.journeyVerdict.identityCreated ?? false;
  const inviteUnderstood = input.smokeResult?.journeyVerdict.inviteUnderstood ?? false;
  const nextActionClear = input.smokeResult?.journeyVerdict.nextActionClear ?? false;
  const overallPass =
    input.healthcheckOk &&
    homepageLoaded &&
    inviteFlowCompleted &&
    tokenStatePersisted &&
    stepsFailed.length === 0 &&
    consoleErrors.length === 0 &&
    networkErrors.length === 0;

  const artifact: RunArtifact = {
    runId: input.runId,
    adapter: "chirpper",
    runType: "smoke",
    sunGitCommit: getSunGitCommit(),
    chirpperBaseUrl: input.baseUrl,
    testBranch: input.smokeResult?.testBranch ?? "existing_token_claim",
    startedAt: input.runStartedAt.toISOString(),
    endedAt: input.endedAt.toISOString(),
    durationMs: input.endedAt.getTime() - input.runStartedAt.getTime(),
    stepsAttempted,
    stepsSucceeded,
    stepsFailed,
    stepResults: input.stepRecords,
    inviteUrl: input.inviteUrl,
    finalUrl: input.smokeResult?.finalUrl ?? input.currentPageUrl,
    screenshotsTaken: relativizeScreenshots(
      input.smokeResult?.screenshots ?? [],
      path.dirname(input.jsonArtifactPath)
    ),
    consoleErrors,
    networkErrors,
    journeyEvents: input.smokeResult?.journeyEvents ?? [],
    failureMessage: input.failureMessage,
    verdict: {
      app_reachable: input.healthcheckOk,
      homepage_loaded: homepageLoaded,
      invite_flow_completed: inviteFlowCompleted,
      token_state_persisted: tokenStatePersisted,
      session_mode: sessionMode,
      first_time_visitor: firstTimeVisitor,
      identity_created: identityCreated,
      invite_understood: inviteUnderstood,
      next_action_clear: nextActionClear,
      overall_pass: overallPass
    },
    evaluation: {
      journey_status: "broken",
      blocker_type: "unknown",
      user_value_score: 0,
      trust_graph_readiness: 0,
      recommended_priority: "fix_now",
      site_readiness: "not_ready",
      readiness_reason: "Pending evaluation."
    }
  };

  artifact.evaluation = evaluateArtifact(artifact);
  return artifact;
}

function relativizeScreenshots(
  screenshots: SmokeScreenshot[],
  baseDir: string
): SmokeScreenshot[] {
  return screenshots.map((screenshot) => ({
    ...screenshot,
    path: path.relative(baseDir, screenshot.path) || path.basename(screenshot.path)
  }));
}

function renderMarkdownScorecard(artifact: RunArtifact): string {
  const verdict = artifact.verdict;
  const evaluation = artifact.evaluation;
  const screenshotLines =
    artifact.screenshotsTaken.length > 0
      ? artifact.screenshotsTaken
          .map((screenshot) => `- ${screenshot.label}: ${screenshot.path}`)
          .join("\n")
      : "- none";
  const consoleErrorLine =
    artifact.consoleErrors.length > 0 ? String(artifact.consoleErrors.length) : "0";
  const networkErrorLine =
    artifact.networkErrors.length > 0 ? String(artifact.networkErrors.length) : "0";

  return [
    `# SUN Run Scorecard`,
    ``,
    `- Run ID: \`${artifact.runId}\``,
    `- Started: \`${artifact.startedAt}\``,
    `- Ended: \`${artifact.endedAt}\``,
    `- SUN commit: \`${artifact.sunGitCommit ?? "unknown"}\``,
    `- Chirpper base URL: \`${artifact.chirpperBaseUrl}\``,
    `- Test branch: \`${artifact.testBranch}\``,
    `- Session mode: \`${verdict.session_mode}\``,
    `- Overall pass: \`${verdict.overall_pass ? "yes" : "no"}\``,
    `- Journey status: \`${evaluation.journey_status}\``,
    `- Blocker type: \`${evaluation.blocker_type}\``,
    `- User value score: \`${evaluation.user_value_score}/5\``,
    `- Trust graph readiness: \`${evaluation.trust_graph_readiness}/5\``,
    `- Recommended priority: \`${evaluation.recommended_priority}\``,
    `- Site readiness: \`${evaluation.site_readiness}\``,
    `- Final URL: \`${artifact.finalUrl ?? "n/a"}\``,
    ``,
    `## Verdict`,
    ``,
    `- app_reachable: \`${verdict.app_reachable}\``,
    `- homepage_loaded: \`${verdict.homepage_loaded}\``,
    `- invite_flow_completed: \`${verdict.invite_flow_completed}\``,
    `- token_state_persisted: \`${verdict.token_state_persisted}\``,
    `- session_mode: \`${verdict.session_mode}\``,
    `- first_time_visitor: \`${verdict.first_time_visitor}\``,
    `- identity_created: \`${verdict.identity_created}\``,
    `- invite_understood: \`${verdict.invite_understood}\``,
    `- next_action_clear: \`${verdict.next_action_clear}\``,
    `- overall_pass: \`${verdict.overall_pass}\``,
    ``,
    `## Evaluation`,
    ``,
    `- journey_status: \`${evaluation.journey_status}\``,
    `- blocker_type: \`${evaluation.blocker_type}\``,
    `- user_value_score: \`${evaluation.user_value_score}\``,
    `- trust_graph_readiness: \`${evaluation.trust_graph_readiness}\``,
    `- recommended_priority: \`${evaluation.recommended_priority}\``,
    `- site_readiness: \`${evaluation.site_readiness}\``,
    `- readiness_reason: ${evaluation.readiness_reason}`,
    ``,
    `## Steps`,
    ``,
    `- Attempted: ${artifact.stepsAttempted.join(", ") || "none"}`,
    `- Succeeded: ${artifact.stepsSucceeded.join(", ") || "none"}`,
    `- Failed: ${artifact.stepsFailed.join(", ") || "none"}`,
    ``,
    `## Evidence`,
    ``,
    `- Screenshots:`,
    screenshotLines,
    `- Journey events: ${artifact.journeyEvents.length}`,
    `- Console errors: ${consoleErrorLine}`,
    `- Network 4xx/5xx: ${networkErrorLine}`,
    artifact.failureMessage ? `- Failure: ${artifact.failureMessage}` : `- Failure: none`
  ].join("\n");
}

function recordImmediateStep(
  stepRecords: RunStepRecord[],
  step: string,
  status: "passed" | "failed",
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

function buildSmokeFailureMessage(smokeResult: SmokeResult): string {
  const reasons: string[] = [];

  if (!smokeResult.tokenStatePersisted) {
    reasons.push("token state was not persisted");
  }
  if (smokeResult.consoleErrors.length > 0) {
    reasons.push(`${smokeResult.consoleErrors.length} console error(s)`);
  }
  if (smokeResult.networkErrors.length > 0) {
    reasons.push(`${smokeResult.networkErrors.length} network 4xx/5xx response(s)`);
  }
  const blockEvents = smokeResult.journeyEvents.filter((event) => event.type === "block");
  if (blockEvents.length > 0) {
    reasons.push(
      `journey block(s): ${blockEvents.map((event) => event.name).join(", ")}`
    );
  }

  return reasons.length > 0
    ? `Smoke verdict failed: ${reasons.join(", ")}.`
    : "Smoke verdict failed.";
}

function parseSmokeTestBranch(value: string | undefined): SmokeTestBranch {
  if (value === "new_visitor_invite_claim") {
    return value;
  }

  return "existing_token_claim";
}

function evaluateArtifact(artifact: RunArtifact): RunEvaluation {
  const verdict = artifact.verdict;
  const blockerType = detectBlockerType(artifact);
  const journeyStatus = detectJourneyStatus(artifact, blockerType);
  const newVisitorHardGateFailed =
    artifact.testBranch === "new_visitor_invite_claim" &&
    (!verdict.identity_created || !verdict.token_state_persisted);

  let userValueScore = scoreUserValue(artifact, journeyStatus, blockerType);
  let trustGraphReadiness = scoreTrustGraphReadiness(
    artifact,
    journeyStatus,
    blockerType
  );
  let recommendedPriority = recommendPriority(journeyStatus, blockerType);

  if (newVisitorHardGateFailed) {
    userValueScore = Math.min(userValueScore, 1) as RunEvaluation["user_value_score"];
    trustGraphReadiness = Math.min(
      trustGraphReadiness,
      1
    ) as RunEvaluation["trust_graph_readiness"];
    recommendedPriority = "fix_now";
  }

  return {
    journey_status: journeyStatus,
    blocker_type: blockerType,
    user_value_score: userValueScore,
    trust_graph_readiness: trustGraphReadiness,
    recommended_priority: recommendedPriority,
    site_readiness: newVisitorHardGateFailed
      ? "not_ready"
      : verdict.overall_pass
        ? "ready_for_invited_entry"
        : "not_ready",
    readiness_reason: newVisitorHardGateFailed
      ? "New visitor identity could not be created or persisted from an invite."
      : verdict.overall_pass
        ? "New visitor can create and persist identity from an invite in local development."
        : "Run did not meet the production-value rubric."
  };
}

function detectJourneyStatus(
  artifact: RunArtifact,
  blockerType: RunEvaluation["blocker_type"]
): RunEvaluation["journey_status"] {
  if (artifact.verdict.overall_pass) {
    return "pass";
  }

  if (
    artifact.consoleErrors.length > 0 ||
    artifact.networkErrors.length > 0 ||
    blockerType === "session_bootstrap"
  ) {
    return "blocked";
  }

  if (
    !artifact.verdict.invite_understood ||
    !artifact.verdict.next_action_clear
  ) {
    return "confusing";
  }

  if (!artifact.verdict.homepage_loaded || !artifact.verdict.app_reachable) {
    return "broken";
  }

  return "blocked";
}

function detectBlockerType(
  artifact: RunArtifact
): RunEvaluation["blocker_type"] {
  const networkUrls = artifact.networkErrors.map((error) => error.url);
  const consoleTexts = artifact.consoleErrors.map((error) => error.text.toLowerCase());

  if (
    networkUrls.some((url) => url.includes("/api/chirpper-session")) ||
    consoleTexts.some((text) => text.includes("chirpper-session"))
  ) {
    return "session_bootstrap";
  }

  if (!artifact.verdict.invite_understood) {
    return "invite_copy";
  }

  if (!artifact.verdict.next_action_clear || hasNavigationBlock(artifact.journeyEvents)) {
    return "navigation";
  }

  if (!artifact.verdict.token_state_persisted || !artifact.verdict.identity_created) {
    return "persistence";
  }

  return "unknown";
}

function hasNavigationBlock(journeyEvents: JourneyEvent[]): boolean {
  return journeyEvents.some(
    (event) =>
      event.type === "block" &&
      typeof event.details?.error === "string" &&
      String(event.details.error).toLowerCase().includes("waitforurl")
  );
}

function scoreUserValue(
  artifact: RunArtifact,
  journeyStatus: RunEvaluation["journey_status"],
  blockerType: RunEvaluation["blocker_type"]
): RunEvaluation["user_value_score"] {
  if (artifact.verdict.overall_pass) {
    return 5;
  }

  if (journeyStatus === "broken") {
    return 0;
  }

  if (
    artifact.testBranch === "new_visitor_invite_claim" &&
    blockerType === "session_bootstrap"
  ) {
    return 1;
  }

  if (journeyStatus === "blocked") {
    return artifact.verdict.invite_understood ? 2 : 1;
  }

  if (journeyStatus === "confusing") {
    return 2;
  }

  return 1;
}

function scoreTrustGraphReadiness(
  artifact: RunArtifact,
  journeyStatus: RunEvaluation["journey_status"],
  blockerType: RunEvaluation["blocker_type"]
): RunEvaluation["trust_graph_readiness"] {
  if (artifact.verdict.overall_pass) {
    return 5;
  }

  if (
    artifact.testBranch === "new_visitor_invite_claim" &&
    blockerType === "session_bootstrap"
  ) {
    return 1;
  }

  if (journeyStatus === "broken") {
    return 0;
  }

  if (journeyStatus === "blocked") {
    return 1;
  }

  if (journeyStatus === "confusing") {
    return 2;
  }

  return 1;
}

function recommendPriority(
  journeyStatus: RunEvaluation["journey_status"],
  blockerType: RunEvaluation["blocker_type"]
): RunEvaluation["recommended_priority"] {
  if (
    blockerType === "session_bootstrap" ||
    journeyStatus === "broken" ||
    journeyStatus === "blocked"
  ) {
    return "fix_now";
  }

  if (journeyStatus === "confusing") {
    return "fix_soon";
  }

  return "monitor";
}
