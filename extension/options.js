// webpify options page: conversion settings and the sites list.
// Everything is stored in storage.local; the background re-registers the
// content script whenever the sites (or their permissions) change.
const api = globalThis.browser ?? globalThis.chrome;
const { DEFAULTS, DEFAULT_SELECTOR } = globalThis.webpify;

const settingsForm = document.getElementById("settings");
const qualityValue = document.getElementById("quality-value");
const sitesList = document.getElementById("sites");
const noSites = document.getElementById("no-sites");
const addForm = document.getElementById("add-site");
const sitesStatus = document.getElementById("sites-status");
const savedToast = document.querySelector(".saved");

/** One line under the add-site form; `ok` in orange ink, otherwise as an error. */
function setStatus(message, ok) {
  sitesStatus.textContent = message;
  sitesStatus.className = `status ${ok ? "is-ok" : "is-bad"}`;
}

// Settings save as they change; the "Saved" pill confirms it for 1.2 s.
let savedTimer = 0;
function flashSaved() {
  savedToast.classList.add("is-visible");
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => savedToast.classList.remove("is-visible"), 1200);
}

// --- Conversion settings -----------------------------------------------------

async function loadSettings() {
  const settings = { ...DEFAULTS, ...(await api.storage.local.get(null)) };
  const fields = settingsForm.elements;
  fields.quality.value = settings.quality;
  fields.maxDimension.value = settings.maxDimension;
  fields.lossless.checked = settings.lossless;
  fields.sharpGraphics.checked = settings.sharpGraphics;
  fields.keepIfLarger.checked = settings.keepIfLarger;
  qualityValue.value = settings.quality;
}

settingsForm.addEventListener("input", async () => {
  const fields = settingsForm.elements;
  const quality = Number(fields.quality.value);
  qualityValue.value = quality;
  await api.storage.local.set({
    quality,
    maxDimension: Math.max(0, Math.floor(Number(fields.maxDimension.value) || 0)),
    lossless: fields.lossless.checked,
    sharpGraphics: fields.sharpGraphics.checked,
    keepIfLarger: fields.keepIfLarger.checked,
  });
  flashSaved();
});

// --- Sites -------------------------------------------------------------------

async function getSites() {
  const { sites = [] } = await api.storage.local.get("sites");
  return sites;
}

async function renderSites() {
  const sites = await getSites();
  sitesList.replaceChildren(...(await Promise.all(sites.map(siteRow))));
  noSites.hidden = sites.length > 0;
}

/** One site: its address, which upload fields it covers, whether access is granted, and actions. */
async function siteRow(site) {
  const granted = await api.permissions.contains({ origins: [site.pattern] });
  const row = document.createElement("li");

  const main = document.createElement("div");
  main.className = "row-main";
  const title = document.createElement("span");
  title.className = "row-title";
  title.textContent = site.pattern;

  const meta = document.createElement("div");
  meta.className = "row-meta";
  const fields = document.createElement("span");
  if (!site.selector || site.selector === DEFAULT_SELECTOR) {
    fields.textContent = "All upload fields and Dropzone areas";
  } else {
    const code = document.createElement("code");
    code.textContent = site.selector;
    fields.append("Upload fields: ", code);
  }
  const access = document.createElement("span");
  access.className = `tag ${granted ? "is-ok" : "is-bad"}`;
  access.textContent = granted ? "Access granted" : "No access";
  meta.append(fields, access);
  main.append(title, meta);
  row.append(main);

  if (!granted) {
    // permissions.request must run directly in the click handler.
    row.append(
      button("Grant access", () => api.permissions.request({ origins: [site.pattern] }).then(renderSites)),
    );
  }
  row.append(button("Remove", () => removeSite(site.pattern)));
  return row;
}

function button(label, onClick) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "btn btn--small";
  element.textContent = label;
  element.addEventListener("click", onClick);
  return element;
}

function isValidSelector(selector) {
  try {
    document.createDocumentFragment().querySelector(selector);
    return true;
  } catch {
    return false;
  }
}

addForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const pattern = addForm.elements.pattern.value.trim();
  const selector = addForm.elements.selector.value.trim() || DEFAULT_SELECTOR;
  if (!isValidSelector(selector)) {
    setStatus(`"${selector}" isn't a valid CSS selector. Nothing was added.`, false);
    return;
  }
  // The browser only shows the permission prompt during the click itself, so
  // this request must come before anything that awaits.
  let request;
  try {
    request = api.permissions.request({ origins: [pattern] });
  } catch (error) {
    badAddress(error);
    return;
  }
  request.then(
    async (granted) => {
      if (!granted) {
        setStatus("Access to that site wasn't allowed, so it wasn't added.", false);
        return;
      }
      const sites = (await getSites()).filter((site) => site.pattern !== pattern);
      await api.storage.local.set({ sites: [...sites, { pattern, selector }] });
      addForm.reset();
      setStatus(`Added ${pattern}. Reload tabs that are already open on it.`, true);
    },
    badAddress,
  );
});

function badAddress(error) {
  console.warn("[webpify] page address rejected:", error);
  setStatus("That page address doesn't work. Use the full address ending in /*, for example https://www.example.com/*.", false);
}

async function removeSite(pattern) {
  const sites = (await getSites()).filter((site) => site.pattern !== pattern);
  await api.storage.local.set({ sites });
  try {
    await api.permissions.remove({ origins: [pattern] });
  } catch (error) {
    console.warn("[webpify] could not drop the site permission:", error);
  }
  setStatus(`Removed ${pattern}.`, true);
}

for (const preset of document.querySelectorAll("[data-pattern]")) {
  preset.addEventListener("click", () => {
    addForm.elements.pattern.value = preset.dataset.pattern;
    addForm.querySelector('[type="submit"]').focus();
  });
}

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "sites" in changes) renderSites();
});
api.permissions.onAdded.addListener(renderSites);
api.permissions.onRemoved.addListener(renderSites);

loadSettings();
renderSites();
