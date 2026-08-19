// "Ruffier test" panel - list + inline form (like health-journal.js),
// "seen" tracking (like self-tests.js), plus an expandable instructions card
// (ruffierInfoExpanded/RUFFIER_INFO_HTML below) and the Ruffier index
// formula/colour categories themselves (calcRuffierIndex, RUFFIER_CATEGORIES).
let ruffierTests = [];
let editingRuffierTestId = null;
let seenRuffierTestIds = new Set();
// Own small expand/collapse, separate from the panel's own ▶ - state lives
// here (not just CSS) because renderRuffierTests() replaces the whole body
// innerHTML on every save/edit, which would otherwise reset it closed.
let ruffierInfoExpanded = false;

const RUFFIER_INFO_HTML = `
  Rufjē tests parāda, cik ātri sirds atgūstas pēc fiziskas slodzes, un ir
  vienkāršs veids, kā novērtēt vispārējo fizisko sagatavotību.
  <strong>Kā izpildīt:</strong>
  <ol>
    <li>Apsēdies vai apgulies un mierīgi atpūsties vismaz 5 minūtes.</li>
    <li>Izmēri pulsu 15 sekundēs un ieraksti to laukā HR1.</li>
    <li>45 sekundēs izpildi 30 pietupienus vienmērīgā tempā.</li>
    <li>Uzreiz pēc slodzes izmēri pulsu 15 sekundēs un ieraksti laukā HR2.</li>
    <li>Nosēdies mierīgi un atpūsties 1 minūti.</li>
    <li>Pēc minūtes atkal izmēri pulsu 15 sekundēs un ieraksti laukā HR3.</li>
  </ol>
  Lietotne pēc tam pati aprēķina Rufjē indeksu un parāda kategoriju
  (teicami / labi / apmierinoši / viduvēji / slikti).
`;

function loadSeenRuffierTestIds() {
  try {
    const stored = localStorage.getItem("seenRuffierTestIds");
    if (stored) seenRuffierTestIds = new Set(JSON.parse(stored));
  } catch (e) {
    seenRuffierTestIds = new Set();
  }
}

function saveSeenRuffierTestIds() {
  localStorage.setItem("seenRuffierTestIds", JSON.stringify([...seenRuffierTestIds]));
}

function isRuffierTestSeen(athleteId, testId) {
  return seenRuffierTestIds.has(`${athleteId}:${testId}`);
}

function markAllRuffierTestsSeen(athleteId, tests) {
  tests.forEach(t => seenRuffierTestIds.add(`${athleteId}:${t.id}`));
  saveSeenRuffierTestIds();
}

loadSeenRuffierTestIds();

function calcRuffierIndex(hr1, hr2, hr3) {
  return (4 * (hr1 + hr2 + hr3) - 200) / 10;
}

const RUFFIER_CATEGORIES = [
  { label: "Teicami", rangeLabel: "< 0 teicami", bg: "var(--lime-bg)", border: "var(--lime)", color: "var(--lime-dark)" },
  { label: "Labi", rangeLabel: "0–5 labi", bg: "var(--warning-bg)", border: "var(--warning)", color: "var(--warning-dark)" },
  { label: "Apmierinoši", rangeLabel: "6–10 apmierinoši", bg: "var(--info-accent-bg)", border: "var(--info-accent)", color: "var(--info-accent-dark)" },
  { label: "Viduvēji", rangeLabel: "11–15 viduvēji", bg: "var(--violet-bg)", border: "var(--violet)", color: "var(--violet-dark)" },
  { label: "Slikti", rangeLabel: "> 15 slikti", bg: "var(--danger-bg)", border: "var(--danger)", color: "var(--danger)" },
];

function ruffierCategory(ri) {
  if (ri < 0) return RUFFIER_CATEGORIES[0];
  if (ri <= 5) return RUFFIER_CATEGORIES[1];
  if (ri <= 10) return RUFFIER_CATEGORIES[2];
  if (ri <= 15) return RUFFIER_CATEGORIES[3];
  return RUFFIER_CATEGORIES[4];
}

function renderRuffierTests() {
  const body = document.getElementById("ruffierTestsBody");
  if (!body) return;
  const athleteId = getSelectedAthleteId();
  if (!athleteId) return;
  const isAthleteView = (activeRole === "athlete") && currentUser.id === athleteId;
  const isCoachView = activeRole === "coach";

  let html = `
    <div class="ruffier-info${ruffierInfoExpanded ? " expanded" : ""}" role="button" tabindex="0">
      <div class="ruffier-info-text">${RUFFIER_INFO_HTML}</div>
      <span class="ruffier-info-toggle">${ruffierInfoExpanded ? "Rādīt mazāk ▲" : "Rādīt vairāk ▼"}</span>
    </div>
  `;
  html += `<div class="ruffier-legend">`;
  RUFFIER_CATEGORIES.forEach(c => {
    html += `<div class="ruffier-legend-row" style="--fbg:${c.bg};--fborder:${c.border};--fcolor:${c.color}">${escapeHtml(c.rangeLabel)}</div>`;
  });
  html += `</div>`;

  if (ruffierTests.length === 0) {
    html += "";
  } else {
    html += `<div class="selftest-list">`;
    ruffierTests.forEach(t => {
      const ri = calcRuffierIndex(t.hr1, t.hr2, t.hr3);
      const cat = ruffierCategory(ri);
      html += `<div class="selftest-row${isAthleteView ? " labtest-row-editable" : ""}" data-ruffiertest-id="${t.id}">
        <span class="selftest-date">${formatDateLV(t.date)}</span>
        <span class="ruffier-index-badge" style="--fbg:${cat.bg};--fborder:${cat.border};--fcolor:${cat.color}">${ri.toFixed(1)} · ${cat.label}</span>
      </div>`;
    });
    html += `</div>`;
  }

  const editing = editingRuffierTestId ? ruffierTests.find(t => t.id === editingRuffierTestId) : null;

  if (isAthleteView) {
    html += `
      <div class="labtest-form">
        <h3 class="labtest-form-title">${editing ? "Rediģēt Rufjē testu" : "Pievienot Rufjē testu"}</h3>
        <label>Datums <input id="ruffierDate" type="date" value="${editing ? editing.date : formatDateISO(new Date())}" /></label>
        <div class="field-grid-3">
          <label>HR1 <input id="ruffierHr1" type="number" min="0" step="1" value="${editing ? editing.hr1 : ""}" /></label>
          <label>HR2 <input id="ruffierHr2" type="number" min="0" step="1" value="${editing ? editing.hr2 : ""}" /></label>
          <label>HR3 <input id="ruffierHr3" type="number" min="0" step="1" value="${editing ? editing.hr3 : ""}" /></label>
        </div>
        <div class="labtest-form-actions">
          ${editing ? `<button class="delete-action" id="deleteRuffierTestBtn" type="button">Dzēst</button>` : ""}
          ${editing ? `<button class="cancel-action panel-add-btn" id="cancelRuffierEditBtn" type="button">Atcelt</button>` : ""}
          <button class="secondary-action panel-add-btn" id="saveRuffierTestBtn" type="button">${editing ? "Saglabāt" : "Pievienot"}</button>
        </div>
      </div>
    `;
  }

  body.innerHTML = html;

  body.querySelector(".ruffier-info")?.addEventListener("click", () => {
    ruffierInfoExpanded = !ruffierInfoExpanded;
    renderRuffierTests();
  });

  if (isAthleteView) {
    body.querySelectorAll(".labtest-row-editable").forEach(row => {
      row.addEventListener("click", () => startRuffierTestEdit(row.dataset.ruffiertestId));
    });
    document.getElementById("saveRuffierTestBtn")?.addEventListener("click", saveRuffierTest);
    document.getElementById("cancelRuffierEditBtn")?.addEventListener("click", cancelRuffierTestEdit);
    document.getElementById("deleteRuffierTestBtn")?.addEventListener("click", deleteRuffierTestEntry);
  }

  const panel = document.getElementById("ruffierTestsPanel");
  if (panel) {
    const header = panel.querySelector(".panel-header");
    if (isCoachView) {
      const unseen = ruffierTests.filter(t => !isRuffierTestSeen(athleteId, t.id)).length;
      panel.classList.toggle("has-entries", unseen > 0);
      if (header) {
        header.dataset.count = unseen > 9 ? "9+" : String(unseen);
      }
    } else {
      panel.classList.toggle("has-entries", false);
      if (header) {
        header.dataset.count = "0";
      }
    }
  }
}

function startRuffierTestEdit(testId) {
  editingRuffierTestId = testId || null;
  renderRuffierTests();
  document.querySelector("#ruffierTestsBody .labtest-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function cancelRuffierTestEdit() {
  editingRuffierTestId = null;
  renderRuffierTests();
}

async function saveRuffierTest() {
  const athleteId = getSelectedAthleteId();
  if (!athleteId) return;
  const date = document.getElementById("ruffierDate").value;
  const hr1 = parseInt(document.getElementById("ruffierHr1").value, 10);
  const hr2 = parseInt(document.getElementById("ruffierHr2").value, 10);
  const hr3 = parseInt(document.getElementById("ruffierHr3").value, 10);

  if (!date || !Number.isFinite(hr1) || !Number.isFinite(hr2) || !Number.isFinite(hr3)) {
    alert("Aizpildiet datumu un visas trīs pulsa vērtības!");
    return;
  }

  try {
    if (editingRuffierTestId) {
      await updateRuffierTest(editingRuffierTestId, { date, hr1, hr2, hr3 });
    } else {
      await insertRuffierTest({ athlete_id: athleteId, date, hr1, hr2, hr3 });
    }
  } catch (e) {
    alert("Neizdevās saglabāt: " + (e.message || e));
    return;
  }

  editingRuffierTestId = null;
  ruffierTests = await getRuffierTests(athleteId);
  renderRuffierTests();
}

async function deleteRuffierTestEntry() {
  if (!editingRuffierTestId) return;
  if (!confirm("Dzēst šo Rufjē testa ierakstu?")) return;
  try {
    await deleteRuffierTest(editingRuffierTestId);
    editingRuffierTestId = null;
    ruffierTests = await getRuffierTests(getSelectedAthleteId());
    renderRuffierTests();
  } catch (e) {
    alert("Neizdevās dzēst: " + (e.message || e));
  }
}
