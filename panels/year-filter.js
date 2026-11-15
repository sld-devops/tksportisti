// One year switch for the whole sidebar and the statistics (2026-11-15), so the
// journal, diary, records, tests, restrictions, races, interval history and the
// weekly/monthly charts each show one season instead of everything piled up.
//
// State is just `selectedYear` (a number, or "all"). Nothing is stored in the
// database: every panel keeps loading all of an athlete's rows, and filters them
// when it draws - so adding or editing never depends on the filter, and the
// "unseen" badges still count every row.
//
// Default: 2026 until 1 February 2027 (the owner's call, may be extended), after
// that the current calendar year.
const YEAR_FIRST = 2026;
const YEAR_DEFAULT_UNTIL = "2027-02-01";

function defaultYear() {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return iso < YEAR_DEFAULT_UNTIL ? 2026 : now.getFullYear();
}

let selectedYear = defaultYear(); // number | "all"

function yearFilterYears() {
  const last = Math.max(new Date().getFullYear(), 2027);
  const years = [];
  for (let y = YEAR_FIRST; y <= last; y++) years.push(y);
  return years;
}

// A row with no usable date cannot be placed in a year, so it stays visible
// rather than silently disappearing.
function inSelectedYear(dateStr) {
  if (selectedYear === "all") return true;
  const y = parseInt(String(dateStr || "").slice(0, 4), 10);
  return Number.isNaN(y) || y === selectedYear;
}

// An entry that spans days (health journal, restrictions) belongs to every year
// it touches; end_date null means a single day (see CLAUDE.md).
function overlapsSelectedYear(startStr, endStr) {
  if (selectedYear === "all") return true;
  const s = parseInt(String(startStr || "").slice(0, 4), 10);
  const e = parseInt(String(endStr || startStr || "").slice(0, 4), 10);
  if (Number.isNaN(s)) return true;
  return s <= selectedYear && selectedYear <= (Number.isNaN(e) ? s : e);
}

function filterByYear(rows, field = "date") {
  return (rows || []).filter((r) => inSelectedYear(r[field]));
}

function filterByYearRange(rows, startField = "start_date", endField = "end_date") {
  return (rows || []).filter((r) => overlapsSelectedYear(r[startField], r[endField]));
}

function renderYearFilter() {
  const box = document.getElementById("yearFilter");
  if (!box) return;
  const btn = (value, label) =>
    `<button type="button" class="year-btn${String(selectedYear) === String(value) ? " active" : ""}" data-year="${value}">${label}</button>`;
  box.innerHTML = `<span class="year-filter-label">Gads</span>${yearFilterYears().map((y) => btn(y, y)).join("")}${btn("all", "Visi")}`;
}

document.getElementById("yearFilter")?.addEventListener("click", async (e) => {
  const b = e.target.closest(".year-btn");
  if (!b) return;
  selectedYear = b.dataset.year === "all" ? "all" : parseInt(b.dataset.year, 10);
  renderYearFilter();
  // Defined in app.js (loaded after this file, called only now).
  await applyYearFilter();
});

renderYearFilter();
