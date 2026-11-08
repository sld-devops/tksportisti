// This runs in Supabase's Deno runtime, not Node. VS Code's built-in TS
// checker doesn't know `Deno`, `jsr:` or `https://` imports and flags them
// as errors - they are valid here, and nothing in this project compiles
// this file with tsc. @ts-nocheck silences that editor-only noise.
// @ts-nocheck
//
// "Pievienot savam kalendāram": a calendar-subscription feed (iCalendar / .ics)
// of one athlete's trainings, races and rest days, so it can be added to
// Google Calendar or the iPhone calendar once and then keeps itself up to date.
//
// Two jobs, one function:
//   GET  ?a=<athleteId>&t=<token>   -> the .ics file. NO login: calendar apps
//        cannot send one, so this function must be deployed with "Verify JWT"
//        switched OFF. Access is by the secret token alone.
//   POST (Authorization: Bearer <session>)  -> { url }, the athlete's own
//        personal link. The token is never computed in the browser.
//
// The token is HMAC-SHA256(CAL_SECRET, athleteId) in hex, so nothing has to be
// stored in the database. CAL_SECRET is a Supabase secret (any long random
// text). Changing it makes every existing link stop working.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// >>> ICS BUILDER (pure functions, no Deno needed - checked in Node)
const DAYS_BACK = 14;
const DAYS_AHEAD = 120;

// iCalendar text escaping: backslash, semicolon, comma and line breaks.
function escapeText(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Lines may not be longer than 75 BYTES; continuation lines start with a space.
// Counted in bytes (not characters), and never cut in the middle of a letter,
// because Latvian letters and emoji take 2-4 bytes each.
function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (curBytes + b > limit) {
      parts.push(cur);
      cur = "";
      curBytes = 0;
      limit = 74; // the leading space of a continuation line takes one byte
    }
    cur += ch;
    curBytes += b;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

const compact = (iso) => String(iso).replace(/-/g, "");

function nextDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  return t.getUTCFullYear() + "-" + String(t.getUTCMonth() + 1).padStart(2, "0") + "-" + String(t.getUTCDate()).padStart(2, "0");
}

// Same wording as the app's displayTitle(): drop a trailing "(...)", "/" -> " un ".
function displayTitle(name) {
  return name ? name.replace(/\s*\(.*?\)\s*$/, "").replace(/\//g, " un ") : "";
}

// Same icons as the app's badgeForTitle().
function badgeForTitle(title) {
  const t = (title || "").toLowerCase();
  if (t.includes("vieglais") || t.includes("atjaunojošais") || t.includes("lēnais")) return "🐢";
  if (t.includes("vidējas intensitātes")) return "🛳️";
  if (t.includes("garais")) return "⌛";
  if (t.includes("intervāli")) return "⚡";
  if (t.includes("tempa")) return "📈";
  if (t.includes("vfs") || t.includes("sfs")) return "💪";
  if (t.includes("velo")) return "🚴";
  return "🎲";
}

const TOD_LABEL = { morning: "rīts", afternoon: "pusdiena", evening: "vakars" };

function allDayEvent({ uid, date, summary, description, now }) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${compact(date)}`,
    `DTEND;VALUE=DATE:${compact(nextDay(date))}`,
    `SUMMARY:${escapeText(summary)}`,
  ];
  if (description) lines.push(`DESCRIPTION:${escapeText(description)}`);
  lines.push("TRANSP:TRANSPARENT", "END:VEVENT");
  return lines.map(foldLine).join("\r\n");
}

// plans / races: rows from the tables; restDays: ["YYYY-MM-DD", ...].
// `now` is passed in (UTC, "YYYYMMDDTHHMMSSZ") so the output is testable.
function buildCalendar({ plans, races, restDays, now }) {
  const events = [];
  for (const p of plans || []) {
    if (!p.date) continue;
    const tod = TOD_LABEL[p.time_of_day];
    const summary = `${p.custom_icon || badgeForTitle(p.title)} ${displayTitle(p.title)}${tod ? ` (${tod})` : ""}`;
    const parts = [];
    if (p.details) parts.push(p.details);
    if (p.coach_comment) parts.push(`Trenera komentārs: ${p.coach_comment}`);
    events.push(allDayEvent({ uid: `plan-${p.id}@tksportisti`, date: p.date, summary, description: parts.join("\n\n"), now }));
  }
  for (const r of races || []) {
    if (!r.date) continue;
    const desc = [
      r.distance ? `Distance: ${r.distance}` : "",
      r.terrain ? `Trase: ${r.terrain}` : "",
      r.location ? `Vieta: ${r.location}` : "",
      r.target_time ? `Mērķis: ${r.target_time}` : "",
    ].filter(Boolean).join("\n");
    events.push(allDayEvent({ uid: `race-${r.id}@tksportisti`, date: r.date, summary: `🏁 ${r.name || "Sacensības"}`, description: desc, now }));
  }
  for (const d of restDays || []) {
    events.push(allDayEvent({ uid: `rest-${d}@tksportisti`, date: d, summary: "🌴 Brīvdiena", description: "", now }));
  }
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Toma Komasa Sportistu Portals//LV",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Mans treniņu plāns",
    "X-WR-TIMEZONE:Europe/Riga",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
// <<< ICS BUILDER

// ---------------------------------------------------------------------------

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

async function tokenFor(athleteId) {
  const secret = Deno.env.get("CAL_SECRET");
  if (!secret) throw new Error("CAL_SECRET nav iestatīts");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(athleteId));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Compares without stopping at the first difference.
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const isoDate = (d) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  try {
    // ---- the athlete (or coach) asks for a personal link --------------------
    if (req.method === "POST") {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Nav autentificēts" }, 401);
      const { data: { user }, error: authError } = await supabase.auth.getUser(
        authHeader.replace("Bearer ", ""),
      );
      if (authError || !user) return json({ error: "Nav autentificēts" }, 401);

      const { data: profile } = await supabase
        .from("profiles").select("role").eq("id", user.id).single();

      let athleteId = user.id;
      if (profile?.role === "coach") {
        const body = await req.json().catch(() => ({}));
        if (!body.athleteId) return json({ error: "athleteId obligāts" }, 400);
        athleteId = body.athleteId;
      } else if (profile?.role !== "athlete") {
        return json({ error: "Nav tiesību" }, 403);
      }

      const t = await tokenFor(athleteId);
      const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/calendar-feed?a=${athleteId}&t=${t}`;
      return json({ url });
    }

    // ---- the calendar app fetches the feed ----------------------------------
    if (req.method === "GET" || req.method === "HEAD") {
      const params = new URL(req.url).searchParams;
      const athleteId = params.get("a") || "";
      const token = params.get("t") || "";
      // One generic answer for every kind of mismatch: nothing to learn from it.
      const notFound = () => new Response("Not found", { status: 404, headers: CORS });
      if (!/^[0-9a-f-]{36}$/i.test(athleteId) || !token) return notFound();
      if (!sameText(token, await tokenFor(athleteId))) return notFound();

      const today = new Date();
      const from = isoDate(new Date(today.getTime() - DAYS_BACK * 86400000));
      const to = isoDate(new Date(today.getTime() + DAYS_AHEAD * 86400000));

      const [plansRes, racesRes, notesRes] = await Promise.all([
        supabase.from("plans").select("*").eq("athlete_id", athleteId).gte("date", from).lte("date", to).order("date"),
        supabase.from("races").select("*").eq("athlete_id", athleteId).gte("date", from).lte("date", to).order("date"),
        supabase.from("day_notes").select("date, is_rest_day").eq("athlete_id", athleteId).eq("is_rest_day", true).gte("date", from).lte("date", to),
      ]);

      const now = today.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
      const ics = buildCalendar({
        plans: plansRes.data || [],
        races: racesRes.data || [],
        restDays: (notesRes.data || []).map((n) => n.date),
        now,
      });
      return new Response(req.method === "HEAD" ? null : ics, {
        status: 200,
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Cache-Control": "no-cache",
          ...CORS,
        },
      });
    }

    return new Response("Method not allowed", { status: 405, headers: CORS });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Nezināma kļūda" }, 500);
  }
});
