import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { chromium, type Locator, type Page } from "playwright";
import type {
  ActionDecision,
  ActionRecord,
  ExecutionOutcome,
  ExecutionPlan,
  PageElementDescriptor,
  PageSnapshot,
  ScreenshotArtifact
} from "./types.js";
import type { RunStore } from "./store.js";
import { SunAiService } from "./ai.js";

const MAX_EXECUTION_STEPS = Number(process.env.SUN_MAX_EXECUTION_STEPS ?? "8");
const DEFAULT_TIMEOUT_MS = Number(process.env.SUN_TIMEOUT_MS ?? "15000");
const HEADLESS = process.env.HEADLESS !== "false";

export async function executePlan(input: {
  runId: string;
  prompt: string;
  plan: ExecutionPlan;
  runDir: string;
  store: RunStore;
  ai: SunAiService;
}): Promise<{
  analysis: Awaited<ReturnType<SunAiService["analyzeRun"]>>;
  outcome: ExecutionOutcome;
  finalUrl: string | null;
}> {
  const browser = await chromium.launch({
    headless: HEADLESS
  });
  const context = await browser.newContext({
    viewport: {
      width: 1440,
      height: 1080
    }
  });
  const page = await context.newPage();
  page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);
  page.setDefaultTimeout(DEFAULT_TIMEOUT_MS);

  const actionNarrative: string[] = [];
  let outcome: ExecutionOutcome = "partial";
  let finalUrl: string | null = null;

  try {
    await mkdir(input.runDir, { recursive: true });
    await input.store.addProgress(input.runId, "Opening starting URL.", {
      url: input.plan.startingUrl
    });
    await page.goto(input.plan.startingUrl, {
      waitUntil: "domcontentloaded"
    });
    await settlePage(page);

    for (let stepNumber = 1; stepNumber <= MAX_EXECUTION_STEPS; stepNumber += 1) {
      const snapshot = await captureSnapshot(page);
      const screenshot = await captureScreenshot({
        page,
        runDir: input.runDir,
        stepNumber,
        label: `Step ${stepNumber}`
      });
      await input.store.addScreenshot(input.runId, screenshot);

      const screenshotPath = path.join(input.runDir, screenshot.fileName);
      const screenshotDataUrl = await buildDataUrl(screenshotPath);

      const decision = await input.ai.decideNextAction({
        prompt: input.prompt,
        plan: input.plan,
        snapshot,
        priorActions: actionNarrative,
        screenshotDataUrl
      });

      actionNarrative.push(
        `Step ${stepNumber}: ${decision.summary} (${decision.action.kind}${
          decision.action.targetEid ? ` ${decision.action.targetEid}` : ""
        }${decision.action.value ? ` => ${decision.action.value}` : ""})`
      );

      const actionRecord: ActionRecord = {
        stepNumber,
        decisionSummary: decision.summary,
        actionKind: decision.action.kind,
        targetEid: decision.action.targetEid,
        value: decision.action.value,
        pageUrl: snapshot.url,
        recordedAt: new Date().toISOString()
      };
      await input.store.addAction(input.runId, actionRecord);
      await input.store.addProgress(input.runId, decision.reasoning, {
        decision
      });

      if (decision.status === "complete" || decision.action.kind === "stop") {
        outcome = decision.status === "blocked" ? "blocked" : "task_completed";
        break;
      }

      if (decision.status === "blocked") {
        outcome = "blocked";
        break;
      }

      await executeAction(page, input.plan.startingUrl, decision);
      await settlePage(page);
      finalUrl = page.url();
    }

    finalUrl = finalUrl ?? page.url();
    const screenshotsWithData = await Promise.all(
      (await input.store.load(input.runId))!.screenshots.map(async (artifact) => ({
        artifact,
        dataUrl: await buildDataUrl(path.join(input.runDir, artifact.fileName))
      }))
    );

    const analysis = await input.ai.analyzeRun({
      prompt: input.prompt,
      plan: input.plan,
      screenshots: screenshotsWithData,
      finalUrl,
      executionOutcome: outcome as "task_completed" | "partial" | "blocked"
    });

    return {
      analysis,
      outcome,
      finalUrl
    };
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }
}

async function captureSnapshot(page: Page): Promise<PageSnapshot> {
  return page.evaluate(() => {
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(
        'a, button, input, textarea, select, [role="button"], [contenteditable="true"]'
      )
    )
      .filter((element) => isElementVisible(element))
      .slice(0, 24)
      .map((element, index) => {
        const eid = `e${index + 1}`;
        element.setAttribute("data-sun-eid", eid);
        return {
          eid,
          tag: element.tagName.toLowerCase(),
          role: element.getAttribute("role"),
          type: element.getAttribute("type"),
          label:
            element.getAttribute("aria-label") ||
            findLabelText(element as HTMLElement) ||
            "",
          text: normalizeText(element.innerText || element.textContent || ""),
          placeholder: element.getAttribute("placeholder") || "",
          href: element instanceof HTMLAnchorElement ? element.href : null,
          disabled:
            "disabled" in element
              ? Boolean((element as HTMLButtonElement | HTMLInputElement).disabled)
              : false
        };
      });

    const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
      .map((heading) => normalizeText(heading.textContent || ""))
      .filter(Boolean)
      .slice(0, 8);

    return {
      url: window.location.href,
      title: document.title,
      headings,
      textExcerpt: normalizeText(document.body.innerText || "").slice(0, 2400),
      elements
    };

    function normalizeText(value: string): string {
      return value.replace(/\s+/g, " ").trim();
    }

    function isElementVisible(element: HTMLElement): boolean {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.visibility !== "hidden" &&
        style.display !== "none"
      );
    }

    function findLabelText(element: HTMLElement): string {
      const id = element.getAttribute("id");
      if (id) {
        const label = document.querySelector(`label[for="${id}"]`);
        if (label) {
          return normalizeText(label.textContent || "");
        }
      }

      const wrappedLabel = element.closest("label");
      return wrappedLabel ? normalizeText(wrappedLabel.textContent || "") : "";
    }
  });
}

async function captureScreenshot(input: {
  page: Page;
  runDir: string;
  stepNumber: number;
  label: string;
}): Promise<ScreenshotArtifact> {
  const padded = String(input.stepNumber).padStart(2, "0");
  const fileName = `${padded}-${slugify(input.label)}.png`;
  const absolutePath = path.join(input.runDir, fileName);
  await input.page.screenshot({
    path: absolutePath,
    fullPage: true
  });

  return {
    id: `${padded}-${Date.now()}`,
    label: input.label,
    fileName,
    relativePath: path.join(path.basename(input.runDir), fileName),
    pageUrl: input.page.url(),
    capturedAt: new Date().toISOString()
  };
}

async function executeAction(
  page: Page,
  startingUrl: string,
  decision: ActionDecision
): Promise<void> {
  switch (decision.action.kind) {
    case "click":
      await (await requireTarget(page, decision.action.targetEid)).click();
      break;
    case "fill":
      await (await requireTarget(page, decision.action.targetEid)).fill(
        decision.action.value ?? ""
      );
      break;
    case "press":
      await (await requireTarget(page, decision.action.targetEid)).press(
        decision.action.value ?? "Enter"
      );
      break;
    case "goto": {
      const nextUrl = decision.action.value;
      if (!nextUrl) {
        throw new Error("Goto action was missing a target URL.");
      }
      const target = new URL(nextUrl);
      const starting = new URL(startingUrl);
      if (target.host !== starting.host) {
        throw new Error(`Blocked cross-host navigation to ${target.host}.`);
      }
      await page.goto(target.toString(), {
        waitUntil: "domcontentloaded"
      });
      break;
    }
    case "wait":
      await page.waitForTimeout(Number(decision.action.value ?? "1000"));
      break;
    case "stop":
      break;
  }
}

async function requireTarget(page: Page, eid: string | undefined): Promise<Locator> {
  if (!eid) {
    throw new Error("The requested action did not specify a target element.");
  }
  const locator = page.locator(`[data-sun-eid="${eid}"]`).first();
  await locator.waitFor();
  return locator;
}

async function settlePage(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForLoadState("networkidle", {
    timeout: 3000
  }).catch(() => undefined);
  await page.waitForTimeout(500);
}

async function buildDataUrl(filePath: string): Promise<string> {
  const base64 = await readFile(filePath, "base64");
  return `data:image/png;base64,${base64}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "capture";
}
