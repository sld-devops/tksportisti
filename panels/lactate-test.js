// Laktāta tests - a running step test, entered as a table of stages.
//
// The real procedure this models: 15-20 min warm-up, then 4-7 stages of 3-5
// minutes each, every stage roughly 10-20 s/km faster than the one before. A
// blood sample is taken in the short break after each stage, and the pace, the
// heart rate and the lactate reading are written down. The test ends when
// lactate climbs steeply or the athlete is done.
//
// Two thresholds are read off the resulting curve: LT1 (aerobic) at 2.0 mmol/L
// and LT2 (anaerobic) at 4.0 mmol/L. Both are wanted as a pace AND a heart
// rate, since that is what training zones are built from. "Zemākais + 1" is the
// other widely used way to place LT1 and is shown alongside, not instead.

let lactateTests = [];
let editingLactateTestId = null;
// The dialog's working copy. Rebuilding the step inputs on every keystroke
// would steal focus mid-typing, so the rows are only rebuilt when one is added
// or removed - the current values are read back out of the DOM when needed.
let lactateSteps = [];
let seenLactateTestIds = new Set();

function loadSeenLactateTestIds() {
  try {
    const stored = localStorage.getItem("seenLactateTestIds");
    if (stored) seenLactateTestIds = new Set(JSON.parse(stored));
  } catch (e) {
    seenLactateTestIds = new Set();
  }
}

function saveSeenLactateTestIds() {
  localStorage.setItem("seenLactateTestIds", JSON.stringify([...seenLactateTestIds]));
}

// Both roles may edit this panel, so the key carries edited_at as well as the
// id: a test the other side goes back and corrects has to come back as new,
// which a plain id set cannot express. Same reasoning as seenPaceHrEdits.
function lactateSeenKey(athleteId, test) {
  return `${athleteId}:${test.id}:${test.edited_at || ""}`;
}

function isLactateTestSeen(athleteId, test) {
  return seenLactateTestIds.has(lactateSeenKey(athleteId, test));
}

function markAllLactateTestsSeen(athleteId, tests) {
  tests.forEach(t => seenLactateTestIds.add(lactateSeenKey(athleteId, t)));
  saveSeenLactateTestIds();
}

loadSeenLactateTestIds();

const LACTATE_LT1 = 2.0;
const LACTATE_LT2 = 4.0;
const LACTATE_BASELINE_RISE = 1.0;
const LACTATE_DEFAULT_STAGE_MIN = 4;

/* ---------- reading what was typed ---------- */

// "4:30" -> 270. A pace is written min:sec; a bare number is taken as whole
// minutes ("4" -> 4:00) rather than as 4 seconds, which is what
// raceTimeToSeconds alone would return.
function lactatePaceToSec(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  if (!s.includes(":")) {
    const n = parseFloat(s.replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 60) : null;
  }
  const sec = raceTimeToSeconds(s);
  return sec > 0 ? sec : null;
}

function lactateSecToPace(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return "";
  const total = Math.round(sec);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function lactateNum(text) {
  const n = parseFloat(String(text ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// A stage counts towards the curve only once it has both a pace and a lactate
// reading - a half-filled row must not bend the line or shift a threshold.
// Sorted slowest first so the result never depends on the order they were
// typed in, while the table itself keeps the order the coach entered.
function lactateUsableSteps(steps) {
  return (steps || [])
    .map(s => ({
      paceSec: lactatePaceToSec(s.pace),
      hr: lactateNum(s.hr),
      la: lactateNum(s.la),
    }))
    .filter(s => s.paceSec !== null && s.la !== null)
    .sort((a, b) => b.paceSec - a.paceSec);
}

/* ---------- the thresholds ---------- */

// Walks the stages in order and returns the point where lactate first crosses
// `target`, interpolated between the stage below it and the stage above it.
// Returns null when the test never got there, and a `belowRange` marker when
// the very first stage was already above the target - that means the test
// started too fast, which is a real thing to tell the coach rather than
// silently answering with the first stage.
function lactateThresholdAt(points, target) {
  if (points.length < 2) return null;
  if (points[0].la >= target) return { belowRange: true };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (a.la < target && b.la >= target) {
      const span = b.la - a.la;
      if (span <= 0) continue;
      const f = (target - a.la) / span;
      const hr = a.hr !== null && b.hr !== null ? Math.round(a.hr + f * (b.hr - a.hr)) : null;
      return {
        paceSec: a.paceSec + f * (b.paceSec - a.paceSec),
        hr,
        la: target,
      };
    }
  }
  return null;
}

function lactateBaseline(points) {
  return points.length ? Math.min(...points.map(p => p.la)) : null;
}

function lactateResults(points) {
  const base = lactateBaseline(points);
  return [
    {
      key: "lt1",
      label: "LT1 · aerobais",
      note: "2,0 mmol/L",
      target: LACTATE_LT1,
      result: lactateThresholdAt(points, LACTATE_LT1),
    },
    {
      key: "lt1b",
      label: "LT1 · zemākais + 1",
      note: base !== null ? `${lactateFmt(base + LACTATE_BASELINE_RISE)} mmol/L` : "",
      target: base !== null ? base + LACTATE_BASELINE_RISE : null,
      result: base !== null ? lactateThresholdAt(points, base + LACTATE_BASELINE_RISE) : null,
    },
    {
      key: "lt2",
      label: "LT2 · anaerobais",
      note: "4,0 mmol/L",
      target: LACTATE_LT2,
      result: lactateThresholdAt(points, LACTATE_LT2),
    },
  ];
}

// Latvian writes the decimal comma, and a whole number keeps no ".0" tail.
function lactateFmt(n) {
  if (!Number.isFinite(n)) return "";
  return (Math.round(n * 10) / 10).toFixed(1).replace(".", ",").replace(",0", "");
}

// The one number worth showing next to the date in the collapsed panel.
function lactateLt2Label(test) {
  const r = lactateThresholdAt(lactateUsableSteps(test.steps), LACTATE_LT2);
  if (!r || r.belowRange) return "";
  return `${lactateSecToPace(r.paceSec)}/km`;
}

/* ---------- the curve ---------- */

// Own constants, not the ones in panels/stats.js - those are `const` at global
// scope and a second declaration of the same name would be a syntax error that
// kills the whole file.
const LT_CHART_W = 1000;
const LT_CHART_H = 360;
// The deep bottom pad is the room the pace labels and the "ātrāk →" hint need
// on two separate lines - at 40 they were drawn almost on top of each other.
const LT_PAD = { top: 26, right: 34, bottom: 56, left: 44 };

function buildLactateChart(points, results) {
  const plotTop = LT_PAD.top;
  const plotBottom = LT_CHART_H - LT_PAD.bottom;
  const plotLeft = LT_PAD.left;
  const plotRight = LT_CHART_W - LT_PAD.right;
  const plotW = plotRight - plotLeft;
  const plotH = plotBottom - plotTop;

  if (points.length < 2) {
    return '<p class="lactate-empty">Līknei vajag vismaz divus posmus ar tempu un laktātu.</p>';
  }

  const paces = points.map(p => p.paceSec);
  const slowest = Math.max(...paces);
  const fastest = Math.min(...paces);
  const paceSpan = slowest - fastest;
  // Faster to the right, the way a lactate curve is always drawn - so a
  // smaller pace in seconds has to land at a larger x.
  const xAt = sec => (paceSpan <= 0 ? plotLeft + plotW / 2 : plotLeft + ((slowest - sec) / paceSpan) * plotW);

  const maxLa = Math.max(...points.map(p => p.la));
  // Always tall enough to show the 4.0 line, so the two threshold guides are
  // on the picture even for a test that stopped early.
  const yMax = Math.max(LACTATE_LT2 + 0.5, Math.ceil((maxLa + 0.5) * 2) / 2);
  const yAt = la => plotBottom - (la / yMax) * plotH;

  let svg = `<svg viewBox="0 0 ${LT_CHART_W} ${LT_CHART_H}" role="img" aria-label="Laktāta līkne">`;

  // Whole-mmol grid, then the two threshold guides on top of it.
  for (let v = 1; v <= yMax; v++) {
    const y = yAt(v).toFixed(1);
    svg += `<line class="chart-grid-line" x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}" />`;
    svg += `<text class="lactate-y-label" x="${plotLeft - 8}" y="${y}" text-anchor="end" dominant-baseline="middle">${v}</text>`;
  }

  [LACTATE_LT1, LACTATE_LT2].forEach(v => {
    if (v > yMax) return;
    const y = yAt(v).toFixed(1);
    svg += `<line class="lactate-guide" x1="${plotLeft}" y1="${y}" x2="${plotRight}" y2="${y}" />`;
  });

  // The measured curve.
  const linePts = points.map(p => ({ x: xAt(p.paceSec), y: yAt(p.la) }));
  svg += `<path class="chart-line" d="${smoothLinePath(linePts, plotTop, plotBottom)}" fill="none" />`;

  // Where each threshold falls, as a vertical drop to the axis.
  results.forEach(r => {
    if (!r.result || r.result.belowRange) return;
    const x = xAt(r.result.paceSec).toFixed(1);
    const y = yAt(r.result.la).toFixed(1);
    svg += `<line class="lactate-marker lactate-marker-${r.key}" x1="${x}" y1="${y}" x2="${x}" y2="${plotBottom}" />`;
    svg += `<circle class="lactate-marker-dot lactate-marker-${r.key}" cx="${x}" cy="${y}" r="6" />`;
  });

  // The stages themselves, each carrying its own reading so nothing has to be
  // hovered for - same reasoning as the stats charts.
  points.forEach((p, i) => {
    const x = xAt(p.paceSec);
    const y = yAt(p.la);
    svg += `<circle class="chart-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" />`;
    svg += `<text class="chart-point-label" x="${x.toFixed(1)}" y="${(y - 12).toFixed(1)}" text-anchor="${edgeAnchor(i, points.length)}">${lactateFmt(p.la)}</text>`;
    svg += `<text class="chart-axis-label" x="${x.toFixed(1)}" y="${(plotBottom + 20).toFixed(1)}" text-anchor="${edgeAnchor(i, points.length)}">${lactateSecToPace(p.paceSec)}</text>`;
  });

  // Centred, not tucked into the right corner - there it sat directly under
  // the last pace label and the two read as one crowded blob.
  svg += `<text class="lactate-axis-title" x="${(plotLeft + plotRight) / 2}" y="${LT_CHART_H - 4}" text-anchor="middle">ātrāk →</text>`;
  svg += `</svg>`;
  return `<div class="lactate-chart chart-series-2">${svg}</div>`;
}

/* ---------- the panel ---------- */

function renderLactateTests() {
  const body = document.getElementById("lactateTestsBody");
  if (!body) return;
  const athleteId = getSelectedAthleteId();
  if (!athleteId) return;
  const isAthleteView = (activeRole === "athlete") && currentUser.id === athleteId;
  const isCoachView = activeRole === "coach";
  if (!isAthleteView && !isCoachView) {
    body.innerHTML = "";
    return;
  }

  let html = "";
  if (lactateTests.length) {
    html += `<div class="selftest-list">`;
    lactateTests.forEach(t => {
      const lt2 = lactateLt2Label(t);
      html += `<div class="selftest-row labtest-row-editable" data-lactatetest-id="${t.id}">
        <span class="selftest-date">${formatDateLV(t.date)}</span>
        ${lt2 ? `<span class="selftest-mas">LT2 ${escapeHtml(lt2)}</span>` : ""}
      </div>`;
    });
    html += `</div>`;
  }
  html += `<button id="addLactateTestBtn" class="secondary-action panel-add-btn" type="button">Pievienot</button>`;

  body.innerHTML = html;

  document.getElementById("addLactateTestBtn")?.addEventListener("click", () => openLactateTestDialog(null));
  body.querySelectorAll("[data-lactatetest-id]").forEach(row => {
    row.addEventListener("click", () => {
      const t = lactateTests.find(x => x.id === row.dataset.lactatetestId);
      if (t) openLactateTestDialog(t);
    });
  });

  const panel = document.getElementById("lactateTestsPanel");
  if (panel) {
    const header = panel.querySelector(".panel-header");
    // Both roles enter tests here, so the badge means "the other one added or
    // changed something", not "there are entries".
    const myRole = isCoachView ? "coach" : "athlete";
    const unseen = lactateTests.filter(
      t => t.edited_by && t.edited_by !== myRole && !isLactateTestSeen(athleteId, t)
    ).length;
    panel.classList.toggle("has-entries", unseen > 0);
    if (header) header.dataset.count = unseen > 9 ? "9+" : String(unseen);
  }
}

/* ---------- the dialog ---------- */

function openLactateTestDialog(existing) {
  const dlg = document.getElementById("lactateTestDialog");
  if (!dlg) return;

  editingLactateTestId = existing ? existing.id : null;
  document.getElementById("lactateDialogTitle").textContent = existing
    ? "Laktāta tests"
    : "Jauns laktāta tests";
  document.getElementById("ltDate").value = existing ? existing.date : formatDateISO(new Date());
  document.getElementById("ltStageMin").value = existing
    ? (existing.stage_min ?? "")
    : LACTATE_DEFAULT_STAGE_MIN;
  document.getElementById("ltNotes").value = existing ? (existing.notes || "") : "";

  // A brand new test opens with four blank stages, which is the short end of a
  // real protocol - fewer than that and there is nothing to interpolate across.
  lactateSteps = existing && Array.isArray(existing.steps) && existing.steps.length
    ? existing.steps.map(s => ({ pace: s.pace || "", hr: s.hr ?? "", la: s.la ?? "", rpe: s.rpe ?? "" }))
    : [emptyLactateStep(), emptyLactateStep(), emptyLactateStep(), emptyLactateStep()];

  document.getElementById("deleteLactateTestBtn").hidden = !existing;
  renderLactateSteps();
  dlg.showModal();
}

function emptyLactateStep() {
  return { pace: "", hr: "", la: "", rpe: "" };
}

// Pulls the current values out of the inputs. Everything downstream - the
// results, the curve, the save - reads the DOM through this one function, so
// there is never a stale copy to keep in step.
function readLactateStepsFromDom() {
  const rows = document.querySelectorAll("#ltStepsBody .lactate-step-row");
  return [...rows].map(row => ({
    pace: row.querySelector(".lt-pace").value.trim(),
    hr: row.querySelector(".lt-hr").value.trim(),
    la: row.querySelector(".lt-la").value.trim(),
    rpe: row.querySelector(".lt-rpe").value.trim(),
  }));
}

function renderLactateSteps() {
  const wrap = document.getElementById("ltStepsBody");
  if (!wrap) return;

  let html = `<div class="lactate-step-head">
      <span></span>
      <span>Temps</span>
      <span>Pulss</span>
      <span>Laktāts</span>
      <span>Sajūta</span>
      <span></span>
    </div>`;

  lactateSteps.forEach((s, i) => {
    html += `<div class="lactate-step-row" data-step="${i}">
      <span class="lactate-step-num">${i + 1}.</span>
      <input class="lt-pace" type="text" inputmode="numeric" placeholder="4:30" value="${escapeHtml(String(s.pace ?? ""))}" />
      <input class="lt-hr" type="number" min="0" max="250" placeholder="150" value="${escapeHtml(String(s.hr ?? ""))}" />
      <input class="lt-la" type="number" min="0" step="0.1" placeholder="1.6" value="${escapeHtml(String(s.la ?? ""))}" />
      <input class="lt-rpe" type="number" min="1" max="10" placeholder="1-10" value="${escapeHtml(String(s.rpe ?? ""))}" />
      <button class="icon-action-btn is-delete lt-remove-step" type="button" aria-label="Noņemt ${i + 1}. posmu">✕</button>
    </div>`;
  });

  wrap.innerHTML = html;

  wrap.querySelectorAll(".lt-remove-step").forEach(btn => {
    btn.addEventListener("click", () => {
      const i = parseInt(btn.closest(".lactate-step-row").dataset.step, 10);
      lactateSteps = readLactateStepsFromDom();
      lactateSteps.splice(i, 1);
      if (!lactateSteps.length) lactateSteps.push(emptyLactateStep());
      renderLactateSteps();
    });
  });

  // Typing recomputes the results and the curve, but must never rebuild these
  // inputs - that would drop the caret out of the box mid-number.
  wrap.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("input", renderLactateResult);
  });

  renderLactateResult();
}

function renderLactateResult() {
  const box = document.getElementById("ltResult");
  if (!box) return;

  const points = lactateUsableSteps(readLactateStepsFromDom());
  const results = lactateResults(points);

  let html = buildLactateChart(points, results);

  html += `<div class="lactate-result-rows">`;
  results.forEach(r => {
    let value;
    if (!r.result) {
      value = `<span class="lactate-result-missing">nav sasniegts</span>`;
    } else if (r.result.belowRange) {
      value = `<span class="lactate-result-missing">zem testētā diapazona</span>`;
    } else {
      const hr = r.result.hr !== null ? `${r.result.hr} sit./min` : "pulss nav ievadīts";
      value = `<strong>${lactateSecToPace(r.result.paceSec)}/km</strong> · ${hr}`;
    }
    html += `<div class="lactate-result-row lactate-result-${r.key}">
      <span class="lactate-result-label">${escapeHtml(r.label)}${r.note ? ` <span class="lactate-result-note">${escapeHtml(r.note)}</span>` : ""}</span>
      <span class="lactate-result-value">${value}</span>
    </div>`;
  });
  html += `</div>`;

  box.innerHTML = html;
}

async function saveLactateTest() {
  const athleteId = getSelectedAthleteId();
  if (!athleteId) return;

  const date = document.getElementById("ltDate").value;
  if (!date) {
    alert("Norādiet testa datumu!");
    return;
  }

  // Blank rows are dropped rather than stored - a coach who leaves the last
  // two stages empty should not get two empty lines back next time.
  const steps = readLactateStepsFromDom().filter(s => s.pace || s.hr || s.la || s.rpe);
  if (!steps.length) {
    alert("Ievadiet vismaz vienu posmu!");
    return;
  }

  const payload = {
    date,
    stage_min: lactateNum(document.getElementById("ltStageMin").value),
    notes: document.getElementById("ltNotes").value.trim(),
    steps,
    edited_by: activeRole === "coach" ? "coach" : "athlete",
    edited_at: new Date().toISOString(),
  };

  try {
    if (editingLactateTestId) {
      await updateLactateTest(editingLactateTestId, payload);
    } else {
      await insertLactateTest({ athlete_id: athleteId, ...payload });
    }
  } catch (e) {
    alert("Neizdevās saglabāt: " + (e.message || e));
    return;
  }

  editingLactateTestId = null;
  lactateTests = await getLactateTests(athleteId);
  // Your own save must never come back at you as a notification.
  markAllLactateTestsSeen(athleteId, lactateTests);
  renderLactateTests();
  document.getElementById("lactateTestDialog").close();
}

async function deleteLactateTestEntry() {
  if (!editingLactateTestId) return;
  if (!confirm("Dzēst šo laktāta testu?")) return;
  try {
    await deleteLactateTest(editingLactateTestId);
  } catch (e) {
    alert("Neizdevās dzēst: " + (e.message || e));
    return;
  }
  editingLactateTestId = null;
  lactateTests = await getLactateTests(getSelectedAthleteId());
  renderLactateTests();
  document.getElementById("lactateTestDialog").close();
}

// The dialog lives in index.html, not in the render output, so these are wired
// once at load rather than on every render.
document.getElementById("ltAddStepBtn")?.addEventListener("click", () => {
  lactateSteps = readLactateStepsFromDom();
  lactateSteps.push(emptyLactateStep());
  renderLactateSteps();
});
document.getElementById("saveLactateTestBtn")?.addEventListener("click", saveLactateTest);
document.getElementById("deleteLactateTestBtn")?.addEventListener("click", deleteLactateTestEntry);
