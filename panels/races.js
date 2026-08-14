// "Sacensības" - divas daļas: mazie sacensību logi (jauna sacensība /
// rezultāts) un lielais "Sacensību kalendārs" sānjoslas panelis ar
// Gaidāmās/Notikušās cilnēm. Skat. CLAUDE.md "races un monthRaces ir
// nedēļas/mēneša tvērumā" - tāpēc findRaceById meklē visos trīs sarakstos.
let races = [];
let monthRaces = [];
// Every race of the selected athlete, cached by the race-calendar panel. races
// and monthRaces only ever hold the visible week/month, so a race listed in the
// panel is usually in neither of them.
let raceCalendarRaces = [];
let seenRaceIds = new Set();

// Looking a race up in `races` alone made the panel's edit button silently do
// nothing for anything outside the current week - which is every past race.
function findRaceById(raceId) {
  return races.find((x) => x.id === raceId)
    || monthRaces.find((x) => x.id === raceId)
    || raceCalendarRaces.find((x) => x.id === raceId)
    || null;
}

function loadSeenRaceIds() {
  try {
    const stored = localStorage.getItem("seenRaceIds");
    if (stored) seenRaceIds = new Set(JSON.parse(stored));
  } catch (e) {
    seenRaceIds = new Set();
  }
}

function saveSeenRaceIds() {
  localStorage.setItem("seenRaceIds", JSON.stringify([...seenRaceIds]));
}

function isRaceSeen(athleteId, raceId) {
  return seenRaceIds.has(`${athleteId}:${raceId}`);
}

function markAllRacesSeen(athleteId, races) {
  races.forEach(r => seenRaceIds.add(`${athleteId}:${r.id}`));
  saveSeenRaceIds();
}

loadSeenRaceIds();

// #region Sacensību dialogi (jauna/rediģēt sacensību, ierakstīt rezultātu)
// Race dialog
const raceDialog = document.getElementById("raceDialog");
const raceDate = document.getElementById("raceDate");
const raceName = document.getElementById("raceName");
const raceLocation = document.getElementById("raceLocation");
const saveRaceBtn = document.getElementById("saveRaceBtn");
const deleteRaceBtn = document.getElementById("deleteRaceBtn");
let editingRaceId = null;

// Race result dialog
const raceResultDialog = document.getElementById("raceResultDialog");
const raceResultInfo = document.getElementById("raceResultInfo");
const raceResultTime = document.getElementById("raceResultTime");
const raceResultPace = document.getElementById("raceResultPace");
const raceResultComment = document.getElementById("raceResultComment");
const saveRaceResultBtn = document.getElementById("saveRaceResultBtn");
let editingRaceResultId = null;
let editingRaceDistance = "";

function openRaceDialog(raceId) {
  editingRaceId = raceId;
  if (raceId) {
    const r = findRaceById(raceId);
    if (!r) return;
    raceDate.value = r.date;
    raceName.value = r.name;
    raceLocation.value = r.location || "";
    document.getElementById("raceDistance").value = r.distance || "";
    document.getElementById("raceTerrain").value = r.terrain || "";
    document.getElementById("raceTargetTime").value = r.target_time || "";
    if (deleteRaceBtn) deleteRaceBtn.hidden = false;
  } else {
    raceDate.value = formatDateISO(new Date());
    raceName.value = "";
    raceLocation.value = "";
    document.getElementById("raceDistance").value = "";
    document.getElementById("raceTerrain").value = "";
    document.getElementById("raceTargetTime").value = "";
    if (deleteRaceBtn) deleteRaceBtn.hidden = true;
  }
  raceDialog.showModal();
}

document.getElementById("openRaceBtn")?.addEventListener("click", () => openRaceDialog(null));

saveRaceBtn.addEventListener("click", async () => {
  const athleteId = getSelectedAthleteId();
  const data = {
    name: raceName.value.trim(),
    date: raceDate.value,
    location: raceLocation.value.trim(),
    distance: document.getElementById("raceDistance").value.trim(),
    terrain: document.getElementById("raceTerrain").value,
    target_time: document.getElementById("raceTargetTime").value.trim(),
  };
  try {
    if (editingRaceId) {
      await updateRace(editingRaceId, data);
    } else {
      data.athlete_id = athleteId;
      await insertRace(data);
    }
    raceDialog.close();
    await loadNonTemplateData();
  } catch (e) {
    console.error(e);
  }
});


if (deleteRaceBtn) {
  deleteRaceBtn.addEventListener("click", async () => {
    if (!editingRaceId) return;
    try {
      await deleteRace(editingRaceId);
      raceDialog.close();
      await loadNonTemplateData();
    } catch (e) {
      console.error(e);
    }
  });
}

// Race result dialog
function openRaceResultDialog(raceId) {
  editingRaceResultId = raceId;
  const r = findRaceById(raceId);
  if (!r) return;
  raceResultInfo.innerHTML = `<strong>${escapeHtml(r.name)}</strong><span>${formatDateLV(r.date)}${r.distance ? " · " + escapeHtml(r.distance) : ""}${r.location ? " · " + escapeHtml(r.location) : ""}${r.target_time ? " · Mērķis: " + escapeHtml(r.target_time) : ""}</span>`;
  editingRaceDistance = r.distance || "";
  raceResultTime.value = r.result_time || "";
  raceResultPace.value = r.result_pace || "";
  raceResultComment.value = r.result_comment || "";
  raceResultDialog.showModal();
}

saveRaceResultBtn.addEventListener("click", async () => {
  if (!editingRaceResultId) return;
  try {
    await updateRace(editingRaceResultId, {
      result_time: raceResultTime.value.trim(),
      result_pace: raceResultPace.value.trim(),
      result_comment: raceResultComment.value.trim(),
    });
    raceResultDialog.close();
    await loadNonTemplateData();
  } catch (e) {
    console.error(e);
  }
});

raceResultTime.addEventListener("input", () => {
  if (editingRaceDistance) {
    raceResultPace.value = calcPace(raceResultTime.value.trim(), editingRaceDistance);
  }
});

// #endregion

// #region Sacensību kalendāra panelis (saraksts, cilnes, "saglabāt kā rekordu")
function getUpcomingRaces(allRaces) {
  return allRaces.filter((r) => !r.result_time);
}

function renderRaceTabFromRaces(allRaces, tab) {
  const athleteId = getSelectedAthleteId();
  const upcoming = getUpcomingRaces(allRaces).sort((a, b) => a.date < b.date ? -1 : 1);
  const past = allRaces.filter((r) => !!r.result_time).sort((a, b) => a.date < b.date ? 1 : -1);
  const races = tab === "upcoming" ? upcoming : past;
  raceCalendarRaces = allRaces;
  const content = document.getElementById("raceCalendarContent");
  if (!races.length) {
    content.innerHTML = "";
    return;
  }
  const isAthleteOwner = (activeRole === "athlete") && currentUser.id === athleteId;
  content.innerHTML = races.map((r) => {
    const hasResult = !!r.result_time;
    return `
      <div class="race-list-item">
        <div class="race-list-main">
          <strong>${escapeHtml(r.name)}</strong>
          <span class="muted">${formatDateLV(r.date)}${r.location ? " · " + escapeHtml(r.location) : ""}</span>
          ${r.distance ? `<span class="race-dist-line"><strong class="race-distance">${escapeHtml(r.distance)}</strong>${r.terrain ? ` · ${escapeHtml(capitalize(r.terrain))}` : ""}</span>` : r.terrain ? `<span class="race-dist-line"><span class="race-distance">${escapeHtml(capitalize(r.terrain))}</span></span>` : ""}
        </div>
        <div class="race-list-details">
          ${tab === "upcoming"
            ? (r.target_time
              ? `<span class="chip-target">Mērķis: ${escapeHtml(r.target_time)}${r.target_pace ? " (" + escapeHtml(r.target_pace.replace(/\/km\s*$/i, "")) + "/km)" : ""}</span>`
              : `<span class="muted">— Nav mērķa</span>`)
            : (hasResult
              ? `<span class="chip-result">✅ ${escapeHtml(r.result_time)}${r.result_pace ? " (" + escapeHtml(r.result_pace.replace(/\/km\s*$/i, "")) + "/km)" : ""}</span>`
              : `<span class="muted">— Nav rezultāta</span>`)
          }
        </div>
        ${tab === "past" && r.result_comment ? `<div class="race-comment-block"><div class="race-comment-label">Komentārs pēc sacensībām</div><p class="race-notes">${escapeHtml(r.result_comment)}</p></div>` : ""}
        ${isAthleteOwner ? `<div class="race-list-actions">
          <button class="secondary-action-sm" data-race-edit="${r.id}" type="button">✏️ Rediģēt</button>
          <!-- Both tabs, with or without a result: a finished race sits in
               "past", and the button used to be upcoming-only and no-result-only,
               so a saved time could never be corrected and an old race could
               never be given one at all. -->
          <button class="secondary-action-sm" data-race-log="${r.id}" type="button">${hasResult ? "✏️ Labot rezultātu" : "📝 Pievienot rezultātu"}</button>
          ${tab === "past" && hasResult && distanceToMeters(r.distance)
            ? `<button class="secondary-action-sm" data-race-record="${r.id}" type="button">🏅 Saglabāt kā rekordu</button>`
            : ""}
        </div>` : ""}
      </div>
    `;
  }).join("");

  if (isAthleteOwner) {
    content.querySelectorAll("[data-race-edit]").forEach((btn) => {
      btn.addEventListener("click", () => openRaceDialog(btn.dataset.raceEdit));
    });
    content.querySelectorAll("[data-race-log]").forEach((btn) => {
      btn.addEventListener("click", () => openRaceResultDialog(btn.dataset.raceLog));
    });
    content.querySelectorAll("[data-race-record]").forEach((btn) => {
      btn.addEventListener("click", () => saveRaceAsRecord(btn.dataset.raceRecord, btn));
    });
  }
}

// "37:32" -> 2252, "1:23:45" -> 5025. 0 when the time cannot be read, which
// makes the caller skip the slower-than-existing check rather than guess.
function raceTimeToSeconds(text) {
  const parts = String(text || "").trim().split(":").map((p) => parseFloat(p.replace(",", ".")));
  if (!parts.length || parts.some((n) => !isFinite(n))) return 0;
  // .reduce((acc, n) => ..., sākumvērtība) "salok" visu masīvu vienā
  // vērtībā - kā Python `functools.reduce`. Šeit katrs solis reizina līdzšinējo
  // rezultātu ar 60 un pieskaita nākamo daļu, kas laika daļas (stundas,
  // minūtes, sekundes) pārvērš sekundēs neatkarīgi no tā, cik daļu ir.
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

// Turns a finished race into a personal record. An existing record over the
// same distance is replaced in place - keeping its own distance wording, so it
// stays in the row it was already in - otherwise a new record is added.
async function saveRaceAsRecord(raceId, btn) {
  const race = findRaceById(raceId);
  if (!race || !race.result_time) return;
  if (!distanceToMeters(race.distance)) {
    alert("Šīm sacensībām nav norādīta distance, tāpēc rekordu saglabāt nevar.");
    return;
  }

  const existing = findRecordForDistance(race.distance);
  if (existing) {
    const oldSec = raceTimeToSeconds(existing.time);
    const newSec = raceTimeToSeconds(race.result_time);
    // Only ask when the new time is genuinely worse; a faster result just wins.
    if (oldSec && newSec && newSec > oldSec) {
      const ok = confirm(
        `Esošais rekords (${existing.distance}) ir ${existing.time}, `
        + `bet šis rezultāts ${race.result_time} ir lēnāks.\n\nTomēr nomainīt rekordu?`
      );
      if (!ok) return;
    }
  }

  const data = {
    athlete_id: getSelectedAthleteId(),
    distance: existing
      ? existing.distance
      : (standardRecordDistanceLabel(race.distance) || race.distance),
    time: race.result_time,
    location: race.location || "",
    competition_name: race.name || "",
    date: race.date,
  };

  try {
    if (existing) {
      await updateRecord(existing.id, data);
    } else {
      await insertRecord(data);
    }
    records = await getRecords(getSelectedAthleteId());
    render();
    if (btn) {
      btn.textContent = "✅ Saglabāts";
      btn.disabled = true;
    }
  } catch (e) {
    console.error(e);
    alert("Saglabāšana neizdevās (iespējams, trūkst tiesību).");
  }
}

// `.then(rezultāts => {...})` ir tas pats, ko citur failā dara `await` -
// "kad šis solījums (promise) atrisinās, izpildi šo funkciju ar rezultātu".
// Abi paņēmieni ir līdzvērtīgi; šis fails vietām lieto `.then()` tur, kur
// nav `async function` apkārt.
function renderRaceTab(tab) {
  const athleteId = getSelectedAthleteId();
  if (!athleteId) return;
  getRaces(athleteId).then((allRaces) => renderRaceTabFromRaces(allRaces, tab));
}

function updateRaceCalendarBadge(allRaces) {
  const panel = document.getElementById("raceCalendarPanel");
  if (!panel) return;
  const header = panel.querySelector(".panel-header");
  const athleteId = getSelectedAthleteId();
  if (activeRole === "coach" && athleteId) {
    const upcoming = getUpcomingRaces(allRaces);
    const unseen = upcoming.filter(r => !isRaceSeen(athleteId, r.id)).length;
    panel.classList.toggle("has-entries", unseen > 0);
    header.dataset.count = unseen > 9 ? "9+" : String(unseen);
  } else {
    panel.classList.toggle("has-entries", false);
  }
}

function refreshRaceCalendar() {
  const athleteId = getSelectedAthleteId();
  if (!athleteId) return;
  getRaces(athleteId).then((allRaces) => {
    updateRaceCalendarBadge(allRaces);
    const activeTab = document.querySelector("#raceCalendarPanel [data-race-tab].active");
    renderRaceTabFromRaces(allRaces, activeTab ? activeTab.dataset.raceTab : "upcoming");
  });
}

function onRaceCalendarExpand() {
  const athleteId = getSelectedAthleteId();
  if (!athleteId) {
    refreshRaceCalendar();
    return;
  }
  getRaces(athleteId).then((allRaces) => {
    if (activeRole === "coach") {
      markAllRacesSeen(athleteId, getUpcomingRaces(allRaces));
    }
    updateRaceCalendarBadge(allRaces);
    const activeTab = document.querySelector("#raceCalendarPanel [data-race-tab].active");
    renderRaceTabFromRaces(allRaces, activeTab ? activeTab.dataset.raceTab : "upcoming");
  });
}

document.querySelectorAll("#raceCalendarPanel [data-race-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#raceCalendarPanel [data-race-tab]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderRaceTab(btn.dataset.raceTab);
  });
});
// #endregion
