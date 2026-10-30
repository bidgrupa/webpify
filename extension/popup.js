// webpify toolbar popup: turn conversion on or off for the site in the current tab, or pause
// it everywhere for a while. Sites are stored like the ones added on the settings page.
const api = globalThis.browser ?? globalThis.chrome;
const { DEFAULTS, matchesPattern } = globalThis.webpify;
const PAUSE_MS = 10 * 60 * 1000;

const host = document.getElementById("page-host");
const siteRow = document.getElementById("site-row");
const siteSwitch = document.getElementById("site-switch");
const siteHelp = document.getElementById("site-help");
const grant = document.getElementById("grant");
const unsupported = document.getElementById("unsupported");
const siteStatus = document.getElementById("site-status");
const pause = document.getElementById("pause");
const pauseHelp = document.getElementById("pause-help");

let tab = null;
let pattern = null; // this site as a match pattern, e.g. https://admin.lauris.io/*
let site = null; // the stored site that covers this page, if any

function setStatus(message, ok) {
  siteStatus.textContent = message;
  siteStatus.className = `status ${ok ? "is-ok" : "is-bad"}`;
}

const clock = (time) => new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

async function render() {
  const settings = { ...DEFAULTS, ...(await api.storage.local.get(null)) };
  const paused = settings.pausedUntil > Date.now();

  siteRow.hidden = !pattern;
  unsupported.hidden = Boolean(pattern);
  if (pattern) {
    site = settings.sites.find((s) => matchesPattern(s.pattern, tab.url)) ?? null;
    const granted = site ? await api.permissions.contains({ origins: [site.pattern] }) : false;
    // A broader pattern from the settings (say *.lauris.io) is changed there, not here.
    const coveredElsewhere = Boolean(site) && site.pattern !== pattern;
    siteSwitch.checked = Boolean(site);
    siteSwitch.disabled = coveredElsewhere;
    grant.hidden = !site || granted;
    if (!site) {
      siteHelp.textContent = "Your browser asks for access the first time.";
    } else if (!granted) {
      siteHelp.textContent = "webpify needs access to this site again.";
    } else if (coveredElsewhere) {
      siteHelp.textContent = `On through ${site.pattern}. Change it in the settings.`;
    } else if (paused) {
      siteHelp.textContent = `On, but paused until ${clock(settings.pausedUntil)}.`;
    } else {
      siteHelp.textContent = "Images and videos you upload here are converted.";
    }
  }

  pause.textContent = paused ? "Resume now" : "Pause for 10 minutes";
  pauseHelp.textContent = paused
    ? `Paused until ${clock(settings.pausedUntil)}. Uploads on every site stay as they are.`
    : "For an upload that has to stay as it is. Turns itself back on.";
}

siteSwitch.addEventListener("change", () => {
  if (siteSwitch.checked) turnOn();
  else turnOff();
});

function turnOn() {
  // Firefox closes the popup while the permission prompt is open, so the background adds the
  // site and starts it in this tab once access is granted. Both calls happen right in the
  // click, before anything awaits: the browser only shows the prompt then.
  api.runtime.sendMessage({ type: "enable-site", pattern, tabId: tab.id }).catch(() => {});
  let request;
  try {
    request = api.permissions.request({ origins: [pattern] });
  } catch (error) {
    console.warn("[webpify] permission request failed:", error);
    siteSwitch.checked = false;
    setStatus("webpify can't be turned on for this page.", false);
    return;
  }
  request.then(
    (granted) => {
      if (!granted) {
        siteSwitch.checked = false;
        setStatus("Access wasn't allowed, so webpify stays off here.", false);
        return;
      }
      // The background saves the site; storage.onChanged below redraws the popup.
      setStatus("On. Works on this page now, no reload needed.", true);
    },
    (error) => {
      console.warn("[webpify] permission request failed:", error);
      siteSwitch.checked = false;
      setStatus("webpify can't be turned on for this page.", false);
    },
  );
}

async function turnOff() {
  const removed = site.pattern;
  const { sites = [] } = await api.storage.local.get("sites");
  await api.storage.local.set({ sites: sites.filter((s) => s.pattern !== removed) });
  try {
    await api.permissions.remove({ origins: [removed] });
  } catch (error) {
    console.warn("[webpify] could not drop the site permission:", error);
  }
  setStatus("Off. Uploads on this site stay as they are.", true);
  await render();
}

grant.addEventListener("click", () => {
  // Directly in the click, like turnOn.
  api.permissions.request({ origins: [site.pattern] }).then(render, render);
});

pause.addEventListener("click", async () => {
  const { pausedUntil = 0 } = await api.storage.local.get("pausedUntil");
  const paused = pausedUntil > Date.now();
  await api.storage.local.set({ pausedUntil: paused ? 0 : Date.now() + PAUSE_MS });
  await render();
});

api.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") render();
});

document.getElementById("open-settings").addEventListener("click", () => {
  api.runtime.openOptionsPage();
  window.close();
});

(async () => {
  // activeTab: opening the popup gives access to this tab's address.
  [tab] = await api.tabs.query({ active: true, currentWindow: true });
  let url = null;
  try {
    url = new URL(tab?.url ?? "");
  } catch {}
  if (url && (url.protocol === "https:" || url.protocol === "http:")) {
    pattern = `${url.protocol}//${url.hostname}/*`;
    host.textContent = url.hostname;
  }
  await render();
})();
