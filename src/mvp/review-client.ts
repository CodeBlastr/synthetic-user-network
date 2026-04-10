// Client-side JavaScript served at /sun-review.js for the review page.
// Kept in a separate module so it is never nested inside an HTML template
// literal — that nesting caused the HTML parser to mis-tokenise </div>
// sequences inside JS strings, breaking the entire script block.

export const reviewClientJs = `
(function() {

  // ── utilities ────────────────────────────────────────────────────────────

  function sunEsc(v) {
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sunGetRunId() {
    var meta = document.querySelector('meta[name="sun-run-id"]');
    return meta ? meta.getAttribute("content") : null;
  }

  // ── retest SSE streams ───────────────────────────────────────────────────

  var _retestStreams = {};

  function sunSubscribeRetest(retestId) {
    if (_retestStreams[retestId]) _retestStreams[retestId].close();
    var es = new EventSource("/api/runs/" + retestId + "/events");
    _retestStreams[retestId] = es;
    es.onmessage = function(e) {
      var evt = JSON.parse(e.data);
      sunAppendRetestEvent(retestId, evt);
      if (evt.type === "screenshot_captured" && evt.data && evt.data.screenshot) {
        sunAppendRetestShot(retestId, evt.data.screenshot);
      }
      if (evt.type === "run_completed" || evt.type === "run_failed") {
        var status = evt.type === "run_completed" ? "completed" : "failed";
        sunUpdateRetestStatus(retestId, status);
        es.close();
        delete _retestStreams[retestId];
        // Fetch full record to get analysis.codexPromptMarkdown
        fetch("/api/runs/" + retestId)
          .then(function(r) { return r.json(); })
          .then(function(b) { if (b.run) sunShowRetestPrompt(retestId, b.run); })
          .catch(function() {});
      }
    };
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function sunRenderRetest(retest) {
    var list = document.getElementById("retestList");
    var empty = document.getElementById("retestEmpty");
    if (empty) empty.style.display = "none";

    var existing = document.getElementById("retest-" + retest.id);
    if (!existing) {
      var card = document.createElement("div");
      card.className = "retest-card";
      card.id = "retest-" + retest.id;
      var ts = new Date(retest.createdAt).toLocaleString();
      card.innerHTML =
        '<div class="retest-header">'
        + '<strong>Verification Run — ' + sunEsc(ts) + '</strong>'
        + '<span class="retest-status" id="retest-status-' + retest.id + '">'
        + sunEsc(retest.status)
        + '</span>'
        + '</div>'
        + '<div class="retest-body">'
        + '<div class="retest-events" id="retest-events-' + retest.id + '"></div>'
        + '<div class="retest-shots" id="retest-shots-' + retest.id + '"></div>'
        + '</div>';
      list.appendChild(card);
    }

    // Hydrate events
    var evFeed = document.getElementById("retest-events-" + retest.id);
    if (evFeed && retest.events) {
      evFeed.innerHTML = "";
      for (var i = 0; i < retest.events.length; i++) {
        sunAppendRetestEvent(retest.id, retest.events[i]);
      }
    }

    // Hydrate screenshots
    var shotGrid = document.getElementById("retest-shots-" + retest.id);
    if (shotGrid && retest.screenshots) {
      shotGrid.innerHTML = "";
      for (var j = 0; j < retest.screenshots.length; j++) {
        sunAppendRetestShot(retest.id, retest.screenshots[j]);
      }
    }
  }

  function sunAppendRetestEvent(retestId, evt) {
    var feed = document.getElementById("retest-events-" + retestId);
    if (!feed) return;
    var el = document.createElement("div");
    el.className = "retest-event";
    el.innerHTML = "<strong>" + sunEsc(evt.message) + "</strong>"
      + '<div class="ts">' + new Date(evt.createdAt).toLocaleTimeString() + "</div>";
    feed.appendChild(el);
    feed.scrollTop = feed.scrollHeight;
  }

  function sunAppendRetestShot(retestId, shot) {
    var grid = document.getElementById("retest-shots-" + retestId);
    if (!grid) return;
    var el = document.createElement("div");
    el.className = "retest-shot";
    var img = document.createElement("img");
    img.src = "/artifacts/" + encodeURI(shot.relativePath);
    img.alt = sunEsc(shot.label);
    var cap = document.createElement("span");
    cap.textContent = shot.label;
    el.appendChild(img);
    el.appendChild(cap);
    grid.appendChild(el);
  }

  function sunUpdateRetestStatus(retestId, status) {
    var el = document.getElementById("retest-status-" + retestId);
    if (el) el.textContent = status;
  }

  function sunShowRetestPrompt(retestId, retest) {
    var card = document.getElementById("retest-" + retestId);
    if (!card) return;
    // Don't add twice
    if (card.querySelector(".retest-prompt")) return;

    var promptEl = document.createElement("div");
    promptEl.className = "retest-prompt";

    var markdown = retest.analysis && retest.analysis.codexPromptMarkdown
      ? retest.analysis.codexPromptMarkdown
      : null;

    if (markdown) {
      var promptId = "retest-prompt-text-" + retestId;
      promptEl.innerHTML =
        '<div class="eyebrow">Fix Prompt</div>'
        + '<p style="font-size:13px;color:var(--muted);margin:0 0 8px;">Copy this prompt and paste it into any AI to implement the fix.</p>'
        + '<textarea id="' + promptId + '" readonly></textarea>'
        + '<p style="margin-top:10px;"><button onclick="(function(){'
        + 'var f=document.getElementById(\\"' + promptId + '\\");'
        + 'f.select();f.setSelectionRange(0,f.value.length);'
        + 'navigator.clipboard.writeText(f.value);'
        + '})()">Copy Prompt</button></p>';
      card.appendChild(promptEl);
      // Set value after append to avoid escaping issues
      document.getElementById(promptId).value = markdown;
    } else if (retest.status === "failed") {
      promptEl.innerHTML =
        '<div class="eyebrow">Fix Prompt</div>'
        + '<p style="font-size:13px;color:var(--muted);margin:0;">'
        + 'Verification failed before analysis could complete: '
        + sunEsc(retest.failureMessage || "unknown error")
        + '</p>';
      card.appendChild(promptEl);
    }
  }

  // ── start a retest ───────────────────────────────────────────────────────

  function sunStartRetest() {
    var runId = sunGetRunId();
    if (!runId) return;
    var btn = document.getElementById("runVerificationBtn");
    if (btn) btn.disabled = true;
    fetch("/api/runs/" + runId + "/retests", { method: "POST" })
      .then(function(res) {
        return res.json().then(function(body) {
          if (!res.ok) throw new Error(body.error || "Could not start retest.");
          return body;
        });
      })
      .then(function(body) {
        return fetch("/api/runs/" + body.retestId)
          .then(function(r) { return r.json(); })
          .then(function(b) {
            if (b.run) {
              sunRenderRetest(b.run);
              sunSubscribeRetest(body.retestId);
            }
          });
      })
      .catch(function(err) {
        alert("Could not start verification test: " + err.message);
      })
      .then(function() {
        if (btn) btn.disabled = false;
      });
  }

  // ── expose globals ───────────────────────────────────────────────────────

  window.sunStartRetest = sunStartRetest;

  // ── init on page load ────────────────────────────────────────────────────

  document.addEventListener("DOMContentLoaded", function() {
    // Wire the main review page copy button (replaces the removed inline script)
    var copyBtn = document.getElementById("copyButton");
    if (copyBtn) {
      copyBtn.addEventListener("click", function() {
        var field = document.getElementById("codexPrompt");
        if (!field) return;
        field.select();
        field.setSelectionRange(0, field.value.length);
        navigator.clipboard.writeText(field.value);
      });
    }

    // Hydrate existing retests
    var runId = sunGetRunId();
    if (!runId) return;
    fetch("/api/runs/" + runId + "/retests")
      .then(function(res) { return res.json(); })
      .then(function(body) {
        if (!body.retests || !body.retests.length) return;
        for (var i = 0; i < body.retests.length; i++) {
          var rt = body.retests[i];
          sunRenderRetest(rt);
          if (rt.status === "running") {
            sunSubscribeRetest(rt.id);
          } else if (rt.status === "completed" || rt.status === "failed") {
            sunShowRetestPrompt(rt.id, rt);
          }
        }
      })
      .catch(function() {});
  });

})();
`;
