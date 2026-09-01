#!/usr/bin/env node
// Stages a throwaway copy of the app with Supabase stubbed out (so nothing
// ever touches the live project), injects a probe script that drives the
// UI, and renders it in headless Chromium. Produces a screenshot and a DOM
// dump you can Read. See SKILL.md for usage and the probe-script contract.
//
// Usage:
//   node driver.mjs                    # default smoke test (coach dashboard)
//   node driver.mjs --probe my.js      # your own probe script instead
//   node driver.mjs --out /some/dir    # stage into a specific dir
import { execFileSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SKILL_DIR, "../../..");

const args = process.argv.slice(2);
function argVal(flag) {
  const i = args.indexOf(flag);
  return i === -1 ? null : args[i + 1];
}

const stage = argVal("--out") || path.join(
  process.env.HOME, ".cache", `tksp-run-${Date.now()}`
);
const probePath = argVal("--probe");

// ---- 1. Stage a copy of the app -------------------------------------------
// Chromium's snap build can't read paths under the agent's scratchpad
// (/tmp/claude-.../scratchpad), so this always stages under ~/.cache - see
// CLAUDE.md "Verifying in a headless browser".
mkdirSync(stage, { recursive: true });
for (const item of ["index.html", "styles.css", "db.js", "auth.js", "app.js", "panels", "images", "date-picker.js"]) {
  cpSync(path.join(REPO_ROOT, item), path.join(stage, item), { recursive: true });
}

// ---- 2. Stub Supabase so this never touches the live project --------------
const SUPABASE_STUB = `
    <script>
      window.supabase = {
        createClient: () => ({
          auth: {
            getSession: async () => ({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
            signInWithPassword: async () => ({ data: {}, error: null }),
            signOut: async () => ({ error: null }),
            updateUser: async () => ({ data: {}, error: null }),
          },
          from() {
            const builder = {
              select() { return builder; },
              in() { return builder; },
              gte() { return builder; },
              lte() { return builder; },
              eq() { return builder; },
              neq() { return builder; },
              or() { return builder; },
              order() { return builder; },
              insert() { return builder; },
              update() { return builder; },
              upsert() { return builder; },
              delete() { return builder; },
              range() { return builder; },
              single() { return builder; },
              then(resolve) { resolve({ data: [], error: null }); },
            };
            return builder;
          },
        }),
      };
    </script>`;

let html = readFileSync(path.join(stage, "index.html"), "utf8");
html = html.replace(
  /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2"[^>]*><\/script>/,
  SUPABASE_STUB
);

// ---- 3. Inject the probe script --------------------------------------------
const DEFAULT_PROBE = `
    <script defer>
      window.addEventListener("load", () => {
        const out = {};
        try {
          document.getElementById("appView").hidden = false;
          document.getElementById("authView").hidden = true;
          activeRole = "coach";
          currentUser = { id: "coach-1" };
          currentProfile = { id: "coach-1", role: "coach" };
          athletes = [{ id: "ath-1", role: "athlete", full_name: "Testa Sportists" }];
          athleteSelect.innerHTML = '<option value="ath-1">Testa Sportists</option>';
          athleteSelect.value = "ath-1";
          plans = []; races = []; dayNotes = []; logEntries = [];
          healthEntries = []; restrictions = [];
          weekStatuses = { "ath-1": [false, false, false, false] };
          weekBlockTypesByAthlete = { "ath-1": [null, null, null, null] };

          render();
          // render() -> renderAthleteDropdown() resets selectedIndex to -1
          // for a coach with nothing picked yet (CLAUDE.md "The four boxes
          // next to an athlete's name" / sidebar-lock section) - reselect
          // and redraw so the screenshot shows real content instead of the
          // "pick an athlete" empty state. The visible name lives in
          // #dropdownSelected (a custom panel) - the real select element is
          // hidden and its options carry no text, only a value.
          athleteSelect.value = "ath-1";
          renderAthleteDropdown();
          renderCalendar();

          out.appViewVisible = !document.getElementById("appView").hidden;
          out.calendarDayColumns = document.querySelectorAll(".day-column").length;
          out.athleteDropdownText = document.querySelector("#dropdownSelected .athlete-name")?.textContent || null;
        } catch (e) {
          out.ERROR = e.stack;
        }
        const pre = document.createElement("pre");
        pre.id = "probeOut";
        pre.textContent = JSON.stringify(out, null, 2);
        document.body.appendChild(pre);
      });
    </script>`;

const probeScript = probePath ? readFileSync(probePath, "utf8") : DEFAULT_PROBE;
html = html.replace("</body>", `${probeScript}\n  </body>`);
writeFileSync(path.join(stage, "index.html"), html);

// ---- 4. Find a chromium binary ---------------------------------------------
function findChromium() {
  for (const bin of ["chromium-browser", "chromium", "google-chrome", "google-chrome-stable"]) {
    try {
      execFileSync("which", [bin], { stdio: "pipe" });
      return bin;
    } catch { /* try next */ }
  }
  throw new Error("No chromium binary found (tried chromium-browser, chromium, google-chrome).");
}
const chromiumBin = findChromium();

// ---- 5. Render: DOM dump + screenshot --------------------------------------
const url = `file://${path.join(stage, "index.html")}`;
const domDumpPath = path.join(stage, "dom.html");
const screenshotPath = path.join(stage, "screenshot.png");

const domDump = execFileSync(chromiumBin, [
  "--headless", "--no-sandbox", "--disable-gpu",
  "--virtual-time-budget=4000", "--window-size=1400,1600",
  "--dump-dom", url,
], { encoding: "utf8", maxBuffer: 1024 * 1024 * 50 });
writeFileSync(domDumpPath, domDump);

execFileSync(chromiumBin, [
  "--headless", "--no-sandbox", "--disable-gpu",
  "--virtual-time-budget=4000", "--window-size=1400,1600",
  `--screenshot=${screenshotPath}`, url,
], { stdio: "pipe" });

// ---- 6. Report --------------------------------------------------------------
const probeMatch = domDump.match(/<pre id="probeOut">([\s\S]*?)<\/pre>/);
const probeOut = probeMatch ? probeMatch[1].replace(/&quot;/g, '"').replace(/&gt;/g, ">").replace(/&lt;/g, "<") : null;

console.log(JSON.stringify({
  stage,
  domDump: domDumpPath,
  screenshot: screenshotPath,
  probeOut: probeOut ? JSON.parse(probeOut) : null,
  cleanup: `rm -rf ${stage}`,
}, null, 2));
