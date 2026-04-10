// Client-side JavaScript served at /sun-client.js
// Kept in a separate module so it is never nested inside an HTML template
// literal — that nesting caused the HTML parser to mis-tokenise </div>
// sequences inside JS strings, breaking the entire script block.

export const clientJs = `
(function() {
  var _sunEs = null;

  // ── utilities ────────────────────────────────────────────────────────────

  function sunEsc(v) {
    return String(v)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sunResizePrompt(el) {
    el.style.overflowY = "hidden";
    el.style.height = "auto";
    var maxH = 21 * 12;
    if (el.scrollHeight > maxH) {
      el.style.height = maxH + "px";
      el.style.overflowY = "scroll";
    } else {
      el.style.height = el.scrollHeight + "px";
    }
  }

  // ── load & restore a run by ID ───────────────────────────────────────────

  function sunLoadRun(runId) {
    fetch("/api/runs/" + runId)
      .then(function(res) { return res.json(); })
      .then(function(body) {
        if (!body.run) return;
        var run = body.run;

        // Restore prompt textarea
        var inp = document.getElementById("promptInput");
        if (inp && run.prompt) {
          inp.value = run.prompt;
          sunResizePrompt(inp);
        }

        // Restore plan display (includes Execute button)
        if (run.plan) sunRenderPlan(run);

        // Restore events oldest-first so prepend ends up newest-on-top
        var ef = document.getElementById("eventFeed");
        if (ef && run.events && run.events.length) {
          ef.innerHTML = "";
          for (var i = run.events.length - 1; i >= 0; i--) {
            sunPrependEvent(run.events[i]);
          }
        }

        // Restore screenshots oldest-first so prepend ends up newest-on-top
        var pg = document.getElementById("previewGrid");
        if (pg && run.screenshots && run.screenshots.length) {
          pg.innerHTML = "";
          for (var j = run.screenshots.length - 1; j >= 0; j--) {
            sunPrependScreenshot(run.screenshots[j]);
          }
        }

        // Restore review link if completed
        if (run.status === "completed" && run.reviewPath) {
          var rr = document.getElementById("reviewReady");
          if (rr) {
            rr.style.display = "block";
            rr.innerHTML = "<strong>Analysis ready</strong>"
              + "<p>SUN finished and assembled the recommendation.</p>"
              + "<a href=\\"" + run.reviewPath + "\\">Open review &rarr;</a>";
          }
        }

        // Reconnect stream if still running
        if (run.status === "running") sunConnectEvents(runId);

        // Sync the dropdown selection to this run
        var sel = document.getElementById("runHistory");
        if (sel) sel.value = runId;
      })
      .catch(function() {});
  }

  // ── generate a new plan ──────────────────────────────────────────────────

  function sunGeneratePlan() {
    var inp = document.getElementById("promptInput");
    var btn = document.getElementById("planButton");
    var pc  = document.getElementById("planContainer");
    var ef  = document.getElementById("eventFeed");
    var pg  = document.getElementById("previewGrid");
    var rr  = document.getElementById("reviewReady");
    var sel = document.getElementById("runHistory");

    var prompt = inp ? inp.value.trim() : "";
    if (!prompt) { alert("Please enter a test prompt first."); return; }

    // Clear stored run — starting fresh
    sessionStorage.removeItem("sun_last_run_id");
    if (sel) sel.value = "";

    if (inp) { inp.style.height = ""; inp.style.overflowY = "hidden"; }
    if (btn) btn.disabled = true;
    if (rr)  { rr.style.display = "none"; rr.innerHTML = ""; }
    if (ef)  ef.innerHTML = "<div class=\\"empty\\">Waiting for execution...</div>";
    if (pg)  pg.innerHTML = "<div class=\\"empty\\">No screenshots yet.</div>";
    if (pc)  pc.innerHTML = "<div class=\\"loading\\"><div class=\\"loading-dots\\"><span></span><span></span><span></span></div>Generating plan...</div>";

    fetch("/api/plans", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: prompt })
    }).then(function(res) {
      return res.json().then(function(body) {
        if (!res.ok) throw new Error(body.error || "Unable to generate plan.");
        // Persist this run for back-navigation restore
        sessionStorage.setItem("sun_last_run_id", body.run.id);
        sunRenderPlan(body.run);
        // Add the new run to the top of the dropdown
        sunPrependRunOption(body.run);
      });
    }).catch(function(err) {
      var el = document.getElementById("planContainer");
      if (el) el.innerHTML = "<div class=\\"empty\\">" + sunEsc(err.message) + "</div>";
    }).then(function() {
      var b = document.getElementById("planButton");
      if (b) b.disabled = false;
    });
  }

  // ── render plan display ──────────────────────────────────────────────────

  function sunRenderPlan(run) {
    var plan = run.plan;
    var steps = "";
    for (var i = 0; i < plan.steps.length; i++) {
      var s = plan.steps[i];
      steps += "<div class=\\"step\\"><strong>" + sunEsc(s.title) + "</strong>"
        + "<div class=\\"meta\\">" + sunEsc(s.purpose) + "</div>"
        + "<div class=\\"meta\\" style=\\"margin-top:4px\\"><b>Evidence:</b> " + sunEsc(s.evidenceToCollect) + "</div></div>";
    }
    var pc = document.getElementById("planContainer");
    if (!pc) return;
    pc.innerHTML =
      "<div class=\\"url-pill\\">" + sunEsc(plan.startingUrl) + "</div>"
      + "<div class=\\"plan-meta\\"><b>Goal:</b> " + sunEsc(plan.goal) + "</div>"
      + "<div class=\\"plan-meta\\"><b>Focus:</b> " + plan.focusAreas.map(sunEsc).join(" &middot; ") + "</div>"
      + "<div class=\\"plan-meta\\"><b>Constraints:</b> " + plan.constraints.map(sunEsc).join(" &middot; ") + "</div>"
      + "<div class=\\"plan-meta\\"><b>Done when:</b> " + sunEsc(plan.completionSignal) + "</div>"
      + "<div class=\\"steps\\">" + steps + "</div>"
      + "<button class=\\"btn-execute\\" id=\\"executeButton\\">Execute? Yes.</button>";

    var execBtn = document.getElementById("executeButton");
    if (execBtn) execBtn.onclick = function() { sunExecuteRun(run.id); };
  }

  // ── execute an approved run ──────────────────────────────────────────────

  function sunExecuteRun(runId) {
    sunConnectEvents(runId);
    fetch("/api/runs/" + runId + "/execute", { method: "POST" })
      .then(function(res) {
        return res.json().then(function(body) {
          if (!res.ok) {
            var ef = document.getElementById("eventFeed");
            if (ef) ef.innerHTML = "<div class=\\"event\\"><strong>Error</strong><div class=\\"ts\\">" + sunEsc(body.error || "Unknown.") + "</div></div>";
          }
        });
      });
  }

  // ── SSE event stream ─────────────────────────────────────────────────────

  function sunConnectEvents(runId) {
    if (_sunEs) _sunEs.close();
    var ef = document.getElementById("eventFeed");
    var pg = document.getElementById("previewGrid");
    if (ef) ef.innerHTML = "";
    if (pg) pg.innerHTML = "";
    _sunEs = new EventSource("/api/runs/" + runId + "/events");
    _sunEs.onmessage = function(e) {
      var p = JSON.parse(e.data);
      sunPrependEvent(p);
      if (p.type === "screenshot_captured" && p.data && p.data.screenshot) {
        sunPrependScreenshot(p.data.screenshot);
      }
      if (p.type === "run_completed" && p.data && p.data.reviewPath) {
        var rr = document.getElementById("reviewReady");
        if (rr) {
          rr.style.display = "block";
          rr.innerHTML = "<strong>Analysis ready</strong>"
            + "<p>SUN finished and assembled the recommendation.</p>"
            + "<a href=\\"" + p.data.reviewPath + "\\">Open review &rarr;</a>";
        }
        // Update dropdown label status for this run
        sunUpdateRunOptionStatus(runId, "completed");
        _sunEs.close();
      }
      if (p.type === "run_failed") {
        sunUpdateRunOptionStatus(runId, "failed");
        _sunEs.close();
      }
    };
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function sunPrependEvent(evt) {
    var feed = document.getElementById("eventFeed");
    if (!feed) return;
    var el = document.createElement("div");
    el.className = "event";
    el.innerHTML = "<strong>" + sunEsc(evt.message) + "</strong>"
      + "<div class=\\"ts\\">" + new Date(evt.createdAt).toLocaleTimeString() + "</div>";
    feed.prepend(el);
  }

  function sunPrependScreenshot(shot) {
    var grid = document.getElementById("previewGrid");
    if (!grid) return;
    var empties = grid.querySelectorAll(".empty");
    for (var i = 0; i < empties.length; i++) { empties[i].parentNode.removeChild(empties[i]); }
    var el = document.createElement("div");
    el.className = "preview";
    var img = document.createElement("img");
    img.src = "/artifacts/" + encodeURI(shot.relativePath);
    img.alt = sunEsc(shot.label);
    var cap = document.createElement("span");
    cap.textContent = shot.label;
    el.appendChild(img);
    el.appendChild(cap);
    grid.prepend(el);
  }

  // ── dropdown helpers ─────────────────────────────────────────────────────

  function sunMakeOptionLabel(r) {
    var name = r.runName || r.prompt.slice(0, 50);
    var date = new Date(r.createdAt).toLocaleDateString();
    return name + " — " + date + " [" + r.status + "]";
  }

  function sunPrependRunOption(run) {
    var sel = document.getElementById("runHistory");
    if (!sel) return;
    // Don't duplicate
    if (sel.querySelector("option[value=\\"" + run.id + "\\"]")) return;
    var opt = document.createElement("option");
    opt.value = run.id;
    opt.textContent = sunMakeOptionLabel({
      runName: run.plan ? run.plan.runName : null,
      prompt: run.prompt,
      createdAt: run.createdAt,
      status: run.status
    });
    // Insert after the placeholder (index 0)
    if (sel.options.length > 1) {
      sel.insertBefore(opt, sel.options[1]);
    } else {
      sel.appendChild(opt);
    }
    sel.value = run.id;
  }

  function sunUpdateRunOptionStatus(runId, status) {
    var sel = document.getElementById("runHistory");
    if (!sel) return;
    var opt = sel.querySelector("option[value=\\"" + runId + "\\"]");
    if (opt) {
      opt.textContent = opt.textContent.replace(/\\[\\w+\\]$/, "[" + status + "]");
    }
  }

  // ── dropdown pick ────────────────────────────────────────────────────────

  function sunPickRun(runId) {
    if (!runId) return;
    sessionStorage.setItem("sun_last_run_id", runId);
    // Clear current UI before loading
    var rr = document.getElementById("reviewReady");
    if (rr) { rr.style.display = "none"; rr.innerHTML = ""; }
    var ef = document.getElementById("eventFeed");
    if (ef) ef.innerHTML = "<div class=\\"empty\\">Loading...</div>";
    var pg = document.getElementById("previewGrid");
    if (pg) pg.innerHTML = "<div class=\\"empty\\">Loading...</div>";
    var pc = document.getElementById("planContainer");
    if (pc) pc.innerHTML = "<div class=\\"empty\\">Loading...</div>";
    sunLoadRun(runId);
  }

  // ── expose globals ───────────────────────────────────────────────────────

  window.sunGeneratePlan = sunGeneratePlan;
  window.sunResizePrompt = sunResizePrompt;
  window.sunPickRun      = sunPickRun;

  // ── init on page load ────────────────────────────────────────────────────

  // Populate dropdown with up to 20 past runs
  fetch("/api/runs")
    .then(function(res) { return res.json(); })
    .then(function(body) {
      var sel = document.getElementById("runHistory");
      if (!sel || !body.runs || !body.runs.length) return;
      for (var i = 0; i < body.runs.length; i++) {
        var r = body.runs[i];
        var opt = document.createElement("option");
        opt.value = r.id;
        opt.textContent = sunMakeOptionLabel(r);
        sel.appendChild(opt);
      }
    })
    .catch(function() {});

  // Restore last viewed run (survives back-navigation in same tab)
  var lastRunId = sessionStorage.getItem("sun_last_run_id");
  if (lastRunId) {
    sunLoadRun(lastRunId);
  }

})();
`;
