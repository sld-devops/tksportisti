// "Restrictions" panel (coach marks days/times the athlete CANNOT
// train). The athlete picks dates by clicking on the small calendar
// (`restrictionSelectedDates`, a Set of the selected ISO dates), and on
// save they get grouped into consecutive periods (see saveRestrictionForm
// below). `end_date: null` means "single day", not "open-ended" - see
// CLAUDE.md for this convention, which the health journal shares too.
let restrictions = [];
let restrictionSelectedDates = new Set();
let restrictionEditingId = null;
let restrictionCalYear = new Date().getFullYear();
let restrictionCalMonth = new Date().getMonth();

// #region Restriction-checking helper functions (also used by app.js's calendar)
function isTimeSlotRestricted(dateStr, tod, list = restrictions) {
  const dayRestrictions = list.filter(r =>
    dateStr >= r.start_date && dateStr <= (r.end_date || r.start_date)
  );
  if (dayRestrictions.length === 0) return false;
  for (const r of dayRestrictions) {
    if (!r.time_of_day) return true;
    if (tod && r.time_of_day === tod) return true;
  }
  return false;
}

function isDayFullyRestricted(dateStr) {
  return isTimeSlotRestricted(dateStr, "morning") &&
         isTimeSlotRestricted(dateStr, "afternoon") &&
         isTimeSlotRestricted(dateStr, "evening");
}

function getRestrictedTods(dateStr) {
  const tods = ["morning", "afternoon", "evening"];
  return tods.filter(tod => isTimeSlotRestricted(dateStr, tod));
}

// #endregion

// #region Form state and the small calendar
function renderRestrictions() {
  renderRestrictionCards();
}

function startRestrictionEdit(restrictionId) {
  restrictionEditingId = restrictionId || null;
  restrictionSelectedDates = new Set();
  restrictionCalYear = new Date().getFullYear();
  restrictionCalMonth = new Date().getMonth();

  if (restrictionId) {
    const r = restrictions.find(x => x.id === restrictionId);
    if (r) {
      if (r.end_date) {
        const start = new Date(r.start_date);
        const end = new Date(r.end_date);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          restrictionSelectedDates.add(formatDateISO(d));
        }
      } else {
        restrictionSelectedDates.add(r.start_date);
      }
      restrictionCalYear = new Date(r.start_date).getFullYear();
      restrictionCalMonth = new Date(r.start_date).getMonth();
    }
  }

  renderRestrictionCards();
  document.querySelector("#restrictionsBody .restriction-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function cancelRestrictionEdit() {
  restrictionEditingId = null;
  restrictionSelectedDates = new Set();
  renderRestrictionCards();
}

function renderMiniCalendar() {
  const container = document.getElementById("miniCalendar");
  if (!container) return;

  const monthNames = ["Janvāris", "Februāris", "Marts", "Aprīlis", "Maijs", "Jūnijs", "Jūlijs", "Augusts", "Septembris", "Oktobris", "Novembris", "Decembris"];
  const dayNames = ["Pr", "Ot", "Tr", "Ce", "Pk", "Se", "Sv"];
  const today = new Date();
  const todayStr = formatDateISO(today);

  const firstDay = new Date(restrictionCalYear, restrictionCalMonth, 1);
  const lastDay = new Date(restrictionCalYear, restrictionCalMonth + 1, 0);
  let startDow = firstDay.getDay();
  if (startDow === 0) startDow = 7;
  startDow--;

  let html = `<div class="mini-calendar-header">
    <button class="mini-calendar-nav" id="miniCalPrev" type="button">←</button>
    <span class="mini-calendar-month">${monthNames[restrictionCalMonth]} ${restrictionCalYear}</span>
    <button class="mini-calendar-nav" id="miniCalNext" type="button">→</button>
  </div>`;

  html += '<div class="mini-calendar-grid">';
  for (const dn of dayNames) {
    html += `<div class="mini-calendar-dayname">${dn}</div>`;
  }

  for (let i = 0; i < startDow; i++) {
    html += '<div class="mini-calendar-day empty"></div>';
  }

  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date = new Date(restrictionCalYear, restrictionCalMonth, d);
    const dateStr = formatDateISO(date);
    let cls = "mini-calendar-day";
    if (dateStr === todayStr) cls += " today";
    if (restrictionSelectedDates.has(dateStr)) cls += " selected";

    html += `<div class="${cls}" data-date="${dateStr}">${d}</div>`;
  }

  html += '</div>';
  container.innerHTML = html;

  document.getElementById("miniCalPrev")?.addEventListener("click", () => {
    restrictionCalMonth--;
    if (restrictionCalMonth < 0) { restrictionCalMonth = 11; restrictionCalYear--; }
    renderMiniCalendar();
  });
  document.getElementById("miniCalNext")?.addEventListener("click", () => {
    restrictionCalMonth++;
    if (restrictionCalMonth > 11) { restrictionCalMonth = 0; restrictionCalYear++; }
    renderMiniCalendar();
  });

  container.querySelectorAll(".mini-calendar-day:not(.empty)").forEach(cell => {
    cell.addEventListener("click", (e) => {
      e.preventDefault();
      const dateStr = cell.dataset.date;
      if (restrictionSelectedDates.has(dateStr)) {
        restrictionSelectedDates.delete(dateStr);
      } else {
        restrictionSelectedDates.add(dateStr);
      }
      renderMiniCalendar();
      updateSelectedDatesList();
      updateSaveButtonState();
    });
  });
}

function updateSelectedDatesList() {
  const el = document.getElementById("selectedDatesList");
  if (!el) return;
  const sorted = [...restrictionSelectedDates].sort();
  if (sorted.length === 0) {
    el.textContent = "";
    return;
  }
  if (sorted.length <= 5) {
    el.textContent = sorted.map(d => formatDateLV(d)).join(", ");
  } else {
    el.textContent = `${formatDateLV(sorted[0])} — ${formatDateLV(sorted[sorted.length - 1])} (${sorted.length} dienas)`;
  }
}

function updateSaveButtonState() {
  const btn = document.getElementById("saveRestrictionBtn");
  if (btn) {
    btn.disabled = restrictionSelectedDates.size === 0;
  }
}

// #endregion

// #region Saving and rendering the cards
async function saveRestrictionForm() {
  const reason = document.getElementById("restrictionReasonInput")?.value.trim();
  if (!reason) { alert("Lūdzu, uzrakstiet iemeslu!"); return; }
  if (restrictionSelectedDates.size === 0) { alert("Lūdzu, izvēlieties vismaz vienu datumu!"); return; }

  const todRadio = document.querySelector('input[name="restrictionTod"]:checked');
  const tod = todRadio?.value || null;
  const athleteId = getSelectedAthleteId();

  // The selected dates are individual points on the calendar (e.g. Aug 3,
  // 4, 5 and 10), but in the database each entry is ONE continuous period
  // (start_date..end_date). This loop "glues" the sorted dates into
  // consecutive periods: as long as each next date is exactly +1 day from
  // the previous one, it extends the current period; as soon as there is a
  // gap (e.g. from the 5th to the 10th), the previous period is closed off
  // and a new one starts. As a result, Aug 3-5 and Aug 10 become two
  // separate `insertRestriction` calls.
  const sorted = [...restrictionSelectedDates].sort();
  const ranges = [];
  if (sorted.length > 0) {
    let rangeStart = sorted[0];
    let rangeEnd = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(sorted[i]);
      const diff = (curr - prev) / (1000 * 60 * 60 * 24);
      if (diff === 1) {
        rangeEnd = sorted[i];
      } else {
        ranges.push({ start: rangeStart, end: rangeEnd === rangeStart ? null : rangeEnd });
        rangeStart = sorted[i];
        rangeEnd = sorted[i];
      }
    }
    ranges.push({ start: rangeStart, end: rangeEnd === rangeStart ? null : rangeEnd });
  }

  try {
    if (restrictionEditingId) {
      await deleteRestriction(restrictionEditingId);
    }
    for (const range of ranges) {
      await insertRestriction({
        athlete_id: athleteId,
        start_date: range.start,
        end_date: range.end,
        time_of_day: tod || null,
        reason
      });
    }
    restrictionEditingId = null;
    restrictionSelectedDates = new Set();
    await loadNonTemplateData();
  } catch (e) {
    alert("Neizdevās saglabāt: " + (e.message || e));
  }
}

function renderRestrictionCards() {
  const body = document.getElementById("restrictionsBody");
  if (!body) return;
  const canEdit = currentUser.id === getSelectedAthleteId() && activeRole !== "coach";

  const todayStr = formatDateISO(new Date());
  const activeRestrictions = restrictions.filter(r =>
    !r.end_date
      ? r.start_date >= todayStr
      : r.end_date >= todayStr
  );

  const panel = document.getElementById("restrictionsPanel");
  if (panel) {
    const header = panel.querySelector(".panel-header");
    panel.classList.toggle("has-restrictions", activeRestrictions.length > 0);
    if (header) {
      header.dataset.count = activeRestrictions.length > 9 ? "9+" : String(activeRestrictions.length);
    }
  }

  // Only current and upcoming restrictions are listed. A restriction that has
  // already passed is history, not something to act on — it stays visible in
  // the week/month calendar so it can still be looked back at, but it is not
  // left cluttering this panel. `restrictions` itself is untouched, so the
  // calendar renderers keep seeing every row.
  const pastCount = restrictions.length - activeRestrictions.length;
  const list = activeRestrictions.length
    ? activeRestrictions.map(r => {
        const period = r.end_date
          ? `${formatDateLV(r.start_date)} — ${formatDateLV(r.end_date)}`
          : formatDateLV(r.start_date);
        // The shared .tod-badge, same as a plan card and the athlete's own
        // record, so Rīts/Pusdiena/Vakars is one colour app-wide and stays that
        // way. .restriction-tod-badge is only the position beside the date now.
        const todBadge = r.time_of_day ? `<span class="tod-badge restriction-tod-badge tod-${r.time_of_day}">${todLabel(r.time_of_day)}</span>` : "";
        return `
          <div class="restriction-card${canEdit ? " restriction-card-editable" : ""}">
            ${canEdit ? `<div class="restriction-card-actions">
              <button class="edit-restriction-btn icon-action-btn" data-edit-restriction="${r.id}" type="button" title="Rediģēt">✏️</button>
              <button class="delete-restriction-btn icon-action-btn is-delete" data-restriction="${r.id}" type="button" title="Dzēst">✕</button>
            </div>` : ""}
            <div class="restriction-card-header">
              <span class="restriction-dates">${period}</span>
              ${todBadge}
            </div>
            <div class="restriction-card-reason">${escapeHtml(r.reason)}</div>
          </div>
        `;
      }).join("")
    : "";

  const pastNote = pastCount
    ? `<div class="restriction-past-note">Pagājušie ierobežojumi (${pastCount}) šeit vairs netiek rādīti — tie paliek redzami nedēļas un mēneša skatā.</div>`
    : "";

  const editing = restrictionEditingId ? restrictions.find(x => x.id === restrictionEditingId) : null;
  const todOptions = [
    { value: "", label: "Visa diena", cls: "tod-all" },
    { value: "morning", label: "🌄 Rīts", cls: "tod-morning" },
    { value: "afternoon", label: "☀️ Pusdiena", cls: "tod-afternoon" },
    { value: "evening", label: "🌇 Vakars", cls: "tod-evening" },
  ];
  const currentTod = editing ? (editing.time_of_day || "") : "";
  const todRadiosHtml = todOptions.map(opt => `
    <label class="tod-radio-label ${opt.cls}">
      <input type="radio" name="restrictionTod" value="${opt.value}" ${opt.value === currentTod ? "checked" : ""}> ${opt.label}
    </label>
  `).join("");

  const form = canEdit ? `
    <div class="restriction-form">
      <h3 class="restriction-form-title">${editing ? "Rediģēt ierobežojumu" : "Jauns ierobežojums"}</h3>
      <div class="mini-calendar" id="miniCalendar"></div>
      <div class="selected-dates-list" id="selectedDatesList"></div>
      <div class="tod-radio-group">${todRadiosHtml}</div>
      <label>Iemesls <textarea id="restrictionReasonInput" class="restriction-input" rows="2">${editing ? escapeHtml(editing.reason || "") : ""}</textarea></label>
      <div class="restriction-form-actions">
        ${editing ? `<button class="cancel-action panel-add-btn" id="cancelRestrictionEditBtn" type="button">Atcelt</button>` : ""}
        <button class="secondary-action panel-add-btn" id="saveRestrictionBtn" type="button" disabled>${editing ? "Saglabāt" : "Pievienot"}</button>
      </div>
    </div>
  ` : "";

  body.innerHTML = `
    <div class="restriction-list">${list}</div>
    ${pastNote}
    ${form}
  `;

  document.querySelectorAll(".edit-restriction-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      startRestrictionEdit(btn.dataset.editRestriction);
    });
  });

  document.querySelectorAll(".delete-restriction-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Dzēst šo ierobežojumu?")) return;
      try {
        await deleteRestriction(btn.dataset.restriction);
        if (restrictionEditingId === btn.dataset.restriction) {
          restrictionEditingId = null;
          restrictionSelectedDates = new Set();
        }
        await loadNonTemplateData();
      } catch (e) {
        alert("Neizdevās dzēst: " + (e.message || e));
      }
    });
  });

  if (canEdit) {
    renderMiniCalendar();
    updateSelectedDatesList();
    updateSaveButtonState();
    document.getElementById("saveRestrictionBtn")?.addEventListener("click", saveRestrictionForm);
    document.getElementById("cancelRestrictionEditBtn")?.addEventListener("click", cancelRestrictionEdit);
  }
}
// #endregion
