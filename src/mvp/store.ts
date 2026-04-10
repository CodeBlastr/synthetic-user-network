import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type {
  ActionRecord,
  ExecutionOutcome,
  ExecutionPlan,
  RunAnalysis,
  RunEvent,
  RunRecord,
  RunStatus,
  ScreenshotArtifact
} from "./types.js";

export class RunEventHub {
  private readonly subscribers = new Map<string, Set<(event: RunEvent) => void>>();

  subscribe(runId: string, listener: (event: RunEvent) => void): () => void {
    const listeners = this.subscribers.get(runId) ?? new Set();
    listeners.add(listener);
    this.subscribers.set(runId, listeners);
    return () => {
      const current = this.subscribers.get(runId);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.subscribers.delete(runId);
      }
    };
  }

  publish(runId: string, event: RunEvent): void {
    const listeners = this.subscribers.get(runId);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(event);
    }
  }
}

export class RunStore {
  constructor(
    private readonly runsDir: string,
    private readonly eventHub: RunEventHub
  ) {}

  async create(prompt: string): Promise<RunRecord> {
    const runId = randomUUID();
    const now = new Date().toISOString();
    const run: RunRecord = {
      id: runId,
      prompt,
      createdAt: now,
      updatedAt: now,
      status: "planned",
      executionOutcome: "not_started",
      failureMessage: null,
      finalUrl: null,
      reviewPath: null,
      plan: null,
      screenshots: [],
      actionHistory: [],
      analysis: null,
      events: []
    };
    await this.save(run);
    return run;
  }

  async load(runId: string): Promise<RunRecord | null> {
    try {
      const content = await readFile(this.runFile(runId), "utf8");
      return JSON.parse(content) as RunRecord;
    } catch {
      return null;
    }
  }

  async setPlan(runId: string, plan: ExecutionPlan): Promise<RunRecord> {
    return this.mutate(runId, (run) => {
      run.plan = plan;
      run.status = "planned";
      return this.pushEvent(run, {
        type: "plan_created",
        message: `Plan ready for ${plan.runName}.`,
        data: {
          startingUrl: plan.startingUrl,
          stepCount: plan.steps.length
        }
      });
    });
  }

  async start(runId: string): Promise<RunRecord> {
    return this.mutate(runId, (run) => {
      run.status = "running";
      run.executionOutcome = "not_started";
      return this.pushEvent(run, {
        type: "run_started",
        message: "Execution started."
      });
    });
  }

  async addProgress(
    runId: string,
    message: string,
    data?: Record<string, unknown>
  ): Promise<RunRecord> {
    return this.mutate(runId, (run) =>
      this.pushEvent(run, {
        type: "run_progress",
        message,
        data
      })
    );
  }

  async addScreenshot(runId: string, screenshot: ScreenshotArtifact): Promise<RunRecord> {
    return this.mutate(runId, (run) => {
      run.screenshots.push(screenshot);
      return this.pushEvent(run, {
        type: "screenshot_captured",
        message: `Captured ${screenshot.label}.`,
        data: {
          screenshot
        }
      });
    });
  }

  async addAction(runId: string, action: ActionRecord): Promise<RunRecord> {
    return this.mutate(runId, (run) => {
      run.actionHistory.push(action);
      return run;
    });
  }

  async complete(
    runId: string,
    outcome: ExecutionOutcome,
    finalUrl: string | null,
    analysis: RunAnalysis,
    reviewPath: string
  ): Promise<RunRecord> {
    return this.mutate(runId, (run) => {
      run.status = "completed";
      run.executionOutcome = outcome;
      run.finalUrl = finalUrl;
      run.analysis = analysis;
      run.reviewPath = reviewPath;
      return this.pushEvent(run, {
        type: "run_completed",
        message: "Review page is ready.",
        data: {
          reviewPath,
          outcome
        }
      });
    });
  }

  async fail(runId: string, errorMessage: string): Promise<RunRecord> {
    return this.mutate(runId, (run) => {
      run.status = "failed";
      run.failureMessage = errorMessage;
      return this.pushEvent(run, {
        type: "run_failed",
        message: errorMessage
      });
    });
  }

  runDirectory(runId: string): string {
    return path.join(this.runsDir, runId);
  }

  private runFile(runId: string): string {
    return path.join(this.runDirectory(runId), "run.json");
  }

  async ensureBaseDir(): Promise<void> {
    await mkdir(this.runsDir, { recursive: true });
  }

  async listRuns(limit = 20): Promise<RunRecord[]> {
    const runs = await this.loadAllRuns();
    return runs
      .filter((r) => !r.parentRunId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
  }

  async createRetest(parentRunId: string): Promise<RunRecord> {
    const parent = await this.load(parentRunId);
    if (!parent || !parent.plan) {
      throw new Error(`Parent run ${parentRunId} not found or has no plan.`);
    }
    const runId = randomUUID();
    const now = new Date().toISOString();
    const run: RunRecord = {
      id: runId,
      parentRunId,
      prompt: parent.prompt,
      createdAt: now,
      updatedAt: now,
      status: "planned",
      executionOutcome: "not_started",
      failureMessage: null,
      finalUrl: null,
      reviewPath: null,
      plan: parent.plan,
      screenshots: [],
      actionHistory: [],
      analysis: null,
      events: []
    };
    await this.save(run);
    return run;
  }

  async listRetests(parentRunId: string): Promise<RunRecord[]> {
    const all = await this.loadAllRuns();
    return all
      .filter((r) => r.parentRunId === parentRunId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  private async loadAllRuns(): Promise<RunRecord[]> {
    try {
      const entries = await readdir(this.runsDir, { withFileTypes: true });
      const runs: RunRecord[] = [];
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const run = await this.load(entry.name);
          if (run) runs.push(run);
        }
      }
      return runs;
    } catch {
      return [];
    }
  }

  private async save(run: RunRecord): Promise<RunRecord> {
    const runDir = this.runDirectory(run.id);
    await mkdir(runDir, { recursive: true });
    await writeFile(this.runFile(run.id), `${JSON.stringify(run, null, 2)}\n`, "utf8");
    return run;
  }

  private async mutate(runId: string, update: (run: RunRecord) => RunRecord): Promise<RunRecord> {
    const current = await this.load(runId);
    if (!current) {
      throw new Error(`Run ${runId} was not found.`);
    }
    const updated = update(current);
    updated.updatedAt = new Date().toISOString();
    await this.save(updated);
    return updated;
  }

  private pushEvent(
    run: RunRecord,
    event: Omit<RunEvent, "id" | "createdAt">
  ): RunRecord {
    const fullEvent: RunEvent = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...event
    };
    run.events.push(fullEvent);
    this.eventHub.publish(run.id, fullEvent);
    return run;
  }
}
