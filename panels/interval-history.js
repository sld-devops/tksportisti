// "Nesenākie intervālu un tempa skrējieni" (Recent interval and tempo runs)
// panel. There are already extensive "why" comments from earlier work on this
// file - mostly missing here are JS syntax explanations (Map, String.raw,
// regex .exec() loops) where they first appear in this file.

// #region Length checking and classification (distance/time, interval/tempo)
// Tabs are derived per athlete from their own completed interval sessions, so
// nothing is hardcoded here. A coach writes an interval either as a distance
// ("6x400m") or as a duration ("6x4min"), so both kinds get their own tab
// strip under the Attālums/Laiks switch. These ranges reject typos and keep
// the two kinds from being confused (e.g. "3min" must not become 3 metres).
const MIN_INTERVAL_METERS = 50;
const MAX_INTERVAL_METERS = 20000;
const MIN_INTERVAL_SECONDS = 10;
const MAX_INTERVAL_SECONDS = 3600;
const MAX_INTERVAL_SESSIONS = 5;

// A tempo run has no "Nx" to anchor on, so its length is read from a single
// field (the plan) or from free text (the athlete's own record). These ranges
// are deliberately much narrower than the interval ones: they are the only
// thing stopping a stride ("100m"), a rest ("2min") or a pace from being read
// as the length of the run.
const MIN_TEMPO_METERS = 1000;
const MAX_TEMPO_METERS = 60000;
const MIN_TEMPO_SECONDS = 600;
const MAX_TEMPO_SECONDS = 10800;

const TEMPO_TYPE = "Tempa skrējiens";

let intervalHistoryKind = "interval"; // "interval" | "tempo"
// Each kind remembers its own Garums/Laiks choice and its own length tab.
// Shared state would be wrong in both directions: intervals are usually looked
// at by length and tempo runs by time, so one shared choice means switching
// kinds regularly lands on the side that happens to be empty for the other one.
const intervalHistoryActive = {
  interval: { mode: "dist", dist: null, time: null },
  tempo: { mode: "dist", dist: null, time: null },
};

function parseDistanceMeters(str) {
  str = (str || "").trim().toLowerCase().replace(",", ".");
  let m = str.match(/^(\d+(?:\.\d+)?)\s*m$/);
  if (m) return Math.round(parseFloat(m[1]));
  m = str.match(/^(\d+(?:\.\d+)?)\s*km$/);
  if (m) return Math.round(parseFloat(m[1]) * 1000);
  m = str.match(/^(\d+(?:\.\d+)?)$/);
  if (m) return Math.round(parseFloat(m[1]));
  return null;
}

// Accepts "4min", "4 min", "4'", "90s", "1:30", "1min30s".
function parseDurationSeconds(str) {
  str = (str || "").trim().toLowerCase().replace(",", ".");
  let m = str.match(/^(\d+)\s*(?:min|['′])\s*(\d+)\s*(?:s|sek|sec|["″])?$/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
  m = str.match(/^(\d+):(\d{1,2})$/);
  if (m) return parseInt(m[1]) * 60 + parseInt(m[2]);
  m = str.match(/^(\d+(?:\.\d+)?)\s*(?:min|minūtes|['′])$/);
  if (m) return Math.round(parseFloat(m[1]) * 60);
  m = str.match(/^(\d+)\s*(?:s|sek|sec|["″])$/);
  if (m) return parseInt(m[1]);
  return null;
}

function isPlausibleIntervalDistance(meters) {
  return meters !== null && meters >= MIN_INTERVAL_METERS && meters <= MAX_INTERVAL_METERS;
}

function isPlausibleIntervalDuration(seconds) {
  return seconds !== null && seconds >= MIN_INTERVAL_SECONDS && seconds <= MAX_INTERVAL_SECONDS;
}

function formatIntervalDistLabel(meters) {
  if (meters < 1000) return meters + "m";
  const km = meters / 1000;
  return (Number.isInteger(km) ? String(km) : km.toFixed(1).replace(".", ",")) + "km";
}

function formatIntervalDurLabel(seconds) {
  if (seconds < 60) return seconds + "s";
  const min = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${min}min ${rest}s` : `${min}min`;
}

// Sorts one written interval length into the distance bucket or the time
// bucket. Anything unrecognised (or implausible) is ignored on purpose.
function classifyIntervalLength(raw, out) {
  const meters = parseDistanceMeters(raw);
  if (isPlausibleIntervalDistance(meters)) {
    out.distances.push(meters);
    return;
  }
  const seconds = parseDurationSeconds(raw);
  if (isPlausibleIntervalDuration(seconds)) out.durations.push(seconds);
}

// Same idea as classifyIntervalLength, but for a tempo run, whose length is a
// single written value rather than the "Nx" half of a repetition.
//
// The token is put through normalizeTrainingDetails() (app.js) first, which is
// where every way the coach writes minutes — "60 min", "60min", "60'",
// "60 min.", "60 minūtes" — is already folded into one form. Reusing it means
// there is no second list of spellings to keep in step. app.js loads after this
// file, so it must be called at render time, never at load time.
function classifyTempoLength(raw, out) {
  const token = normalizeTrainingDetails(raw || "");
  const meters = parseDistanceMeters(token);
  if (meters !== null && meters >= MIN_TEMPO_METERS && meters <= MAX_TEMPO_METERS) {
    out.distances.push(meters);
    return;
  }
  const seconds = parseDurationSeconds(token);
  if (seconds !== null && seconds >= MIN_TEMPO_SECONDS && seconds <= MAX_TEMPO_SECONDS) {
    out.durations.push(seconds);
  }
}

// A planned tempo run reads its length from the first field of the main part —
// "Pamatdaļa: 10 km; 150-160; 4:00/km" -> "10 km" — the same positional slot
// loadTemplateToForm()/parsePlanToForm() read it from.
//
// Deliberately not extractMainPart(): that falls back to the first line when
// there is no main part, and "Iesildīšanās: 15min" would then be read as a
// 15-minute tempo run.
function extractTempoLengthsFromPlan(details) {
  const out = { distances: [], durations: [] };
  if (!details) return out;
  const line = details.split("\n").find(l => l.includes("Pamatdaļa:"));
  if (!line) return out;
  classifyTempoLength(splitDetailFields(line)[0], out);
  return out;
}

// The athlete's own record is free text with no fields at all, so only a number
// carrying a unit is considered — "12km", "40 min", "1500m". A bare number is
// never a length here: the same sentence routinely holds a pulse ("165") and a
// pace ("4:00/km"), and either would otherwise invent a tab of its own. The
// pace is safe for a second reason too — the unit must follow the number
// directly, and "4:00" has a colon in the way.
// Spaces only, never \s, for the same reason as IV_TEXT_REP_RE above: a line
// break must not be allowed to glue a number to the next line's word.
const TEMPO_TEXT_TOKEN_RE = /\d+(?:[.,]\d+)?[ ]*(?:km|min\.?|minūt\p{L}*|stund\p{L}*|sek|s|h|m|['′])(?![\p{L}\d])/giu;

function extractTempoLengthsFromText(text) {
  const out = { distances: [], durations: [] };
  if (!text) return out;
  // A regex with the "g" (global) flag remembers WHERE it last stopped
  // (`.lastIndex`), so calling `.exec()` repeatedly on the SAME
  // regex object finds the NEXT match each time, not the same first one -
  // that's how this loop collects ALL matches in the text, not just the first.
  // Resetting `.lastIndex = 0` beforehand is a safe reset, since this same
  // regex object (const, defined once at the top) is reused on every call.
  TEMPO_TEXT_TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TEMPO_TEXT_TOKEN_RE.exec(text)) !== null) classifyTempoLength(m[0], out);
  return out;
}

function isTempoTitle(title) {
  return (title || "").trim() === TEMPO_TYPE;
}

function extractIntervalLengths(details) {
  const out = { distances: [], durations: [] };
  if (!details) return out;
  const lines = details.split("\n");
  lines.forEach(line => {
    if (isVarIntervalLine(line)) {
      const result = parseSegmentsFromVarLine(line);
      result.segments.forEach(seg => classifyIntervalLength(seg.length, out));
    } else {
      // Grabs the length written right after "Nx": "400m", "400 m", "1,5km",
      // a bare "400", or a duration such as "4min" / "4'" / "90s" / "1:30".
      const m = line.match(/Pamatdaļa:\s*(?:\d+-)?\d+\s*x\s*([\d.,]+(?::\d{1,2})?\s*(?:(?:min|['′])\s*(?:\d+\s*(?:s|sek|sec|["″]))?|km|sek|sec|[msh]|["″])?)/i);
      if (m) classifyIntervalLength(m[1], out);
    }
  });
  return out;
}

// The athlete's own record of an unplanned training is free text, so there is
// no "Pamatdaļa:" line to anchor on — the repetition itself is the only
// reliable marker. Both orders are read ("9x400m", "400m x 9", "400mx9"), and
// the side carrying a unit is the length. A bare number on its own is never
// taken: the logged interval times sitting in the same text ("72, 74.2") would
// otherwise be read as 72 metres and invent a tab of their own.
// Spaces only, never \s — a line break must not be allowed to glue two
// unrelated numbers together ("...caur 2min" + "200 m x 4" on the next line
// once read as one length, and the 200m was lost).
// `String.raw` is a template-string "tag" function - it makes JS NOT interpret
// backslashes (`\d`, `\s`) as special characters, so regex fragments can be
// written just like a plain regex, instead of doubling every
// `\` ("\\d"). Convenient, since these strings are then glued (${...}) into a bigger regex.
const IV_TEXT_NUM = String.raw`\d+(?:[.,]\d+)?(?::\d{1,2})?`;
const IV_TEXT_UNIT = String.raw`(?:km|min(?:ūtes)?|m|sek|sec|s|['′"″])`;
const IV_TEXT_LEN = String.raw`${IV_TEXT_NUM}[ ]?${IV_TEXT_UNIT}?(?:\d+[ ]?${IV_TEXT_UNIT}?)?`;
const IV_TEXT_REP_RE = new RegExp(String.raw`(${IV_TEXT_LEN})[ ]*[x×][ ]*(${IV_TEXT_LEN})`, "gi");

function hasIntervalUnit(token) {
  return /[^\d.,:\s]/.test(token);
}

function extractIntervalLengthsFromText(text) {
  const out = { distances: [], durations: [] };
  if (!text) return out;
  IV_TEXT_REP_RE.lastIndex = 0;
  let m;
  while ((m = IV_TEXT_REP_RE.exec(text)) !== null) {
    const a = m[1].trim();
    const b = m[2].trim();
    // "400m x 9" -> the unit is on the left; "9x400m" and the unitless "9x400"
    // both put the length on the right.
    classifyIntervalLength(hasIntervalUnit(a) && !hasIntervalUnit(b) ? a : b, out);
  }
  return out;
}

// One pass over the athlete's history -> for each kind (intervals, tempo runs)
// two Maps (distance in meters, and duration in seconds) of length to its most
// recent sessions. A length only appears once the athlete has actually logged
// that session, so every tab is guaranteed to have at least one card. Both
// sources count: a training the coach planned and the athlete logged, and a
// training the athlete recorded themselves.
//
// The two kinds are told apart by the training type, not by the content: only
// the exact type "Tempa skrējiens" is a tempo run. Everything else keeps going
// through the interval reader, which needs an "Nx" and so simply finds nothing
// in a training that has none.
// #endregion

// #region Building history from plans and the athlete's own records
// `new Map()` is the same "key -> value" structure as Python's `dict`,
// except JS objects (`{}`) can only have text keys - `Map` accepts
// anything (including a number) as a key, which matters here since the keys
// are lengths in metres/seconds. `.set(key, value)`/`.get(key)`/`.has(key)`
// are the equivalent of `map[key] = value` / `map[key]` / `key in
// map` - just safe for keys of any type.
function buildIntervalHistory() {
  const today = formatDateISO(new Date());
  const logByPlanId = new Map();
  const selfLogs = [];
  allLogEntries.forEach(l => {
    // The athlete's own records have no plan_id, so they can never be matched
    // to a plan — their lengths are read from their free text instead.
    if (!l.plan_id) {
      if (isSelfLog(l)) selfLogs.push(l);
      return;
    }
    if (!logByPlanId.has(l.plan_id)) logByPlanId.set(l.plan_id, l);
  });

  const sessions = [];
  for (const plan of allPlans) {
    if (plan.date > today) continue;
    const log = logByPlanId.get(plan.id);
    if (!log) continue;
    const tempo = isTempoTitle(plan.title);
    const lengths = tempo
      ? extractTempoLengthsFromPlan(plan.details)
      : extractIntervalLengths(plan.details);
    if (!lengths.distances.length && !lengths.durations.length) continue;
    sessions.push({ date: plan.date, kind: tempo ? "tempo" : "interval", lengths, plan, log });
  }
  for (const log of selfLogs) {
    if (!log.date || log.date > today) continue;
    const data = getSelfLogData(log);
    const tempo = isTempoTitle(data.title);
    const lengths = tempo
      ? extractTempoLengthsFromText(data.text)
      : extractIntervalLengthsFromText(data.text);
    if (!lengths.distances.length && !lengths.durations.length) continue;
    sessions.push({ date: log.date, kind: tempo ? "tempo" : "interval", lengths, selfLog: log });
  }
  // Newest first across both sources, so the 5-per-tab cap keeps the most
  // recent sessions however each of them was recorded.
  sessions.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const history = {
    interval: { dist: new Map(), time: new Map() },
    tempo: { dist: new Map(), time: new Map() },
  };
  const add = (map, key, session) => {
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key);
    if (list.length < MAX_INTERVAL_SESSIONS) list.push(session);
  };

  for (const session of sessions) {
    const buckets = history[session.kind];
    new Set(session.lengths.distances).forEach(d => add(buckets.dist, d, session));
    new Set(session.lengths.durations).forEach(s => add(buckets.time, s, session));
  }
  return history;
}

// The athlete's own record has no plan behind it — no main-part line, no pace
// bounds, no per-interval boxes — so it is drawn the way it is drawn in the
// calendar (panels/self-log.js), minus the two things that belong to the
// calendar only: the edit/delete buttons and the coach's comment box. That box
// is bound to the day, and exactly one of them may exist per day.
// #endregion

// #region Drawing the cards
function renderIntervalHistorySelfCard(log) {
  const d = getSelfLogData(log);
  const title = d.title || "";
  const textHtml = (d.text || "")
    .split("\n")
    .filter(l => l.trim())
    .map(l => `<div>${escapeHtml(l)}</div>`)
    .join("");
  const todBadge = d.tod ? `<span class="tod-badge tod-${d.tod}">${todLabel(d.tod)}</span>` : "";
  const feelingBadge = log.feeling || log.feeling_tags ? feelingBadgeHtml(log.feeling, log.feeling_tags) : "";
  const notesHtml = log.notes ? `<div class="log-notes">${escapeHtml(log.notes)}</div>` : "";

  return `
    <article class="session-card interval-history-card">
      <div style="font-size:0.82rem;color:var(--muted);margin-bottom:4px;">${formatDateLV(log.date)} ${todBadge}</div>
      <span class="plan-type-badge">${d.icon || badgeForTitle(title)}</span>
      <div class="self-log-badge">📝 Sportista ieraksts</div>
      <div class="task-card">
        <strong>${escapeHtml(displayTitle(title))}</strong>
      </div>
      ${textHtml ? `<div class="task-card self-log-text-view">${textHtml}</div>` : ""}
      ${feelingBadge}
      ${notesHtml}
    </article>
  `;
}

function renderIntervalHistoryCard(session) {
  if (session.selfLog) return renderIntervalHistorySelfCard(session.selfLog);
  const { plan, log } = session;
  const notCompleted = plan.completed === false;
  const mainLine = extractMainPart(plan.details);
  const paceBoundsMap = buildPaceBoundsMap(plan.details);
  const planLogData = log?.log_data || [];
  const feelingBadge = log?.feeling || log?.feeling_tags ? feelingBadgeHtml(log.feeling, log.feeling_tags) : "";
  const logNotes = log?.notes
    ? `<div class="log-notes">${escapeHtml(log.notes)}</div>`
    : "";
  const todBadge = plan.time_of_day
    ? `<span class="tod-badge tod-${plan.time_of_day}">${todLabel(plan.time_of_day)}</span>`
    : "";

  let logBlock = "";
  if (log) {
    const plannedIntervalCount = getPlannedIntervalCount(plan.details);
    const pamatData = planLogData.filter(e => e.section === "Pamatdaļa");
    const inlineHtml = pamatData.length ? renderLogEntryLines(pamatData, paceBoundsMap, plannedIntervalCount, plan.details) : "";
    if (inlineHtml || feelingBadge || logNotes) {
      logBlock = `
        <div class="log-card log-inline">
          ${inlineHtml}
          ${feelingBadge}
          ${logNotes}
        </div>`;
    }
  }

  const coachComment = plan.coach_comment
    ? `<div class="log-notes">${escapeHtml(plan.coach_comment)}</div>`
    : "";

  return `
    <article class="session-card interval-history-card${notCompleted ? " not-completed" : ""}">
      <div style="font-size:0.82rem;color:var(--muted);margin-bottom:4px;">${formatDateLV(plan.date)} ${todBadge}</div>
      <span class="plan-type-badge">${plan.custom_icon || badgeForTitle(plan.title)}</span>
      ${notCompleted ? '<span class="not-completed-icon-abs">!</span>' : ""}
      <div class="task-card">
        <strong>${escapeHtml(mainLine)}</strong>
      </div>
      ${coachComment}
      ${logBlock}
      ${notCompleted ? `<div class="not-completed-badge"><span class="not-completed-icon">!</span> Sportists atzīmēja kā neizpildītu</div>` : ""}
      ${notCompleted && plan.athlete_comment ? `<div class="log-notes not-completed-comment">${escapeHtml(plan.athlete_comment)}</div>` : ""}
    </article>
  `;
}

// `keep` is passed only by the panel's own buttons — "kind" or "mode", naming
// the switch that was just pressed. Without it the auto-switches below ran on
// the render the click itself caused, so pressing an empty side bounced
// straight back and the button looked dead; the "nothing on this side" message
// was unreachable. Pressing the kind switch deliberately does NOT keep the
// mode, so that a side whose remembered Garums/Laiks is empty still lands
// somewhere with content. Switching athletes auto-switches both, because that
// render comes from app.js with no argument at all.
// #endregion

// #region Drawing the panel and tabs (Intervāli/Tempa, Garums/Laiks)
function renderIntervalHistory(keep) {
  const body = document.getElementById("intervalHistoryBody");
  const athleteId = getSelectedAthleteId();
  if (!athleteId) {
    body.innerHTML = "";
    return;
  }

  const history = buildIntervalHistory();
  const countOf = kind => history[kind].dist.size + history[kind].time.size;

  if (countOf("interval") === 0 && countOf("tempo") === 0) {
    body.innerHTML = '<p class="interval-empty">Nav neviena intervālu vai tempa treniņa</p>';
    return;
  }

  // Land on a side that actually has something, so an athlete is never shown an
  // empty panel just because the last athlete looked at was different.
  if (!keep && countOf(intervalHistoryKind) === 0) {
    intervalHistoryKind = intervalHistoryKind === "interval" ? "tempo" : "interval";
  }

  const buckets = history[intervalHistoryKind];
  const slot = intervalHistoryActive[intervalHistoryKind];
  const distances = [...buckets.dist.keys()].sort((a, b) => a - b);
  const durations = [...buckets.time.keys()].sort((a, b) => a - b);

  if (keep !== "mode") {
    if (slot.mode === "dist" && distances.length === 0 && durations.length) slot.mode = "time";
    if (slot.mode === "time" && durations.length === 0 && distances.length) slot.mode = "dist";
  }

  const isTime = slot.mode === "time";
  const keys = isTime ? durations : distances;
  const map = isTime ? buckets.time : buckets.dist;
  const label = isTime ? formatIntervalDurLabel : formatIntervalDistLabel;
  let activeKey = isTime ? slot.time : slot.dist;

  // The previously selected length may not exist for this athlete.
  if (!keys.includes(activeKey)) {
    activeKey = keys.length ? keys[0] : null;
    if (isTime) slot.time = activeKey;
    else slot.dist = activeKey;
  }

  const isTempo = intervalHistoryKind === "tempo";
  let html = `
    <div class="view-tabs interval-mode-tabs">
      <button type="button" data-kind="interval"${isTempo ? "" : ' class="active"'}>Intervāli</button>
      <button type="button" data-kind="tempo"${isTempo ? ' class="active"' : ""}>Tempa skr.</button>
    </div>
    <div class="view-tabs interval-mode-tabs">
      <button type="button" data-mode="dist"${isTime ? "" : ' class="active"'}>Garums</button>
      <button type="button" data-mode="time"${isTime ? ' class="active"' : ""}>Laiks</button>
    </div>`;

  if (distances.length === 0 && durations.length === 0) {
    html += `<p class="interval-empty">${isTempo ? "Nav neviena tempa skrējiena" : "Nav neviena intervālu treniņa"}</p>`;
  } else if (keys.length === 0) {
    html += `<p class="interval-empty">${isTime ? "Nav neviena pēc laika" : "Nav neviena pēc garuma"}</p>`;
  } else {
    html += '<div class="interval-tabs">';
    keys.forEach(k => {
      html += `<button class="interval-tab${k === activeKey ? " active" : ""}" data-len="${k}">${label(k)}</button>`;
    });
    html += "</div>";

    html += '<div class="interval-sessions">';
    map.get(activeKey).forEach(s => {
      // One session with unexpected data must not blank the whole panel -
      // without this the body stays empty and the panel looks like it refuses
      // to open at all.
      try {
        html += renderIntervalHistoryCard(s);
      } catch (err) {
        console.error("Intervālu/tempa vēsture: neizdevās uzzīmēt " + s.date, err);
      }
    });
    html += "</div>";
  }

  body.innerHTML = html;

  body.querySelectorAll("[data-kind]").forEach(btn => {
    btn.addEventListener("click", () => {
      intervalHistoryKind = btn.dataset.kind;
      renderIntervalHistory("kind");
    });
  });

  body.querySelectorAll("[data-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      intervalHistoryActive[intervalHistoryKind].mode = btn.dataset.mode;
      renderIntervalHistory("mode");
    });
  });

  body.querySelectorAll(".interval-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      const len = parseInt(btn.dataset.len);
      const active = intervalHistoryActive[intervalHistoryKind];
      if (active.mode === "time") active.time = len;
      else active.dist = len;
      renderIntervalHistory("mode");
    });
  });
}
// #endregion
