// "Records" panel - the five standard row distances (RECORD_DISTANCES)
// always render in a fixed order, the rest ("custom") render below them.
// The form is a <dialog> (not an inline panel), because this dialog is also
// used by panels/races.js (the "Save as record" 🏅 button), so it was not
// split into an inline form like the newer panels.
let records = [];
let seenRecordIds = new Set();
let editingRecordId = null;

function loadSeenRecordIds() {
  try {
    const stored = localStorage.getItem("seenRecordIds");
    if (stored) seenRecordIds = new Set(JSON.parse(stored));
  } catch (e) {
    seenRecordIds = new Set();
  }
}

function saveSeenRecordIds() {
  localStorage.setItem("seenRecordIds", JSON.stringify([...seenRecordIds]));
}

function isRecordSeen(athleteId, recordId) {
  return seenRecordIds.has(`${athleteId}:${recordId}`);
}

function markAllRecordsSeen(athleteId, records) {
  records.forEach(r => seenRecordIds.add(`${athleteId}:${r.id}`));
  saveSeenRecordIds();
}

loadSeenRecordIds();

const recordDialog = document.getElementById("recordDialog");
const recordDistSelect = document.getElementById("recordDistSelect");
const recordTimeInput = document.getElementById("recordTimeInput");
const recordLocation = document.getElementById("recordLocation");
const recordCompetition = document.getElementById("recordCompetition");
const recordDate = document.getElementById("recordDate");
const saveRecordBtn = document.getElementById("saveRecordBtn");
const deleteRecordBtn = document.getElementById("deleteRecordBtn");
const recordCustomDistRow = document.getElementById("recordCustomDistRow");
const recordCustomDist = document.getElementById("recordCustomDist");

function renderRecordRow(r, canEditRecords) {
  const pace = calcPace(r.time, r.distance);
  const title = r.competition_name
    ? `${escapeHtml(r.competition_name)}${r.location ? ` (${escapeHtml(r.location)})` : ""}`
    : (r.location ? escapeHtml(r.location) : "");

  return `
    <div class="profile-record-row ${canEditRecords ? "record-clickable" : ""}" ${canEditRecords ? `data-edit-record="${r.id}"` : ""}>
      ${r.date ? `<div class="record-chip-date">${formatDateLV(r.date)}</div>` : ""}
      ${title ? `<div class="record-row-title">${title}</div>` : ""}
      <div class="record-row-line">Distance: <strong>${escapeHtml(r.distance)}</strong></div>
      <div class="record-row-line">Kopējais laiks: <strong>${escapeHtml(r.time)}</strong></div>
      ${pace ? `<div class="record-row-line">Temps: <strong>${pace}</strong></div>` : ""}
    </div>
  `;
}

// The rows the records panel always shows, in order. A record only lands in
// one of them if its `distance` string equals `value` exactly.
const RECORD_DISTANCES = [
  { value: "1 jūdze", label: "1 jūdze" },
  { value: "5 km", label: "5 km" },
  { value: "10 km", label: "10 km" },
  { value: "21 km", label: "Pusmaratons" },
  { value: "42 km", label: "Maratons" },
];

// "5km", "5 km", "21.1km", "1 jūdze", "400m" -> metres, so a race distance and
// a record distance compare equal even when they are written differently.
// 0 means "no usable number", which callers treat as "cannot match".
function distanceToMeters(text) {
  const s = String(text || "").trim().toLowerCase().replace(",", ".");
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const unit = s.slice(m.index + m[1].length).trim();
  if (/^(j[ūu]dz|mil|mi$)/.test(unit)) return Math.round(n * 1609);
  if (/^m(?![a-z])/.test(unit)) return Math.round(n);
  return Math.round(n * 1000); // km, or no unit written at all
}

// The athlete's existing record over the same distance, whatever wording it
// uses. Null when there is none, or when the distance has no number in it.
function findRecordForDistance(distanceText) {
  const meters = distanceToMeters(distanceText);
  if (!meters) return null;
  return records.find((r) => distanceToMeters(r.distance) === meters) || null;
}

// A new record only appears in a standard row if its distance string matches
// that row's label exactly, so "5km" has to become "5 km" on the way in.
function standardRecordDistanceLabel(distanceText) {
  const meters = distanceToMeters(distanceText);
  if (!meters) return "";
  const match = RECORD_DISTANCES.find((d) => distanceToMeters(d.value) === meters);
  return match ? match.value : "";
}

function renderRecords() {
  const athleteId = getSelectedAthleteId();
  const canEditRecords = currentUser.id === athleteId && activeRole !== "coach";

  const recordDistances = RECORD_DISTANCES;

  const standardDists = new Set(recordDistances.map((d) => d.value));
  const customRecords = records.filter((r) => !standardDists.has(r.distance));

  const recordsHtml = recordDistances
    .map((rd) => {
      const r = records.find((rec) => rec.distance === rd.value);
      if (!r) return "";
      return renderRecordRow(r, canEditRecords);
    })
    .join("");

  document.getElementById("recordsBody").innerHTML = `
    <div class="profile-section">
      <div class="profile-records" id="profileRecords">
        ${recordsHtml}
        ${customRecords.map((r) => renderRecordRow(r, canEditRecords)).join("")}
      </div>
      ${canEditRecords ? '<button class="secondary-action panel-add-btn" id="addRecordEntryBtn" type="button">Pievienot</button>' : ""}
    </div>
  `;

  document.querySelectorAll("[data-edit-record]").forEach((btn) => {
    btn.addEventListener("click", () => openRecordDialog(btn.dataset.editRecord));
  });

  document.querySelectorAll("[data-add-record]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openRecordDialog(null);
      const distSelect = document.getElementById("recordDistSelect");
      if (distSelect) distSelect.value = btn.dataset.addRecord;
    });
  });

  document.getElementById("addRecordEntryBtn")?.addEventListener("click", () => {
    openRecordDialog(null);
  });

  const panel = document.getElementById("recordsPanel");
  if (panel) {
    const header = panel.querySelector(".panel-header");
    if (activeRole === "coach") {
      const unseen = records.filter(r => !isRecordSeen(athleteId, r.id)).length;
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

recordDistSelect.addEventListener("change", () => {
  recordCustomDistRow.hidden = recordDistSelect.value !== "__other__";
});

function openRecordDialog(recordId) {
  editingRecordId = recordId;
  if (recordId) {
    const r = records.find((rec) => rec.id === recordId);
    if (!r) return;
    const isOther = !["1 jūdze", "5 km", "10 km", "21 km", "42 km"].includes(r.distance);
    recordDistSelect.value = isOther ? "__other__" : r.distance;
    recordCustomDistRow.hidden = !isOther;
    recordCustomDist.value = isOther ? r.distance : "";
    recordTimeInput.value = r.time;
    recordLocation.value = r.location || "";
    recordCompetition.value = r.competition_name || "";
    recordDate.value = r.date || "";
    deleteRecordBtn.hidden = false;
  } else {
    recordDistSelect.value = "";
    recordCustomDistRow.hidden = true;
    recordCustomDist.value = "";
    recordTimeInput.value = "";
    recordLocation.value = "";
    recordCompetition.value = "";
    recordDate.value = formatDateISO(new Date());
    deleteRecordBtn.hidden = true;
  }
  recordDialog.showModal();
}

saveRecordBtn.addEventListener("click", async () => {
  const distance = recordDistSelect.value === "__other__"
    ? recordCustomDist.value.trim()
    : recordDistSelect.value;
  const data = {
    athlete_id: getSelectedAthleteId(),
    distance,
    time: recordTimeInput.value.trim(),
    location: recordLocation.value.trim(),
    competition_name: recordCompetition.value.trim(),
    date: recordDate.value,
  };
  if (!distance) return;
  try {
    if (editingRecordId) {
      await updateRecord(editingRecordId, data);
    } else {
      await insertRecord(data);
    }
    recordDialog.close();
    records = await getRecords(getSelectedAthleteId());
    render();
  } catch (e) {
    console.error(e);
  }
});

deleteRecordBtn.addEventListener("click", async () => {
  if (!editingRecordId) return;
  try {
    await deleteRecord(editingRecordId);
    recordDialog.close();
    records = await getRecords(getSelectedAthleteId());
    render();
  } catch (e) {
    console.error(e);
  }
});
