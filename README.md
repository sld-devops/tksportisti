# TK Athletes Running Planner

A training planning web application for a coach and their ~20-25 athletes — replaces the Google Sheets the coach previously used for training planning. Goal: make coach-athlete collaboration clearer and faster — the coach can quickly build precise, personalized training plans for each athlete, and athletes can easily track their plans.

Live at `tksportisti.netlify.app`.

## How to work with the code if you want to make changes

This file (`README.md`) gives a quick overview. Detailed, continuously updated technical information about specific features, previously found bugs, and decision history is stored in **`CLAUDE.md`** — it's mainly for Claude Code sessions, but it's useful for anyone who wants to understand why a piece of code is built the way it is. `TODO.md` tracks one specific, long-term task — splitting `app.js` into smaller files.

## Technologies

Deliberately simple, "old-fashioned" approach — no build step, no package manager (npm/webpack), no framework (React/Vue, etc.):

- **Plain HTML/CSS/JavaScript**, loaded via normal `<script>` tags in `index.html` — the browser runs the files exactly as written, with no intermediate processing.
- **Supabase** as the backend: database (Postgres), user authentication, and three small server functions for administrative tasks (see below).
- No test runner — testing happens by opening the app in a browser.

## Running locally

```bash
xdg-open index.html
```

Because the app talks to Supabase directly from the browser (`db.js`/`auth.js`), even a locally opened file works against the **real, live** database — there's no separate test/local version. For testing, use the "Test Athlete" account, not any real athlete's account.

## File structure

```text
index.html          — page "skeleton": both views (login/app), all panels/dialogs
                       already written in HTML, just hidden/shown as needed
auth.js              — login, session, account switching, password change
db.js                — THE ONLY file that talks to Supabase database
date-picker.js       — custom-built calendar widget for date fields
                       (browser's default doesn't show Latvian/start Monday first)
app.js               — calendar drawing, training builder, main app logic
                       (see below)
panels/*.js          — separate isolated functionality (see below)
styles.css           — all styles
images/              — logos and other images
supabase/functions/  — three server functions (create-user, delete-user,
                       reset-password) that require a secret key that must
                       not be exposed in the browser
```

Load order in `index.html`: `auth.js` → `db.js` → `date-picker.js` → all `panels/*.js` → `app.js` (last). Panel files load before `app.js` because `app.js` contains a check for "is anyone logged in", which can immediately call a panel's render function.

### `panels/` — one for each app section

| File | What it does |
| --- | --- |
| `profile.js` | Athlete profile card, links (Garmin/Strava/archive), HR training zones, thresholds, "Pace vs Heart Rate" |
| `stats.js` | "Completed statistics" — weekly/monthly training load graphs |
| `interval-history.js` | "Recent interval and tempo runs" |
| `restrictions.js` | Restrictions (days/times when athlete cannot train) |
| `races.js` | Race calendar, results |
| `records.js` | Personal records |
| `diary.js` | Training diary |
| `health-journal.js` | Health journal |
| `self-tests.js` | Self-tests (flexibility/mobility) |
| `polar-tests.js` | Polar tests (MAS/MAP/VO2max/lactate) |
| `ruffier-test.js` | Ruffier test (heart rate recovery after effort) |
| `lactate-test.js` | Lactate test (step test, LT1/LT2 thresholds) |
| `lab-tests.js` | Laboratory tests (PDF/image uploads) |
| `self-log.js` | Athlete manually logs a completed training that the coach didn't plan |
| `admin.js` | Coach: create new athlete, delete, reset password |
| `weekly-review.js` | Table with all athletes at once — which weeks have been reviewed |

Each panel contains its own state, its own `render*()` function, and its own save/delete logic, but they all share one global view with `app.js` (no modules/imports — all files "see" each other's functions and variables).

### What stays in `app.js`

Everything that isn't split into a panel — mainly the app's "core", which is too tightly coupled to safely separate:

- Calendar (weekly and monthly view) drawing
- Training builder and templates ("Create new training")
- Training completion entry dialogs
- Global state (selected athlete, week, loaded plans, etc.)

`app.js` itself is split into logical sections with collapsible `// #region ...` comments — VSCode shows these as sections that can be collapsed/expanded.

## Key principles

**Two roles: `coach` and `athlete`.** The coach picks an athlete from a dropdown and sees/edits everything; an athlete sees only their own data. Many `render*` functions branch based on role (`isCoach()`).

**Data flows in one direction, with manual refreshing.** No real-time auto-sync. Model: (1) a `db.js` function gets/changes a row in Supabase, (2) the caller updates the corresponding global array (`plans`, `templates`, `restrictions`, ...), (3) the caller calls the corresponding `render*()`, which redraws that page section. If you forget to call `render*()` after a change, what's on screen and what's actually stored will diverge.

**Training description ("details") is structured text, not free prose.** Each training in the database is stored as one long text with lines ("Warmup: 15min; 120-130", "Main: 6x400m (76-78s); through 2min"), where each line has fields in a strict order, separated by `;`. The code that reads and writes this should be thought of as parsing record fields, not editing text — details in CLAUDE.md.

**Two-way editing with a "new entry" badge.** Several sections (HR zones, thresholds, pace/pulse table, lactate tests) can be edited by either coach or athlete. Each stores "who and when last edited" in the database record and shows a red badge to the other side until they've looked — without a new table, because Supabase schema can't be changed without access outside the app.

**Nothing is Supabase realtime — refreshes on switching/reloading.** If two people are viewing at the same time and one saves changes, the other will see them only on the next load (switching athlete/week or page reload).

## Next steps

See `TODO.md` — it tracks how far we've gotten with splitting `app.js` into smaller files — and `CLAUDE.md`, where all the other decision history and known "gotchas" in the code are collected.
