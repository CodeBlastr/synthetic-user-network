export type RunStatus = "planned" | "running" | "completed" | "failed";

export type ExecutionOutcome =
  | "not_started"
  | "task_completed"
  | "partial"
  | "blocked";

export interface PlanStep {
  title: string;
  purpose: string;
  evidenceToCollect: string;
}

export interface ExecutionPlan {
  runName: string;
  startingUrl: string;
  goal: string;
  focusAreas: string[];
  constraints: string[];
  steps: PlanStep[];
  completionSignal: string;
}

export interface RunEvent {
  id: string;
  type:
    | "plan_created"
    | "run_started"
    | "run_progress"
    | "screenshot_captured"
    | "run_completed"
    | "run_failed";
  message: string;
  createdAt: string;
  data?: Record<string, unknown>;
}

export interface ScreenshotArtifact {
  id: string;
  label: string;
  fileName: string;
  relativePath: string;
  pageUrl: string;
  capturedAt: string;
  summary?: string;
}

export interface ActionRecord {
  stepNumber: number;
  decisionSummary: string;
  actionKind: "click" | "fill" | "press" | "goto" | "wait" | "stop";
  targetEid?: string;
  value?: string;
  pageUrl: string;
  recordedAt: string;
}

export interface AnalysisEvidence {
  screenshotId: string;
  screenshotLabel: string;
  whyItMatters: string;
}

export interface RunAnalysis {
  recommendationTitle: string;
  recommendedNextStep: string;
  goalAlignment: string;
  reasoning: string[];
  evidence: AnalysisEvidence[];
  codexPromptMarkdown: string;
  confidence: "high" | "medium" | "low";
}

export interface RunRecord {
  id: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
  status: RunStatus;
  executionOutcome: ExecutionOutcome;
  failureMessage: string | null;
  finalUrl: string | null;
  reviewPath: string | null;
  plan: ExecutionPlan | null;
  screenshots: ScreenshotArtifact[];
  actionHistory: ActionRecord[];
  analysis: RunAnalysis | null;
  events: RunEvent[];
}

export interface PlannerOutput {
  plan: ExecutionPlan;
}

export interface PageElementDescriptor {
  eid: string;
  tag: string;
  role: string | null;
  type: string | null;
  label: string;
  text: string;
  placeholder: string;
  href: string | null;
  disabled: boolean;
}

export interface PageSnapshot {
  url: string;
  title: string;
  headings: string[];
  textExcerpt: string;
  elements: PageElementDescriptor[];
}

export interface ActionDecision {
  status: "continue" | "complete" | "blocked";
  reasoning: string;
  summary: string;
  action: {
    kind: "click" | "fill" | "press" | "goto" | "wait" | "stop";
    targetEid?: string;
    value?: string;
  };
  screenshotLabel: string;
}
