import type { RunRecord } from "./types.js";

export function renderHomePage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SUN</title>
    <style>
      :root {
        --ink: #1d1a16;
        --muted: #665d52;
        --accent: #b94e24;
        --accent-soft: rgba(185, 78, 36, 0.12);
        --line: rgba(29, 26, 22, 0.13);
        --bg: #f2ebe0;
        --card: rgba(255, 251, 244, 0.92);
        --font: "Avenir Next", "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: var(--bg);
        color: var(--ink);
        font-family: var(--font);
        font-size: 14px;
        line-height: 1.6;
        height: 100vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }
      /* ── top bar ── */
      .topbar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        border-bottom: 1px solid var(--line);
        background: var(--card);
        flex-shrink: 0;
      }
      .topbar-logo {
        font-weight: 800;
        font-size: 13px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: var(--accent);
      }
      .topbar-sep { color: var(--line); }
      #planStatus {
        color: var(--muted);
        font-size: 13px;
      }
      /* ── 3-column layout ── */
      .columns {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        gap: 0;
        overflow: hidden;
      }
      .col {
        border-right: 1px solid var(--line);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .col:last-child { border-right: none; }
      .col-header {
        padding: 12px 16px;
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        background: var(--card);
      }
      .col-header h2 {
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        padding: 4px 10px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
      }
      .col-body {
        flex: 1;
        overflow-y: auto;
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      /* ── plan column ── */
      textarea {
        width: 100%;
        min-height: 120px;
        resize: vertical;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: white;
        padding: 12px;
        font: 500 13px/1.6 "American Typewriter", "Courier New", monospace;
        color: var(--ink);
      }
      .btn-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 9px 18px;
        font: 700 13px/1 var(--font);
        cursor: pointer;
        transition: opacity 150ms;
      }
      button:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-primary { background: var(--ink); color: white; }
      .btn-execute { background: var(--accent); color: white; width: 100%; padding: 12px; font-size: 14px; border-radius: 10px; }
      /* ── plan display ── */
      .plan-meta { color: var(--muted); font-size: 13px; }
      .plan-meta b { color: var(--ink); }
      .url-pill {
        display: inline-block;
        background: var(--accent-soft);
        color: var(--accent);
        border-radius: 6px;
        padding: 3px 8px;
        font-size: 12px;
        font-weight: 600;
        word-break: break-all;
        margin-bottom: 4px;
      }
      .steps { display: grid; gap: 8px; }
      .step {
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: white;
      }
      .step strong { display: block; margin-bottom: 4px; font-size: 13px; }
      .step .meta { font-size: 12px; color: var(--muted); }
      /* ── stream column ── */
      .events { display: flex; flex-direction: column; gap: 8px; }
      .event {
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: white;
      }
      .event strong { display: block; font-size: 13px; margin-bottom: 2px; }
      .event .ts { font-size: 11px; color: var(--muted); }
      /* ── visuals column ── */
      .preview-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
      .preview {
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid var(--line);
        background: white;
      }
      .preview img {
        display: block;
        width: 100%;
        aspect-ratio: 4/3;
        object-fit: cover;
        background: #e8dfd0;
      }
      .preview span {
        display: block;
        padding: 7px 9px;
        font-size: 11px;
        color: var(--muted);
      }
      /* ── review link ── */
      .review-ready {
        display: none;
        padding: 14px;
        border-radius: 10px;
        border: 1px solid var(--accent);
        background: var(--accent-soft);
      }
      .review-ready strong { display: block; color: var(--accent); margin-bottom: 6px; }
      .review-ready a {
        display: inline-block;
        margin-top: 8px;
        padding: 9px 18px;
        background: var(--accent);
        color: white;
        border-radius: 999px;
        font-weight: 700;
        font-size: 13px;
        text-decoration: none;
      }
      /* ── empty states ── */
      .empty { color: var(--muted); font-size: 13px; }
      /* ── loader dot ── */
      .dot {
        width: 8px; height: 8px;
        border-radius: 50%;
        background: var(--accent);
        animation: pulse 1s infinite ease-in-out;
        display: inline-block;
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.4; transform: scale(0.85); }
        50% { opacity: 1; transform: scale(1); }
      }
    </style>
  </head>
  <body>
    <div class="topbar">
      <span class="topbar-logo">SUN</span>
      <span class="topbar-sep">·</span>
      <span id="planStatus">Enter a prompt to begin.</span>
    </div>

    <div class="columns">

      <!-- Column 1: Plan the Test -->
      <div class="col">
        <div class="col-header">
          <h2>Plan the Test</h2>
          <span class="pill">localhost:3020</span>
        </div>
        <div class="col-body">
          <textarea id="promptInput" spellcheck="false">Go to this url: https://chirpper.com/i/xxxxxx. Create a new post using that invite. Critique the clarity of the process to use that invite, and make a recommendation for next steps to improve that flow.</textarea>
          <div class="btn-row">
            <button id="planButton" class="btn-primary">Generate Plan</button>
          </div>
          <div id="planContainer" class="empty">
            The plan will appear here once generated.
          </div>
        </div>
      </div>

      <!-- Column 2: Test Execution -->
      <div class="col">
        <div class="col-header">
          <h2>Test Execution</h2>
          <div class="pill"><span class="dot"></span> Live</div>
        </div>
        <div class="col-body">
          <div id="eventFeed" class="events">
            <div class="empty">Events will stream here after you approve a plan.</div>
          </div>
        </div>
      </div>

      <!-- Column 3: Visuals -->
      <div class="col">
        <div class="col-header">
          <h2>Visuals</h2>
          <span class="pill">Screenshots</span>
        </div>
        <div class="col-body">
          <div id="reviewReady" class="review-ready"></div>
          <div id="previewGrid" class="preview-grid">
            <div class="empty">Screenshots will appear as SUN captures them.</div>
          </div>
        </div>
      </div>

    </div>

    <script type="module">
      const promptInput = document.getElementById("promptInput");
      const planButton = document.getElementById("planButton");
      const planStatus = document.getElementById("planStatus");
      const planContainer = document.getElementById("planContainer");
      const eventFeed = document.getElementById("eventFeed");
      const previewGrid = document.getElementById("previewGrid");
      const reviewReady = document.getElementById("reviewReady");

      let eventSource = null;

      planButton.addEventListener("click", async () => {
        planButton.disabled = true;
        planStatus.textContent = "Generating plan...";
        reviewReady.style.display = "none";
        reviewReady.innerHTML = "";
        eventFeed.innerHTML = ‘<div class="empty">Waiting for plan...</div>’;
        previewGrid.innerHTML = ‘<div class="empty">No screenshots yet.</div>’;
        planContainer.innerHTML = ‘<div class="empty">Thinking...</div>’;

        try {
          const response = await fetch("/api/plans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: promptInput.value })
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.error || "Unable to generate plan.");
          renderPlan(payload.run);
          planStatus.textContent = "Plan ready — review and execute.";
        } catch (err) {
          planContainer.innerHTML = ‘<div class="empty">’ + escapeHtml(err.message) + ‘</div>’;
          planStatus.textContent = "Plan failed.";
        } finally {
          planButton.disabled = false;
        }
      });

      function renderPlan(run) {
        const plan = run.plan;
        const steps = plan.steps.map((s) => \`
          <div class="step">
            <strong>\${escapeHtml(s.title)}</strong>
            <div class="meta">\${escapeHtml(s.purpose)}</div>
            <div class="meta" style="margin-top:4px"><b>Evidence:</b> \${escapeHtml(s.evidenceToCollect)}</div>
          </div>
        \`).join("");

        planContainer.innerHTML = \`
          <div class="url-pill">\${escapeHtml(plan.startingUrl)}</div>
          <div class="plan-meta"><b>Goal:</b> \${escapeHtml(plan.goal)}</div>
          <div class="plan-meta"><b>Focus:</b> \${plan.focusAreas.map(escapeHtml).join(" · ")}</div>
          <div class="plan-meta"><b>Constraints:</b> \${plan.constraints.map(escapeHtml).join(" · ")}</div>
          <div class="plan-meta"><b>Done when:</b> \${escapeHtml(plan.completionSignal)}</div>
          <div class="steps">\${steps}</div>
          <button id="executeButton" class="btn-execute">Execute? Yes.</button>
        \`;
        document.getElementById("executeButton").addEventListener("click", () => executeRun(run.id));
      }

      async function executeRun(runId) {
        planStatus.textContent = "Running...";
        connectEvents(runId);
        const response = await fetch(\`/api/runs/\${runId}/execute\`, { method: "POST" });
        const payload = await response.json();
        if (!response.ok) {
          planStatus.textContent = "Failed to start.";
          eventFeed.innerHTML = ‘<div class="event"><strong>Error</strong><div class="ts">’ + escapeHtml(payload.error || "Unknown error.") + ‘</div></div>’;
        }
      }

      function connectEvents(runId) {
        if (eventSource) eventSource.close();
        eventFeed.innerHTML = "";
        previewGrid.innerHTML = "";
        eventSource = new EventSource(\`/api/runs/\${runId}/events\`);
        eventSource.onmessage = (e) => {
          const payload = JSON.parse(e.data);
          prependEvent(payload);
          if (payload.type === "screenshot_captured" && payload.data?.screenshot) {
            prependScreenshot(payload.data.screenshot);
          }
          if (payload.type === "run_completed" && payload.data?.reviewPath) {
            reviewReady.style.display = "block";
            reviewReady.innerHTML = \`
              <strong>Analysis ready</strong>
              <div>SUN finished the run and assembled the recommendation.</div>
              <a href="\${payload.data.reviewPath}">Open review &rarr;</a>
            \`;
            planStatus.textContent = "Done.";
            eventSource.close();
          }
          if (payload.type === "run_failed") {
            planStatus.textContent = "Run failed.";
            eventSource.close();
          }
        };
      }

      function prependEvent(event) {
        const el = document.createElement("div");
        el.className = "event";
        el.innerHTML = \`
          <strong>\${escapeHtml(event.message)}</strong>
          <div class="ts">\${new Date(event.createdAt).toLocaleTimeString()}</div>
        \`;
        eventFeed.prepend(el);
      }

      function prependScreenshot(shot) {
        previewGrid.querySelectorAll(".empty").forEach(n => n.remove());
        const el = document.createElement("div");
        el.className = "preview";
        el.innerHTML = \`
          <img src="/artifacts/\${encodeURI(shot.relativePath)}" alt="\${escapeHtml(shot.label)}" />
          <span>\${escapeHtml(shot.label)}</span>
        \`;
        previewGrid.prepend(el);
      }

      function escapeHtml(v) {
        return String(v)
          .replaceAll("&","&amp;").replaceAll("<","&lt;")
          .replaceAll(">","&gt;").replaceAll(‘"’,"&quot;").replaceAll("’","&#39;");
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
