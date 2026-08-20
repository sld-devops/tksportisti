// "Laboratorijas izmeklējumi" (Lab tests) panel - the same list+inline form
// pattern as health-journal.js/ruffier-test.js, but with two "seen"
// tracking Sets instead of one: the coach sees NEW tests,
// the athlete sees when the coach has marked "Izvērtēts" (Evaluated) (two
// different meanings of "new", hence two independent notification counters).
//
// This is the only panel that stores files (PDF/images) in Supabase
// "Storage" (like a cloud folder for files), NOT in a database table -
// `supabase.storage.from("bucket").upload(path, file)` uploads,
// `.createSignedUrl(path, seconds)` creates a temporary download link
// (valid for 60 seconds), `.remove([path])` deletes. The table itself
// (`lab_tests`, db.js) stores only the file's NAME and PATH to it in Storage,
// not the file itself.
let labTests = [];
let editingLabTestId = null;
let seenLabTestIds = new Set();
let seenIzvertetsIds = new Set();

function loadSeenLabTestIds() {
  try {
    const stored = localStorage.getItem("seenLabTestIds");
    if (stored) seenLabTestIds = new Set(JSON.parse(stored));
  } catch (e) {
    seenLabTestIds = new Set();
  }
}

function saveSeenLabTestIds() {
  localStorage.setItem("seenLabTestIds", JSON.stringify([...seenLabTestIds]));
}

function isLabTestSeen(athleteId, testId) {
  return seenLabTestIds.has(`${athleteId}:${testId}`);
}

function markAllLabTestsSeen(athleteId, tests) {
  tests.forEach(t => seenLabTestIds.add(`${athleteId}:${t.id}`));
  saveSeenLabTestIds();
}

function loadSeenIzvertetsIds() {
  try {
    const stored = localStorage.getItem("seenIzvertetsIds");
    if (stored) seenIzvertetsIds = new Set(JSON.parse(stored));
  } catch (e) {
    seenIzvertetsIds = new Set();
  }
}

function saveSeenIzvertetsIds() {
  localStorage.setItem("seenIzvertetsIds", JSON.stringify([...seenIzvertetsIds]));
}

function isIzvertetsSeen(athleteId, testId) {
  return seenIzvertetsIds.has(`${athleteId}:${testId}`);
}

function markAllIzvertetsSeen(athleteId, tests) {
  tests.forEach(t => seenIzvertetsIds.add(`${athleteId}:${t.id}`));
  saveSeenIzvertetsIds();
}

loadSeenLabTestIds();
loadSeenIzvertetsIds();

const LABTEST_TYPE_LABEL = {
  asins_aina: "🧪 Asins aina",
  slodzes_tests: "💉 Slodzes tests",
  cits: "📄 Cits"
};

const LABTEST_TYPE_CLASS = {
  asins_aina: "labtest-type-asins",
  slodzes_tests: "labtest-type-slodzes",
  cits: "labtest-type-cits"
};

function renderLabTests() {
  const body = document.getElementById("labTestsBody");
  if (!body) return;
  const athleteId = getSelectedAthleteId();
  if (!athleteId) return;
  const isAthleteView = (activeRole === "athlete") && currentUser.id === athleteId;
  const isCoachView = activeRole === "coach";

  let html = "";

  if (labTests.length === 0) {
    html += "";
  } else {
    html += `<div class="labtest-list">`;
    labTests.forEach(t => {
      const izvertetsBadge = t.izvertets && isAthleteView
        ? `<span class="labtest-izvertets-badge">Izvērtēts</span>`
        : "";
      const coachCheckbox = isCoachView
        ? `<label class="labtest-izvertets-cb" title="Izvērtēts">
            <input type="checkbox" data-labtest-id="${t.id}" ${t.izvertets ? "checked" : ""} />
          </label>`
        : "";
      html += `<div class="labtest-row${isAthleteView ? " labtest-row-editable" : ""}" data-labtest-id="${t.id}">
        <span class="labtest-actions">
          ${coachCheckbox}
          <a class="labtest-download-btn" href="#" data-labtest-id="${t.id}" title="Lejupielādēt">⬇</a>
        </span>
        <div class="labtest-info">
          <span class="labtest-date">${formatDateLV(t.date)}</span>
          <span class="labtest-type-badge ${LABTEST_TYPE_CLASS[t.type] || ""}">${LABTEST_TYPE_LABEL[t.type] || t.type}</span>
          ${izvertetsBadge}
        </div>
        <span class="labtest-name">${escapeHtml(t.name)}</span>
      </div>`;
    });
    html += `</div>`;
  }

  const editing = editingLabTestId ? labTests.find(t => t.id === editingLabTestId) : null;

  if (isAthleteView) {
    html += `
      <div class="labtest-form">
        <h3 class="labtest-form-title">${editing ? "Rediģēt izmeklējumu" : "Pievienot izmeklējumu"}</h3>
        <div class="field-grid">
          <label>Datums <input id="labTestDate" type="date" value="${editing ? editing.date : formatDateISO(new Date())}" /></label>
          <label>Tips
            <select id="labTestType">
              <option value="asins_aina" ${(!editing || editing.type === "asins_aina") ? "selected" : ""}>Asins aina</option>
              <option value="slodzes_tests" ${editing?.type === "slodzes_tests" ? "selected" : ""}>Slodzes tests</option>
              <option value="cits" ${editing?.type === "cits" ? "selected" : ""}>Cits</option>
            </select>
          </label>
        </div>
        <label>Nosaukums <input id="labTestName" type="text" placeholder="piem. Pilna asins aina 06.2026" value="${editing ? escapeHtml(editing.name) : ""}" /></label>
        <label>Fails${editing ? ` <span class="muted">(atstāj tukšu, lai saglabātu iepriekšējo)</span>` : ""}
          <input id="labTestFile" type="file" accept=".pdf,.jpg,.jpeg,.png" ${!editing ? "required" : ""} />
        </label>
        <div class="labtest-form-actions">
          ${editing ? `<button class="delete-action" id="deleteLabTestBtn" type="button">Dzēst</button>` : ""}
          ${editing ? `<button class="cancel-action panel-add-btn" id="cancelLabTestEditBtn" type="button">Atcelt</button>` : ""}
          <button class="secondary-action panel-add-btn" id="saveLabTestBtn" type="button">${editing ? "Saglabāt" : "Pievienot"}</button>
        </div>
      </div>
    `;
  }

  body.innerHTML = html;

  if (isAthleteView) {
    body.querySelectorAll(".labtest-row-editable").forEach(row => {
      row.addEventListener("click", (e) => {
        if (e.target.closest(".labtest-actions")) return;
        startLabTestEdit(row.dataset.labtestId);
      });
    });
    document.getElementById("saveLabTestBtn")?.addEventListener("click", saveLabTest);
    document.getElementById("cancelLabTestEditBtn")?.addEventListener("click", cancelLabTestEdit);
    document.getElementById("deleteLabTestBtn")?.addEventListener("click", deleteLabTestFile);
  }

  body.querySelectorAll(".labtest-download-btn").forEach(a => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      const t = labTests.find(lt => lt.id === a.dataset.labtestId);
      if (!t) return;
      try {
        const { data, error } = await supabase
          .storage
          .from("lab-test-files")
          .createSignedUrl(t.file_path, 60);
        if (error) throw error;
        if (data?.signedUrl) {
          const link = document.createElement("a");
          link.href = data.signedUrl;
          link.download = t.file_name;
          link.click();
        }
      } catch (e) {
        alert("Neizdevās lejupielādēt: " + (e.message || e));
      }
    });
  });

  body.querySelectorAll(".labtest-izvertets-cb input").forEach(cb => {
    cb.addEventListener("change", async () => {
      const testId = cb.dataset.labtestId;
      const checked = cb.checked;
      try {
        await updateLabTest(testId, { izvertets: checked });
        const t = labTests.find(lt => lt.id === testId);
        if (t) t.izvertets = checked;
      } catch (e) {
        cb.checked = !checked;
        alert("Neizdevās atjaunināt: " + (e.message || e));
      }
    });
  });

  const panel = document.getElementById("labTestsPanel");
  if (panel) {
    const header = panel.querySelector(".panel-header");
    if (isCoachView) {
      const unseen = labTests.filter(t => !isLabTestSeen(athleteId, t.id)).length;
      panel.classList.toggle("has-entries", unseen > 0);
      if (header) {
        header.dataset.count = unseen > 9 ? "9+" : String(unseen);
      }
    } else {
      const unseenIzv = labTests.filter(t => t.izvertets && !isIzvertetsSeen(athleteId, t.id)).length;
      panel.classList.toggle("has-entries", unseenIzv > 0);
      if (header) {
        header.dataset.count = unseenIzv > 9 ? "9+" : String(unseenIzv);
      }
    }
  }
}

function startLabTestEdit(testId) {
  editingLabTestId = testId || null;
  renderLabTests();
  document.querySelector("#labTestsBody .labtest-form")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function cancelLabTestEdit() {
  editingLabTestId = null;
  renderLabTests();
}

async function saveLabTest() {
  const athleteId = getSelectedAthleteId();
  if (!athleteId) return;
  const date = document.getElementById("labTestDate").value;
  const type = document.getElementById("labTestType").value;
  const name = document.getElementById("labTestName").value.trim();
  const fileInput = document.getElementById("labTestFile");

  if (!date || !name) { alert("Aizpildiet datumu un nosaukumu!"); return; }

  if (editingLabTestId) {
    const existing = labTests.find(t => t.id === editingLabTestId);
    if (!existing) return;

    try {
      if (fileInput.files.length > 0) {
        await supabase.storage.from("lab-test-files").remove([existing.file_path]);
        const file = fileInput.files[0];
        const filePath = `${athleteId}/${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("lab-test-files")
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        await updateLabTest(editingLabTestId, {
          date,
          type,
          name,
          file_path: filePath,
          file_name: file.name,
          file_type: file.type,
        });
      } else {
        await updateLabTest(editingLabTestId, { date, type, name });
      }
    } catch (e) {
      alert("Neizdevās atjaunināt: " + (e.message || e));
      return;
    }
  } else {
    if (fileInput.files.length === 0) { alert("Izvēlieties failu!"); return; }
    const file = fileInput.files[0];
    const filePath = `${athleteId}/${Date.now()}-${file.name}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("lab-test-files")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      await insertLabTest({
        athlete_id: athleteId,
        date,
        type,
        name,
        file_path: filePath,
        file_name: file.name,
        file_type: file.type,
      });
    } catch (e) {
      alert("Neizdevās saglabāt: " + (e.message || e));
      return;
    }
  }

  editingLabTestId = null;
  labTests = await getLabTests(athleteId);
  renderLabTests();
}

async function deleteLabTestFile() {
  if (!editingLabTestId) return;
  const existing = labTests.find(t => t.id === editingLabTestId);
  if (!existing) return;
  if (!confirm(`Dzēst "${existing.name}"?`)) return;

  try {
    await supabase.storage.from("lab-test-files").remove([existing.file_path]);
    await deleteLabTest(editingLabTestId);
    editingLabTestId = null;
    labTests = await getLabTests(getSelectedAthleteId());
    renderLabTests();
  } catch (e) {
    alert("Neizdevās dzēst: " + (e.message || e));
  }
}
