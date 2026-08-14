// "Paveiktā statistika" panelis - četri roku darinātie SVG grafiki (nav
// nekādas grafiku bibliotēkas, skat. CLAUDE.md "one small multiple per
// metric"). Fails ir matemātiskāks par citiem paneļiem (koordinātu
// rēķināšana, izliektas līnijas), bet katrai daļai jau ir plaši "kāpēc"
// komentāri no iepriekšējā darba - šeit galvenokārt trūkstošie JS sintakses
// skaidrojumi tur, kur tie vēl nav bijuši.

// #region Stāvoklis un metriku definīcijas
let statsPeriod = "week";
let trendWeeks = 8;
let trendMonths = 8;
let weeklyTrend = [];
let monthlyTrend = [];
let statsTableOpen = false;

const statsBar = document.getElementById("statsBar");

// One small chart per metric, stacked and sharing the x positions. They are NOT
// drawn on one pair of axes on purpose: run_km is kilometres and the other three
// are hours, so a shared scale would flatten the hour lines against zero, and
// four independently-scaled lines on one plot invent crossings that mean nothing.
const CHART_W = 1000;
// Each facet carries its own date band at the bottom, so the months are
// readable next to every chart instead of only under the last one.
const FACET_H = 132;
const PAD = { top: 20, right: 22, bottom: 26, left: 22 };

// color = validated categorical slot, assigned in fixed order and never
// recycled; the hue is set once on the facet as --series and inherited.
const STATS_METRICS = [
  // short = the table heading. The full label is far too wide for a phone-width
  // table; the unit moves to a caption under it rather than into every heading.
  { key: "run_km", label: "Kilometrāža", short: "Kilometrāža", unit: "km", color: "chart-series-1" },
  { key: "run_min", label: "Laiks", short: "Laiks", unit: "h", color: "chart-series-2" },
  { key: "vfs_sfs_min", label: "VFS/SFS", short: "VFS/SFS", unit: "h", color: "chart-series-3" },
  { key: "velo_min", label: "Velo", short: "Velo", unit: "h", color: "chart-series-4" },
];

// #endregion

// #region Palīgfunkcijas: koordinātas, datumu formāti, izliektā līnija
function statsData() {
  return statsPeriod === "week" ? weeklyTrend : monthlyTrend;
}

function statsPointX(i, count) {
  const plotW = CHART_W - PAD.left - PAD.right;
  if (count === 1) return PAD.left + plotW / 2;
  return PAD.left + (i / (count - 1)) * plotW;
}

// "Jūlijs 2026" rather than "2026. gada 7. mēnesis" - the month is named, the
// way the coach would say it. Intl gives it lowercase in Latvian.
function statsMonthName(monthStart, style) {
  const parts = (monthStart || "").split("-");
  if (parts.length < 2) return "";
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, 1);
  const name = new Intl.DateTimeFormat("lv-LV", { month: style }).format(d);
  return `${capitalize(name)} ${parts[0]}`;
}

function statsFullDateLabel(d) {
  if (statsPeriod === "week") {
    const parts = (d.week_start || "").split("-");
    if (parts.length !== 3) return "";
    const start = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    const end = addDays(start, 6);
    const p2 = (n) => String(n).padStart(2, "0");
    return `${p2(start.getDate())}.${p2(start.getMonth() + 1)}.–${p2(end.getDate())}.${p2(end.getMonth() + 1)}.`;
  }
  return statsMonthName(d.month_start, "long");
}

// The full week label is far too wide to repeat under every point, so the axis
// only carries the start of the week, and months only the short name. The year
// rides a second line (see buildAxisLabels) rather than stealing width here -
// "Janv. 2026" next to "Febr." collided at twelve months across.
function statsAxisDateLabel(d) {
  if (statsPeriod === "week") {
    const parts = (d.week_start || "").split("-");
    return parts.length === 3 ? `${parts[2]}.${parts[1]}.` : "";
  }
  return statsMonthName(d.month_start, "short").replace(/\s+\d{4}$/, "");
}

// The first column is the widest cell in the table; the heading already says
// "Nedēļa", so the week's start date alone carries it.
function statsTableDateLabel(d) {
  if (statsPeriod === "week") {
    const parts = (d.week_start || "").split("-");
    return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0].slice(2)}.` : "";
  }
  return statsMonthName(d.month_start, "long");
}

// A middle-anchored label on the first or last point hangs half its width past
// the edge of the plot - and past the edge of the card. The ends anchor inwards.
function edgeAnchor(i, count) {
  if (i === 0) return "start";
  if (i === count - 1) return "end";
  return "middle";
}

function statsValueText(metric, val) {
  return `${val.toFixed(1)} ${metric.unit}`;
}

// Catmull-Rom through every point, converted to cubic beziers - that is what
// makes the line curve through the data instead of kinking at each point. The
// control points are clamped to the plot rectangle, or a steep week-to-week
// step bows the curve out through the top or bottom edge.
function smoothLinePath(points, minY, maxY) {
  if (!points.length) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const clamp = (v) => Math.max(minY, Math.min(maxY, v));
  const TENSION = 0.85;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || points[i + 1];
    const c1x = p1.x + ((p2.x - p0.x) / 6) * TENSION;
    const c1y = clamp(p1.y + ((p2.y - p0.y) / 6) * TENSION);
    const c2x = p2.x - ((p3.x - p1.x) / 6) * TENSION;
    const c2y = clamp(p2.y - ((p3.y - p1.y) / 6) * TENSION);
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// #endregion

// #region Viena grafika (facet) un tā ass zīmēšana
function buildFacetHtml(metric, data, withYear) {
  const plotTop = PAD.top;
  const plotBottom = FACET_H - PAD.bottom;
  const plotH = plotBottom - plotTop;
  const plotRight = CHART_W - PAD.right;
  // `Math.max(...masīvs, 0)` - spread `...` "izklāj" masīva vērtības kā
  // atsevišķus argumentus (Math.max negrib pašu masīvu, tam vajag skaitļus
  // vienu pēc otra), un `, 0` klāt garantē, ka rezultāts nekad nav negatīvs
  // pat tad, ja masīvs būtu tukšs.
  const max = Math.max(...data.map((d) => d[metric.key] || 0), 0);
  // An all-zero metric would draw a flat line along the baseline and say
  // nothing; the facet keeps its heading so the reader still sees it exists.
  const empty = max <= 0;
  const scaleMax = empty ? 1 : max;
  const yAt = (val) => plotBottom - (val / scaleMax) * plotH;

  const points = data.map((d, i) => ({
    x: statsPointX(i, data.length),
    y: yAt(d[metric.key] || 0),
  }));
  const linePath = smoothLinePath(points, plotTop, plotBottom);
  const areaPath = points.length > 1
    ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${plotBottom} L ${points[0].x.toFixed(1)} ${plotBottom} Z`
    : "";

  // Horizontal hairlines for reading height, plus one vertical hairline per
  // period so it is obvious at a glance which point belongs to which month.
  const grid = [plotTop, plotTop + plotH / 2, plotBottom]
    .map((y) => `<line class="chart-grid-line" x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${plotRight}" y2="${y.toFixed(1)}" />`)
    .join("")
    + data.map((_, i) => {
      const x = statsPointX(i, data.length).toFixed(1);
      return `<line class="chart-grid-line chart-grid-tick" x1="${x}" y1="${plotTop}" x2="${x}" y2="${plotBottom}" />`;
    }).join("");

  const dots = empty ? "" : points.map((p) => `
    <circle class="chart-dot" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" />
  `).join("");

  // Every point carries its own figure, so the reader never has to hover. Zero
  // weeks are left blank on purpose: the point already sits on the baseline,
  // and a row of "0.0" over every untrained week is noise, not information.
  // The label is clamped to the plot so a value at the very top or at either
  // end cannot be drawn outside the box.
  const valueLabels = empty ? "" : points.map((p, i) => {
    const val = data[i][metric.key] || 0;
    if (val <= 0) return "";
    const y = Math.max(11, p.y - 11);
    const x = Math.min(CHART_W - PAD.right, Math.max(PAD.left, p.x));
    return `<text class="chart-point-label" text-anchor="${edgeAnchor(i, points.length)}" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${escapeHtml(val.toFixed(1))}</text>`;
  }).join("");

  return `
    <div class="chart-facet ${metric.color}" data-facet="${metric.key}">
      <div class="chart-facet-head">
        <span class="chart-facet-key"></span>
        <span class="chart-facet-title">${escapeHtml(metric.label)}</span>
      </div>
      <svg class="${data.length > 8 ? "is-dense" : ""}" viewBox="0 0 ${CHART_W} ${FACET_H}" role="img"
           aria-label="${escapeHtml(metric.label)} — tendence">
        ${grid}
        ${empty ? "" : `<path class="chart-area" d="${areaPath}" />`}
        ${empty ? "" : `<path class="chart-line" d="${linePath}" />`}
        ${dots}
        ${empty ? "" : `<circle class="chart-cursor-dot" cx="-99" cy="-99" r="6" />`}
        ${valueLabels}
        ${empty ? `<text class="chart-empty-note" x="${PAD.left + 8}" y="${plotTop + plotH / 2 + 5}">nav datu</text>` : ""}
        ${buildAxisLabels(data, plotBottom, withYear)}
      </svg>
    </div>
  `;
}

// The date band that sits under every facet. Every period is labelled - the
// owner wants to see at a glance which point is which month, so nothing is
// thinned out; past eight the type steps down, which is what keeps twelve
// labels from touching. The year rides a second line under the first period
// and wherever it rolls over, so it never competes for width with the month
// beside it, and only under the bottom facet - all four share the same x
// positions, so repeating the year four times is just clutter.
function buildAxisLabels(data, plotBottom, withYear) {
  let lastYear = "";
  return data
    .map((d, i) => {
      const x = statsPointX(i, data.length).toFixed(1);
      const anchor = edgeAnchor(i, data.length);
      const year = (d.month_start || d.week_start || "").slice(0, 4);
      const showYear = year !== lastYear;
      lastYear = year;
      return `<text class="chart-axis-label" text-anchor="${anchor}" x="${x}" y="${plotBottom + 13}">${escapeHtml(statsAxisDateLabel(d))}</text>`
        + (withYear && showYear ? `<text class="chart-axis-year" text-anchor="${anchor}" x="${x}" y="${plotBottom + 23}">${escapeHtml(year)}</text>` : "");
    })
    .join("");
}

// #endregion

// #region Tabulas skats un perioda/diapazona pogas
// Tooltips must never be the only way to read a value, so every figure is also
// available as a plain table.
function buildStatsTableHtml(data) {
  const head = STATS_METRICS.map((m) => `<th scope="col">${escapeHtml(m.short)}</th>`).join("");
  // .slice() bez argumentiem uzkopē masīvu (jauns masīvs, tas pats saturs),
  // lai .reverse() (kas maina masīvu VIETĀ, nevis atgriež jaunu) neapgrieztu
  // otrādi arī pašu `data` - kas sabojātu grafiku, jo tas paļaujas uz
  // hronoloģisko secību.
  const rows = data.slice().reverse().map((d) => `
    <tr>
      <th scope="row">${escapeHtml(statsTableDateLabel(d))}</th>
      ${STATS_METRICS.map((m) => `<td>${(d[m.key] || 0).toFixed(1)}</td>`).join("")}
    </tr>
  `).join("");
  // The wrapper is the safety net: the headings are short enough that the table
  // normally fits, but a narrow phone can still be pushed sideways instead of
  // silently clipping the last column.
  return `
    <div class="chart-table-wrap">
      <table class="chart-table">
        <thead><tr><th scope="col">${statsPeriod === "week" ? "Nedēļa" : "Mēnesis"}</th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <p class="chart-table-note">Kilometrāža — kilometros. Laiks, VFS/SFS un Velo — stundās.</p>
  `;
}

function buildStatsRangeHtml() {
  const isWeek = statsPeriod === "week";
  const ranges = isWeek
    ? [{ val: 4, label: "4 nedēļas" }, { val: 8, label: "8 nedēļas" }, { val: 12, label: "12 nedēļas" }]
    : [{ val: 4, label: "4 mēneši" }, { val: 8, label: "8 mēneši" }, { val: 12, label: "12 mēneši" }];
  const currentRange = isWeek ? trendWeeks : trendMonths;
  return `
    <div class="stats-range">
      ${ranges.map((r) => `
        <button class="${r.val === currentRange ? "active" : ""}" data-stat-range="${r.val}" type="button">${r.label}</button>
      `).join("")}
    </div>
  `;
}

function renderStats() {
  const data = statsData();

  const tabsHtml = `
    <div class="stats-tabs">
      <button class="${statsPeriod === "week" ? "active" : ""}" data-stat-period="week">Nedēļa</button>
      <button class="${statsPeriod === "month" ? "active" : ""}" data-stat-period="month">Mēnesis</button>
    </div>
  `;

  if (!data || !data.length) {
    statsBar.innerHTML = tabsHtml + '<p class="muted" style="padding:12px 18px">Nav datu</p>';
    attachStatsTabHandlers();
    return;
  }

  statsBar.innerHTML = `
    <div class="stats-chart">
      ${tabsHtml}
      ${buildStatsRangeHtml()}
      <div class="chart-facets" id="chartFacets" tabindex="0"
           role="group" aria-label="Paveiktās slodzes tendence pa rādītājiem">
        ${STATS_METRICS.map((m, i) => buildFacetHtml(m, data, i === STATS_METRICS.length - 1)).join("")}
        <div class="chart-crosshair" hidden></div>
        <div class="chart-tooltip" hidden role="status"></div>
      </div>
      <div class="chart-table-actions">
        <button class="secondary-action" type="button" data-stats-table>${statsTableOpen ? "Paslēpt tabulu" : "Rādīt tabulu"}</button>
      </div>
      ${statsTableOpen ? buildStatsTableHtml(data) : ""}
    </div>
  `;

  attachStatsTabHandlers();
  attachStatsRangeHandlers();
  attachStatsTableToggle();
  attachStatsHover(data);
}

// #endregion

// #region Peles/pieskāriena kursors un padoms (tooltip)
// One crosshair and one tooltip across all four facets: splitting the metrics
// apart gave each an honest scale, and this gives back the "what did every
// metric do that week" reading that a single combined plot had.
//
// `show`/`hide`/`geometry`/`indexFromEvent` zemāk ir funkcijas TAJĀ IEKŠĀ šīs
// funkcijas ("closures") - tās var lasīt un mainīt `activeIndex` un pārējos
// mainīgos, kas deklarēti augšpusē (`wrap`, `crosshair`, u.c.), pat pēc tam,
// kad tās izsauc kāds notikums (peles kustība). Tas ir veids, kā šai vienai
// izsaukšanas reizei (attachStatsHover(data)) "iekonservēt" savu privāto
// stāvokli, ko nekas ārpusē nevar aiztikt.
function attachStatsHover(data) {
  const wrap = document.getElementById("chartFacets");
  if (!wrap) return;
  const crosshair = wrap.querySelector(".chart-crosshair");
  const tooltip = wrap.querySelector(".chart-tooltip");
  const facets = [...wrap.querySelectorAll(".chart-facet")];
  const cursorDots = facets.map((f) => f.querySelector(".chart-cursor-dot"));
  let activeIndex = -1;

  function geometry() {
    const svg = facets[0]?.querySelector("svg");
    if (!svg) return null;
    const svgRect = svg.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    if (!svgRect.width) return null;
    return {
      scale: svgRect.width / CHART_W,
      offsetX: svgRect.left - wrapRect.left,
      wrapRect,
    };
  }

  function show(index) {
    const g = geometry();
    if (!g || index < 0 || index >= data.length) return;
    activeIndex = index;
    const d = data[index];
    const xPx = g.offsetX + statsPointX(index, data.length) * g.scale;

    crosshair.hidden = false;
    crosshair.style.left = `${xPx}px`;

    facets.forEach((facet, i) => {
      const dot = cursorDots[i];
      if (!dot) return;
      const metric = STATS_METRICS[i];
      const line = facet.querySelector(".chart-line");
      if (!line) { dot.setAttribute("cx", "-99"); return; }
      const max = Math.max(...data.map((row) => row[metric.key] || 0), 0);
      const plotTop = PAD.top;
      const plotBottom = FACET_H - PAD.bottom;
      const val = d[metric.key] || 0;
      dot.setAttribute("cx", statsPointX(index, data.length).toFixed(1));
      dot.setAttribute("cy", (plotBottom - (val / (max || 1)) * (plotBottom - plotTop)).toFixed(1));
    });

    // Series names are ours, but building the readout node by node keeps the
    // tooltip free of any string-concatenated markup.
    tooltip.textContent = "";
    const head = document.createElement("div");
    head.className = "chart-tooltip-date";
    head.textContent = statsFullDateLabel(d);
    tooltip.appendChild(head);
    STATS_METRICS.forEach((m) => {
      const row = document.createElement("div");
      row.className = "chart-tooltip-row";
      const key = document.createElement("span");
      key.className = `chart-tooltip-key ${m.color}`;
      const val = document.createElement("strong");
      val.textContent = statsValueText(m, d[m.key] || 0);
      const name = document.createElement("span");
      name.className = "chart-tooltip-name";
      name.textContent = m.label;
      row.append(key, val, name);
      tooltip.appendChild(row);
    });
    tooltip.hidden = false;

    const tipW = tooltip.offsetWidth;
    const maxLeft = g.wrapRect.width - tipW - 4;
    tooltip.style.left = `${Math.max(4, Math.min(maxLeft, xPx - tipW / 2))}px`;
  }

  function hide() {
    activeIndex = -1;
    crosshair.hidden = true;
    tooltip.hidden = true;
    cursorDots.forEach((dot) => dot && dot.setAttribute("cx", "-99"));
  }

  // The reader aims at a date, never at a 2px line: the nearest point wins.
  function indexFromEvent(e) {
    const g = geometry();
    if (!g) return -1;
    const x = e.clientX - g.wrapRect.left - g.offsetX;
    const plotW = (CHART_W - PAD.left - PAD.right) * g.scale;
    if (data.length === 1) return 0;
    const rel = (x - PAD.left * g.scale) / plotW;
    return Math.max(0, Math.min(data.length - 1, Math.round(rel * (data.length - 1))));
  }

  wrap.addEventListener("pointermove", (e) => show(indexFromEvent(e)));
  wrap.addEventListener("pointerleave", hide);
  wrap.addEventListener("focus", () => show(data.length - 1));
  wrap.addEventListener("blur", hide);
  wrap.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const from = activeIndex === -1 ? data.length - 1 : activeIndex;
    show(Math.max(0, Math.min(data.length - 1, from + (e.key === "ArrowRight" ? 1 : -1))));
  });
}

// #endregion

// #region Pogu piesaiste (cilnes, diapazons, tabulas poga)
function attachStatsTableToggle() {
  statsBar.querySelector("[data-stats-table]")?.addEventListener("click", () => {
    statsTableOpen = !statsTableOpen;
    renderStats();
  });
}

function attachStatsTabHandlers() {
  statsBar.querySelectorAll("[data-stat-period]").forEach((btn) => {
    btn.addEventListener("click", () => {
      statsPeriod = btn.dataset.statPeriod;
      renderStats();
    });
  });
}

async function attachStatsRangeHandlers() {
  const athleteId = getSelectedAthleteId();
  statsBar.querySelectorAll("[data-stat-range]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const val = parseInt(btn.dataset.statRange);
      if (statsPeriod === "week") {
        trendWeeks = val;
        try {
          weeklyTrend = await getWeeklyTrend(athleteId, trendWeeks);
        } catch (e) {
          weeklyTrend = [];
        }
      } else {
        trendMonths = val;
        try {
          monthlyTrend = await getMonthlyTrend(athleteId, trendMonths);
        } catch (e) {
          monthlyTrend = [];
        }
      }
      renderStats();
    });
  });
}
// #endregion
