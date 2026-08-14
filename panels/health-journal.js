// "Veselības žurnāls" panelis - tāda pati "seen" izsekošana kā self-tests.js
// (skat. tā komentārus), bet pievienošanas/rediģēšanas forma nav dialogā -
// tā zīmējas TIEŠI PAŠĀ PANELĪ (`.health-form` HTML zemāk renderHealthJournal
// iekšā), atkarībā no `editingHealthId` (null = jauna ieraksta forma, id =
// rediģē to konkrēto ierakstu). `end_date: null` nozīmē "viena diena", nevis
// "bez beigu datuma" - skat. CLAUDE.md par šo konvenciju.
let healthEntries = [];
let editingHealthId = null;
let seenHealthIds = new Set();

function loadSeenHealthIds() {
  try {
    const stored = localStorage.getItem("seenHealthIds");
    if (stored) seenHealthIds = new Set(JSON.parse(stored));
  } catch (e) {
    seenHealthIds = new Set();
  }
}

function saveSeenHealthIds() {
  localStorage.setItem("seenHealthIds", JSON.stringify([...seenHealthIds]));
}

function isHealthSeen(entryId) {
  return seenHealthIds.has(entryId);
}

function markAllHealthSeen(entries) {
  entries.forEach(e => seenHealthIds.add(e.id));
  saveSeenHealthIds();
}

loadSeenHealthIds();

// Zīmē visu paneli uzreiz - saraksts + (ja sportists skatās savu profilu)
// forma zem tā. Tā kā šī funkcija pati sevi izsauc no jauna pēc katras
// darbības (startHealthEdit, cancelHealthEdit, saveHealthEntry), forma vienmēr
// rāda pareizo stāvokli (tukša / aizpildīta rediģēšanai).
function renderHealthJournal() {
  const body = document.getElementById("healthJournalBody");
  if (!body) return;
  const athleteId = getSelectedAthleteId();
  const isAthleteOwner = currentUser.id === athleteId && activeRole !== "coach";

  let html = "";

  if (!healthEntries.length) {
    html += "";
  } else {
    html += `<div class="health-list">`;
    healthEntries.forEach(e => {
      const dateLabel = e.end_date
        ? `${e.start_date} – ${e.end_date}`
        : e.start_date;
      html += `<div class="health-entry${isAthleteOwner ? " health-clickable" : ""}" data-health-id="${e.id}">
        <div class="health-entry-header">
          <span class="health-entry-date">${dateLabel}</span>
        </div>
        <div class="health-entry-text">${escapeHtml(e.description)}</div>
      </div>`;
    });
    html += `</div>`;
  }

  const editing = editingHealthId ? healthEntries.find(h => h.id === editingHealthId) : null;

  if (isAthleteOwner) {
    html += `
      <div class="health-form">
        <h3 class="health-form-title">${editing ? "Rediģēt ierakstu" : "Jauns ieraksts"}</h3>
        <div class="field-grid">
          <label>No <input id="hjStartDate" type="date" value="${editing ? editing.start_date : formatDateISO(new Date())}" /></label>
          <label>Līdz (tukšs, ja viena diena) <input id="hjEndDate" type="date" value="${editing?.end_date || ""}" /></label>
        </div>
        <label>Apraksts <textarea id="hjDescription" rows="4">${editing ? escapeHtml(editing.description || "") : ""}</textarea></label>
        <div class="health-form-actions">
          ${editing ? `<button class="delete-action" id="deleteHealthBtn" type="button">Dzēst</button>` : ""}
          ${editing ? `<button class="cancel-action panel-add-btn" id="cancelHealthEditBtn" type="button">Atcelt</button>` : ""}
          <button class="secondary-action panel-add-btn" id="saveHealthBtn" type="button">${editing ? "Saglabāt" : "Pievienot"}</button>
        </div>
      </div>
    `;
  }

  body.innerHTML = html;

  if (isAthleteOwner) {
    body.querySelectorAll("[data-health-id]").forEach(el => {
      el.addEventListener("click", () => startHealthEdit(el.dataset.healthId));
    });
    document.getElementById("saveHealthBtn")?.addEventListener("click", saveHealthEntry);
    document.getElementById("cancelHealthEditBtn")?.addEventListener("click", cancelHealthEdit);
    document.getElementById("deleteHealthBtn")?.addEventListener("click", deleteHealthEntryHandler);
  }

  const panel = document.getElementById("healthJournalPanel");
  if (panel) {
    const header = panel.querySelector(".panel-header");
    if (activeRole === "coach") {
      const unseen = healthEntries.filter(e => !isHealthSeen(e.id)).length;
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

function startHealthEdit(entryId) {
  editingHealthId = entryId || null;
  renderHealthJournal();
  document.querySelector("#healthJournalBody .health-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function cancelHealthEdit() {
  editingHealthId = null;
  renderHealthJournal();
}

async function saveHealthEntry() {
  const athleteId = getSelectedAthleteId();
  const startDate = document.getElementById("hjStartDate").value;
  const endDate = document.getElementById("hjEndDate").value || null;
  const description = document.getElementById("hjDescription").value.trim();

  if (!startDate) return;
  if (!description) return;

  const data = {
    athlete_id: athleteId,
    start_date: startDate,
    end_date: endDate,
    description,
  };

  try {
    if (editingHealthId) {
      await updateHealthEntry(editingHealthId, data);
    } else {
      await insertHealthEntry(data);
    }
    editingHealthId = null;
    healthEntries = await getHealthEntries(athleteId);
    await refreshAthleteHealthSet();
    render();
  } catch (e) {
    console.error(e);
  }
}

async function deleteHealthEntryHandler() {
  if (!editingHealthId) return;
  if (!confirm("Dzēst šo ierakstu?")) return;
  try {
    await deleteHealthEntry(editingHealthId);
    editingHealthId = null;
    healthEntries = await getHealthEntries(getSelectedAthleteId());
    await refreshAthleteHealthSet();
    render();
  } catch (e) {
    console.error(e);
  }
}
