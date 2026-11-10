// "Veselības žurnāls" (Health journal) panel - the same "seen" tracking as
// self-tests.js (see its comments), but the add/edit form is not in a dialog -
// it renders DIRECTLY IN THE PANEL ITSELF (the `.health-form` HTML below,
// inside renderHealthJournal), depending on `editingHealthId` (null = new
// entry form, id = editing that specific entry). `end_date: null` means
// "single day", not "no end date" - see CLAUDE.md for this convention.
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

// Draws the whole panel at once - the list + (if the athlete is viewing their
// own profile) the form below it. Since this function re-invokes itself after
// every action (startHealthEdit, cancelHealthEdit, saveHealthEntry), the form
// always shows the correct state (empty / filled in for editing).
// A long entry shows its first 5 lines; a small arrow under it opens the rest.
// The arrow appears only when the text really is longer than 5 lines, which can
// only be measured once the panel has a size - hence the ResizeObserver (it also
// fires when the closed panel is opened).
const healthExpandedIds = new Set();
let healthOverflowObserver = null;

function measureHealthOverflow(body) {
  body.querySelectorAll(".health-entry").forEach((entry) => {
    const text = entry.querySelector(".health-entry-text");
    const btn = entry.querySelector(".health-more-btn");
    if (!text || !btn || text.classList.contains("is-expanded")) return;
    btn.hidden = !(text.scrollHeight > text.clientHeight + 1);
  });
}

function watchHealthOverflow(body) {
  if (healthOverflowObserver) healthOverflowObserver.disconnect();
  if (typeof ResizeObserver === "undefined") {
    // No observer: show the arrow on every entry rather than hide the text.
    body.querySelectorAll(".health-more-btn").forEach((b) => { b.hidden = false; });
    return;
  }
  healthOverflowObserver = new ResizeObserver(() => measureHealthOverflow(body));
  body.querySelectorAll(".health-entry-text").forEach((t) => healthOverflowObserver.observe(t));
  requestAnimationFrame(() => measureHealthOverflow(body));
}

function wireHealthMoreButtons(body) {
  body.querySelectorAll(".health-more-btn").forEach((btn) => {
    btn.addEventListener("click", (ev) => {
      // The row itself is clickable (athlete: opens the edit form) - the arrow must not.
      ev.stopPropagation();
      const id = btn.dataset.toggleHealth;
      const open = !healthExpandedIds.has(id);
      if (open) healthExpandedIds.add(id); else healthExpandedIds.delete(id);
      btn.closest(".health-entry").querySelector(".health-entry-text").classList.toggle("is-expanded", open);
      btn.setAttribute("aria-expanded", String(open));
      btn.querySelector(".health-more-label").textContent = open ? "Rādīt mazāk" : "Rādīt visu";
      if (!open) measureHealthOverflow(body);
    });
  });
}

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
        <div class="health-entry-text${healthExpandedIds.has(e.id) ? " is-expanded" : ""}">${escapeHtml(e.description)}</div>
        <button class="health-more-btn" type="button" data-toggle-health="${e.id}" aria-expanded="${healthExpandedIds.has(e.id)}" hidden>
          <span class="health-more-arrow" aria-hidden="true">▶</span><span class="health-more-label">${healthExpandedIds.has(e.id) ? "Rādīt mazāk" : "Rādīt visu"}</span>
        </button>
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
  wireHealthMoreButtons(body);
  watchHealthOverflow(body);

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
    const isNew = !editingHealthId;
    if (editingHealthId) {
      await updateHealthEntry(editingHealthId, data);
    } else {
      await insertHealthEntry(data);
    }
    if (!isCoach()) {
      const who = currentProfile?.full_name || "Sportists";
      const dateRange = endDate ? `${formatDateLV(startDate)}–${formatDateLV(endDate)}` : formatDateLV(startDate);
      queueNotificationEmail("health:" + athleteId, {
        target: "coach",
        subject: `${isNew ? "Jauns" : "Mainīts"} veselības ieraksts: ${who} (${dateRange})`,
        message: `${who} ${isNew ? "pievienoja" : "izmainīja"} veselības žurnāla ierakstu (${dateRange}).\n${description}\n\nAtver lietotni: https://tksportisti.netlify.app`,
      });
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
