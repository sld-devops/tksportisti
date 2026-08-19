// "Dienasgrāmata" (Diary) panel. The athlete writes entries (the form is always
// visible at the bottom), the coach reads them. "readDiaryEntryIds" is the same
// "seen tracking via localStorage" idea as self-tests.js, except the coach is
// the one who "sees" (not the athlete) - and app.js also uses this same Set's
// state to draw the 📒 icon next to the athlete's name in the sidebar.
let diaryEntries = [];
let readDiaryEntryIds = new Set();

function loadReadDiaryIds() {
  try {
    const stored = localStorage.getItem("readDiaryEntryIds");
    if (stored) readDiaryEntryIds = new Set(JSON.parse(stored));
  } catch (e) {
    readDiaryEntryIds = new Set();
  }
}

function saveReadDiaryIds() {
  localStorage.setItem("readDiaryEntryIds", JSON.stringify([...readDiaryEntryIds]));
}

function isEntryRead(athleteId, entryId) {
  return readDiaryEntryIds.has(`${athleteId}:${entryId}`);
}

function markAllEntriesRead(athleteId, entries) {
  entries.forEach(e => readDiaryEntryIds.add(`${athleteId}:${e.id}`));
  saveReadDiaryIds();
}

loadReadDiaryIds();

const DIARY_TEXTAREA_MIN_ROWS = 2;
const DIARY_TEXTAREA_MAX_ROWS = 7;

function growDiaryTextarea(el) {
  el.rows = DIARY_TEXTAREA_MIN_ROWS;
  while (el.scrollHeight > el.clientHeight && el.rows < DIARY_TEXTAREA_MAX_ROWS) {
    el.rows++;
  }
}

function renderDiary() {
  const body = document.getElementById("diaryBody");
  if (!body) return;
  const athleteId = getSelectedAthleteId();
  const isAthleteOwner = currentUser.id === athleteId && activeRole !== "coach";
  const canEdit = isAthleteOwner;

  const panel = document.getElementById("diaryPanel");
  if (panel) {
    const header = panel.querySelector(".panel-header");
    if (isAthleteOwner) {
      panel.classList.toggle("has-entries", false);
      if (header) {
        header.dataset.count = "0";
      }
    } else {
      const unread = diaryEntries.filter(e => !isEntryRead(athleteId, e.id)).length;
      panel.classList.toggle("has-entries", unread > 0);
      if (header) {
        header.dataset.count = unread > 9 ? "9+" : String(unread);
      }
    }
  }

  if (!isAthleteOwner) {
    body.innerHTML = diaryEntries.length
      ? diaryEntries.map(e => `
          <div class="diary-entry" data-entry-id="${e.id}">
            <div class="diary-entry-header">
              <span class="diary-entry-date">${formatDateLV(e.date)}</span>
            </div>
            <div class="diary-entry-content">
              <p>${escapeHtml(e.content)}</p>
            </div>
          </div>
        `).join("")
      : "";
    return;
  }

  const list = diaryEntries.length
    ? diaryEntries.map(e => `
        <div class="diary-entry${canEdit ? " diary-entry-editable" : ""}" data-entry-id="${e.id}">
          ${canEdit ? `<div class="diary-entry-actions">
            <button class="diary-edit-btn icon-action-btn" data-edit-diary="${e.id}" type="button" title="Rediģēt">✏️</button>
            <button class="diary-delete-btn icon-action-btn is-delete" data-delete-diary="${e.id}" type="button" title="Dzēst">✕</button>
          </div>` : ""}
          <div class="diary-entry-header">
            <span class="diary-entry-date">${formatDateLV(e.date)}</span>
          </div>
          <div class="diary-entry-content">
            <p>${escapeHtml(e.content)}</p>
          </div>
        </div>
      `).join("")
    : "";

  const form = canEdit ? `
    <div class="diary-form">
      <div class="diary-form-row">
        <label>Datums <input id="newDiaryDate" type="date" class="diary-input" value="${formatDateISO(new Date())}" /></label>
      </div>
      <textarea id="newDiaryContent" class="diary-input" rows="2"></textarea>
      <button id="addDiaryBtn" class="secondary-action panel-add-btn" type="button">Pievienot</button>
    </div>
  ` : "";

  body.innerHTML = `
    <div class="diary-list">${list}</div>
    ${form}
  `;

  body.querySelector("#newDiaryContent")?.addEventListener("input", (e) => growDiaryTextarea(e.target));

  body.querySelector("#addDiaryBtn")?.addEventListener("click", async () => {
    const date = document.getElementById("newDiaryDate")?.value;
    const content = document.getElementById("newDiaryContent")?.value.trim();
    if (!date || !content) { alert("Lūdzu, aizpildiet datumu un saturu!"); return; }
    try {
      await insertDiaryEntry({ athlete_id: athleteId, date, content });
      document.getElementById("newDiaryDate").value = formatDateISO(new Date());
      document.getElementById("newDiaryContent").value = "";
      diaryEntries = await getDiaryEntries(athleteId);
      renderDiary();
    } catch (e) {
      alert("Neizdevās saglabāt: " + (e.message || e));
    }
  });

}

// Diary body delegated click handler — added once, not per render
//
// `e.target.closest(".class")`, starting from the element that was actually
// clicked, goes UP the DOM tree and finds the nearest ancestor (or the element
// itself) that has this class - useful when a button contains other elements
// (e.g. an icon), since a click on the icon's "target" would be the icon, not
// the button itself.
document.getElementById("diaryBody")?.addEventListener("click", async (e) => {
  const editBtn = e.target.closest(".diary-edit-btn");
  if (editBtn) {
    e.preventDefault();
    const id = editBtn.dataset.editDiary;
    const entry = diaryEntries.find(en => en.id === id);
    if (!entry) return;
    const entryEl = editBtn.closest(".diary-entry");
    const contentDiv = entryEl?.querySelector(".diary-entry-content");
    if (!contentDiv) return;
    contentDiv.innerHTML = `
      <textarea class="diary-edit-textarea" rows="3">${escapeHtml(entry.content)}</textarea>
      <button class="primary-action diary-save-edit-btn" type="button">Saglabāt</button>
    `;
    return;
  }

  const saveBtn = e.target.closest(".diary-save-edit-btn");
  if (saveBtn) {
    e.preventDefault();
    const entryEl = saveBtn.closest(".diary-entry");
    const id = entryEl?.dataset.entryId;
    const textarea = entryEl?.querySelector("textarea");
    if (!id || !textarea) return;
    const content = textarea.value.trim();
    if (!content) return;
    try {
      await updateDiaryEntry(id, { content });
      diaryEntries = await getDiaryEntries(getSelectedAthleteId());
      renderDiary();
    } catch (e) {
      console.error(e);
    }
    return;
  }

  const deleteBtn = e.target.closest(".diary-delete-btn");
  if (deleteBtn) {
    e.preventDefault();
    const id = deleteBtn.dataset.deleteDiary;
    if (!confirm("Dzēst šo ierakstu?")) return;
    try {
      await deleteDiaryEntry(id);
      diaryEntries = diaryEntries.filter(en => en.id !== id);
      renderDiary();
    } catch (e) {
      console.error(e);
    }
    return;
  }
});
