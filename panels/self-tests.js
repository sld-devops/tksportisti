// "Paštesti" panelis - sportists ieraksta rezultātus, treneris tos redz.
// `seenSelfTestIds` (localStorage, PER PĀRLŪKU, nevis datubāzē) atceras,
// kurus ierakstus treneris jau ir redzējis, lai sarkanais "N" skaitlītis pie
// paneļa virsraksta rādītu, cik JAUNU ierakstu ir - skat. CLAUDE.md
// "Notification badges" par šo atkārtoto sešu paneļu paraugu.
let selfTests = [];
let editingSelfTestId = null;
let seenSelfTestIds = new Set();

function loadSeenSelfTestIds() {
  try {
    const stored = localStorage.getItem("seenSelfTestIds");
    if (stored) seenSelfTestIds = new Set(JSON.parse(stored));
  } catch (e) {
    seenSelfTestIds = new Set();
  }
}

function saveSeenSelfTestIds() {
  localStorage.setItem("seenSelfTestIds", JSON.stringify([...seenSelfTestIds]));
}

function isSelfTestSeen(athleteId, testId) {
  return seenSelfTestIds.has(`${athleteId}:${testId}`);
}

function markAllSelfTestsSeen(athleteId, tests) {
  tests.forEach(t => seenSelfTestIds.add(`${athleteId}:${t.id}`));
  saveSeenSelfTestIds();
}

loadSeenSelfTestIds();

const ST_FIELDS = [
  "stPlank", "stDibens", "stRokas", "stSiena", "stTipLab", "stTipKreis",
  "stPlankLab", "stPlankKreis", "stPalLab", "stPalKreis",
];
const ST_KEYS = [
  "plank", "dibens_gaisa", "rokas_zeme", "siena_ietupiens", "tiptoes_labakaja", "tiptoes_kreisaja",
  "plank_labais", "plank_kreisais", "paleciens_laba", "paleciens_kreisa",
];

// Zīmē sarakstu sānjoslas panelī (tikai datumi - viss pārējais atveras
// dialogā). Sportists redz savus, treneris redz izvēlētā sportista.
function renderSelfTests() {
  const body = document.getElementById("selfTestsBody");
  if (!body) return;
  const athleteId = getSelectedAthleteId();
  const isAthleteView = (activeRole === "athlete") && currentUser.id === athleteId;

  if (!isAthleteView && activeRole !== "coach") {
    body.innerHTML = "";
    return;
  }

  const list = selfTests.length
    ? selfTests.map(s => `
        <div class="selftest-row" data-selftest-id="${s.id}">
          <span class="selftest-date">${formatDateLV(s.date)}</span>
        </div>
      `).join("")
    : "";

  const addBtn = isAthleteView
    ? '<button id="addSelfTestBtn" class="secondary-action panel-add-btn" type="button">Pievienot</button>'
    : "";

  body.innerHTML = `<div class="selftest-list">${list}</div>${addBtn}`;

  document.getElementById("addSelfTestBtn")?.addEventListener("click", () => openSelfTestDialog(null));

  body.querySelectorAll("[data-selftest-id]").forEach(row => {
    row.addEventListener("click", () => {
      const s = selfTests.find(st => st.id === row.dataset.selftestId);
      if (s) openSelfTestDialog(s);
    });
  });

  const panel = document.getElementById("selfTestsPanel");
  if (panel) {
    const header = panel.querySelector(".panel-header");
    if (activeRole === "coach") {
      const unseen = selfTests.filter(t => !isSelfTestSeen(athleteId, t.id)).length;
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

// Atver/aizpilda dialogu vienam paštestam. `existing` ir null jaunam
// ierakstam vai esošs objekts rediģēšanai. Treneris redz to pašu dialogu,
// bet visi lauki ir `.disabled` - viņš var tikai skatīties, nevis labot.
function openSelfTestDialog(existing) {
  const dlg = document.getElementById("selfTestDialog");
  const athleteId = getSelectedAthleteId();
  const isAthleteView = (activeRole === "athlete") && currentUser.id === athleteId;

  if (existing) {
    editingSelfTestId = existing.id;
    document.getElementById("stDate").value = existing.date;
    ST_FIELDS.forEach((id, i) => {
      document.getElementById(id).value = existing[ST_KEYS[i]] || "";
    });
    document.getElementById("deleteSelfTestBtn").hidden = !isAthleteView;
  } else {
    editingSelfTestId = null;
    document.getElementById("stDate").value = formatDateISO(new Date());
    ST_FIELDS.forEach(id => { document.getElementById(id).value = ""; });
    document.getElementById("deleteSelfTestBtn").hidden = true;
  }

  ST_FIELDS.forEach(id => { document.getElementById(id).disabled = !isAthleteView; });
  document.getElementById("stDate").disabled = !isAthleteView;
  document.getElementById("saveSelfTestBtn").hidden = !isAthleteView;

  dlg.showModal();
}

document.getElementById("saveSelfTestBtn")?.addEventListener("click", async () => {
  const athleteId = getSelectedAthleteId();
  const date = document.getElementById("stDate").value;
  if (!date) return;

  const data = { athlete_id: athleteId, date };
  ST_FIELDS.forEach((id, i) => { data[ST_KEYS[i]] = document.getElementById(id).value.trim(); });

  try {
    if (editingSelfTestId) {
      const updates = { date };
      ST_KEYS.forEach((k, i) => { updates[k] = document.getElementById(ST_FIELDS[i]).value.trim(); });
      await updateSelfTest(editingSelfTestId, updates);
    } else {
      await insertSelfTest(data);
    }
    selfTests = await getSelfTests(athleteId);
    renderSelfTests();
    document.getElementById("selfTestDialog").close();
  } catch (e) {
    alert("Neizdevās saglabāt: " + (e.message || e));
  }
});

document.getElementById("deleteSelfTestBtn")?.addEventListener("click", async () => {
  if (!editingSelfTestId) return;
  if (!confirm("Dzēst šo paštestu?")) return;
  try {
    await deleteSelfTest(editingSelfTestId);
    selfTests = await getSelfTests(getSelectedAthleteId());
    renderSelfTests();
    document.getElementById("selfTestDialog").close();
  } catch (e) {
    alert("Neizdevās dzēst: " + (e.message || e));
  }
});
