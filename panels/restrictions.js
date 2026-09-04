// "Restrictions" panel (coach marks days/times the athlete CANNOT
// train). The athlete picks dates by clicking on the small calendar
// (`restrictionSelectedDates`, a Set of the selected ISO dates), and on
// save they get grouped into consecutive periods (see saveRestrictionForm
// below). `end_date: null` means "single day", not "open-ended" - see
// CLAUDE.md for this convention, which the health journal shares too.
let restrictions = [];
let restrictionSelectedDates = new Set();
let restrictionEditingIds = [];
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

function startRestrictionEdit(idsCsv) {
  restrictionEditingIds = idsCsv ? idsCsv.split(",") : [];
  restrictionSelectedDates = new Set();
  restrictionCalYear = new Date().getFullYear();
  restrictionCalMonth = new Date().getMonth();

  if (restrictionEditingIds.length) {
    // All rows in a group share the same date(s) - only the first is needed.
    const r = restrictions.find(x => x.id === restrictionEditingIds[0]);
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
  restrictionEditingIds = [];
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

  const todBoxes = [...document.querySelectorAll('input[name="restrictionTod"]:checked')];
  if (todBoxes.length === 0) { alert("Lūdzu, izvēlieties vismaz vienu dienas laiku!"); return; }
  const tods = todBoxes.map(cb => cb.value || null);
  const athleteId = getSelectedAthleteId();

  // The selected dates are individual points on the calendar (e.g. Aug 3,
  // 4, 5 and 10), but in the database each entry is ONE continuous period
  // (start_date..end_date). This loop "glues" the sorted dates into
  // consecutive periods: as long as each next date is exactly +1 day from
  // the previous one, it extends the current period; as soon as there is a
  // gap (e.g. from the 5th to the 10th), the previous period is closed off
  // and a new one starts. As a result, Aug 3-5 and Aug 10 become two
  // separate periods - and each of those becomes one `insertRestriction`
  // call per selected day-part (`tods`), since a row only ever holds one.
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
    for (const id of restrictionEditingIds) {
      await deleteRestriction(id);
    }
    for (const range of ranges) {
      for (const tod of tods) {
        await insertRestriction({
          athlete_id: athleteId,
          start_date: range.start,
          end_date: range.end,
          time_of_day: tod,
          reason
        });
      }
    }
    if (!isCoach()) {
      const who = currentProfile?.full_name || "Sportists";
      const rangeText = ranges.map(r => r.end ? `${formatDateLV(r.start)}–${formatDateLV(r.end)}` : formatDateLV(r.start)).join(", ");
      queueNotificationEmail("restriction:" + athleteId, {
        target: "coach",
        subject: `Jauns ierobežojums: ${who} (${rangeText})`,
        message: `${who} pievienoja/mainīja ierobežojumu (${rangeText}).\nIemesls: ${reason}\n\nAtver lietotni: https://tksportisti.netlify.app`,
      });
    }
    restrictionEditingIds = [];
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

  // A single form save can produce several rows sharing the same date(s) and
  // reason - one per selected day-part (see saveRestrictionForm). There is no
  // group id for that in the database; rows are grouped for display purely by
  // matching start_date+end_date+reason, and shown as one card with all of
  // that group's day-part badges side by side.
  const TOD_ORDER = ["", "morning", "afternoon", "evening"];
  const groups = new Map();
  activeRestrictions.forEach(r => {
    const key = `${r.start_date}|${r.end_date || ""}|${r.reason}`;
    if (!groups.has(key)) groups.set(key, { start_date: r.start_date, end_date: r.end_date, reason: r.reason, rows: [] });
    groups.get(key).rows.push(r);
  });

  const list = groups.size
    ? [...groups.values()].map(g => {
        g.rows.sort((a, b) => TOD_ORDER.indexOf(a.time_of_day || "") - TOD_ORDER.indexOf(b.time_of_day || ""));
        const period = g.end_date
          ? `${formatDateLV(g.start_date)} — ${formatDateLV(g.end_date)}`
          : formatDateLV(g.start_date);
        // The shared .tod-badge, same as a plan card and the athlete's own
        // record, so Rīts/Pusdiena/Vakars is one colour app-wide and stays that
        // way. .restriction-tod-badge is only the position beside the date now.
        const todBadges = g.rows.map(r => r.time_of_day ? `<span class="tod-badge restriction-tod-badge tod-${r.time_of_day}">${todLabel(r.time_of_day)}</span>` : "").join("");
        const ids = g.rows.map(r => r.id).join(",");
        return `
          <div class="restriction-card${canEdit ? " restriction-card-editable" : ""}">
            ${canEdit ? `<div class="restriction-card-actions">
              <button class="edit-restriction-btn icon-action-btn" data-edit-restriction="${ids}" type="button" title="Rediģēt">✏️</button>
              <button class="delete-restriction-btn icon-action-btn is-delete" data-restriction="${ids}" type="button" title="Dzēst">✕</button>
            </div>` : ""}
            <div class="restriction-card-header">
              <span class="restriction-dates">${period}</span>
              ${todBadges}
            </div>
            <div class="restriction-card-reason">${escapeHtml(g.reason)}</div>
          </div>
        `;
      }).join("")
    : "";

  const pastNote = pastCount
    ? `<div class="restriction-past-note">Pagājušie ierobežojumi (${pastCount}) šeit vairs netiek rādīti — tie paliek redzami nedēļas un mēneša skatā.</div>`
    : "";

  const editingRows = restrictionEditingIds.length ? restrictions.filter(x => restrictionEditingIds.includes(x.id)) : [];
  const editing = editingRows[0] || null;
  const todOptions = [
    { value: "", label: "Visa diena", cls: "tod-all" },
    { value: "morning", label: "🌄 Rīts", cls: "tod-morning" },
    { value: "afternoon", label: "☀️ Pusdiena", cls: "tod-afternoon" },
    { value: "evening", label: "🌇 Vakars", cls: "tod-evening" },
  ];
  const editingTods = new Set(editingRows.map(r => r.time_of_day || ""));
  // Checkboxes, not radios - a coach/athlete may need to block more than one
  // part of the same day (e.g. morning AND evening) in one go. "Visa diena"
  // is kept mutually exclusive with the other three via the change listener
  // wired below, since it already covers them. Editing a group (see the
  // grouping above) pre-checks every day-part that group's rows cover.
  const todRadiosHtml = todOptions.map(opt => `
    <label class="tod-radio-label ${opt.cls}">
      <input type="checkbox" name="restrictionTod" value="${opt.value}" ${editingTods.has(opt.value) ? "checked" : ""}> ${opt.label}
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
      const ids = btn.dataset.restriction.split(",");
      try {
        for (const id of ids) {
          await deleteRestriction(id);
        }
        if (ids.some(id => restrictionEditingIds.includes(id))) {
          restrictionEditingIds = [];
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
    document.querySelectorAll('input[name="restrictionTod"]').forEach(cb => {
      cb.addEventListener("change", () => {
        const boxes = document.querySelectorAll('input[name="restrictionTod"]');
        if (cb.value === "" && cb.checked) {
          boxes.forEach(other => { if (other !== cb) other.checked = false; });
        } else if (cb.value !== "" && cb.checked) {
          boxes.forEach(other => { if (other.value === "") other.checked = false; });
        }
      });
    });
    document.getElementById("saveRestrictionBtn")?.addEventListener("click", saveRestrictionForm);
    document.getElementById("cancelRestrictionEditBtn")?.addEventListener("click", cancelRestrictionEdit);
  }
}
// #endregion
