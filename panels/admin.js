// Admin panelis (tikai trenerim) - jauna sportista izveide, sportista
// dzēšana, paroles atiestatīšana. Šīs trīs darbības NEVAR iet caur db.js
// parasto ceļu, jo Supabase lietotāju izveidei/dzēšanai vajag "service role"
// atslēgu, kuru nedrīkst atklāt pārlūkā (skat. CLAUDE.md par
// `supabase/functions/`). Tā vietā šis fails sauc trīs servera funkcijas
// (Supabase Edge Functions) ar `fetch(...)` - parastu tīkla pieprasījumu ar
// pieteikšanās žetonu (`Authorization: Bearer ...`), nevis `supabase.from()`.

// #region Jauna sportista izveide
const DIACRITICS = {
  ā: "a", Ā: "A", č: "c", Č: "C", ē: "e", Ē: "E",
  ģ: "g", Ģ: "G", ī: "i", Ī: "I", ķ: "k", Ķ: "K",
  ļ: "l", Ļ: "L", ņ: "n", Ņ: "N", ō: "o", Ō: "O",
  ŗ: "r", Ŗ: "R", š: "s", Š: "S", ū: "u", Ū: "U",
  ž: "z", Ž: "Z",
};

function normalizeName(s) {
  return (s || "")
    .split("")
    .map((c) => DIACRITICS[c] ?? c)
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function updateGeneratedUsername() {
  const first = document.getElementById("newUserFirstName")?.value || "";
  const last = document.getElementById("newUserLastName")?.value || "";
  const username = document.getElementById("newUserUsername");
  if (username) {
    const parts = [
      ...first.trim().split(/\s+/).map(normalizeName),
      ...last.trim().split(/\s+/).map(normalizeName),
    ].filter(Boolean);
    username.value = parts.length > 0 ? parts.join(".") : "";
  }
}

const createUserDialog = document.getElementById("createUserDialog");
const createUserBtn = document.getElementById("createUserBtn");
const saveNewUserBtn = document.getElementById("saveNewUserBtn");
const createUserResult = document.getElementById("createUserResult");
const createUserError = document.getElementById("createUserError");

createUserBtn?.addEventListener("click", () => {
  document.getElementById("newUserFirstName").value = "";
  document.getElementById("newUserLastName").value = "";
  document.getElementById("newUserUsername").value = "";
  createUserResult.hidden = true;
  createUserError.hidden = true;
  createUserDialog?.showModal();
});

document.getElementById("cancelCreateUserBtn")?.addEventListener("click", () => createUserDialog?.close());
document.getElementById("createUserForm")?.addEventListener("submit", (e) => e.preventDefault());

document.getElementById("newUserFirstName")?.addEventListener("input", updateGeneratedUsername);
document.getElementById("newUserLastName")?.addEventListener("input", updateGeneratedUsername);

saveNewUserBtn?.addEventListener("click", async () => {
  const firstName = document.getElementById("newUserFirstName").value.trim();
  const lastName = document.getElementById("newUserLastName").value.trim();
  if (!firstName || !lastName) {
    createUserError.textContent = "Ievadi vārdu un uzvārdu";
    createUserError.hidden = false;
    return;
  }

  createUserError.hidden = true;
  saveNewUserBtn.disabled = true;
  saveNewUserBtn.textContent = "Izveido...";

  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) throw new Error("Nav sesijas");

    const res = await fetch(
      "https://yqaabswcvwkiimpoxsfj.supabase.co/functions/v1/create-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({ firstName, lastName, role: "athlete" }),
      },
    );

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || "Neizdevās izveidot lietotāju");
    }

    createUserResult.innerHTML = `
      <div class="success-message">
        <p>✅ Lietotājs izveidots!</p>
        <p><strong>Lietotājvārds:</strong> <code>${result.username}</code></p>
        <p><strong>Parole:</strong> <code>${result.password}</code></p>
        <button id="copyUserCredsBtn" class="secondary-action" type="button">📋 Kopēt</button>
        <span id="copyFeedback" style="display:none;color:var(--success);font-size:0.85rem">Nokopēts!</span>
      </div>
    `;
    createUserResult.hidden = false;

    document.getElementById("copyUserCredsBtn")?.addEventListener("click", () => {
      const text = `Lietotājvārds: ${result.username}\nParole: ${result.password}`;
      navigator.clipboard.writeText(text);
      const fb = document.getElementById("copyFeedback");
      if (fb) fb.style.display = "inline";
    });

    athletes = await getAthletes();
    renderAthleteDropdown();
    renderAdminAthleteList();
    loadAllData();
  } catch (e) {
    createUserError.textContent = e instanceof Error ? e.message : "Nezināma kļūda";
    createUserError.hidden = false;
  } finally {
    // `finally` bloks izpildās VIENMĒR - vienalga, vai `try` izdevās, vai
    // `catch` noķēra kļūdu. Šeit tas atbloķē pogu abos gadījumos, lai tā
    // nepaliktu "Izveido..." stāvoklī uz visiem laikiem, ja kaut kas nogāja greizi.
    saveNewUserBtn.disabled = false;
    saveNewUserBtn.textContent = "Izveidot";
  }
});

// #endregion

// #region Sportistu saraksts un dzēšana
const deleteUserConfirmDialog = document.getElementById("deleteUserConfirmDialog");
const deleteUserConfirmBody = document.getElementById("deleteUserConfirmBody");
const confirmDeleteUserBtn = document.getElementById("confirmDeleteUserBtn");
const deleteUserError = document.getElementById("deleteUserError");
let pendingDeleteUserId = null;

function renderAdminAthleteList() {
  const container = document.getElementById("adminAthleteList");
  if (!container) return;

  const currentUserId = currentUser?.id;

  container.innerHTML = `
    <div class="admin-athlete-list">
      <h3 class="admin-athlete-list-title">Sportistu saraksts</h3>
      ${athletes
        .filter(a => a.id !== currentUserId)
        .map(a => `
          <div class="admin-athlete-row">
            <span class="athlete-name">${a.full_name}</span>
            <div class="admin-athlete-actions">
              <button class="reset-pw-athlete-btn" data-athlete-id="${a.id}" data-athlete-name="${a.full_name}" type="button">🔑 Mainīt paroli</button>
              <button class="delete-athlete-btn" data-athlete-id="${a.id}" data-athlete-name="${a.full_name}" type="button">Dzēst sportistu</button>
            </div>
          </div>
        `).join("")}
    </div>
  `;

  container.querySelectorAll(".delete-athlete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      pendingDeleteUserId = btn.dataset.athleteId;
      const name = btn.dataset.athleteName;
      deleteUserConfirmBody.innerHTML = `
        <p>Vai tiešām dzēst sportistu <strong>${name}</strong>?</p>
        <p class="muted" style="font-size:0.85rem">Tiks dzēsti visi treniņi, rezultāti, ieraksti, dienasgrāmata.</p>
      `;
      deleteUserError.hidden = true;
      deleteUserConfirmDialog.showModal();
    });
  });

  container.querySelectorAll(".reset-pw-athlete-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const athleteId = btn.dataset.athleteId;
      const athleteName = btn.dataset.athleteName;
      document.getElementById("resetPwAthleteName").textContent = athleteName;
      document.getElementById("resetPwInput").value = "";
      document.getElementById("resetPwError").hidden = true;
      document.getElementById("copyResetPwFeedback").style.display = "none";
      document.getElementById("generatePwBtn").disabled = false;
      document.getElementById("generatePwBtn").textContent = "Ģenerēt";
      pendingResetUserId = athleteId;
      resetPasswordDialog.showModal();
    });
  });
}

confirmDeleteUserBtn?.addEventListener("click", async () => {
  if (!pendingDeleteUserId) return;

  confirmDeleteUserBtn.disabled = true;
  confirmDeleteUserBtn.textContent = "Dzēš...";
  deleteUserError.hidden = true;

  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) throw new Error("Nav sesijas");

    const res = await fetch(
      "https://yqaabswcvwkiimpoxsfj.supabase.co/functions/v1/delete-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({ userId: pendingDeleteUserId }),
      },
    );

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || "Neizdevās dzēst sportistu");
    }

    deleteUserConfirmDialog.close();
    athletes = athletes.filter(a => a.id !== pendingDeleteUserId);
    pendingDeleteUserId = null;
    render();
  } catch (e) {
    deleteUserError.textContent = e instanceof Error ? e.message : "Nezināma kļūda";
    deleteUserError.hidden = false;
  } finally {
    confirmDeleteUserBtn.disabled = false;
    confirmDeleteUserBtn.textContent = "Dzēst";
  }
});

deleteUserConfirmDialog?.addEventListener("close", () => {
  pendingDeleteUserId = null;
});

// #endregion

// #region Paroles atiestatīšana
const resetPasswordDialog = document.getElementById("resetPasswordDialog");
const generatePwBtn = document.getElementById("generatePwBtn");
const resetPwInput = document.getElementById("resetPwInput");
const resetPwError = document.getElementById("resetPwError");
const copyResetPwBtn = document.getElementById("copyResetPwBtn");
const copyResetPwFeedback = document.getElementById("copyResetPwFeedback");
let pendingResetUserId = null;

generatePwBtn?.addEventListener("click", async () => {
  if (!pendingResetUserId) return;

  generatePwBtn.disabled = true;
  generatePwBtn.textContent = "Ģenerē...";
  resetPwError.hidden = true;

  try {
    const { data: session } = await supabase.auth.getSession();
    if (!session?.session?.access_token) throw new Error("Nav sesijas");

    const res = await fetch(
      "https://yqaabswcvwkiimpoxsfj.supabase.co/functions/v1/reset-password",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({ userId: pendingResetUserId }),
      },
    );

    const result = await res.json();

    if (!res.ok) {
      throw new Error(result.error || "Neizdevās mainīt paroli");
    }

    resetPwInput.value = result.password;
    generatePwBtn.textContent = "✔ Ģenerēts";
  } catch (e) {
    resetPwError.textContent = e instanceof Error ? e.message : "Nezināma kļūda";
    resetPwError.hidden = false;
    generatePwBtn.disabled = false;
    generatePwBtn.textContent = "Ģenerēt";
  }
});

copyResetPwBtn?.addEventListener("click", () => {
  const pw = resetPwInput.value;
  if (!pw) return;
  navigator.clipboard.writeText(pw);
  copyResetPwFeedback.style.display = "inline";
});

resetPasswordDialog?.addEventListener("close", () => {
  pendingResetUserId = null;
  resetPwInput.value = "";
  copyResetPwFeedback.style.display = "none";
});
// #endregion
