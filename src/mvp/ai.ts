import type {
  ActionDecision,
  ExecutionPlan,
  PageSnapshot,
  RunAnalysis,
  ScreenshotArtifact
} from "./types.js";

// Anthropic Messages API content types
interface ClaudeTextContent {
  type: "text";
  text: string;
}

interface ClaudeImageContent {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/png" | "image/jpeg" | "image/gif" | "image/webp";
    data: string;
  };
}

type ClaudeContent = ClaudeTextContent | ClaudeImageContent;

interface ClaudeApiResponse {
  content: Array<{ type: string; text?: string }>;
  stop_reason: string;
}

interface ClaudeErrorPayload {
  type?: string;
  error?: {
    type?: string;
    message?: string;
  };
}

// Internal input types used to build requests
interface InputPartText {
  type: "input_text";
  text: string;
}

interface InputPartImage {
  type: "input_image";
  image_url: string; // data URL: "data:image/png;base64,..."
}

type InputPart = InputPartText | InputPartImage;

export class SunAiService {
  private readonly apiKey: string;
  private readonly model: string;

  constructor() {
    this.apiKey = process.env.CLAUDE_API_KEY ?? "";
    this.model = process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6";
  }

  ensureConfigured(): void {
    if (!this.apiKey) {
      throw new Error("CLAUDE_API_KEY is required for the SUN MVP planner and reviewer.");
    }
  }

  async createPlan(userPrompt: string): Promise<ExecutionPlan> {
    const responseText = await this.callModel([
      {
        type: "input_text",
        text: [
          "You are SUN, a synthetic-user planner.",
          "Return JSON only — no prose before or after the JSON object.",
          "CRITICAL JSON RULES: All string values must use \\n for line breaks — no literal newlines inside JSON strings.",
          "Never use unescaped double-quote characters inside a JSON string value. Use single quotes for any quoted text.",
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
          "Return JSON only — no prose before or after the JSON object.",
          "CRITICAL JSON RULES: All string values must use \\n for line breaks — no literal newlines inside JSON strings.",
          "Never use unescaped double-quote characters inside a JSON string value. Use single quotes for any quoted text.",
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
          "Return JSON only — no prose before or after the JSON object.",
          "Produce exactly one product recommendation based on the captured evidence.",
          "The recommendation must be concrete enough for a product engineer to implement next.",
          "The recommendation must explain why it improves the user's stated goal.",
          "The codexPromptMarkdown value must be a single JSON string.",
          "CRITICAL JSON RULES: All string values must use \\n for line breaks — no literal newlines inside JSON strings.",
          "Do not use markdown code fences (triple backticks) anywhere in the JSON values.",
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

  private async callModel(parts: InputPart[]): Promise<string> {
    this.ensureConfigured();
    const maxAttempts = Math.max(1, Number(process.env.CLAUDE_MAX_ATTEMPTS ?? "2"));
    const claudeContent = toClaudeContent(parts);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 4096,
          messages: [{ role: "user", content: claudeContent }]
        })
      });

      if (response.ok) {
        const payload = (await response.json()) as ClaudeApiResponse;
        const text = payload.content
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("\n")
          .trim();
        if (!text) {
          throw new Error("Claude response did not include any text content.");
        }
        return text;
      }

      const errorDetails = await readClaudeError(response);
      // Retry on rate limit (429) or overload (529)
      const shouldRetry =
        (response.status === 429 || response.status === 529) && attempt < maxAttempts;

      if (shouldRetry) {
        const retryAfterMs = getRetryDelayMs(response, attempt);
        await sleep(retryAfterMs);
        continue;
      }

      throw new Error(buildClaudeErrorMessage(response.status, errorDetails));
    }

    throw new Error("Claude request exhausted all retry attempts.");
  }
}

function toClaudeContent(parts: InputPart[]): ClaudeContent[] {
  return parts.map((part) => {
    if (part.type === "input_text") {
      return { type: "text" as const, text: part.text };
    }
    // Parse data URL: "data:image/png;base64,<data>"
    const match = part.image_url.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (!match) {
      return { type: "text" as const, text: "[image could not be decoded]" };
    }
    const mediaType = match[1] as "image/png" | "image/jpeg" | "image/gif" | "image/webp";
    return {
      type: "image" as const,
      source: { type: "base64" as const, media_type: mediaType, data: match[2] }
    };
  });
}

function parseJsonObject(value: string): unknown {
  const trimmed = value.trim();
  // Greedy match so nested backticks inside string values don't truncate early
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*)```\s*$/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Model output did not contain a JSON object.");
  }
  const json = candidate.slice(firstBrace, lastBrace + 1);
  try {
    return JSON.parse(json);
  } catch {
    // Retry after escaping any literal control characters inside JSON strings
    return JSON.parse(sanitizeJsonControlChars(json));
  }
}

// Scan character-by-character and repair common LLM JSON mistakes:
// - Literal newlines / carriage returns / tabs inside string values
// - Unescaped double-quote characters inside string values
//
// Strategy: track whether we're inside a JSON string. A `"` that isn't
// preceded by an odd run of backslashes either opens/closes a string OR
// is an unescaped interior quote. We detect the latter by checking whether
// the "closing" quote is followed (ignoring whitespace) by a structural
// character: , } ] — if not, it was an interior quote and we escape it.
function sanitizeJsonControlChars(raw: string): string {
  let inString = false;
  let escaped = false;
  let result = "";

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      result += ch;
      continue;
    }

    if (ch === '"') {
      if (!inString) {
        inString = true;
        result += ch;
        continue;
      }
      // We think this might close the string. Peek ahead past whitespace.
      let j = i + 1;
      while (j < raw.length && (raw[j] === " " || raw[j] === "\t")) j++;
      const next = raw[j] ?? "";
      // Structural characters that legitimately follow a closing string quote
      if (",}]:\n\r".includes(next) || j >= raw.length) {
        inString = false;
        result += ch;
      } else {
        // Interior unescaped quote — escape it
        result += '\\"';
      }
      continue;
    }

    if (inString) {
      if (ch === "\n") { result += "\\n"; continue; }
      if (ch === "\r") { result += "\\r"; continue; }
      if (ch === "\t") { result += "\\t"; continue; }
    }

    result += ch;
  }
  return result;
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

async function readClaudeError(response: Response): Promise<{
  message: string | null;
  type: string | null;
}> {
  const rawText = await response.text();
  if (!rawText.trim()) {
    return { message: null, type: null };
  }
  try {
    const payload = JSON.parse(rawText) as ClaudeErrorPayload;
    return {
      message: payload.error?.message ?? rawText.trim(),
      type: payload.error?.type ?? null
    };
  } catch {
    return { message: rawText.trim(), type: null };
  }
}

function buildClaudeErrorMessage(
  status: number,
  error: { message: string | null; type: string | null }
): string {
  const parts = [`Claude request failed with status ${status}`];
  if (error.message) {
    parts.push(error.message);
  }
  if (error.type) {
    parts.push(`type=${error.type}`);
  }
  if (status === 401) {
    parts.push("Check that CLAUDE_API_KEY is valid.");
  } else if (status === 429) {
    parts.push("SUN retried; if this persists, wait and try again.");
  } else if (status === 529) {
    parts.push("Claude API is temporarily overloaded. Please try again shortly.");
  }
  return `${parts.join(". ")}.`;
}

function getRetryDelayMs(response: Response, attempt: number): number {
  const retryAfterSeconds = Number(response.headers.get("retry-after") ?? "");
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }
  return 1000 * attempt;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
