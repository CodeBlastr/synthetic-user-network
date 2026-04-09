import type {
  ActionDecision,
  ExecutionPlan,
  PageSnapshot,
  RunAnalysis,
  ScreenshotArtifact
} from "./types.js";

interface ResponseInputPartText {
  type: "input_text";
  text: string;
}

interface ResponseInputPartImage {
  type: "input_image";
  image_url: string;
}

type ResponseInputPart = ResponseInputPartText | ResponseInputPartImage;

interface ResponsesApiResult {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
}

interface OpenAiErrorPayload {
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export class SunAiService {
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? "";
    this.model = process.env.OPENAI_MODEL ?? "gpt-5-mini";
  }

  ensureConfigured(): void {
    if (!this.apiKey) {
      throw new Error("OPENAI_API_KEY is required for the SUN MVP planner and reviewer.");
    }
  }

  async createPlan(userPrompt: string): Promise<ExecutionPlan> {
    const responseText = await this.callModel([
      {
        type: "input_text",
        text: [
          "You are SUN, a synthetic-user planner.",
          "Return JSON only.",
          "Create a compact execution plan for a human-approved browser evaluation run.",
          "This run is recommendation-first: it should gather enough evidence to make one concrete next-step recommendation, not perform product changes.",
          "Prefer 3 to 6 steps.",
          "Use a starting URL only if the user provided one explicitly.",
          "JSON shape:",
          "{",
          '  "runName": string,',
          '  "startingUrl": string,',
          '  "goal": string,',
          '  "focusAreas": string[],',
          '  "constraints": string[],',
          '  "steps": [{"title": string, "purpose": string, "evidenceToCollect": string}],',
          '  "completionSignal": string',
          "}",
          "",
          "User prompt:",
          userPrompt
        ].join("\n")
      }
    ]);

    const parsed = parseJsonObject(responseText) as Partial<ExecutionPlan>;
    if (
      !parsed.runName ||
      !parsed.startingUrl ||
      !parsed.goal ||
      !Array.isArray(parsed.focusAreas) ||
      !Array.isArray(parsed.constraints) ||
      !Array.isArray(parsed.steps) ||
      !parsed.completionSignal
    ) {
      throw new Error("Planner returned an incomplete execution plan.");
    }

    return {
      runName: String(parsed.runName),
      startingUrl: String(parsed.startingUrl),
      goal: String(parsed.goal),
      focusAreas: parsed.focusAreas.map((value) => String(value)),
      constraints: parsed.constraints.map((value) => String(value)),
      steps: parsed.steps.map((step) => ({
        title: String(step.title),
        purpose: String(step.purpose),
        evidenceToCollect: String(step.evidenceToCollect)
      })),
      completionSignal: String(parsed.completionSignal)
    };
  }

  async decideNextAction(input: {
    prompt: string;
    plan: ExecutionPlan;
    snapshot: PageSnapshot;
    priorActions: string[];
    screenshotDataUrl: string;
  }): Promise<ActionDecision> {
    const responseText = await this.callModel([
      {
        type: "input_text",
        text: [
          "You are SUN's browser executor.",
          "Return JSON only.",
          "Choose the next best action for a browser evaluation run.",
          "Do not fabricate hidden state.",
          "Stop as soon as there is enough evidence to make one recommendation.",
          "Only choose target_eid values from the provided page elements.",
          "Allowed actions: click, fill, press, goto, wait, stop.",
          "When using fill, include the exact value to type.",
          "When using press, set value to a keyboard key like Enter.",
          "When using goto, value must be an absolute URL on the same host as the starting URL.",
          "If the task is complete, set status to complete and action.kind to stop.",
          "If the run is blocked, set status to blocked and action.kind to stop.",
          "JSON shape:",
          "{",
          '  "status": "continue" | "complete" | "blocked",',
          '  "reasoning": string,',
          '  "summary": string,',
          '  "screenshotLabel": string,',
          '  "action": {',
          '    "kind": "click" | "fill" | "press" | "goto" | "wait" | "stop",',
          '    "targetEid": string | null,',
          '    "value": string | null',
          "  }",
          "}",
          "",
          `User prompt: ${input.prompt}`,
          `Goal: ${input.plan.goal}`,
          `Starting URL: ${input.plan.startingUrl}`,
          `Focus areas: ${input.plan.focusAreas.join(" | ")}`,
          `Completion signal: ${input.plan.completionSignal}`,
          "",
          "Prior actions:",
          input.priorActions.length > 0 ? input.priorActions.join("\n") : "None yet.",
          "",
          `Current URL: ${input.snapshot.url}`,
          `Page title: ${input.snapshot.title}`,
          `Headings: ${input.snapshot.headings.join(" | ") || "None visible"}`,
          `Page text excerpt: ${input.snapshot.textExcerpt}`,
          "",
          "Interactive elements:",
          input.snapshot.elements
            .map(
              (element) =>
                `${element.eid} | <${element.tag}> | role=${element.role ?? "none"} | type=${
                  element.type ?? "none"
                } | label=${element.label || "none"} | text=${element.text || "none"} | placeholder=${
                  element.placeholder || "none"
                } | href=${element.href ?? "none"} | disabled=${String(element.disabled)}`
            )
            .join("\n")
        ].join("\n")
      },
      {
        type: "input_image",
        image_url: input.screenshotDataUrl
      }
    ]);

    const parsed = parseJsonObject(responseText) as Partial<ActionDecision>;
    const status =
      parsed.status === "complete" || parsed.status === "blocked"
        ? parsed.status
        : "continue";
    const actionKind = parsed.action?.kind ?? "stop";

    return {
      status,
      reasoning: String(parsed.reasoning ?? "No reasoning returned."),
      summary: String(parsed.summary ?? "No summary returned."),
      screenshotLabel: String(parsed.screenshotLabel ?? "Observed state"),
      action: {
        kind: isActionKind(actionKind) ? actionKind : "stop",
        targetEid: parsed.action?.targetEid ? String(parsed.action.targetEid) : undefined,
        value: parsed.action?.value ? String(parsed.action.value) : undefined
      }
    };
  }

  async analyzeRun(input: {
    prompt: string;
    plan: ExecutionPlan;
    screenshots: Array<{
      artifact: ScreenshotArtifact;
      dataUrl: string;
    }>;
    finalUrl: string | null;
    executionOutcome: "task_completed" | "partial" | "blocked";
  }): Promise<RunAnalysis> {
    const selectedShots = input.screenshots.slice(0, 6);
    const responseText = await this.callModel([
      {
        type: "input_text",
        text: [
          "You are SUN's recommendation analyst.",
          "Return JSON only.",
          "Produce exactly one product recommendation based on the captured evidence.",
          "The recommendation must be concrete enough for a product engineer to implement next.",
          "The recommendation must explain why it improves the user's stated goal.",
          "The codex prompt markdown must be copy-pasteable and implementation-oriented.",
          "JSON shape:",
          "{",
          '  "recommendationTitle": string,',
          '  "recommendedNextStep": string,',
          '  "goalAlignment": string,',
          '  "reasoning": string[],',
          '  "confidence": "high" | "medium" | "low",',
          '  "evidence": [{"screenshotLabel": string, "whyItMatters": string}],',
          '  "codexPromptMarkdown": string',
          "}",
          "",
          `User prompt: ${input.prompt}`,
          `Plan goal: ${input.plan.goal}`,
          `Completion signal: ${input.plan.completionSignal}`,
          `Execution outcome: ${input.executionOutcome}`,
          `Final URL: ${input.finalUrl ?? "n/a"}`,
          "",
          "Screenshot labels available:",
          selectedShots.map((item) => item.artifact.label).join(" | ")
        ].join("\n")
      },
      ...selectedShots.map((item) => ({
        type: "input_image" as const,
        image_url: item.dataUrl
      }))
    ]);

    const parsed = parseJsonObject(responseText) as Partial<RunAnalysis> & {
      evidence?: Array<{ screenshotLabel?: string; whyItMatters?: string }>;
    };

    if (
      !parsed.recommendationTitle ||
      !parsed.recommendedNextStep ||
      !parsed.goalAlignment ||
      !Array.isArray(parsed.reasoning) ||
      !parsed.codexPromptMarkdown
    ) {
      throw new Error("Run analysis did not produce a usable recommendation.");
    }

    return {
      recommendationTitle: String(parsed.recommendationTitle),
      recommendedNextStep: String(parsed.recommendedNextStep),
      goalAlignment: String(parsed.goalAlignment),
      reasoning: parsed.reasoning.map((entry) => String(entry)),
      confidence:
        parsed.confidence === "high" || parsed.confidence === "low"
          ? parsed.confidence
          : "medium",
      evidence: (parsed.evidence ?? []).map((entry) => ({
        screenshotId: "",
        screenshotLabel: String(entry.screenshotLabel ?? ""),
        whyItMatters: String(entry.whyItMatters ?? "")
      })),
      codexPromptMarkdown: String(parsed.codexPromptMarkdown)
    };
  }

  private async callModel(content: ResponseInputPart[]): Promise<string> {
    this.ensureConfigured();
    const maxAttempts = Math.max(1, Number(process.env.OPENAI_MAX_ATTEMPTS ?? "2"));

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          input: [
            {
              role: "user",
              content
            }
          ]
        })
      });

      if (response.ok) {
        const payload = (await response.json()) as ResponsesApiResult;
        const outputText = payload.output_text ?? extractTextFromOutput(payload.output ?? []);
        if (!outputText) {
          throw new Error("OpenAI response did not include any output text.");
        }
        return outputText;
      }

      const errorDetails = await readOpenAiError(response);
      const shouldRetry =
        response.status === 429 &&
        attempt < maxAttempts &&
        isRetryableRateLimit(errorDetails);

      if (shouldRetry) {
        const retryAfterMs = getRetryDelayMs(response, attempt);
        await sleep(retryAfterMs);
        continue;
      }

      throw new Error(buildOpenAiErrorMessage(response.status, errorDetails, response));
    }

    throw new Error("OpenAI request exhausted all retry attempts.");
  }
}

function extractTextFromOutput(
  output: ResponsesApiResult["output"]
): string {
  if (!output) {
    return "";
  }
  return output
    .flatMap((item) => item.content ?? [])
    .map((content) => content.text ?? "")
    .join("\n")
    .trim();
}

function parseJsonObject(value: string): unknown {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1] ?? trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Model output did not contain a JSON object.");
  }
  return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
}

function isActionKind(value: unknown): value is ActionDecision["action"]["kind"] {
  return (
    value === "click" ||
    value === "fill" ||
    value === "press" ||
    value === "goto" ||
    value === "wait" ||
    value === "stop"
  );
}

async function readOpenAiError(response: Response): Promise<{
  message: string | null;
  type: string | null;
  code: string | null;
}> {
  const rawText = await response.text();
  if (!rawText.trim()) {
    return {
      message: null,
      type: null,
      code: null
    };
  }

  try {
    const payload = JSON.parse(rawText) as OpenAiErrorPayload;
    return {
      message: payload.error?.message ?? rawText.trim(),
      type: payload.error?.type ?? null,
      code: payload.error?.code ?? null
    };
  } catch {
    return {
      message: rawText.trim(),
      type: null,
      code: null
    };
  }
}

function isRetryableRateLimit(error: {
  type: string | null;
  code: string | null;
}): boolean {
  return !(
    error.type === "insufficient_quota" ||
    error.code === "insufficient_quota" ||
    error.code === "billing_hard_limit_reached"
  );
}

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "");
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  return 1000 * attempt;
}

function buildOpenAiErrorMessage(
  status: number,
  error: {
    message: string | null;
    type: string | null;
    code: string | null;
  },
  response: Response
): string {
  const parts = [`OpenAI request failed with status ${status}`];

  if (error.message) {
    parts.push(error.message);
  }

  if (error.code) {
    parts.push(`code=${error.code}`);
  } else if (error.type) {
    parts.push(`type=${error.type}`);
  }

  if (
    status === 429 &&
    (error.type === "insufficient_quota" ||
      error.code === "insufficient_quota" ||
      error.code === "billing_hard_limit_reached")
  ) {
    parts.push(
      "The API project behind OPENAI_API_KEY appears to be out of quota or billing capacity."
    );
  } else if (status === 429) {
    parts.push("SUN retried once; if this persists, wait and try again.");
  }

  const requestId = response.headers.get("x-request-id");
  if (requestId) {
    parts.push(`request_id=${requestId}`);
  }

  return `${parts.join(". ")}.`;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
