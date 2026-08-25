---
name: run-tk-sportistu-portals
description: Build, run, and drive tk-sportistu-portals (Toma Komasa Sportistu Portāls). Use when asked to start the app, render its calendar/dashboard, take a screenshot of its UI, or verify a change without touching the live Supabase project.
---

Flat static HTML/CSS/JS, no build step, no server, no test runner — talking
directly to a live Supabase project from the browser (see `auth.js`). Drive
it via `.claude/skills/run-tk-sportistu-portals/driver.mjs`: it stages a
throwaway copy with Supabase stubbed out, injects a probe script that pokes
the UI, and renders it in headless Chromium. All paths below are relative to
the repo root.

## Prerequisites

- A Chromium binary (`chromium-browser`, `chromium`, or `google-chrome`) —
  already present on this container. If missing on a clean machine:
  `sudo apt-get install -y chromium`.
- Node.js — already present, used to run the driver itself.

Nothing else. No `npm install` (there's no `package.json`), no build.

## Setup / Build

None — there is no separate build step. `index.html` loads `db.js`,
`auth.js`, `panels/*.js`, `date-picker.js`, then `app.js` as plain
`<script>` tags (see CLAUDE.md's "Architecture" section for the exact load
order, which the driver mirrors when it stages files).

## Run (agent path)

```bash
node .claude/skills/run-tk-sportistu-portals/driver.mjs
```

This stages a copy of the app under `~/.cache/tksp-run-<timestamp>/`,
replaces the Supabase CDN `<script>` tag with an inline stub (every table
query resolves to `{ data: [], error: null }` — nothing ever reaches the
live project), injects a default probe that logs in as a coach with one
athlete ("Testa Sportists") and renders the full dashboard + week calendar,
then runs Chromium headless twice (once for `--dump-dom`, once for
`--screenshot=`). It prints a JSON summary to stdout:

```json
{
  "stage": "/home/you/.cache/tksp-run-1787628669359",
  "domDump": ".../dom.html",
  "screenshot": ".../screenshot.png",
  "probeOut": { "appViewVisible": true, "calendarDayColumns": 7, "athleteDropdownText": "Testa Sportists" },
  "cleanup": "rm -rf .../tksp-run-1787628669359"
}
```

Read `screenshot` with the Read tool to see it; `domDump` is plain HTML you
can grep or Read. Run the printed `cleanup` command when done — the driver
does not delete the staged copy itself, so you can inspect it first.

**Driving a specific scenario instead of the default:** write your own probe
script (same shape as `DEFAULT_PROBE` inside `driver.mjs` — set the globals
the feature needs, call the real `render*()` function, append a
`<pre id="probeOut">` with whatever you want to assert) and pass it in:

```bash
node .claude/skills/run-tk-sportistu-portals/driver.mjs --probe /path/to/my-probe.js
```

`--out <dir>` stages into a specific directory instead of a fresh
timestamped one under `~/.cache`.

## Run (human path)

```bash
xdg-open index.html
```

Opens the real app in a real browser against the **live** Supabase project
(no stub) — this is the actual deployed behaviour, not a dev server. Shows
the real login screen. A test account ("Testa Sportists") exists for safe
write-testing; use it rather than a real athlete's account. This path
doesn't produce a screenshot on its own — that's what the driver is for.

## Test

There is no test suite. The closest equivalent, and the one thing worth
running after any JS edit:

```bash
node --check app.js
node --check db.js
node --check panels/restrictions.js   # etc., one per touched file
```

Confirms the file parses; catches nothing about actual behaviour — that's
what the driver's screenshot is for.

---

## Gotchas

- **Chromium's snap build can't see `/tmp` or the agent's scratchpad
  directory.** `--screenshot=/tmp/foo.png` reports "N bytes written" and
  then `ls`/Read can't find the file — it was written somewhere the snap
  sandbox considers valid, not the literal path. Always stage and write
  output under `~/.cache/` (or elsewhere under `$HOME`), never `/tmp`. The
  driver does this by default; don't override `--out` to a `/tmp` path.
- **`--dump-dom` and `--screenshot=` don't reliably combine in one
  invocation** — the driver runs Chromium twice, once per flag. Verified:
  combining them was flaky in earlier ad-hoc testing this session; two
  separate calls are not.
- **A literal backtick inside the probe script breaks `driver.mjs` itself**,
  since `DEFAULT_PROBE` is a JS template literal containing the injected
  HTML/JS as text. Hit this firsthand editing the default probe (a comment
  with `` `hidden` `` in it silently truncated the string and threw a
  `SyntaxError` from a completely unrelated line). If you edit
  `DEFAULT_PROBE` or write a custom `--probe` file, keep backticks out of
  it, or switch that section to a non-template-literal string.
- **`render()` deselects the athlete.** For a coach role, `render()` →
  `renderAthleteDropdown()` sets `athleteSelect.selectedIndex = -1` when
  nothing is explicitly picked (CLAUDE.md: "Sidebar panels are locked until
  a coach picks an athlete"). A probe that wants a populated dashboard must
  call `render()` once, then set `athleteSelect.value` and call
  `renderAthleteDropdown()` + `renderCalendar()` again — see
  `DEFAULT_PROBE` in `driver.mjs` for the working sequence.
- **The visible athlete name isn't in the `<select>`.** `#athleteSelect` is
  a real but `hidden` element whose `<option>`s carry a `value` and no text
  (`app.js` builds them as `<option value="${a.id}"></option>`). The actual
  displayed name/list is a custom panel (`#dropdownSelected .athlete-name`,
  and `.athlete-row` for the dropdown list). A probe checking "did the
  athlete's name render" must query `#dropdownSelected`, not
  `athleteSelect.selectedOptions`.
- **Never point this at the live project without the stub.** `auth.js`
  hardcodes the Supabase project URL and anon key with no local/mock
  backend — an unstubbed automated run reads real data, and a probe that
  submits a form would write real data. The driver's stub replaces the
  Supabase `<script>` tag specifically so nothing automated ever reaches
  production; only the human path (above) should touch the live project.

## Troubleshooting

- **`Error: No chromium binary found`**: none of `chromium-browser`,
  `chromium`, `google-chrome`, `google-chrome-stable` resolved via `which`.
  Install one, e.g. `sudo apt-get install -y chromium`.
- **`probeOut` is `null` in the driver's summary, no `ERROR` key either**:
  the injected `<script>` had a syntax error and never ran at all (so even
  the driver's own try/catch, which is *inside* that script, never
  executed) — nothing appends `<pre id="probeOut">` to the dumped DOM. Open
  `domDump` and check for the raw script tag; a stray backtick (see Gotchas)
  is the usual cause.
- **`probeOut.ERROR` is set**: your probe threw after the script started
  running — the stack trace is right there in the JSON. Common cause: a
  global the render function needs (e.g. `currentProfile`, `athletes`,
  `restrictions`) wasn't set before calling it — see CLAUDE.md's own
  headless-browser section for the full list a given `render*()` typically
  needs.
