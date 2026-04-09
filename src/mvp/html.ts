import type { RunRecord } from "./types.js";

export function renderHomePage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SUN MVP</title>
    <style>
      :root {
        --paper: #f5efe2;
        --paper-strong: #fffaf0;
        --ink: #1d1a16;
        --muted: #665d52;
        --accent: #b94e24;
        --accent-soft: rgba(185, 78, 36, 0.14);
        --line: rgba(29, 26, 22, 0.16);
        --shadow: 0 24px 80px rgba(29, 26, 22, 0.12);
        --font-display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
        --font-body: "Avenir Next", "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(185, 78, 36, 0.18), transparent 32%),
          radial-gradient(circle at bottom right, rgba(34, 83, 120, 0.16), transparent 28%),
          linear-gradient(180deg, #f7f1e6 0%, #efe4d1 100%);
        font-family: var(--font-body);
      }
      .shell {
        width: min(1180px, calc(100vw - 32px));
        margin: 32px auto 48px;
      }
      .hero, .panel, .stream-card, .review-link {
        background: rgba(255, 250, 240, 0.88);
        backdrop-filter: blur(18px);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: var(--shadow);
      }
      .hero {
        padding: 28px;
        display: grid;
        gap: 16px;
      }
      .eyebrow {
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
      }
      h1, h2, h3 {
        margin: 0;
        font-family: var(--font-display);
        font-weight: 600;
      }
      h1 {
        font-size: clamp(2.4rem, 5vw, 4rem);
        line-height: 0.95;
        max-width: 11ch;
      }
      .subhead {
        max-width: 68ch;
        color: var(--muted);
        font-size: 1rem;
        line-height: 1.7;
      }
      .layout {
        margin-top: 24px;
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(320px, 0.8fr);
        gap: 20px;
      }
      .panel {
        padding: 24px;
      }
      textarea {
        width: 100%;
        min-height: 220px;
        resize: vertical;
        border-radius: 22px;
        border: 1px solid rgba(29, 26, 22, 0.18);
        background: rgba(255, 255, 255, 0.92);
        padding: 18px;
        font: 500 0.98rem/1.6 "American Typewriter", "Courier New", monospace;
        color: var(--ink);
      }
      button, .ghost-link {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 14px 20px;
        font: 700 0.95rem/1 var(--font-body);
        cursor: pointer;
        transition: transform 180ms ease, box-shadow 180ms ease, opacity 180ms ease;
      }
      button:hover, .ghost-link:hover {
        transform: translateY(-1px);
      }
      .primary {
        background: var(--ink);
        color: var(--paper-strong);
        box-shadow: 0 16px 40px rgba(29, 26, 22, 0.22);
      }
      .accent {
        background: var(--accent);
        color: white;
        box-shadow: 0 16px 40px rgba(185, 78, 36, 0.28);
      }
      .muted-button {
        background: rgba(29, 26, 22, 0.08);
        color: var(--ink);
      }
      .stack {
        display: grid;
        gap: 16px;
      }
      .plan-header, .status-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        flex-wrap: wrap;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border-radius: 999px;
        padding: 8px 12px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 0.82rem;
        font-weight: 700;
      }
      .steps, .events {
        display: grid;
        gap: 12px;
      }
      .step, .event {
        padding: 14px;
        border-radius: 18px;
        border: 1px solid rgba(29, 26, 22, 0.1);
        background: rgba(255, 255, 255, 0.7);
      }
      .step strong, .event strong {
        display: block;
        margin-bottom: 6px;
      }
      .meta {
        color: var(--muted);
        font-size: 0.92rem;
        line-height: 1.6;
      }
      .preview-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
        gap: 12px;
      }
      .preview {
        border-radius: 18px;
        overflow: hidden;
        border: 1px solid rgba(29, 26, 22, 0.1);
        background: rgba(255, 255, 255, 0.84);
      }
      .preview img {
        display: block;
        width: 100%;
        aspect-ratio: 4 / 3;
        object-fit: cover;
        background: #ddd2bf;
      }
      .preview span {
        display: block;
        padding: 10px;
        font-size: 0.82rem;
        color: var(--muted);
      }
      .review-link {
        margin-top: 20px;
        padding: 18px 20px;
        display: none;
      }
      .empty-state {
        color: var(--muted);
        line-height: 1.7;
      }
      .loader {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        background: var(--accent);
        box-shadow: 24px 0 var(--accent-soft), -24px 0 rgba(29, 26, 22, 0.12);
        animation: pulse 1s infinite ease-in-out;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(0.9); opacity: 0.65; }
        50% { transform: scale(1.1); opacity: 1; }
      }
      @media (max-width: 900px) {
        .layout {
          grid-template-columns: 1fr;
        }
        .shell {
          width: min(100vw - 20px, 1180px);
          margin-top: 20px;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <div class="eyebrow">Synthetic User Network</div>
        <h1>Prompt a test. Review the plan. Approve the run.</h1>
        <p class="subhead">
          SUN’s MVP stays recommendation-first. You describe the browser journey you want reviewed,
          SUN drafts an execution plan, waits for approval, captures evidence, and then publishes one
          recommendation page with screenshots, reasoning, and a Codex-ready implementation prompt.
        </p>
      </section>

      <section class="layout">
        <div class="panel stack">
          <div class="plan-header">
            <h2>1. Describe The Test</h2>
            <span class="pill">Docker target: localhost:3020</span>
          </div>
          <textarea id="promptInput" spellcheck="false">Go to this url: https://chirpper.com/i/xxxxxx. Create a new post using that invite. Critique the clarity of the process to use that invite, and make a recommendation for next steps to improve that flow.</textarea>
          <div class="status-line">
            <button id="planButton" class="primary">Generate Plan</button>
            <div id="planStatus" class="meta">Waiting for a prompt.</div>
          </div>
          <div id="planContainer" class="empty-state">
            The plan will appear here with an approval button before SUN touches the browser.
          </div>
          <div id="reviewLink" class="review-link"></div>
        </div>

        <div class="stack">
          <section class="panel stream-card stack">
            <div class="plan-header">
              <h2>2. Run Stream</h2>
              <div class="pill"><span class="loader"></span> Live while running</div>
            </div>
            <div id="eventFeed" class="events empty-state">
              Execution events will stream here after you approve a plan.
            </div>
          </section>

          <section class="panel stack">
            <div class="plan-header">
              <h2>3. Screenshot Evidence</h2>
              <div class="pill">Preview rail</div>
            </div>
            <div id="previewGrid" class="preview-grid">
              <div class="empty-state">Screenshot previews will appear as SUN captures them.</div>
            </div>
          </section>
        </div>
      </section>
    </main>

    <script type="module">
      const promptInput = document.getElementById("promptInput");
      const planButton = document.getElementById("planButton");
      const planStatus = document.getElementById("planStatus");
      const planContainer = document.getElementById("planContainer");
      const eventFeed = document.getElementById("eventFeed");
      const previewGrid = document.getElementById("previewGrid");
      const reviewLink = document.getElementById("reviewLink");

      let activeRunId = null;
      let eventSource = null;

      planButton.addEventListener("click", async () => {
        planButton.disabled = true;
        planStatus.textContent = "Generating an AI-backed plan...";
        reviewLink.style.display = "none";
        reviewLink.innerHTML = "";
        eventFeed.innerHTML = '<div class="empty-state">Plan requested. Waiting for SUN.</div>';
        previewGrid.innerHTML = '<div class="empty-state">No screenshots yet.</div>';

        try {
          const response = await fetch("/api/plans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: promptInput.value })
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || "Unable to generate plan.");
          }
          activeRunId = payload.run.id;
          renderPlan(payload.run);
          planStatus.textContent = "Plan ready. Review it before you execute.";
        } catch (error) {
          planContainer.innerHTML = '<div class="empty-state">' + escapeHtml(error.message) + '</div>';
          planStatus.textContent = "Plan generation failed.";
        } finally {
          planButton.disabled = false;
        }
      });

      function renderPlan(run) {
        const plan = run.plan;
        const steps = plan.steps.map((step) => \`
          <div class="step">
            <strong>\${escapeHtml(step.title)}</strong>
            <div class="meta">\${escapeHtml(step.purpose)}</div>
            <div class="meta"><b>Evidence:</b> \${escapeHtml(step.evidenceToCollect)}</div>
          </div>
        \`).join("");

        planContainer.innerHTML = \`
          <div class="stack">
            <div class="plan-header">
              <h3>\${escapeHtml(plan.runName)}</h3>
              <span class="pill">\${escapeHtml(plan.startingUrl)}</span>
            </div>
            <div class="meta"><b>Goal:</b> \${escapeHtml(plan.goal)}</div>
            <div class="meta"><b>Focus:</b> \${plan.focusAreas.map(escapeHtml).join(" | ")}</div>
            <div class="meta"><b>Constraints:</b> \${plan.constraints.map(escapeHtml).join(" | ")}</div>
            <div class="meta"><b>Completion signal:</b> \${escapeHtml(plan.completionSignal)}</div>
            <div class="steps">\${steps}</div>
            <button id="executeButton" class="accent">Execute? Yes.</button>
          </div>
        \`;

        document.getElementById("executeButton").addEventListener("click", () => executeRun(run.id));
      }

      async function executeRun(runId) {
        planStatus.textContent = "Execution approved. SUN is collecting evidence.";
        connectEvents(runId);
        const response = await fetch(\`/api/runs/\${runId}/execute\`, { method: "POST" });
        const payload = await response.json();
        if (!response.ok) {
          planStatus.textContent = "Execution failed to start.";
          eventFeed.innerHTML = '<div class="event"><strong>Unable to start</strong><div class="meta">' + escapeHtml(payload.error || "Unknown error.") + '</div></div>';
          return;
        }
      }

      function connectEvents(runId) {
        if (eventSource) {
          eventSource.close();
        }
        eventFeed.innerHTML = "";
        previewGrid.innerHTML = "";
        eventSource = new EventSource(\`/api/runs/\${runId}/events\`);
        eventSource.onmessage = (event) => {
          const payload = JSON.parse(event.data);
          appendEvent(payload);
          if (payload.type === "screenshot_captured" && payload.data && payload.data.screenshot) {
            appendScreenshot(payload.data.screenshot);
          }
          if (payload.type === "run_completed" && payload.data && payload.data.reviewPath) {
            reviewLink.style.display = "block";
            reviewLink.innerHTML = \`
              <strong>Review ready.</strong>
              <div class="meta">SUN finished the run and assembled the recommendation page.</div>
              <p><a class="ghost-link muted-button" href="\${payload.data.reviewPath}">Open analysis review</a></p>
            \`;
            planStatus.textContent = "Run completed.";
            eventSource.close();
          }
          if (payload.type === "run_failed") {
            planStatus.textContent = "Run failed.";
            eventSource.close();
          }
        };
      }

      function appendEvent(event) {
        const wrapper = document.createElement("div");
        wrapper.className = "event";
        wrapper.innerHTML = \`
          <strong>\${escapeHtml(event.message)}</strong>
          <div class="meta">\${escapeHtml(new Date(event.createdAt).toLocaleString())}</div>
        \`;
        eventFeed.prepend(wrapper);
      }

      function appendScreenshot(screenshot) {
        const empty = previewGrid.querySelector(".empty-state");
        if (empty) {
          empty.remove();
        }
        const card = document.createElement("div");
        card.className = "preview";
        card.innerHTML = \`
          <img src="/artifacts/\${encodeURI(screenshot.relativePath)}" alt="\${escapeHtml(screenshot.label)}" />
          <span>\${escapeHtml(screenshot.label)}</span>
        \`;
        previewGrid.prepend(card);
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");
      }
    </script>
  </body>
</html>`;
}

export function renderReviewPage(run: RunRecord): string {
  const plan = run.plan;
  const analysis = run.analysis;
  const screenshots = run.screenshots
    .map(
      (screenshot) => `
        <article class="shot">
          <img src="/artifacts/${encodePathSegment(screenshot.relativePath)}" alt="${escapeHtml(
            screenshot.label
          )}" />
          <div class="caption">
            <h3>${escapeHtml(screenshot.label)}</h3>
            <p>${escapeHtml(
              analysis?.evidence.find((item) => item.screenshotLabel === screenshot.label)?.whyItMatters ??
                "Captured evidence from the approved SUN run."
            )}</p>
          </div>
        </article>
      `
    )
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(run.plan?.runName ?? "SUN Review")}</title>
    <style>
      :root {
        --paper: #fcf7ed;
        --ink: #171412;
        --muted: #5f564c;
        --line: rgba(23, 20, 18, 0.12);
        --accent: #20595f;
        --accent-soft: rgba(32, 89, 95, 0.12);
        --font-display: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif;
        --font-body: "Avenir Next", "Segoe UI", sans-serif;
        --shadow: 0 28px 80px rgba(23, 20, 18, 0.1);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: var(--ink);
        font-family: var(--font-body);
        background:
          radial-gradient(circle at top right, rgba(32, 89, 95, 0.12), transparent 30%),
          linear-gradient(180deg, #f8f2e5 0%, #f4ebdc 100%);
      }
      main {
        width: min(1100px, calc(100vw - 32px));
        margin: 32px auto 48px;
        display: grid;
        gap: 20px;
      }
      .card {
        background: rgba(252, 247, 237, 0.92);
        border: 1px solid var(--line);
        border-radius: 28px;
        box-shadow: var(--shadow);
        padding: 28px;
      }
      h1, h2, h3 {
        margin: 0;
        font-family: var(--font-display);
        font-weight: 600;
      }
      h1 { font-size: clamp(2.4rem, 5vw, 3.8rem); line-height: 0.96; }
      p, li { line-height: 1.7; color: var(--muted); }
      .eyebrow {
        margin-bottom: 12px;
        font-size: 12px;
        letter-spacing: 0.18em;
        text-transform: uppercase;
        color: var(--accent);
        font-weight: 700;
      }
      .grid {
        display: grid;
        grid-template-columns: 1.1fr 0.9fr;
        gap: 20px;
      }
      .meta-list {
        display: grid;
        gap: 12px;
      }
      .meta-row {
        padding: 14px;
        border-radius: 18px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.65);
      }
      .shot-grid {
        display: grid;
        gap: 16px;
      }
      .shot {
        overflow: hidden;
        border-radius: 22px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.76);
      }
      .shot img {
        display: block;
        width: 100%;
        height: auto;
      }
      .caption {
        padding: 18px;
      }
      textarea {
        width: 100%;
        min-height: 260px;
        border: 1px solid var(--line);
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.82);
        padding: 18px;
        color: var(--ink);
        font: 500 0.96rem/1.6 "American Typewriter", "Courier New", monospace;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 14px 20px;
        background: var(--ink);
        color: white;
        font: 700 0.95rem/1 var(--font-body);
        cursor: pointer;
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
      @media (max-width: 900px) {
        .grid {
          grid-template-columns: 1fr;
        }
        main {
          width: min(100vw - 20px, 1100px);
          margin-top: 20px;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <section class="card">
        <div class="eyebrow">SUN Recommendation Review</div>
        <h1>${escapeHtml(analysis?.recommendationTitle ?? "Recommendation pending")}</h1>
        <p>${escapeHtml(analysis?.recommendedNextStep ?? "No recommendation was generated.")}</p>
      </section>

      <section class="grid">
        <article class="card">
          <div class="eyebrow">Why This Next Step</div>
          <h2>Reasoning</h2>
          <ul>
            ${(analysis?.reasoning ?? []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
          </ul>
          <p><strong>Goal alignment:</strong> ${escapeHtml(analysis?.goalAlignment ?? "")}</p>
          <p><strong>Confidence:</strong> ${escapeHtml(analysis?.confidence ?? "n/a")}</p>
        </article>

        <article class="card">
          <div class="eyebrow">Run Context</div>
          <h2>Approved Plan</h2>
          <div class="meta-list">
            <div class="meta-row"><strong>Prompt</strong><p>${escapeHtml(run.prompt)}</p></div>
            <div class="meta-row"><strong>Starting URL</strong><p>${escapeHtml(plan?.startingUrl ?? "")}</p></div>
            <div class="meta-row"><strong>Goal</strong><p>${escapeHtml(plan?.goal ?? "")}</p></div>
            <div class="meta-row"><strong>Outcome</strong><p>${escapeHtml(run.executionOutcome)}</p></div>
            <div class="meta-row"><strong>Final URL</strong><p>${escapeHtml(run.finalUrl ?? "n/a")}</p></div>
          </div>
        </article>
      </section>

      <section class="card">
        <div class="eyebrow">Evidence</div>
        <h2>Screenshot Trail</h2>
        <div class="shot-grid">${screenshots}</div>
      </section>

      <section class="card">
        <div class="eyebrow">Implementation Handoff</div>
        <h2>Copy-Paste Markdown For Codex</h2>
        <p>Use this prompt to turn the approved recommendation into implementation work.</p>
        <textarea id="codexPrompt" readonly>${escapeHtml(analysis?.codexPromptMarkdown ?? "")}</textarea>
        <p><button id="copyButton">Copy Markdown</button></p>
      </section>
    </main>
    <script>
      document.getElementById("copyButton").addEventListener("click", async () => {
        const field = document.getElementById("codexPrompt");
        field.select();
        field.setSelectionRange(0, field.value.length);
        await navigator.clipboard.writeText(field.value);
      });
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function encodePathSegment(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
