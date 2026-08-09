const profileCard = document.getElementById("profileCard");
const urlEditState = { garmin: false, strava: false, spreadsheet: false };

// Pace/HR is edited by both the coach and the athlete, so each side gets a
// badge when the *other* one changed it. Who-and-when rides along inside the
// existing pace_hr_map JSON under "_meta" rather than in new profile columns;
// renderPaceHrMap only ever reads the fixed HR keys, so the extra key is inert.
// "Seen" is per-browser, like every other panel badge: athlete id -> the last
// edit timestamp this browser has already looked at.
let seenPaceHrEdits = {};

function loadSeenPaceHrEdits() {
  try {
    seenPaceHrEdits = JSON.parse(localStorage.getItem("seenPaceHrEdits")) || {};
  } catch (e) {
    seenPaceHrEdits = {};
  }
}

function saveSeenPaceHrEdits() {
  localStorage.setItem("seenPaceHrEdits", JSON.stringify(seenPaceHrEdits));
}

function isPaceHrEditSeen(athleteId, editedAt) {
  return seenPaceHrEdits[athleteId] === editedAt;
}

function markPaceHrEditSeen(athleteId, editedAt) {
  if (!athleteId || !editedAt) return;
  seenPaceHrEdits[athleteId] = editedAt;
  saveSeenPaceHrEdits();
}

loadSeenPaceHrEdits();
profileCard.addEventListener("click", (e) => {
  const btn = e.target.closest(".url-edit-btn");
  if (!btn) return;
  urlEditState[btn.dataset.field] = true;
  renderProfile();
  // The state key is lowercase ("garmin"), the input id is not ("editGarminUrl")
  // - without capitalize() this looked up an element that does not exist and the
  // field silently stayed unfocused.
  const input = document.getElementById(`edit${capitalize(btn.dataset.field)}Url`);
  if (input) input.focus();
});

function renderProfile() {
  const athleteId = getSelectedAthleteId();
  const profile = isCoach()
    ? athletes.find((a) => a.id === athleteId) || currentProfile
    : currentProfile;
  const canEdit = currentUser.id === athleteId;
  const canEditUrls = profile.role === "athlete" && canEdit;

  function urlRow(id, label, field, url, logo, placeholder) {
    const editing = canEditUrls && (urlEditState[field] || !url);
    if (editing) {
      return `<input id="${id}" value="${url || ""}" placeholder="${placeholder}" />`;
    }
    if (url) {
      const editBtn = canEditUrls
        ? `<button class="url-edit-btn" data-field="${field}" type="button">Labot</button>`
        : "";
      return `<div class="profile-url-row"><a href="${url}" target="_blank" rel="noopener"><img class="profile-logo profile-logo-${field}" src="${logo}" alt="${label}"></a>${editBtn}</div>`;
    }
    return `<span class="muted">— Nav norādīts</span>`;
  }

  profileCard.innerHTML = `
    <div class="profile-header">
      <div class="profile-name">${profile.full_name}</div>
    </div>
    <section class="profile-section">
      <label>${urlRow("editGarminUrl", "Garmin", "garmin", profile.garmin_url, "https://pngimg.com/uploads/garmin/garmin_PNG5.png", "https://connect.garmin.com/...")}</label>
      <label>${urlRow("editStravaUrl", "Strava", "strava", profile.strava_url, "https://upload.wikimedia.org/wikipedia/commons/c/cb/Strava_Logo.svg", "https://strava.com/...")}</label>
      <label>Treniņu plāna arhīvs
        ${urlRow("editSpreadsheetUrl", "Kalendāra arhīvs", "spreadsheet", profile.spreadsheet_url, "https://cloud.gmelius.com/public/logos/google/Google_Sheets_Logo_512px.png", "https://docs.google.com/spreadsheets/...")}
      </label>
    </section>
  `;
  ["editGarminUrl", "editStravaUrl", "editSpreadsheetUrl"].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener("blur", saveProfileUrls);
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") e.target.blur();
      });
    }
  });
}

// The percent column is derived from max HR, never stored - hr_zones keeps
// holding plain pulse numbers, so nothing already saved changes shape.
function hrPercentOf(value, maxHr) {
  const v = parseFloat(String(value ?? "").replace(",", "."));
  if (!v || v <= 0 || !maxHr) return "";
  return String(Math.round((v / maxHr) * 100));
}

function parseMaxHr(value) {
  const n = parseFloat(String(value ?? "").replace(",", "."));
  return n > 0 ? n : 0;
}

function hrZonePercentText(zone, maxHr) {
  const from = hrPercentOf(zone.no, maxHr);
  const to = hrPercentOf(zone.lidz, maxHr);
  if (from && to) return `${from}-${to}%`;
  if (from || to) return `${from || to}%`;
  return "";
}

// Accepts "71-78", "71-78%", "71 - 78", or a single number (fills only "no").
function parsePercentRange(text) {
  const nums = String(text ?? "").match(/\d+(?:[.,]\d+)?/g);
  if (!nums) return [];
  return nums.slice(0, 2).map((n) => parseFloat(n.replace(",", ".")));
}

function renderHrZones() {
  const athleteId = getSelectedAthleteId();
  const profile = isCoach()
    ? athletes.find((a) => a.id === athleteId) || currentProfile
    : currentProfile;
  const hrZones = profile.hr_zones || {};
  const canEdit = isCoach();
  const disabled = canEdit ? "" : "disabled";
  const maxHr = parseMaxHr(hrZones.max_hr);

  const zoneRowsHtml = ["1", "2", "3", "4", "5"]
    .map((z) => {
      const zone = hrZones[z] || {};
      return `
        <div class="zone-row zone-c${z}">
          <span class="zone-num">${z}.</span>
          <input class="zone-no" value="${zone.no || ""}" placeholder="no" ${disabled} />
          <input class="zone-lidz" value="${zone.lidz || ""}" placeholder="līdz" ${disabled} />
          <input class="zone-pct" value="${hrZonePercentText(zone, maxHr)}" placeholder="%" ${disabled} />
        </div>
      `;
    })
    .join("");

  const hintHtml = maxHr
    ? ""
    : `<p class="zone-hint">Ievadi maksimālo pulsu, lai rēķinātu procentus.</p>`;

  document.getElementById("hrZonesBody").innerHTML = `
    <div class="profile-section" id="hrZoneFields">${zoneRowsHtml}</div>
    <div class="zone-row zone-max">
      <span class="zone-num">Maks.</span>
      <input id="maxHrInput" value="${hrZones.max_hr || ""}" placeholder="maks. HR" ${disabled} />
    </div>
    ${hintHtml}
  `;

  if (canEdit) {
    document.querySelectorAll("#hrZoneFields .zone-no, #hrZoneFields .zone-lidz").forEach((el) => {
      el.addEventListener("input", () => refreshHrZonePercent(el.closest(".zone-row")));
      el.addEventListener("change", saveHrZones);
    });
    document.querySelectorAll("#hrZoneFields .zone-pct").forEach((el) => {
      el.addEventListener("input", () => applyHrZonePercent(el.closest(".zone-row")));
      el.addEventListener("change", saveHrZones);
    });
    const maxInput = document.getElementById("maxHrInput");
    maxInput?.addEventListener("input", refreshAllHrZonePercents);
    maxInput?.addEventListener("change", saveHrZones);
  }
}

function currentMaxHrInput() {
  return parseMaxHr(document.getElementById("maxHrInput")?.value);
}

function refreshHrZonePercent(row) {
  if (!row) return;
  const maxHr = currentMaxHrInput();
  const pct = row.querySelector(".zone-pct");
  if (!pct) return;
  pct.value = hrZonePercentText(
    {
      no: row.querySelector(".zone-no")?.value,
      lidz: row.querySelector(".zone-lidz")?.value,
    },
    maxHr
  );
}

function refreshAllHrZonePercents() {
  document.querySelectorAll("#hrZoneFields .zone-row").forEach(refreshHrZonePercent);
}

// Setting .value from script fires no "input" event, so writing the pulse
// boxes here cannot bounce back and re-trigger this handler.
function applyHrZonePercent(row) {
  if (!row) return;
  const maxHr = currentMaxHrInput();
  if (!maxHr) return;
  const [from, to] = parsePercentRange(row.querySelector(".zone-pct")?.value);
  const noInput = row.querySelector(".zone-no");
  const lidzInput = row.querySelector(".zone-lidz");
  if (from > 0 && noInput) noInput.value = String(Math.round((from / 100) * maxHr));
  if (to > 0 && lidzInput) lidzInput.value = String(Math.round((to / 100) * maxHr));
}

function renderThresholds() {
  const athleteId = getSelectedAthleteId();
  const profile = isCoach()
    ? athletes.find((a) => a.id === athleteId) || currentProfile
    : currentProfile;
  const thresholds = profile.thresholds || {};
  const canEdit = isCoach();
  const disabled = canEdit ? "" : "disabled";

  // thr-a/thr-b/thr-c carry the zone-coloured gradients - each threshold is
  // tinted with the two HR zones it physiologically sits between.
  document.getElementById("thresholdsBody").innerHTML = `
    <div class="profile-section">
      <div class="field-grid thr-row thr-a">
        <label>Aerobais temps (min/km) <input id="editAerobicPace" value="${thresholds.aerobic_pace || ""}" ${disabled} /></label>
        <label>Aerobais pulss <input id="editAerobicHr" value="${thresholds.aerobic_hr || ""}" ${disabled} /></label>
      </div>
      <div class="field-grid thr-row thr-b">
        <label>Anaerobais temps (min/km) <input id="editAnaerobicPace" value="${thresholds.anaerobic_pace || ""}" ${disabled} /></label>
        <label>Anaerobais pulss <input id="editAnaerobicHr" value="${thresholds.anaerobic_hr || ""}" ${disabled} /></label>
      </div>
      <div class="field-grid thr-row thr-c">
        <label>Laktāta temps (min/km) <input id="editLtPace" value="${thresholds.lt_pace || ""}" ${disabled} /></label>
        <label>Laktāta pulss <input id="editLtHr" value="${thresholds.lt_hr || ""}" ${disabled} /></label>
      </div>
    </div>
  `;

  if (canEdit) {
    document.querySelectorAll("#thresholdsBody input").forEach(el => {
      el.addEventListener("change", saveThresholds);
    });
  }
}

// The zone palette lives in styles.css (:root --zoneN-*) so CSS and JS can
// never drift apart; index 0..4 are zones 1-5, index 5 is "above zone 5".
const zoneTokenCache = {};
function zoneToken(index, kind) {
  const name = `--zone${Math.min(index, 5) + 1}-${kind}`;
  if (!(name in zoneTokenCache)) {
    zoneTokenCache[name] = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
  }
  return zoneTokenCache[name];
}

// Turns a pulse into "which zone, and how far through it" - 0 at the zone's
// lower bound, 1 at its upper bound. Returns null when the athlete has no
// usable zones, so the pace/HR rows can stay plain white as before.
function locateHrZone(pulse, hrZones) {
  const bpm = parseFloat(String(pulse ?? "").replace(",", "."));
  if (!bpm) return null;
  const bands = [];
  ["1", "2", "3", "4", "5"].forEach((z, i) => {
    const zone = (hrZones || {})[z] || {};
    const from = parseFloat(zone.no);
    const to = parseFloat(zone.lidz);
    if (from > 0 && to > from) bands.push({ index: i, from, to });
  });
  if (!bands.length) return null;

  const first = bands[0];
  const last = bands[bands.length - 1];
  if (bpm <= first.from) return { index: first.index, progress: 0 };
  if (bpm >= last.to) return { index: last.index, progress: 1 };

  for (const band of bands) {
    if (bpm >= band.from && bpm <= band.to) {
      return { index: band.index, progress: (bpm - band.from) / (band.to - band.from) };
    }
  }
  // Falls in a gap the coach left between two zones - treat it as the top of
  // the highest zone that ends below it.
  const below = bands.filter((b) => b.to < bpm).pop() || first;
  return { index: below.index, progress: 1 };
}

// A pulse just inside zone 3 reads as ~85% yellow with the last 15% sliding
// into zone 4's orange; one near the top of zone 3 is almost fully orange.
function hrZoneTintStyle(pulse, hrZones) {
  const spot = locateHrZone(pulse, hrZones);
  if (!spot) return { row: "", num: "" };
  const share = Math.round((1 - spot.progress) * 100);
  const own = zoneToken(spot.index, "tint");
  const next = zoneToken(spot.index + 1, "tint");
  const line = spot.progress < 0.5
    ? zoneToken(spot.index, "line")
    : zoneToken(spot.index + 1, "line");
  const text = zoneToken(spot.index + (spot.progress < 0.5 ? 0 : 1), "text");
  return {
    row: `background: linear-gradient(120deg, ${own} 0%, ${own} ${share}%, ${next} 100%); border-color: ${line};`,
    num: `color: ${text};`,
  };
}

function renderPaceHrMap() {
  const athleteId = getSelectedAthleteId();
  const profile = isCoach()
    ? athletes.find((a) => a.id === athleteId) || currentProfile
    : currentProfile;
  const paceHrMap = profile.pace_hr_map || {};
  const meta = paceHrMap._meta || {};
  const myRole = isCoach() ? "coach" : "athlete";
  const editedByOther = !!(meta.at && meta.by && meta.by !== myRole);
  const unseen = editedByOther && !isPaceHrEditSeen(profile.id, meta.at);

  const hrValues = ["120", "130", "140", "150", "160", "170", "180"];
  const zoneRowsHtml = hrValues
    .map((hr) => {
      const entry = paceHrMap[hr] || {};
      const tint = hrZoneTintStyle(hr, profile.hr_zones);
      return `
        <div class="zone-row">
          <span class="zone-num" style="${tint.num}">${hr}</span>
          <input class="zone-no" style="${tint.row}" value="${entry.no || ""}" placeholder="no" />
          <input class="zone-lidz" style="${tint.row}" value="${entry.lidz || ""}" placeholder="līdz" />
        </div>
      `;
    })
    .join("");

  // Local time on purpose - the stored stamp is UTC, and slicing its date off
  // would show the previous day for anything edited late in the evening here.
  let noteHtml = "";
  if (meta.at) {
    const d = new Date(meta.at);
    const when = `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}. ${
      String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const who = meta.by === "coach" ? "Treneris" : "Sportists";
    noteHtml = `<p class="pace-hr-note${unseen ? " is-new" : ""}">${who} laboja ${when}</p>`;
  }

  document.getElementById("paceHrBody").innerHTML = `
    <div class="profile-section" id="paceHrFields">${zoneRowsHtml}</div>
    ${noteHtml}
  `;

  const panel = document.getElementById("paceHrPanel");
  panel.classList.toggle("has-entries", unseen);
  const header = panel.querySelector(".panel-header");
  if (header) header.dataset.count = unseen ? "1" : "0";

  document.querySelectorAll("#paceHrFields .zone-no, #paceHrFields .zone-lidz").forEach(el => {
    el.addEventListener("change", savePaceHrMap);
  });
}

function getViewedProfile() {
  const athleteId = getSelectedAthleteId();
  if (isCoach()) {
    const p = athletes.find((a) => a.id === athleteId);
    if (p) return p;
  }
  return currentProfile;
}

const PROFILE_URL_FIELDS = [
  ["editGarminUrl", "garmin_url"],
  ["editStravaUrl", "strava_url"],
  ["editSpreadsheetUrl", "spreadsheet_url"],
];

// Chrome fires a second "blur" when the focused input is removed, and this
// function's own renderProfile() removes it - so a save always calls itself
// once more. Harmless while nothing is refocused afterwards; an endless loop of
// database writes the moment anything is.
let savingProfileUrls = false;

// Only the fields actually on screen are written. A saved URL is drawn as its
// logo and has no input at all, so reading all three and sending them wholesale
// stored an empty string over every link that was not being edited - entering
// Strava wiped Garmin, and the two could never be set at the same time.
async function saveProfileUrls() {
  if (savingProfileUrls) return;
  const profile = getViewedProfile();
  const updates = {};
  PROFILE_URL_FIELDS.forEach(([id, column]) => {
    const el = document.getElementById(id);
    if (el) updates[column] = el.value.trim();
  });
  if (!Object.keys(updates).length) return;

  savingProfileUrls = true;
  try {
    await updateProfile(profile.id, updates);
    if (profile.id === currentUser.id) {
      currentProfile = await getProfile(currentUser.id);
    }
    Object.keys(urlEditState).forEach((k) => (urlEditState[k] = false));
    // A save runs on blur, i.e. once the athlete has already clicked into the
    // next box - so the re-render must not throw away what they are in the
    // middle of pasting there, nor leave them typing into a box that is no
    // longer on the page.
    const focusedId = document.activeElement?.id;
    const typed = {};
    PROFILE_URL_FIELDS.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) typed[id] = el.value;
    });
    renderProfile();
    Object.entries(typed).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el && el.value !== value) el.value = value;
    });
    if (focusedId) document.getElementById(focusedId)?.focus();
  } catch (e) {
    console.error(e);
  } finally {
    savingProfileUrls = false;
  }
}

async function saveHrZones() {
  const profile = getViewedProfile();
  const zones = {};
  document.querySelectorAll("#hrZoneFields .zone-row").forEach((row) => {
    const num = row.querySelector(".zone-num")?.textContent?.replace(".", "").trim() || "";
    const no = row.querySelector(".zone-no")?.value?.trim() || "";
    const lidz = row.querySelector(".zone-lidz")?.value?.trim() || "";
    if (num && (no || lidz)) {
      zones[num] = { no, lidz };
    }
  });
  const maxHr = document.getElementById("maxHrInput")?.value?.trim();
  if (maxHr) zones.max_hr = maxHr;
  try {
    await updateProfile(profile.id, { hr_zones: zones });
    if (profile.id === currentUser.id) {
      currentProfile = await getProfile(currentUser.id);
    }
    const idx = athletes.findIndex((a) => a.id === profile.id);
    if (idx !== -1) athletes[idx].hr_zones = zones;
    render();
  } catch (e) {
    console.error(e);
  }
}

async function saveThresholds() {
  const profile = getViewedProfile();
  const thresholds = {
    lt_hr: document.getElementById("editLtHr").value.trim(),
    lt_pace: document.getElementById("editLtPace").value.trim(),
    aerobic_pace: document.getElementById("editAerobicPace").value.trim(),
    aerobic_hr: document.getElementById("editAerobicHr").value.trim(),
    anaerobic_pace: document.getElementById("editAnaerobicPace").value.trim(),
    anaerobic_hr: document.getElementById("editAnaerobicHr").value.trim(),
  };
  try {
    await updateProfile(profile.id, { thresholds });
    if (profile.id === currentUser.id) {
      currentProfile = await getProfile(currentUser.id);
    }
    const idx = athletes.findIndex((a) => a.id === profile.id);
    if (idx !== -1) athletes[idx].thresholds = thresholds;
    render();
  } catch (e) {
    console.error(e);
  }
}

async function savePaceHrMap() {
  const profile = getViewedProfile();
  const stored = profile.pace_hr_map || {};
  const paceHrMap = {};
  // The list of pulse rows has changed once already (125/135/145/155/165 ->
  // 120/130/.../180). Carry forward any stored pulse that no longer has a row
  // so an unrelated save never quietly deletes numbers the coach entered.
  const shown = new Set(
    [...document.querySelectorAll("#paceHrFields .zone-num")].map((el) => el.textContent.trim())
  );
  Object.keys(stored).forEach((key) => {
    if (key !== "_meta" && !shown.has(key)) paceHrMap[key] = stored[key];
  });
  document.querySelectorAll("#paceHrFields .zone-row").forEach((row) => {
    const hr = row.querySelector(".zone-num")?.textContent?.trim() || "";
    const no = row.querySelector(".zone-no")?.value?.trim() || "";
    const lidz = row.querySelector(".zone-lidz")?.value?.trim() || "";
    if (hr && (no || lidz)) {
      paceHrMap[hr] = { no, lidz };
    }
  });
  // Stamp who saved it, so the other side can be told there is something new.
  const editedAt = new Date().toISOString();
  paceHrMap._meta = { by: isCoach() ? "coach" : "athlete", at: editedAt };
  try {
    await updateProfile(profile.id, { pace_hr_map: paceHrMap });
    // Our own edit must never come back to us as a notification.
    markPaceHrEditSeen(profile.id, editedAt);
    if (profile.id === currentUser.id) {
      currentProfile = await getProfile(currentUser.id);
    }
    const idx = athletes.findIndex((a) => a.id === profile.id);
    if (idx !== -1) athletes[idx].pace_hr_map = paceHrMap;
    render();
  } catch (e) {
    console.error(e);
    alert("Saglabāšana neizdevās (iespējams, trūkst tiesību).");
  }
}
