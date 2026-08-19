// A dialog with a table - rows are athletes, columns are the last 13 weeks,
// a checkmark shows if the coach has already ticked "Week reviewed" for
// that week (see the #weekBlockTypeSelect checkbox in app.js). This panel
// only READS the weekly_reviews table, to give the coach an at-a-glance
// overview of the whole team - the actual ticking happens one week at a
// time on app.js's calendar side.
let weeklyReviewedSet = new Set();

const weeklyReviewDialog = document.getElementById("weeklyReviewDialog");
const weeklyReviewGridWrap = document.getElementById("weeklyReviewGridWrap");

function weeklyReviewKey(athleteId, weekStart) {
  return `${athleteId}|${weekStart}`;
}

function getWeeklyReviewWeeks() {
  const currentMonday = getMonday(new Date());
  const weeks = [];
  for (let i = 12; i >= 0; i--) {
    weeks.push(formatDateISO(addDays(currentMonday, -7 * i)));
  }
  return weeks;
}

async function openWeeklyReviewDialog() {
  weeklyReviewGridWrap.innerHTML = '<p class="muted">Ielādē...</p>';
  weeklyReviewDialog.showModal();
  try {
    const rows = await getWeeklyReviews();
    weeklyReviewedSet = new Set(rows.map((r) => weeklyReviewKey(r.athlete_id, r.week_start)));
    renderWeeklyReviewGrid();
  } catch (err) {
    console.error(err);
    weeklyReviewGridWrap.innerHTML = '<p class="muted">Neizdevās ielādēt datus (iespējams, datubāzes tabula vēl nav izveidota).</p>';
  }
}

function closeWeeklyReviewDialog() {
  weeklyReviewDialog.close();
}

function renderWeeklyReviewGrid() {
  const weeks = getWeeklyReviewWeeks();
  const header = `
    <tr>
      <th class="weekly-review-name-col">Sportists</th>
      ${weeks.map((w) => `<th>${formatShortDate(w)}</th>`).join("")}
    </tr>
  `;
  const rows = athletes.map((a) => `
    <tr>
      <td class="weekly-review-name-col">${escapeHtml(a.full_name)}</td>
      ${weeks.map((w) => `
        <td>${weeklyReviewedSet.has(weeklyReviewKey(a.id, w)) ? '<input class="weekly-review-check" type="checkbox" checked tabindex="-1" aria-label="Apskatīta" />' : ""}</td>
      `).join("")}
    </tr>
  `).join("");
  weeklyReviewGridWrap.innerHTML = `
    <table class="weekly-review-table">
      <thead>${header}</thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

document.getElementById("openWeeklyReviewBtn")?.addEventListener("click", openWeeklyReviewDialog);
document.getElementById("closeWeeklyReviewBtn")?.addEventListener("click", closeWeeklyReviewDialog);
