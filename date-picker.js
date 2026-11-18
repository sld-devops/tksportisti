// Monday-first, Latvian date picker for every date field in the app.
//
// Why this exists: <input type="date"> draws its own calendar, and both the
// first day of the week and the "08/02/2026" number format come from the
// *browser's* language — not from the page. lang="lv" on the input changes
// nothing (measured in a headless browser: plain, lang="lv" and lang="en-GB"
// all render "08/02/2026"). So a Latvian coach on an English browser got a
// Sunday-first calendar and an American date, and the only way to change that
// is for the field to draw its own.
//
// The original input stays in the DOM as the value holder and keeps ISO
// "YYYY-MM-DD" in .value, so every existing read and write — `raceDate.value =
// r.date`, `document.getElementById("stDate").value`, `.disabled = ...` —
// keeps working untouched. A read-only box beside it shows the same date the
// Latvian way and opens the calendar.

const DP_MONTHS = [
  "Janvāris", "Februāris", "Marts", "Aprīlis", "Maijs", "Jūnijs",
  "Jūlijs", "Augusts", "Septembris", "Oktobris", "Novembris", "Decembris",
];
const DP_DAY_NAMES = ["Pr", "Ot", "Tr", "Ce", "Pk", "Se", "Sv"];

// Local date, never toISOString() — that shifts to UTC and can land on the
// previous day for anyone east of Greenwich.
function dpToIso(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dpFormat(iso) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  if (!parts) return "";
  return `${Number(parts[3])}.${Number(parts[2])}.${parts[1]}.`;
}

let dpOpenPopup = null;

function closeDatePicker() {
  if (!dpOpenPopup) return;
  document.querySelectorAll(".dp-overflow-open").forEach((el) => {
    el.classList.remove("dp-overflow-open");
  });
  dpOpenPopup._dpCleanup?.();
  dpOpenPopup.remove();
  dpOpenPopup = null;
}

document.addEventListener("click", (e) => {
  if (dpOpenPopup && !e.target.closest(".dp-wrap")) closeDatePicker();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeDatePicker();
});

function dpRenderMonth(popup, input, display, year, month) {
  const todayIso = dpToIso(new Date());
  const selected = input.value;

  // Monday first: getDay() gives 0 for Sunday, so Sunday becomes the 7th day.
  let startDow = new Date(year, month, 1).getDay();
  startDow = startDow === 0 ? 6 : startDow - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let html = `<div class="dp-header">
    <button class="dp-nav" type="button" data-dp-step="-1">←</button>
    <span class="dp-month">${DP_MONTHS[month]} ${year}</span>
    <button class="dp-nav" type="button" data-dp-step="1">→</button>
  </div><div class="dp-grid">`;
  for (const dn of DP_DAY_NAMES) html += `<div class="dp-dayname">${dn}</div>`;
  for (let i = 0; i < startDow; i++) html += '<div class="dp-day empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = dpToIso(new Date(year, month, d));
    let cls = "dp-day";
    if (iso === todayIso) cls += " today";
    if (iso === selected) cls += " selected";
    html += `<div class="${cls}" data-dp-date="${iso}">${d}</div>`;
  }
  html += `</div><div class="dp-actions">
    <button class="dp-action" type="button" data-dp-today="1">Šodien</button>
    <button class="dp-action" type="button" data-dp-clear="1">Notīrīt</button>
  </div>`;
  popup.innerHTML = html;

  popup.querySelectorAll("[data-dp-step]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = Number(btn.dataset.dpStep);
      const next = new Date(year, month + step, 1);
      dpRenderMonth(popup, input, display, next.getFullYear(), next.getMonth());
    });
  });
  popup.querySelectorAll("[data-dp-date]").forEach((cell) => {
    cell.addEventListener("click", () => dpPick(input, cell.dataset.dpDate));
  });
  popup.querySelector("[data-dp-today]").addEventListener("click", () => {
    dpPick(input, todayIso);
  });
  popup.querySelector("[data-dp-clear]").addEventListener("click", () => {
    dpPick(input, "");
  });
}

function dpPick(input, iso) {
  input.value = iso;
  // Anything listening to the old date field still hears about the change.
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  closeDatePicker();
}

function openDatePicker(input, display) {
  closeDatePicker();
  const popup = document.createElement("div");
  popup.className = "dp-popup";
  // Every one of these fields sits inside a <label>, and clicking a plain <div>
  // inside a label makes the browser forward a second, synthetic click to the
  // label's control - which is this field, so picking a day closed the calendar
  // and immediately reopened it. Cancelling the click's default action stops
  // that forwarding; the popup's own buttons are type="button" and unaffected.
  //
  // The click also stops here rather than carrying on to the document-level
  // "clicked outside, close it" listener above. The ← / → buttons replace the
  // popup's whole contents, so by the time the click reached that listener the
  // button that was pressed no longer existed - closest(".dp-wrap") found
  // nothing, the click read as one from outside the calendar, and switching
  // month closed the calendar instead of changing it.
  popup.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  // Appended beside the field rather than to <body>: half of these fields live
  // inside a <dialog>, and a body-level popup would be painted underneath it.
  display.parentElement.appendChild(popup);
  dpOpenPopup = popup;
  // A sidebar panel body is overflow:hidden for its collapse animation, which
  // cut the last week and the buttons off the bottom of the calendar. An open
  // panel does not need the clipping, and it does not scroll, so nothing moves.
  // The panel itself is `position: relative; z-index: 1`, i.e. its own stacking
  // context, so it also has to be lifted or the next panel paints over the part
  // of the calendar that now hangs outside it.
  popup.closest(".panel-body")?.classList.add("dp-overflow-open");
  popup.closest(".panel")?.classList.add("dp-overflow-open");

  // In a dialog the form scrolls (overflow-y: auto), and a calendar hanging below
  // the last field only made it scroll instead of making the dialog taller. While
  // it is open the form gets exactly as much bottom padding as the calendar
  // sticks out below its last child, so the dialog grows (up to its maximum).
  const dlgForm = popup.closest("dialog form");
  if (dlgForm) {
    const adjust = () => {
      const last = dlgForm.lastElementChild;
      if (!last || popup.classList.contains("dp-up")) return;
      const zoom = typeof uiZoom === "function" ? uiZoom() : 1;
      const need = (popup.getBoundingClientRect().bottom - last.getBoundingClientRect().bottom + 16) / zoom;
      dlgForm.style.paddingBottom = Math.max(8, Math.ceil(need)) + "px";
      // Even the tallest dialog cannot hold it (a short screen): open the calendar
      // upwards, over the fields above, instead of making the form scroll.
      if (dlgForm.scrollHeight > dlgForm.clientHeight + 1) {
        popup.classList.add("dp-up");
        dlgForm.style.paddingBottom = "";
      }
    };
    const ro = new ResizeObserver(adjust);
    ro.observe(popup);
    popup._dpCleanup = () => { ro.disconnect(); dlgForm.style.paddingBottom = ""; };
    popup._dpAdjust = adjust;
  }

  const start = /^(\d{4})-(\d{2})-/.exec(input.value);
  const base = start ? new Date(Number(start[1]), Number(start[2]) - 1, 1) : new Date();
  dpRenderMonth(popup, input, display, base.getFullYear(), base.getMonth());
  popup._dpAdjust?.();
}

function attachDatePicker(input) {
  if (!input || input.dataset.dpReady === "1") return;
  input.dataset.dpReady = "1";

  const wrap = document.createElement("span");
  wrap.className = "dp-wrap";
  const display = document.createElement("input");
  display.type = "text";
  display.readOnly = true;
  display.className = "dp-display";
  display.placeholder = "Izvēlies datumu";

  input.after(wrap);
  wrap.appendChild(display);
  input.type = "hidden";

  // .value and .disabled keep meaning exactly what they meant on the date
  // input, so no caller has to know the field was replaced. Without this,
  // `stDate.value = existing.date` would set a value nobody could see, and a
  // disabled field would still open its calendar.
  let iso = input.getAttribute("value") || "";
  let disabled = input.hasAttribute("disabled");
  Object.defineProperty(input, "value", {
    configurable: true,
    get: () => iso,
    set(v) {
      iso = v || "";
      display.value = dpFormat(iso);
    },
  });
  Object.defineProperty(input, "disabled", {
    configurable: true,
    get: () => disabled,
    set(v) {
      disabled = !!v;
      display.disabled = disabled;
    },
  });
  input.value = iso;
  input.disabled = disabled;

  display.addEventListener("click", () => {
    if (disabled) return;
    if (dpOpenPopup && wrap.contains(dpOpenPopup)) closeDatePicker();
    else openDatePicker(input, display);
  });
}

// One hook for the whole app instead of a call in every panel: the panels build
// their forms as HTML strings at render time, so the fields appear and vanish
// constantly. Only newly added nodes are scanned, so a calendar re-render costs
// next to nothing.
function attachAllDatePickers(root) {
  (root || document).querySelectorAll('input[type="date"]').forEach(attachDatePicker);
}

attachAllDatePickers(document);
new MutationObserver((records) => {
  records.forEach((rec) => {
    rec.addedNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      if (node.matches?.('input[type="date"]')) attachDatePicker(node);
      node.querySelectorAll?.('input[type="date"]').forEach(attachDatePicker);
    });
  });
}).observe(document.documentElement, { childList: true, subtree: true });
