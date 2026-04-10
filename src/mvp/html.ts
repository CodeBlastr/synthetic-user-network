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
        --card: rgba(255, 251, 244, 0.96);
        --font: "Avenir Next", "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        background: var(--bg);
        color: var(--ink);
        font-family: var(--font);
        font-size: 14px;
        line-height: 1.6;
        height: 100dvh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      /* ── top bar ── */
      .topbar {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 14px;
        border-bottom: 1px solid var(--line);
        background: var(--card);
        flex-shrink: 0;
        min-height: 52px;
      }
      .topbar-logo {
        font-weight: 800;
        font-size: 13px;
        letter-spacing: 0.16em;
        text-transform: uppercase;
        color: var(--accent);
        flex-shrink: 0;
      }
      .topbar-sep {
        color: var(--line);
        flex-shrink: 0;
        font-size: 18px;
        line-height: 1;
      }
      #promptInput {
        flex: 1;
        min-width: 0;
        height: auto;
        min-height: 28px;
        max-height: calc(21px * 12);
        background: transparent;
        border: none;
        border-bottom: 1px solid rgba(29, 26, 22, 0.28);
        border-radius: 0;
        padding: 4px 8px;
        font: 500 13px/21px var(--font);
        color: var(--ink);
        resize: none;
        overflow-y: hidden;
        outline: none;
        line-height: 21px;
        align-self: center;
      }
      #promptInput::placeholder { color: var(--muted); }
      #promptInput:focus { border-bottom-color: var(--accent); }
      #runHistory {
        flex-shrink: 0;
        appearance: none;
        -webkit-appearance: none;
        background: transparent;
        border: none;
        border-radius: 0;
        padding: 4px 0;
        font: 500 13px/1 var(--font);
        color: var(--muted);
        cursor: pointer;
        max-width: 240px;
        outline: none;
      }
      #runHistory:focus, #runHistory:hover { color: var(--ink); }
      #planButton {
        appearance: none;
        border: 0;
        flex-shrink: 0;
        border-radius: 999px;
        padding: 8px 18px;
        background: var(--ink);
        color: white;
        font: 700 13px/1 var(--font);
        cursor: pointer;
        transition: opacity 150ms;
        white-space: nowrap;
      }
      #planButton:disabled { opacity: 0.45; cursor: not-allowed; }
      #planButton:not(:disabled):hover { opacity: 0.82; }

      /* ── 3-column layout ── */
      .columns {
        flex: 1;
        display: grid;
        grid-template-columns: 1fr 1fr 1fr;
        overflow: hidden;
        min-height: 0;
      }
      .col {
        border-right: 1px solid var(--line);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        min-height: 0;
      }
      .col:last-child { border-right: none; }
      .col-header {
        padding: 10px 14px;
        border-bottom: 1px solid var(--line);
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        background: var(--card);
      }
      .col-header h2 {
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.13em;
        text-transform: uppercase;
        color: var(--muted);
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        border-radius: 999px;
        padding: 3px 9px;
        background: var(--accent-soft);
        color: var(--accent);
        font-size: 11px;
        font-weight: 700;
      }
      .col-body {
        flex: 1;
        overflow-y: auto;
        padding: 14px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        min-height: 0;
      }

      /* ── plan display ── */
      .plan-meta { color: var(--muted); font-size: 13px; line-height: 1.5; }
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
      }
      .steps { display: grid; gap: 8px; }
      .step {
        padding: 10px 12px;
        border-radius: 10px;
        border: 1px solid var(--line);
        background: white;
      }
      .step strong { display: block; margin-bottom: 3px; font-size: 13px; }
      .step .meta { font-size: 12px; color: var(--muted); line-height: 1.5; }
      .btn-execute {
        appearance: none;
        border: 0;
        border-radius: 10px;
        padding: 13px;
        background: var(--accent);
        color: white;
        font: 700 14px/1 var(--font);
        cursor: pointer;
        width: 100%;
        transition: opacity 150ms;
      }
      .btn-execute:hover { opacity: 0.85; }

      /* ── loading animation ── */
      .loading {
        display: flex;
        align-items: center;
        gap: 10px;
        color: var(--muted);
        font-size: 13px;
      }
      .loading-dots {
        display: flex;
        gap: 4px;
      }
      .loading-dots span {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: var(--accent);
        animation: bounce 1.2s infinite ease-in-out;
      }
      .loading-dots span:nth-child(2) { animation-delay: 0.2s; }
      .loading-dots span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes bounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }

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
        line-height: 1.4;
      }

      /* ── review link ── */
      .review-ready {
        display: none;
        padding: 14px;
        border-radius: 10px;
        border: 1px solid var(--accent);
        background: var(--accent-soft);
      }
      .review-ready strong { display: block; color: var(--accent); margin-bottom: 4px; font-size: 13px; }
      .review-ready p { font-size: 12px; color: var(--muted); margin-bottom: 10px; }
      .review-ready a {
        display: inline-block;
        padding: 9px 18px;
        background: var(--accent);
        color: white;
        border-radius: 999px;
        font: 700 13px/1 var(--font);
        text-decoration: none;
        transition: opacity 150ms;
      }
      .review-ready a:hover { opacity: 0.85; }

      /* ── empty states ── */
      .empty { color: var(--muted); font-size: 13px; }

      /* ── live dot ── */
      .dot {
        width: 7px; height: 7px;
        border-radius: 50%;
        background: var(--accent);
        animation: pulse 1.4s infinite ease-in-out;
        display: inline-block;
      }
      @keyframes pulse {
        0%, 100% { opacity: 0.35; transform: scale(0.8); }
        50% { opacity: 1; transform: scale(1); }
      }
    </style>
  </head>
  <body>
    <div class="topbar">
      <span class="topbar-logo">SUN</span>
      <span class="topbar-sep">|</span>
      <select id="runHistory" onchange="window.sunPickRun(this.value)">
        <option value="">Write a Testing Plan to Begin</option>
      </select>
      <textarea id="promptInput" rows="1" spellcheck="false" oninput="window.sunResizePrompt(this)">Go to this url: https://chirpper.com/i/xxxxxx. Create a new post using that invite. Critique the clarity of the process to use that invite, and make a recommendation for next steps to improve that flow.</textarea>
      <button id="planButton" onclick="window.sunGeneratePlan()">Generate Plan</button>
    </div>

    <div class="columns">

      <!-- Column 1: Plan the Test -->
      <div class="col">
        <div class="col-header">
          <h2>Plan the Test</h2>
          <span class="pill">localhost:3020</span>
        </div>
        <div class="col-body">
          <div id="planContainer" class="empty">Generate a plan above to begin.</div>
        </div>
      </div>

      <!-- Column 2: Test Execution -->
      <div class="col">
        <div class="col-header">
          <h2>Test Execution</h2>
          <div class="pill"><span class="dot"></span>&nbsp;Live</div>
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

    <script src="/sun-client.js"></script>
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
        <h2>Copy-Paste AI Prompt</h2>
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
