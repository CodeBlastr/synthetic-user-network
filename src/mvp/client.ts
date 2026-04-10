// Client-side JavaScript served at /sun-client.js
// Kept in a separate module so it is never nested inside an HTML template
// literal — that nesting caused the HTML parser to mis-tokenise </div>
// sequences inside JS strings, breaking the entire script block.

export const clientJs = `
(function() {
  var _sunEs = null;

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

  function sunGeneratePlan() {
    var inp = document.getElementById("promptInput");
    var btn = document.getElementById("planButton");
    var pc  = document.getElementById("planContainer");
    var ef  = document.getElementById("eventFeed");
    var pg  = document.getElementById("previewGrid");
    var rr  = document.getElementById("reviewReady");

    var prompt = inp ? inp.value.trim() : "";
    if (!prompt) { alert("Please enter a test prompt first."); return; }

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
        sunRenderPlan(body.run);
      });
    }).catch(function(err) {
      var el = document.getElementById("planContainer");
      if (el) el.innerHTML = "<div class=\\"empty\\">" + sunEsc(err.message) + "</div>";
    }).then(function() {
      var b = document.getElementById("planButton");
      if (b) b.disabled = false;
    });
  }

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
        _sunEs.close();
      }
      if (p.type === "run_failed") { _sunEs.close(); }
    };
  }

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

  // Expose to global scope for oninput/onclick attributes
  window.sunGeneratePlan = sunGeneratePlan;
  window.sunResizePrompt = sunResizePrompt;
})();
`;
