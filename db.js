// ===================================================================
// DATA ACCESS LAYER (see also CLAUDE.md "db.js")
// ===================================================================
// This is the ONLY file that talks to Supabase (the cloud database). Each
// function is a small wrapper function around one operation on one table:
// getX (read), insertX (create), updateX (update), deleteX (delete).
// app.js and panels/*.js files NEVER call `supabase.from(...)` directly -
// they always call one of the functions from here.
//
// A query "chain" (e.g. `getProfile` below) looks like a series of
// dot-methods, each adding one SQL condition, and finally
// `await` waits for the response from the server - roughly like SQL:
//   SELECT * FROM profiles WHERE id = userId
// written as:
//   supabase.from("profiles").select("*").eq("id", userId)
// Common methods: .select("fields") - what to select (or "*" for all); .eq/.neq/
// .gte/.lte/.in - conditions (=, ≠, ≥, ≤, "is in list"); .order() -
// sorting; .single() - expect exactly ONE result (not a list);
// .range(from, to) - pagination (see getPlanTitlesSince below, where it's
// actually needed). The response always comes back as `{ data, error }` -
// `const { data } = await ...` takes only the `data` part (destructuring).
//
// Convention throughout this file: `getX` functions silently return an empty
// list (`data || []`) when something fails - the caller doesn't have to
// handle the error, so the page doesn't break. `insertX`/`updateX`/`deleteX`
// functions do the OPPOSITE - they rethrow the error (`if (error) throw
// error`) so the caller (usually a dialog's "Save" button) can tell the
// user that saving failed, rather than pretending everything is fine.

const SUPABASE_URL = "https://yqaabswcvwkiimpoxsfj.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlxYWFic3djdndraWltcG94c2ZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1NDMwMzEsImV4cCI6MjA5NzExOTAzMX0.lp-MqwLJiiHyMyITkQ59BoNvKWHtHl14FevIa3PtnF4";

window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: {
      getItem: (key) => {
        const remember = localStorage.getItem("rememberLogin") !== "false";
        return (remember ? localStorage : sessionStorage).getItem(key);
      },
      setItem: (key, value) => {
        const remember = localStorage.getItem("rememberLogin") !== "false";
        (remember ? localStorage : sessionStorage).setItem(key, value);
      },
      removeItem: (key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      },
    },
    persistSession: true,
    autoRefreshToken: true,
  },
});

// #region Profiles and athlete list
async function getProfile(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  return data;
}

async function upsertProfile(userId, data) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, ...data })
    .select()
    .single();
  if (error) throw error;
}

async function updateProfile(userId, updates) {
  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", userId);
  if (error) throw error;
}

async function getAthletes() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, group_name, role, hr_zones, thresholds, pace_hr_map, garmin_url, strava_url, spreadsheet_url")
    .neq("role", "coach")
    .order("full_name");
  return data || [];
}

async function getAllProfiles() {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("full_name");
  return data || [];
}

// #endregion

// #region Plans and templates
async function getPlans(athleteId, weekStart, weekEnd) {
  const { data } = await supabase
    .from("plans")
    .select("*")
    .eq("athlete_id", athleteId)
    .gte("date", weekStart)
    .lte("date", weekEnd)
    .order("date");
  return data || [];
}

async function getAllPlans(athleteId) {
  const { data } = await supabase
    .from("plans")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });
  return data || [];
}

// Every athlete's plans since `sinceDate`, title + details only — the input for
// the "most used trainings" list. Fetched in pages because PostgREST caps a
// plain select at 1000 rows, and ~25 athletes over a few months goes past that:
// without paging the tail would silently vanish and the counts would be wrong.
async function getPlanTitlesSince(athleteIds, sinceDate) {
  if (!athleteIds.length) return [];
  const PAGE = 1000;
  const MAX_ROWS = 20000;
  const rows = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await supabase
      .from("plans")
      .select("title, details")
      .in("athlete_id", athleteIds)
      .gte("date", sinceDate)
      .order("date", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || !data.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function insertPlan(plan) {
  const { data, error } = await supabase
    .from("plans")
    .insert(plan)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updatePlan(id, updates) {
  const { error } = await supabase
    .from("plans")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

async function deletePlan(id) {
  const { error } = await supabase
    .from("plans")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function getTemplates(athleteId) {
  let query = supabase.from("templates").select("*");
  if (athleteId) {
    query = query.or(`athlete_id.is.null,athlete_id.eq.${athleteId}`);
  }
  const { data } = await query.order("name");
  return data || [];
}

async function insertTemplate(template) {
  const { data, error } = await supabase
    .from("templates")
    .insert(template)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteTemplate(id) {
  const { error } = await supabase
    .from("templates")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function updateTemplate(id, updates) {
  const { data, error } = await supabase
    .from("templates")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// #endregion

// #region Races and records
async function getRaces(athleteId) {
  const { data } = await supabase
    .from("races")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: true });
  return data || [];
}

async function getRacesForWeek(athleteId, weekStart, weekEnd) {
  const { data } = await supabase
    .from("races")
    .select("*")
    .eq("athlete_id", athleteId)
    .gte("date", weekStart)
    .lte("date", weekEnd)
    .order("date");
  return data || [];
}

async function insertRace(race) {
  const { data, error } = await supabase
    .from("races")
    .insert(race)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateRace(id, updates) {
  const { data, error } = await supabase
    .from("races")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteRace(id) {
  const { error } = await supabase
    .from("races")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function getRecords(athleteId) {
  const { data } = await supabase
    .from("records")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("distance");
  return data || [];
}

async function insertRecord(record) {
  const { data, error } = await supabase
    .from("records")
    .insert(record)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateRecord(id, updates) {
  const { error } = await supabase
    .from("records")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

async function deleteRecord(id) {
  const { error } = await supabase
    .from("records")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

// #endregion

// #region Log entries, weekly summaries and stats chart data
async function getLogEntries(athleteId, weekStart, weekEnd) {
  const { data } = await supabase
    .from("log_entries")
    .select("*")
    .eq("athlete_id", athleteId)
    .gte("date", weekStart)
    .lte("date", weekEnd)
    .order("date");
  return data || [];
}

async function getAllLogEntries(athleteId) {
  const { data } = await supabase
    .from("log_entries")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });
  return data || [];
}

function trendDateISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function trendMonday(date) {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  d.setHours(0, 0, 0, 0);
  return d;
}

function trendMonthStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// How many of one week's seven days fall in each month it touches.
// Kilometres and hours are typed in once for the whole week, so a week that
// straddles a month boundary (27 July - 2 August) has nothing saying which of
// the 86 km were run on the 1st and 2nd - it is split by day count, 5/7 to
// July and 2/7 to August. Before this the whole week went to the month holding
// its Monday, which lifted the old month and left the new one empty for its
// first days.
//
// Days are counted, not shares: adding 1/7 seven times comes to
// 0.9999999999999998, and a whole week must keep every metre of its 100 km.
function trendWeekMonthDays(weekStartStr) {
  const days = {};
  const d = new Date(weekStartStr + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const key = trendDateISO(trendMonthStart(d));
    days[key] = (days[key] || 0) + 1;
    d.setDate(d.getDate() + 1);
  }
  return days;
}

async function getWeeklyTrend(athleteId, numWeeks) {
  const endDate = trendMonday(new Date());
  endDate.setDate(endDate.getDate() + 6);
  let startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - (numWeeks * 7) + 1);

  // No floor here on purpose. A hardcoded 2026-06-01 used to clamp the start,
  // so every range button returned the same handful of periods and looked
  // dead: in August 2026 "4", "8" and "12 mēneši" all gave the same 3 months.
  // Periods with nothing logged simply come back as zeros.
  const startStr = trendDateISO(startDate);
  const endStr = trendDateISO(endDate);

  const { data: logs } = await supabase
    .from("log_entries")
    .select("date, activity_type, distance_km, duration_min")
    .eq("athlete_id", athleteId)
    .gte("date", startStr)
    .lte("date", endStr);

  const weeks = {};
  const totalDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  const numBuckets = Math.max(Math.ceil(totalDays / 7), 1);
  for (let i = 0; i < numBuckets; i++) {
    const m = new Date(startDate);
    m.setDate(m.getDate() + i * 7);
    const mon = trendMonday(m);
    const key = trendDateISO(mon);
    weeks[key] = { week_start: key, run_km: 0, run_min: 0, vfs_sfs_min: 0, velo_min: 0 };
  }

  if (logs) {
    // `for (const x of array)` goes through the array's elements in order - like
    // Python's `for x in array:` (unlike `.forEach()`, this allows using
    // `continue`/`break` inside it, which is why this is used here instead of that).
    for (const entry of logs) {
      const d = new Date(entry.date + "T00:00:00");
      const mon = trendMonday(d);
      const key = trendDateISO(mon);
      if (!weeks[key]) continue;
      if (entry.activity_type === "run") {
        weeks[key].run_km += Number(entry.distance_km) || 0;
      }
      weeks[key].run_min += Number(entry.duration_min) / 60 || 0;
      if (entry.activity_type === "gym") {
        weeks[key].vfs_sfs_min += Number(entry.duration_min) / 60 || 0;
      } else if (entry.activity_type === "bike") {
        weeks[key].velo_min += Number(entry.duration_min) / 60 || 0;
      }
    }
  }

  const weekKeys = Object.keys(weeks);
  if (weekKeys.length) {
    const { data: summaries } = await supabase
      .from("weekly_summaries")
      .select("week_start, run_km, run_min, vfs_sfs_min, velo_min")
      .eq("athlete_id", athleteId)
      .gte("week_start", weekKeys[0])
      .lte("week_start", weekKeys[weekKeys.length - 1]);
    if (summaries) {
      for (const s of summaries) {
        const wk = trendDateISO(trendMonday(new Date(s.week_start + "T00:00:00")));
        if (weeks[wk]) {
          if (s.run_km) weeks[wk].run_km = s.run_km;
          if (s.run_min) weeks[wk].run_min = s.run_min;
          if (s.vfs_sfs_min) weeks[wk].vfs_sfs_min = s.vfs_sfs_min;
          if (s.velo_min) weeks[wk].velo_min = s.velo_min;
        }
      }
    }
  }

  return Object.values(weeks);
}

async function getMonthlyTrend(athleteId, numMonths) {
  const endDate = new Date();
  let startDate = new Date(endDate.getFullYear(), endDate.getMonth() - numMonths + 1, 1);

  // Same as getWeeklyTrend: no hardcoded floor, or the range buttons do nothing.
  const startStr = trendDateISO(startDate);
  const endStr = trendDateISO(endDate);

  const { data: logs } = await supabase
    .from("log_entries")
    .select("date, activity_type, distance_km, duration_min")
    .eq("athlete_id", athleteId)
    .gte("date", startStr)
    .lte("date", endStr);

  const months = {};
  const cursor = new Date(startDate);
  while (cursor <= endDate) {
    const key = trendDateISO(cursor);
    months[key] = { month_start: key, run_km: 0, run_min: 0, vfs_sfs_min: 0, velo_min: 0 };
    cursor.setMonth(cursor.getMonth() + 1);
  }

  if (logs) {
    for (const entry of logs) {
      const d = new Date(entry.date + "T00:00:00");
      const ms = trendDateISO(trendMonthStart(d));
      if (!months[ms]) continue;
      if (entry.activity_type === "run") {
        months[ms].run_km += Number(entry.distance_km) || 0;
      }
      months[ms].run_min += Number(entry.duration_min) / 60 || 0;
      if (entry.activity_type === "gym") {
        months[ms].vfs_sfs_min += Number(entry.duration_min) / 60 || 0;
      } else if (entry.activity_type === "bike") {
        months[ms].velo_min += Number(entry.duration_min) / 60 || 0;
      }
    }
  }

  // A week starting up to six days before the range can still put days inside
  // the first month (27 July - 2 August feeds August), so it has to be fetched
  // or those first days come back empty.
  const summaryFrom = new Date(startDate);
  summaryFrom.setDate(summaryFrom.getDate() - 6);
  const { data: summaries } = await supabase
    .from("weekly_summaries")
    .select("week_start, run_km, run_min, vfs_sfs_min, velo_min")
    .eq("athlete_id", athleteId)
    .gte("week_start", trendDateISO(summaryFrom))
    .lte("week_start", endStr);
  if (summaries) {
    for (const s of summaries) {
      // Whole weeks - the vast majority - land in one month with a share of
      // 7/7, which is exactly 1, and behave exactly as before.
      const parts = trendWeekMonthDays(s.week_start);
      for (const monthKey in parts) {
        const share = parts[monthKey] / 7;
        if (!months[monthKey]) continue;
        if (s.run_km) months[monthKey].run_km += s.run_km * share;
        if (s.run_min) months[monthKey].run_min += s.run_min * share;
        if (s.vfs_sfs_min) months[monthKey].vfs_sfs_min += s.vfs_sfs_min * share;
        if (s.velo_min) months[monthKey].velo_min += s.velo_min * share;
      }
    }
  }

  return Object.values(months);
}

async function insertLogEntry(entry) {
  const { data, error } = await supabase
    .from("log_entries")
    .insert(entry)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteLogEntry(id) {
  const { error } = await supabase
    .from("log_entries")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function updateLogEntry(id, updates) {
  const { data, error } = await supabase
    .from("log_entries")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getWeeklySummary(athleteId, weekStart) {
  const { data } = await supabase
    .from("weekly_summaries")
    .select("*")
    .eq("athlete_id", athleteId)
    .eq("week_start", weekStart)
    .maybeSingle();
  return data || null;
}

async function upsertWeeklySummary(data) {
  const { error } = await supabase
    .from("weekly_summaries")
    .upsert(data, { onConflict: "athlete_id,week_start" })
    .select()
    .single();
  if (error) throw error;
}
// #endregion

// #region Day notes and weekly status (boxes next to the athlete's name)
async function getDayNotes(athleteId, weekStart, weekEnd) {
  const { data } = await supabase
    .from("day_notes")
    .select("*")
    .eq("athlete_id", athleteId)
    .gte("date", weekStart)
    .lte("date", weekEnd);
  return data || [];
}

async function getDayNote(athleteId, date) {
  const { data } = await supabase
    .from("day_notes")
    .select("*")
    .eq("athlete_id", athleteId)
    .eq("date", date)
    .maybeSingle();
  return data || null;
}

async function upsertDayNote(data) {
  const { error } = await supabase
    .from("day_notes")
    .upsert(data, { onConflict: "athlete_id,date" })
    .select()
    .single();
  if (error) throw error;
}

async function getWeekStatuses(athleteIds, weekStartStr) {
  if (!athleteIds.length) return {};
  const startParts = weekStartStr.split("-").map(Number);
  const startDate = new Date(startParts[0], startParts[1] - 1, startParts[2]);

  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 28);
  const weekEndStr = isoLocal(endDate);

  const [plansRes, dayNotesRes, racesRes, restrictionsRes] = await Promise.all([
    supabase
      .from("plans")
      .select("athlete_id, date, original_date")
      .in("athlete_id", athleteIds)
      .or(`and(date.gte.${weekStartStr},date.lte.${weekEndStr}),and(original_date.gte.${weekStartStr},original_date.lte.${weekEndStr})`),
    supabase.from("day_notes").select("athlete_id, date").in("athlete_id", athleteIds).gte("date", weekStartStr).lte("date", weekEndStr).eq("is_rest_day", true),
    supabase.from("races").select("athlete_id, date").in("athlete_id", athleteIds).gte("date", weekStartStr).lte("date", weekEndStr),
    // A restricted day (whole or partial) counts as covered too - the coach
    // did not fail to plan it, the athlete simply can't train (all or part of
    // it) that day. See CLAUDE.md "The four boxes next to an athlete's name".
    supabase
      .from("restrictions")
      .select("athlete_id, start_date, end_date")
      .in("athlete_id", athleteIds)
      .lte("start_date", weekEndStr)
      .or(`end_date.gte.${weekStartStr},end_date.is.null`),
  ]);

  const covered = {};
  athleteIds.forEach(id => { covered[id] = new Set(); });
  (plansRes.data || []).forEach(p => {
    if (covered[p.athlete_id]) {
      covered[p.athlete_id].add(p.date);
      if (p.original_date) covered[p.athlete_id].add(p.original_date);
    }
  });
  (dayNotesRes.data || []).forEach(d => { if (covered[d.athlete_id]) covered[d.athlete_id].add(d.date); });
  (racesRes.data || []).forEach(r => { if (covered[r.athlete_id]) covered[r.athlete_id].add(r.date); });
  (restrictionsRes.data || []).forEach(r => {
    if (!covered[r.athlete_id]) return;
    // end_date: null means single-day (= start_date), not open-ended - same
    // convention as everywhere else this table is read.
    const rStart = r.start_date < weekStartStr ? weekStartStr : r.start_date;
    const rEndRaw = r.end_date || r.start_date;
    const rEnd = rEndRaw > weekEndStr ? weekEndStr : rEndRaw;
    if (rStart > rEnd) return;
    // Clamped to the 4-week window first, so this never loops more than ~29
    // times even for a restriction that spans months in the database.
    const sp = rStart.split("-").map(Number);
    const ep = rEnd.split("-").map(Number);
    let cur = new Date(sp[0], sp[1] - 1, sp[2]);
    const last = new Date(ep[0], ep[1] - 1, ep[2]);
    while (cur <= last) {
      covered[r.athlete_id].add(isoLocal(cur));
      cur.setDate(cur.getDate() + 1);
    }
  });

  const statuses = {};
  athleteIds.forEach(id => {
    const weeks = [];
    for (let w = 0; w < 4; w++) {
      let allCovered = true;
      for (let d = 0; d < 7; d++) {
        const dt = new Date(startDate);
        dt.setDate(dt.getDate() + w * 7 + d);
        const ds = isoLocal(dt);
        if (!covered[id].has(ds)) { allCovered = false; break; }
      }
      weeks.push(allCovered);
    }
    statuses[id] = weeks;
  });
  return statuses;
}

async function getWeekBlockTypesForAthletes(athleteIds, weekStartStr) {
  if (!athleteIds.length) return {};
  const startParts = weekStartStr.split("-").map(Number);
  const startDate = new Date(startParts[0], startParts[1] - 1, startParts[2]);
  const weekStarts = [];
  for (let w = 0; w < 4; w++) {
    const dt = new Date(startDate);
    dt.setDate(dt.getDate() + w * 7);
    weekStarts.push(isoLocal(dt));
  }

  const { data } = await supabase
    .from("week_block_types")
    .select("athlete_id, week_start, block_type")
    .in("athlete_id", athleteIds)
    .in("week_start", weekStarts);

  const result = {};
  athleteIds.forEach(id => { result[id] = weekStarts.map(() => null); });
  (data || []).forEach(row => {
    const idx = weekStarts.indexOf(row.week_start);
    if (idx !== -1 && result[row.athlete_id]) result[row.athlete_id][idx] = row.block_type;
  });
  return result;
}

async function getWeekBlockTypesInRange(athleteId, weekStarts) {
  if (!weekStarts.length) return {};
  const { data } = await supabase
    .from("week_block_types")
    .select("week_start, block_type")
    .eq("athlete_id", athleteId)
    .in("week_start", weekStarts);
  const result = {};
  (data || []).forEach(row => { result[row.week_start] = row.block_type; });
  return result;
}
// #endregion

// #region Restrictions and diary
function isoLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function getRestrictions(athleteId) {
  const { data } = await supabase
    .from("restrictions")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("start_date");
  return data || [];
}

async function insertRestriction(r) {
  const { data, error } = await supabase
    .from("restrictions")
    .insert(r)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function deleteRestriction(id) {
  const { error } = await supabase
    .from("restrictions")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function updateRestriction(id, updates) {
  const { error } = await supabase
    .from("restrictions")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

async function getDiaryEntries(athleteId) {
  const { data } = await supabase
    .from("diary_entries")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });
  return data || [];
}

// Ids only, for every athlete at once — enough to tell whether a name in the
// athlete dropdown needs the "unread diary entry" icon, without pulling the
// entries' text across. Same shape as getAthleteHealthCounts.
async function getAllDiaryEntryIds() {
  const { data } = await supabase
    .from("diary_entries")
    .select("id, athlete_id");
  return data || [];
}

async function insertDiaryEntry(data) {
  const { data: result, error } = await supabase
    .from("diary_entries")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function updateDiaryEntry(id, updates) {
  const { error } = await supabase
    .from("diary_entries")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

async function deleteDiaryEntry(id) {
  const { error } = await supabase
    .from("diary_entries")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
// #endregion

// #region Tests: self-tests, Polar, health journal, lab, Ruffier, lactate
async function getSelfTests(athleteId) {
  const { data } = await supabase
    .from("self_tests")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });
  return data || [];
}

async function insertSelfTest(data) {
  const { data: result, error } = await supabase
    .from("self_tests")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function updateSelfTest(id, updates) {
  const { error } = await supabase
    .from("self_tests")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

async function deleteSelfTest(id) {
  const { error } = await supabase
    .from("self_tests")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function getPolarTests(athleteId) {
  const { data } = await supabase
    .from("polar_tests")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });
  return data || [];
}

async function insertPolarTest(data) {
  const { data: result, error } = await supabase
    .from("polar_tests")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function updatePolarTest(id, updates) {
  const { error } = await supabase
    .from("polar_tests")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

async function deletePolarTest(id) {
  const { error } = await supabase
    .from("polar_tests")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function getHealthEntries(athleteId) {
  const { data } = await supabase
    .from("health_entries")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("start_date", { ascending: false });
  return data || [];
}

async function insertHealthEntry(data) {
  const { data: result, error } = await supabase
    .from("health_entries")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function updateHealthEntry(id, updates) {
  const { error } = await supabase
    .from("health_entries")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
}

async function deleteHealthEntry(id) {
  const { error } = await supabase
    .from("health_entries")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function getLabTests(athleteId) {
  const { data } = await supabase
    .from("lab_tests")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });
  return data || [];
}

async function insertLabTest(data) {
  const { data: result, error } = await supabase
    .from("lab_tests")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function deleteLabTest(id) {
  const { error } = await supabase
    .from("lab_tests")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function updateLabTest(id, updates) {
  const { data, error } = await supabase
    .from("lab_tests")
    .update(updates)
    .eq("id", id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Saglabāšana neizdevās (iespējams, trūkst tiesību) — izmaiņas netika saglabātas.");
  }
}

async function getRuffierTests(athleteId) {
  const { data } = await supabase
    .from("ruffier_tests")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });
  return data || [];
}

async function insertRuffierTest(data) {
  const { data: result, error } = await supabase
    .from("ruffier_tests")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function updateRuffierTest(id, updates) {
  const { data, error } = await supabase
    .from("ruffier_tests")
    .update(updates)
    .eq("id", id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Saglabāšana neizdevās (iespējams, trūkst tiesību) — izmaiņas netika saglabātas.");
  }
}

async function deleteRuffierTest(id) {
  const { error } = await supabase
    .from("ruffier_tests")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

async function getLactateTests(athleteId) {
  const { data } = await supabase
    .from("lactate_tests")
    .select("*")
    .eq("athlete_id", athleteId)
    .order("date", { ascending: false });
  return data || [];
}

async function insertLactateTest(data) {
  const { data: result, error } = await supabase
    .from("lactate_tests")
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return result;
}

async function updateLactateTest(id, updates) {
  const { data, error } = await supabase
    .from("lactate_tests")
    .update(updates)
    .eq("id", id)
    .select();
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Saglabāšana neizdevās (iespējams, trūkst tiesību) — izmaiņas netika saglabātas.");
  }
}

async function deleteLactateTest(id) {
  const { error } = await supabase
    .from("lactate_tests")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
// #endregion

// #region Coach reminders (⚕/!/📒 icons) and weekly reviews
async function getNotCompletedAthleteIds() {
  const { data } = await supabase
    .from("plans")
    .select("athlete_id")
    .eq("completed", false)
    .eq("coach_acknowledged", false);
  if (!data) return [];
  const ids = [...new Set(data.map(d => d.athlete_id))];
  return ids;
}

async function acknowledgeNotCompletedPlans(athleteId) {
  const { error } = await supabase
    .from("plans")
    .update({ coach_acknowledged: true })
    .eq("athlete_id", athleteId)
    .eq("completed", false)
    .eq("coach_acknowledged", false);
  if (error) throw error;
}

async function getAthleteHealthCounts() {
  const { data } = await supabase
    .from("health_entries")
    .select("athlete_id, start_date, end_date");
  return data || [];
}

async function getWeekBlockTypes(athleteId) {
  const { data } = await supabase
    .from("week_block_types")
    .select("*")
    .eq("athlete_id", athleteId);
  return data || [];
}

async function upsertWeekBlockType(data) {
  const { error } = await supabase
    .from("week_block_types")
    .upsert(data, { onConflict: "athlete_id,week_start" })
    .select()
    .single();
  if (error) throw error;
}

// Clearing a week's block type deletes the row rather than writing an empty
// string: week_block_types has a check constraint allowing only the three real
// types, so "" was rejected and the coach got a raw Postgres error instead of
// the type coming off. Every reader already does `?.block_type || ""`, so a
// missing row and an empty type mean the same thing downstream.
async function deleteWeekBlockType(athleteId, weekStart) {
  const { error } = await supabase
    .from("week_block_types")
    .delete()
    .eq("athlete_id", athleteId)
    .eq("week_start", weekStart);
  if (error) throw error;
}

async function getWeeklyReviews() {
  const { data, error } = await supabase
    .from("weekly_reviews")
    .select("athlete_id, week_start");
  if (error) throw error;
  return data || [];
}

async function getWeeklyReviewsForAthlete(athleteId) {
  const { data, error } = await supabase
    .from("weekly_reviews")
    .select("week_start")
    .eq("athlete_id", athleteId);
  if (error) throw error;
  return data || [];
}

async function markWeekReviewed(athleteId, weekStart) {
  const { error } = await supabase
    .from("weekly_reviews")
    .upsert(
      { athlete_id: athleteId, week_start: weekStart },
      { onConflict: "athlete_id,week_start" }
    );
  if (error) throw error;
}

async function unmarkWeekReviewed(athleteId, weekStart) {
  const { error } = await supabase
    .from("weekly_reviews")
    .delete()
    .eq("athlete_id", athleteId)
    .eq("week_start", weekStart);
  if (error) throw error;
}
// #endregion


