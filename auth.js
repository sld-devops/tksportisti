// ===================================================================
// AUTH.JS - login, session, account switching, password change
// ===================================================================
// `currentUser`/`currentProfile` (below) are two of the most important global
// variables in the whole app - almost every function in app.js/panels/*.js
// files checks `currentProfile.role` or `isCoach()` somewhere. Users
// log in not with an email, but with a username, which is converted here
// into a "synthetic" email (`lietotajvards@skmitauer.app`) - Supabase Auth
// requires an email format, but the coach and athletes don't need an email.

// #region Login and session basics
const appEl = document.getElementById("appView");
const authViewEl = document.getElementById("authView");
const loginBtn = document.getElementById("loginBtn");
const authForm = document.getElementById("authForm");
const usernameInput = document.getElementById("loginUsername");
const passwordInput = document.getElementById("loginPassword");
const rememberLoginInput = document.getElementById("rememberLogin");
const authErrorEl = document.getElementById("authError");
const logoutBtn = document.getElementById("logoutBtn");
const changePasswordBtn = document.getElementById("changePasswordBtn");
const changePasswordDialog = document.getElementById("changePasswordDialog");
const savePasswordBtn = document.getElementById("savePasswordBtn");
const newPasswordInput = document.getElementById("newPassword");
const confirmPasswordInput = document.getElementById("confirmPassword");
const passwordErrorEl = document.getElementById("passwordError");

let currentUser = null;
let currentProfile = null;

function showApp() {
  authViewEl.hidden = true;
  appEl.hidden = false;
  updateAccountSwitchBtn();
  updateMobileHeaderHeight();
}

function showAuth() {
  appEl.hidden = true;
  authViewEl.hidden = false;
  passwordInput.value = "";
  authErrorEl.hidden = true;
  usernameInput.focus();
}

function isCoach() {
  return currentProfile?.role === "coach";
}


function showError(msg) {
  authErrorEl.textContent = msg;
  authErrorEl.hidden = false;
}

// Supabase reports auth failures in English. Match the ones a user can actually
// hit here and fall back to a generic Latvian line for anything else, so the
// login screen never shows raw English.
function loginErrorLV(error) {
  const raw = (error?.message || "").toLowerCase();
  if (raw.includes("invalid login credentials")) {
    return "Nepareizs lietotājvārds (vards.uzvards) un/vai parole.";
  }
  if (raw.includes("too many requests") || raw.includes("rate limit")) {
    return "Par daudz mēģinājumu. Pamēģini vēlreiz pēc brīža.";
  }
  if (raw.includes("failed to fetch") || raw.includes("network")) {
    return "Nav savienojuma ar serveri. Pārbaudi interneta savienojumu.";
  }
  return "Pieslēgšanās neizdevās. Pamēģini vēlreiz.";
}

async function login() {
  const username = usernameInput.value.toLowerCase().trim();
  const password = passwordInput.value;

  if (!username || !password) {
    showError("Ievadi lietotājvārdu un paroli");
    return;
  }

  const email = username + "@skmitauer.app";
  authErrorEl.hidden = true;

  localStorage.setItem("rememberLogin", String(rememberLoginInput.checked));

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.user) {
    showError(loginErrorLV(error));
    return;
  }

  currentUser = data.user;
  currentProfile = await getProfile(currentUser.id);

  if (!currentProfile) {
    showError("Profils neeksistē. Sazinies ar administratoru.");
    await supabase.auth.signOut();
    currentUser = null;
    return;
  }

  await initApp();
  showApp();
}

async function logout() {
  clearStashedSessions();
  await supabase.auth.signOut();
  currentUser = null;
  currentProfile = null;
  showAuth();
}
// #endregion

// #region Account switching (coach ⇄ athlete on one device)
/* ---------------------------------------------------------------------------
   "Sportista skats" / "Trenera skats"

   The coach also trains, on a second (athlete) account of their own. Planning
   for it already worked from the coach view, but only the athlete may record
   execution — so the only way to log their own training was to sign out and
   type the other username and password.

   This does NOT fake a role. Both real sessions are kept side by side in the
   browser and the button swaps which one is active, so every permission check,
   every render*() branch and every RLS policy sees exactly what it would have
   seen after a normal login. Nothing else in the app knows this exists.

   The switch reloads the page, for the same reason the screen-view button does:
   half the app's state is read once at load, and rebuilding it in place for a
   different user is far more fragile than starting clean.
   ------------------------------------------------------------------------ */

const ACCOUNT_SWITCH_KEY = "accountSwitchSessions";
const accountSwitchBtn = document.getElementById("accountSwitchBtn");
const linkAccountDialog = document.getElementById("linkAthleteDialog");
const linkAccountUsername = document.getElementById("linkAthleteUsername");
const linkAccountPassword = document.getElementById("linkAthletePassword");
const linkAccountErrorEl = document.getElementById("linkAthleteError");
let accountSwitchTarget = "athlete";
let accountSwitchBusy = false;

// Same rule as the Supabase client's own storage in db.js: with "remember me"
// off the stash must not outlive the browser session either.
function accountSwitchStore() {
  return localStorage.getItem("rememberLogin") !== "false" ? localStorage : sessionStorage;
}

function getStashedSessions() {
  try {
    return JSON.parse(accountSwitchStore().getItem(ACCOUNT_SWITCH_KEY) || "{}") || {};
  } catch (e) {
    return {};
  }
}

function setStashedSessions(sessions) {
  try {
    accountSwitchStore().setItem(ACCOUNT_SWITCH_KEY, JSON.stringify(sessions));
  } catch (e) {
    /* private mode - the switch just won't be remembered */
  }
}

function clearStashedSessions() {
  try {
    localStorage.removeItem(ACCOUNT_SWITCH_KEY);
    sessionStorage.removeItem(ACCOUNT_SWITCH_KEY);
  } catch (e) {
    /* ignore */
  }
}

// Only the two tokens are kept. A whole session object also carries a copy of
// the user record, which is stale the moment anything about that account
// changes — setSession needs nothing but these two.
async function stashCurrentSession(role) {
  const { data } = await supabase.auth.getSession();
  if (!data?.session) return null;
  const tokens = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
  const sessions = getStashedSessions();
  sessions[role] = tokens;
  setStashedSessions(sessions);
  return tokens;
}

function updateAccountSwitchBtn() {
  if (!accountSwitchBtn) return;
  const coach = isCoach();
  // The way back is offered only on the device where the coach set this up: a
  // real athlete on their own phone has no coach session stashed, so no athlete
  // ever sees this button.
  const show = !!currentProfile && (coach || !!getStashedSessions().coach);
  accountSwitchBtn.hidden = !show;
  if (!show) return;
  accountSwitchBtn.querySelector(".label-full").textContent = coach ? "Sportista skats" : "Trenera skats";
  accountSwitchBtn.querySelector(".label-short").textContent = coach ? "Sportists" : "Treneris";
}

async function activateSession(tokens) {
  if (!tokens) return false;
  const { data, error } = await supabase.auth.setSession(tokens);
  if (error || !data?.session) return false;
  location.reload();
  return true;
}

async function switchAccount() {
  if (accountSwitchBusy) return;
  accountSwitchBusy = true;
  accountSwitchBtn.disabled = true;
  try {
    const fromRole = isCoach() ? "coach" : "athlete";
    const toRole = fromRole === "coach" ? "athlete" : "coach";
    const back = await stashCurrentSession(fromRole);
    const sessions = getStashedSessions();

    if (await activateSession(sessions[toRole])) return;

    // The other account's saved access is unusable (never set up, or too old).
    // Put the current session back first: a failed setSession can leave the
    // client with no session at all, which would silently log this one out.
    if (back) await supabase.auth.setSession(back);
    delete sessions[toRole];
    setStashedSessions(sessions);
    openLinkAccountDialog(toRole);
  } finally {
    accountSwitchBusy = false;
    accountSwitchBtn.disabled = false;
  }
}

function openLinkAccountDialog(targetRole) {
  accountSwitchTarget = targetRole;
  document.getElementById("linkAthleteTitle").textContent =
    targetRole === "coach" ? "Trenera konts" : "Mans sportista konts";
  document.getElementById("linkAthleteHint").textContent =
    targetRole === "coach"
      ? "Ievadi sava trenera konta lietotājvārdu un paroli."
      : "Ievadi sava sportista konta lietotājvārdu un paroli. Tas jāizdara vienu reizi šajā ierīcē — turpmāk pārslēgšanās notiks ar vienu klikšķi.";
  linkAccountErrorEl.hidden = true;
  linkAccountUsername.value = "";
  linkAccountPassword.value = "";
  linkAccountDialog.showModal();
  linkAccountUsername.focus();
}

function showLinkAccountError(msg) {
  linkAccountErrorEl.textContent = msg;
  linkAccountErrorEl.hidden = false;
}

async function linkAndSwitchAccount() {
  const username = linkAccountUsername.value.toLowerCase().trim();
  const password = linkAccountPassword.value;
  linkAccountErrorEl.hidden = true;

  if (!username || !password) {
    showLinkAccountError("Ievadi lietotājvārdu un paroli");
    return;
  }

  const fromRole = isCoach() ? "coach" : "athlete";
  const back = getStashedSessions()[fromRole] || (await stashCurrentSession(fromRole));
  const previousId = currentUser?.id;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: username + "@skmitauer.app",
    password,
  });

  // Signing in has already replaced the active session, so every failure path
  // below has to put the original one back before returning.
  if (error || !data?.session) {
    if (back) await supabase.auth.setSession(back);
    showLinkAccountError(loginErrorLV(error));
    return;
  }

  const profile = await getProfile(data.user.id);
  const wrongRole = accountSwitchTarget === "coach"
    ? profile?.role !== "coach"
    : profile?.role === "coach";
  const sameAccount = data.user.id === previousId;

  if (!profile || wrongRole || sameAccount) {
    if (back) await supabase.auth.setSession(back);
    if (!profile) {
      showLinkAccountError("Profils neeksistē. Sazinies ar administratoru.");
    } else if (sameAccount) {
      showLinkAccountError("Šis ir tas pats konts, ar kuru esi pieslēdzies.");
    } else if (accountSwitchTarget === "coach") {
      showLinkAccountError("Šis nav trenera konts.");
    } else {
      showLinkAccountError("Šis ir trenera konts, nevis sportista.");
    }
    return;
  }

  const sessions = getStashedSessions();
  sessions[accountSwitchTarget] = {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  };
  setStashedSessions(sessions);
  location.reload();
}
// #endregion

// #region Password change
async function changePassword() {
  const newPwd = newPasswordInput.value;
  const confirmPwd = confirmPasswordInput.value;
  passwordErrorEl.hidden = true;

  if (newPwd.length < 5) {
    passwordErrorEl.textContent = "Parolei jābūt vismaz 5 rakstzīmēm";
    passwordErrorEl.hidden = false;
    return;
  }
  if (newPwd !== confirmPwd) {
    passwordErrorEl.textContent = "Paroles nesakrīt";
    passwordErrorEl.hidden = false;
    return;
  }

  const { error } = await supabase.auth.updateUser({ password: newPwd });
  if (error) {
    passwordErrorEl.textContent = error.message || "Neizdevās nomainīt paroli";
    passwordErrorEl.hidden = false;
    return;
  }

  changePasswordDialog.close();
  newPasswordInput.value = "";
  confirmPasswordInput.value = "";
}
// #endregion

// #region Event binding
authForm.addEventListener("submit", function(e){ e.preventDefault(); login(); });
logoutBtn.addEventListener("click", logout);

accountSwitchBtn?.addEventListener("click", switchAccount);
document.getElementById("linkAthleteBtn")?.addEventListener("click", linkAndSwitchAccount);
linkAccountPassword?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    linkAndSwitchAccount();
  }
});

changePasswordBtn.addEventListener("click", () => {
  passwordErrorEl.hidden = true;
  newPasswordInput.value = "";
  confirmPasswordInput.value = "";
  changePasswordDialog.showModal();
});
savePasswordBtn.addEventListener("click", changePassword);
// #endregion
