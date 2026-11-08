// "Pievienot plānu mobilajam kalendāram" - the athlete's personal calendar-subscription
// link (supabase/functions/calendar-feed). The markup is static in index.html;
// renderProfile() (panels/profile.js) only decides whether to show it.
// Everything here runs on a tap, nothing on page load, so no request is made
// until the athlete actually asks for the link.
const calendarLinkBox = document.getElementById("calendarLinkBox");
const calendarLinkBtn = document.getElementById("calendarLinkBtn");
const calendarLinkPanel = document.getElementById("calendarLinkPanel");
const calendarLinkReady = document.getElementById("calendarLinkReady");
const calendarLinkError = document.getElementById("calendarLinkError");
const calendarLinkInput = document.getElementById("calendarLinkInput");
let calendarLinkUrl = ""; // fetched once, kept until the page is reloaded

function renderCalendarLink(show) {
  if (!calendarLinkBox) return;
  calendarLinkBox.hidden = !show;
  // Leaving the athlete's own profile (e.g. switching role/account) closes it.
  if (!show) calendarLinkPanel.hidden = true;
}

async function toggleCalendarLink() {
  if (!calendarLinkPanel.hidden) {
    calendarLinkPanel.hidden = true;
    return;
  }
  calendarLinkPanel.hidden = false;
  calendarLinkError.hidden = true;
  if (!calendarLinkUrl) {
    calendarLinkBtn.disabled = true;
    try {
      calendarLinkUrl = await getCalendarLink(currentUser.id);
    } catch (e) {
      console.warn("Kalendāra saite nav pieejama:", e);
      // The reason (status + what the server said) is shown in small text so it
      // can be read out or copied to whoever looks after the setup.
      calendarLinkError.textContent = "Kalendāra saite pagaidām nav pieejama. Pamēģini vēlāk vai pasaki trenerim. (" + (e && e.message ? e.message : e) + ")";
      calendarLinkError.hidden = false;
      calendarLinkReady.hidden = true;
      calendarLinkBtn.disabled = false;
      return;
    }
    calendarLinkBtn.disabled = false;
  }
  calendarLinkInput.value = calendarLinkUrl;
  // webcal:// is what makes the iPhone offer "Subscribe" straight away.
  document.getElementById("calendarLinkIphone").href = calendarLinkUrl.replace(/^https?:/, "webcal:");
  calendarLinkReady.hidden = false;
}

calendarLinkBtn?.addEventListener("click", toggleCalendarLink);

document.getElementById("calendarLinkCopy")?.addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(calendarLinkUrl);
  } catch (err) {
    // Older browsers / no permission: select the text so a manual copy works.
    calendarLinkInput.focus();
    calendarLinkInput.select();
    document.execCommand?.("copy");
  }
  const old = btn.textContent;
  btn.textContent = "Nokopēts ✓";
  setTimeout(() => { btn.textContent = old; }, 1800);
});

calendarLinkInput?.addEventListener("focus", () => calendarLinkInput.select());
