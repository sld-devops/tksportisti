// "Polar testi" panelis - tieši tāds pats paraugs kā panels/self-tests.js
// (state, "seen" izsekošana localStorage, saraksts + dialogs, badge), tikai
// citi lauki (MAS temps, MAP vati, VO2max, laktāts). Skat. self-tests.js
// komentārus par to, kā šis paraugs strādā.
let polarTests = [];
let editingPolarTestId = null;
let seenPolarTestIds = new Set();

function loadSeenPolarTestIds() {
  try {
    const stored = localStorage.getItem("seenPolarTestIds");
    if (stored) seenPolarTestIds = new Set(JSON.parse(stored));
  } catch (e) {
    seenPolarTestIds = new Set();
  }
}

function saveSeenPolarTestIds() {
  localStorage.setItem("seenPolarTestIds", JSON.stringify([...seenPolarTestIds]));
}

function isPolarTestSeen(athleteId, testId) {
  return seenPolarTestIds.has(`${athleteId}:${testId}`);
}

function markAllPolarTestsSeen(athleteId, tests) {
  tests.forEach(t => seenPolarTestIds.add(`${athleteId}:${t.id}`));
  saveSeenPolarTestIds();
}

loadSeenPolarTestIds();

const PT_FIELDS = ["ptMas", "ptMap", "ptVo2", "ptLactAfter", "ptLact5"];
const PT_KEYS = ["mas_pace", "map_watts", "vo2max", "lactate_after", "lactate_5min"];

function renderPolarTests() {
  const body = document.getElementById("polarTestsBody");
  if (!body) return;
  const athleteId = getSelectedAthleteId();
  const isAthleteView = (activeRole === "athlete") && currentUser.id === athleteId;

  if (!isAthleteView && activeRole !== "coach") {
    body.innerHTML = "";
    return;
  }

  const list = polarTests.length
    ? polarTests.map(p => `
        <div class="selftest-row" data-polartest-id="${p.id}">
          <span class="selftest-date">${formatDateLV(p.date)}</span>
          ${p.mas_pace ? `<span class="selftest-mas">${escapeHtml(p.mas_pace)}</span>` : ""}
        </div>
      `).join("")
    : "";

  const addBtn = isAthleteView
    ? '<button id="addPolarTestBtn" class="secondary-action panel-add-btn" type="button">Pievienot</button>'
    : "";

  body.innerHTML = `<div class="selftest-list">${list}</div>${addBtn}`;

  document.getElementById("addPolarTestBtn")?.addEventListener("click", () => openPolarTestDialog(null));

  body.querySelectorAll("[data-polartest-id]").forEach(row => {
    row.addEventListener("click", () => {
      const p = polarTests.find(pt => pt.id === row.dataset.polartestId);
      if (p) openPolarTestDialog(p);
    });
  });

  const panel = document.getElementById("polarTestsPanel");
  if (panel) {
    const header = panel.querySelector(".panel-header");
    if (activeRole === "coach") {
      const unseen = polarTests.filter(t => !isPolarTestSeen(athleteId, t.id)).length;
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

function openPolarTestDialog(existing) {
  const dlg = document.getElementById("polarTestDialog");
  const athleteId = getSelectedAthleteId();
  const isAthleteView = (activeRole === "athlete") && currentUser.id === athleteId;

  if (existing) {
    editingPolarTestId = existing.id;
    document.getElementById("ptDate").value = existing.date;
    document.getElementById("ptMas").value = existing.mas_pace || "";
    document.getElementById("ptMap").value = existing.map_watts ?? "";
    document.getElementById("ptVo2").value = existing.vo2max ?? "";
    document.getElementById("ptLactAfter").value = existing.lactate_after ?? "";
    document.getElementById("ptLact5").value = existing.lactate_5min ?? "";
    document.getElementById("deletePolarTestBtn").hidden = !isAthleteView;
  } else {
    editingPolarTestId = null;
    document.getElementById("ptDate").value = formatDateISO(new Date());
    PT_FIELDS.forEach(id => { document.getElementById(id).value = ""; });
    document.getElementById("deletePolarTestBtn").hidden = true;
  }

  PT_FIELDS.forEach(id => { document.getElementById(id).disabled = !isAthleteView; });
  document.getElementById("ptDate").disabled = !isAthleteView;
  document.getElementById("savePolarTestBtn").hidden = !isAthleteView;

  dlg.showModal();
}

document.getElementById("savePolarTestBtn")?.addEventListener("click", async () => {
  const athleteId = getSelectedAthleteId();
  const date = document.getElementById("ptDate").value;
  if (!date) return;

  const data = {
    athlete_id: athleteId,
    date,
    mas_pace: document.getElementById("ptMas").value,
    map_watts: document.getElementById("ptMap").value ? parseInt(document.getElementById("ptMap").value) : null,
    vo2max: document.getElementById("ptVo2").value ? parseFloat(document.getElementById("ptVo2").value) : null,
    lactate_after: document.getElementById("ptLactAfter").value ? parseFloat(document.getElementById("ptLactAfter").value) : null,
    lactate_5min: document.getElementById("ptLact5").value ? parseFloat(document.getElementById("ptLact5").value) : null,
  };

  try {
    if (editingPolarTestId) {
      await updatePolarTest(editingPolarTestId, data);
    } else {
      await insertPolarTest(data);
    }
    polarTests = await getPolarTests(athleteId);
    renderPolarTests();
    document.getElementById("polarTestDialog").close();
  } catch (e) {
    alert("Neizdevās saglabāt: " + (e.message || e));
  }
});

document.getElementById("deletePolarTestBtn")?.addEventListener("click", async () => {
  if (!editingPolarTestId) return;
  if (!confirm("Dzēst šo polar testu?")) return;
  try {
    await deletePolarTest(editingPolarTestId);
    polarTests = await getPolarTests(getSelectedAthleteId());
    renderPolarTests();
    document.getElementById("polarTestDialog").close();
  } catch (e) {
    alert("Neizdevās dzēst: " + (e.message || e));
  }
});
