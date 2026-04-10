import { createReadStream } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { executePlan } from "./browser.js";
import { renderHomePage, renderReviewPage } from "./html.js";
import { clientJs } from "./client.js";
import { SunAiService } from "./ai.js";
import { RunEventHub, RunStore } from "./store.js";
import type { RunAnalysis, RunRecord } from "./types.js";

loadEnv();

const port = Number(process.env.PORT ?? "3020");
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifactsRoot = path.join(projectRoot, "artifacts", "runs");
const allowedHosts = (process.env.SUN_ALLOWED_HOSTS ??
  "chirpper.com,www.chirpper.com,localhost,127.0.0.1")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

const eventHub = new RunEventHub();
const store = new RunStore(artifactsRoot, eventHub);
const ai = new SunAiService();
const runningRuns = new Set<string>();

await store.ensureBaseDir();

const server = createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (request.method === "GET" && requestUrl.pathname === "/") {
      return sendHtml(response, renderHomePage());
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/health") {
      return sendJson(response, 200, {
        status: "ok",
        app: "sun-mvp",
        port,
        allowedHosts
      });
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/plans") {
      const body = await parseJsonBody(request);
      const prompt = String(body.prompt ?? "").trim();
      if (!prompt) {
        return sendJson(response, 400, {
          error: "A non-empty prompt is required."
        });
      }

      ai.ensureConfigured();
      const run = await store.create(prompt);
      try {
        const plan = await ai.createPlan(prompt);
        ensureAllowedUrl(plan.startingUrl);
        const updated = await store.setPlan(run.id, plan);
        return sendJson(response, 200, {
          run: updated
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unable to create plan.";
        await store.fail(run.id, message);
        return sendJson(response, 500, {
          error: message
        });
      }
    }

    const executeMatch = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/execute$/);
    if (request.method === "POST" && executeMatch) {
      const runId = decodeURIComponent(executeMatch[1]);
      const run = await store.load(runId);
      if (!run || !run.plan) {
        return sendJson(response, 404, {
          error: "Run or plan not found."
        });
      }
      if (runningRuns.has(runId)) {
        return sendJson(response, 409, {
          error: "Run is already executing."
        });
      }

      runningRuns.add(runId);
      void runExecution(run).finally(() => {
        runningRuns.delete(runId);
      });

      return sendJson(response, 200, {
        ok: true
      });
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/runs") {
      const runs = await store.listRuns(20);
      const summary = runs.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        status: r.status,
        prompt: r.prompt.slice(0, 80),
        runName: r.plan?.runName ?? null,
        reviewPath: r.reviewPath ?? null
      }));
      return sendJson(response, 200, { runs: summary });
    }

    const runMatch = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)$/);
    if (request.method === "GET" && runMatch) {
      const runId = decodeURIComponent(runMatch[1]);
      const run = await store.load(runId);
      if (!run) {
        return sendJson(response, 404, {
          error: "Run not found."
        });
      }
      return sendJson(response, 200, {
        run
      });
    }

    const eventMatch = requestUrl.pathname.match(/^\/api\/runs\/([^/]+)\/events$/);
    if (request.method === "GET" && eventMatch) {
      const runId = decodeURIComponent(eventMatch[1]);
      const run = await store.load(runId);
      if (!run) {
        return sendJson(response, 404, {
          error: "Run not found."
        });
      }
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive"
      });

      for (const event of run.events) {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      }

      const keepAlive = setInterval(() => {
        response.write(`: keepalive ${Date.now()}\n\n`);
      }, 15000);

      const unsubscribe = eventHub.subscribe(runId, (event) => {
        response.write(`data: ${JSON.stringify(event)}\n\n`);
      });

      request.on("close", () => {
        clearInterval(keepAlive);
        unsubscribe();
        response.end();
      });
      return;
    }

    const reviewMatch = requestUrl.pathname.match(/^\/reviews\/([^/]+)$/);
    if (request.method === "GET" && reviewMatch) {
      const runId = decodeURIComponent(reviewMatch[1]);
      const run = await store.load(runId);
      if (!run) {
        return sendHtml(response, "<h1>Run not found.</h1>", 404);
      }
      return sendHtml(response, renderReviewPage(run));
    }

    if (request.method === "GET" && requestUrl.pathname === "/sun-client.js") {
      response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
      response.end(clientJs);
      return;
    }

    const artifactMatch = requestUrl.pathname.match(/^\/artifacts\/(.+)$/);
    if (request.method === "GET" && artifactMatch) {
      const relativePath = decodeURIComponent(artifactMatch[1]);
      return sendArtifact(response, relativePath);
    }

    return sendJson(response, 404, {
      error: "Not found."
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected server error.";
    return sendJson(response, 500, {
      error: message
    });
  }
});

server.listen(port, "0.0.0.0", () => {
  process.stdout.write(`SUN MVP listening on http://0.0.0.0:${port}\n`);
});

async function runExecution(run: RunRecord): Promise<void> {
  try {
    await store.start(run.id);
    const result = await executePlan({
      runId: run.id,
      prompt: run.prompt,
      plan: run.plan!,
      runDir: store.runDirectory(run.id),
      store,
      ai
    });
    const updatedRun = await store.load(run.id);
    if (!updatedRun) {
      throw new Error(`Run ${run.id} disappeared during execution.`);
    }
    const analysis = hydrateEvidenceIds(result.analysis, updatedRun);
    await store.complete(run.id, result.outcome, result.finalUrl, analysis, `/reviews/${run.id}`);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The approved run failed unexpectedly.";
    await store.fail(run.id, message);
  }
}

function hydrateEvidenceIds(analysis: RunAnalysis, run: RunRecord): RunAnalysis {
  return {
    ...analysis,
    evidence: analysis.evidence.map((item) => ({
      ...item,
      screenshotId:
        run.screenshots.find((shot) => shot.label === item.screenshotLabel)?.id ?? ""
    }))
  };
}

function ensureAllowedUrl(value: string): void {
  const url = new URL(value);
  if (!allowedHosts.includes(url.host)) {
    throw new Error(
      `Host ${url.host} is not permitted by SUN_ALLOWED_HOSTS.`
    );
  }
}

async function sendArtifact(response: ServerResponse, relativePath: string): Promise<void> {
  const normalized = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const absolutePath = path.join(artifactsRoot, normalized);
  if (!absolutePath.startsWith(artifactsRoot)) {
    return sendJson(response, 400, {
      error: "Invalid artifact path."
    });
  }

  try {
    await access(absolutePath);
  } catch {
    return sendJson(response, 404, {
      error: "Artifact not found."
    });
  }

  response.writeHead(200, {
    "Content-Type": contentTypeForPath(absolutePath)
  });
  createReadStream(absolutePath).pipe(response);
}

async function parseJsonBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function sendHtml(response: ServerResponse, html: string, statusCode = 200): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8"
  });
  response.end(html);
}

function sendJson(response: ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function contentTypeForPath(filePath: string): string {
  if (filePath.endsWith(".png")) {
    return "image/png";
  }
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (filePath.endsWith(".json")) {
    return "application/json; charset=utf-8";
  }
  if (filePath.endsWith(".md")) {
    return "text/markdown; charset=utf-8";
  }
  return "application/octet-stream";
}
