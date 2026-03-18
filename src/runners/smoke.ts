import path from "node:path";
import process from "node:process";
import { config as loadEnv } from "dotenv";
import {
  ChirpperAdapter,
  createDefaultChirpperDir,
  type StructuredLogEvent
} from "../adapters/chirpper.js";

loadEnv();

const baseUrl = process.env.CHIRPPER_BASE_URL ?? "http://localhost:3000";
const chirpperDir =
  process.env.CHIRPPER_DIR ?? createDefaultChirpperDir();
const headless = process.env.HEADLESS !== "false";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "30000");

const adapter = new ChirpperAdapter({
  baseUrl,
  chirpperDir,
  headless,
  timeoutMs
});

async function main() {
  const runId = adapter.createRunId();
  const startedAt = Date.now();
  let browserClosed = false;
  let smokeContext: Awaited<ReturnType<typeof adapter.openBrowser>> | null = null;

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
    log({
      level: "info",
      step: "config",
      status: "started",
      details: {
        baseUrl,
        chirpperDir: path.resolve(chirpperDir),
        headless,
        timeoutMs
      }
    });

    const health = await timed("healthcheck", log, () => adapter.healthcheck());
    if (!health.ok) {
      throw new Error(`Healthcheck failed with status ${health.status}.`);
    }

    const inviteUrl = await timed("setup_invite", log, () => adapter.createRootInvite());

    smokeContext = await timed("open_browser", log, () => adapter.openBrowser());
    const activeSmokeContext = smokeContext;
    const smoke = await timed("browser_smoke", log, () =>
      adapter.runSmoke(activeSmokeContext.page, inviteUrl)
    );

    await activeSmokeContext.browser.close();
    browserClosed = true;

    log({
      level: "info",
      step: "summary",
      status: "passed",
      details: {
        elapsedMs: Date.now() - startedAt,
        healthcheck: health,
        smoke
      }
    });
  } catch (error) {
    if (smokeContext && !browserClosed) {
      await smokeContext.browser.close().catch(() => undefined);
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unknown SUN smoke runner error.";

    log({
      level: "error",
      step: "summary",
      status: "failed",
      details: {
        elapsedMs: Date.now() - startedAt,
        error: message
      }
    });
    process.exitCode = 1;
  }
}

async function timed<T>(
  step: string,
  log: (event: Omit<StructuredLogEvent, "runId" | "adapter" | "timestamp">) => void,
  fn: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  log({
    level: "info",
    step,
    status: "started"
  });

  try {
    const result = await fn();
    log({
      level: "info",
      step,
      status: "passed",
      details: {
        elapsedMs: Date.now() - startedAt,
        result
      }
    });
    return result;
  } catch (error) {
    log({
      level: "error",
      step,
      status: "failed",
      details: {
        elapsedMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown step error."
      }
    });
    throw error;
  }
}

void main();
