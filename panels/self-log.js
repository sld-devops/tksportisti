// Athlete's own record of a training the coach never planned.
//
// Why this exists: the athlete could only log execution against a plan the
// coach had already placed. If the coach had not got round to Monday and
// Tuesday yet, the athlete had nowhere to write down what they actually did —
// they had to wait for the plan and hope it matched.
//
// Storage: an ordinary log_entries row with no plan_id. The training type and
// the free-text description live *inside* the existing log_data column under a
// "_self" marker rather than in new columns, because the owner cannot run
// migrations (same reasoning as pace_hr_map._meta in panels/profile.js).
// feeling / notes use the columns they already use everywhere else.
//
// The coach's reply is NOT stored here — it goes to day_notes.coach_comment via
// the existing data-comment-day textarea, so it belongs to the *day*, not to the
// record. A day can hold several records (2026-08-05), and they all share that
// one comment: only the first card renders the box, and renderCalendar decides
// which card that is (`dayCommentTaken`). A per-record reply would need a column
// on log_entries, which the owner cannot add.

const SELF_LOG_SECTION = "_self";

// Which day currently has the inline form open (null = none), and which
// existing record it is editing (null = a new one).
let selfLogFormDate = null;
let selfLogEditingId = null;

function isSelfLog(log) {
  return (log?.log_data || []).some((e) => e && e.section === SELF_LOG_SECTION);
}

function getSelfLogData(log) {
  return (log?.log_data || []).find((e) => e && e.section === SELF_LOG_SECTION) || {};
}

// TEMPLATE_GROUPS lives in app.js, which loads *after* this file, so this has
// to stay a function — a top-level const would run before it exists.
// "Intervāli" is the legacy unsuffixed type name; it is kept for reading old
// rows but must not be offered as a new choice.
// .flatMap(fn) ir kā .map(fn), bet, ja `fn` katram elementam atgriež masīvu
// (šeit - katras grupas `g.types` sarakstu), rezultāti tiek "izlīdzināti"
// vienā vienkāršā sarakstā, nevis sarakstā no sarakstiem.
function selfLogTypes() {
  return TEMPLATE_GROUPS.flatMap((g) => g.types).filter((t) => t !== "Intervāli");
}

// Can this athlete add a record to this day? Two conditions: they are looking at
// their own calendar, and the day has already happened. The coach never gets this
// button — a record of what the athlete did is made by the athlete — and tomorrow
// has nothing to record yet.
//
// Everything else was dropped on 2026-08-05 at the owner's request: the button
// used to appear only on a day the coach had left completely empty, with no
// record on it yet. That meant a second training on the same day could not be
// written down at all, nor anything on top of a planned session, nor anything on
// a day marked as a rest day. Those rules are gone; only the date one came back
// (same day, owner's follow-up).
//
// If you find yourself wanting another condition, put it in renderCalendar's
// `showSelfLogAdd` rather than growing this back into a set of rules.
function canAddSelfLog(dateStr) {
  return (
    activeRole === "athlete" &&
    currentUser?.id === getSelectedAthleteId() &&
    dateStr <= formatDateISO(new Date())
  );
}

function startSelfLogEdit(dateStr, logId) {
  selfLogFormDate = dateStr;
  selfLogEditingId = logId || null;
  renderCalendar();
  const ta = document.querySelector(".self-log-form .self-log-text");
  if (ta) {
    ta.focus();
    ta.closest(".day-column")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

function cancelSelfLogEdit() {
  selfLogFormDate = null;
  selfLogEditingId = null;
  renderCalendar();
}

function selfLogRatingHtml(selected) {
  const opts = FEELING_OPTIONS.map((o) => {
    // "Grūti — izpildīju ar piepūli..." -> "Grūti". The full sentence is what
    // gets stored; only the button caption is shortened, because five full
    // sentences do not fit a day column.
    const short = o.label.split("—")[0].trim();
    return `<label class="feeling-option self-log-feeling" style="--fbg:${o.bg};--fborder:${o.border};--fcolor:${o.color}" title="${escapeHtml(o.label)}">
      <input type="radio" name="selfLogRating" value="${escapeHtml(o.label)}" ${selected === o.label ? "checked" : ""} />
      <span>${escapeHtml(short)}</span>
    </label>`;
  }).join("");
  return `<div class="self-log-field-label">Pašsajūta</div><div class="self-log-rating">${opts}</div>`;
}

// The same three choices, the same wording and the same colours as a planned
// training's time of day (TOD_ORDER / todLabel in app.js) and as the
// restrictions form — one system, not a second one. Stored in the "_self"
// object next to the type and the text; no new column, so no migration.
const SELF_LOG_TODS = [
  { value: "morning", label: "🌄 Rīts" },
  { value: "afternoon", label: "☀️ Pusdiena" },
  { value: "evening", label: "🌇 Vakars" },
];

function selfLogTodHtml(selected) {
  const opts = SELF_LOG_TODS.map((t) => `
    <label class="tod-radio-label tod-${t.value}">
      <input type="radio" name="selfLogTod" value="${t.value}" ${t.value === selected ? "checked" : ""} /> ${t.label}
    </label>`).join("");
  return `<div class="self-log-field-label">Dienas laiks</div><div class="tod-radio-group">${opts}</div>`;
}

function renderSelfLogForm(dateStr) {
  const existing = selfLogEditingId ? logEntries.find((l) => l.id === selfLogEditingId) : null;
  const d = getSelfLogData(existing);
  const currentType = d.title || "";
  // The raw type name, not displayTitle() — that strips the parenthetical, and
  // the parenthetical is the only thing telling the two interval types apart.
  const options = selfLogTypes()
    .map((t) => `<option value="${escapeHtml(t)}" ${t === currentType ? "selected" : ""}>${escapeHtml(t)}</option>`)
    .join("");

  return `
    <div class="self-log-form" data-self-log-form="${dateStr}">
      <div class="self-log-form-title">${existing ? "Labot ierakstu" : "Ko izpildīji?"}</div>
      <div class="self-log-field-label">Treniņa veids</div>
      <select class="self-log-type">${options}</select>
      ${selfLogTodHtml(d.tod || "")}
      <div class="self-log-field-label">Izpildītais</div>
      <textarea class="self-log-text" rows="5" placeholder="Piemēram:&#10;15min iesildīšanās&#10;Drills&#10;10km, 4:45/km&#10;10min atsildīšanās">${escapeHtml(d.text || "")}</textarea>
      ${selfLogRatingHtml(existing?.feeling || "")}
      <div class="self-log-field-label">Komentārs</div>
      <textarea class="self-log-comment inline-comment" rows="2" placeholder="Sportista komentārs...">${escapeHtml(existing?.notes || "")}</textarea>
      <div class="self-log-form-actions">
        <button class="add-day-button self-log-save-btn" data-self-log-save="${dateStr}" type="button">Saglabāt</button>
        <button class="cancel-action self-log-cancel-btn" data-self-log-cancel="1" type="button">Atcelt</button>
      </div>
    </div>`;
}

// dayCommentTaken: something on this day already shows a data-comment-day
// textarea — a restriction, a health entry, a rest day, a race, or simply an
// earlier self-log card — so this card must not render a second one bound to the
// same date. Two of them would be two boxes writing over each other's text.
function renderSelfLogCard(log, dayCommentTaken) {
  const d = getSelfLogData(log);
  const title = d.title || "";
  const icon = d.icon || badgeForTitle(title);
  const textHtml = (d.text || "")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join("");
  // Same badge, same place as a plan card's (renderPlanCard in app.js). A record
  // saved before the time of day existed simply has none, exactly like a
  // training the coach never gave one to.
  const todBadge = d.tod ? `<span class="tod-badge tod-${d.tod}">${todLabel(d.tod)}</span>` : "";
  const feelingBadge = log.feeling || log.feeling_tags ? feelingBadgeHtml(log.feeling, log.feeling_tags) : "";
  const notesHtml = log.notes ? `<div class="log-notes">${escapeHtml(log.notes)}</div>` : "";
  const athleteIsOwner = activeRole === "athlete" && currentUser?.id === getSelectedAthleteId();
  const dayNote = dayNotes.find((n) => n.date === log.date);

  let coachBlock = "";
  if (!dayCommentTaken) {
    if (activeRole === "coach") {
      coachBlock = `<div class="comment-label">Trenera komentārs</div><textarea class="inline-comment" data-comment-day="${log.date}" placeholder="Komentārs...">${escapeHtml(dayNote?.coach_comment || "")}</textarea>`;
    } else if (dayNote?.coach_comment) {
      coachBlock = `<div class="comment-label">Trenera komentārs</div><div class="log-notes">${escapeHtml(dayNote.coach_comment)}</div>`;
    }
  }

  return `
    <article class="session-card self-log-card">
      <h3>${escapeHtml(displayTitle(title))}</h3>
      ${todBadge}
      <span class="plan-type-badge">${icon}</span>
      <div class="self-log-badge">📝 Sportista ieraksts</div>
      ${textHtml ? `<div class="task-card self-log-text-view">${textHtml}</div>` : ""}
      ${feelingBadge}
      ${notesHtml}
      ${coachBlock}
      ${athleteIsOwner
        ? `<div class="card-actions"><div class="log-actions"><button class="edit-log-btn icon-action-btn" data-self-log-edit="${log.id}" type="button" title="Rediģēt">✏️</button><button class="log-delete-btn icon-action-btn is-delete" data-delete-log="${log.id}" type="button" title="Dzēst">✕</button></div></div>`
        : ""}
    </article>`;
}

async function saveSelfLogForm() {
  const form = document.querySelector(".self-log-form");
  if (!form) return;
  const dateStr = form.dataset.selfLogForm;
  const athleteId = getSelectedAthleteId();
  if (!dateStr || !athleteId) return;

  const title = form.querySelector(".self-log-type")?.value || "";
  const todEl = form.querySelector('input[name="selfLogTod"]:checked');
  const tod = todEl ? todEl.value : "";
  const text = form.querySelector(".self-log-text")?.value.trim() || "";
  const feelingEl = form.querySelector('input[name="selfLogRating"]:checked');
  const feeling = feelingEl ? feelingEl.value : null;
  const notes = form.querySelector(".self-log-comment")?.value.trim() || "";

  if (!text && !feeling && !notes) {
    alert("Ieraksti, ko izpildīji.");
    form.querySelector(".self-log-text")?.focus();
    return;
  }
  if (!tod) {
    alert("Norādi dienas laiku.");
    form.querySelector(".tod-radio-group")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  const saveBtn = form.querySelector("[data-self-log-save]");
  if (saveBtn) saveBtn.disabled = true;
  const oldId = selfLogEditingId;

  try {
    // Insert first, delete the old row afterwards: if the insert is refused
    // (e.g. missing rights) the athlete's existing record is still there.
    await insertLogEntry({
      athlete_id: athleteId,
      date: dateStr,
      activity_type: getActivityType(title),
      log_data: [{ section: SELF_LOG_SECTION, title, icon: badgeForTitle(title), tod, text }],
      feeling,
      feeling_tags: null,
      notes,
      duration_min: 0,
      distance_km: 0,
    });
    if (oldId) await deleteLogEntry(oldId);
    selfLogFormDate = null;
    selfLogEditingId = null;
    await loadNonTemplateData();
  } catch (e) {
    console.error(e);
    if (saveBtn) saveBtn.disabled = false;
    alert("Saglabāšana neizdevās (iespējams, trūkst tiesību).");
  }
}
