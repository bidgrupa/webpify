// webpify options page: conversion settings and the sites list.
// Everything is stored in storage.local; the background re-registers the
// content script whenever the sites (or their permissions) change.
const api = globalThis.browser ?? globalThis.chrome;
const { DEFAULTS, DEFAULT_SELECTOR } = globalThis.webpify;

const settingsForm = document.getElementById("settings");
const qualityValue = document.getElementById("quality-value");
const settingsStatus = document.getElementById("settings-status");
const sitesBody = document.getElementById("sites");
const noSites = document.getElementById("no-sites");
const addForm = document.getElementById("add-site");
const sitesStatus = document.getElementById("sites-status");

function setStatus(element, message, kind) {
  element.textContent = message;
  element.className = `status ${kind}`;
}

// --- Conversion settings -----------------------------------------------------

async function loadSettings() {
  const settings = { ...DEFAULTS, ...(await api.storage.local.get(null)) };
  const fields = settingsForm.elements;
  fields.quality.value = settings.quality;
  fields.maxDimension.value = settings.maxDimension;
  fields.lossless.checked = settings.lossless;
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
    keepIfLarger: fields.keepIfLarger.checked,
  });
  setStatus(settingsStatus, "Saved.", "ok");
});

// --- Sites -------------------------------------------------------------------

async function getSites() {
  const { sites = [] } = await api.storage.local.get("sites");
  return sites;
}

async function renderSites() {
  const sites = await getSites();
  sitesBody.replaceChildren(...(await Promise.all(sites.map(siteRow))));
  noSites.hidden = sites.length > 0;
}

async function siteRow(site) {
  const granted = await api.permissions.contains({ origins: [site.pattern] });
  const row = document.createElement("tr");

  const access = document.createElement("td");
  if (granted) {
    access.textContent = "Granted";
  } else {
    const grant = document.createElement("button");
    grant.type = "button";
    grant.textContent = "Grant";
    // permissions.request must run directly in the click handler.
    grant.addEventListener("click", () => api.permissions.request({ origins: [site.pattern] }).then(renderSites));
    access.append(grant);
  }

  const actions = document.createElement("td");
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Remove";
  remove.addEventListener("click", () => removeSite(site.pattern));
  actions.append(remove);

  row.append(codeCell(site.pattern), codeCell(site.selector), access, actions);
  return row;
}

function codeCell(text) {
  const cell = document.createElement("td");
  const code = document.createElement("code");
  code.textContent = text;
  cell.append(code);
  return cell;
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
    setStatus(sitesStatus, `"${selector}" is not a valid CSS selector.`, "error");
    return;
  }
  // The browser only shows the permission prompt during the click itself, so
  // this request must come before anything that awaits.
  let request;
  try {
    request = api.permissions.request({ origins: [pattern] });
  } catch (error) {
    setStatus(sitesStatus, `Invalid page pattern: ${error.message}`, "error");
    return;
  }
  request.then(
    async (granted) => {
      if (!granted) {
        setStatus(sitesStatus, "Access to that site was not granted.", "error");
        return;
      }
      const sites = (await getSites()).filter((site) => site.pattern !== pattern);
      await api.storage.local.set({ sites: [...sites, { pattern, selector }] });
      addForm.reset();
      setStatus(sitesStatus, `Added ${pattern}. Reload tabs that are already open on it.`, "ok");
    },
    (error) => setStatus(sitesStatus, `Invalid page pattern: ${error.message}`, "error"),
  );
});

async function removeSite(pattern) {
  const sites = (await getSites()).filter((site) => site.pattern !== pattern);
  await api.storage.local.set({ sites });
  try {
    await api.permissions.remove({ origins: [pattern] });
  } catch (error) {
    console.warn("[webpify] could not drop the site permission:", error);
  }
  setStatus(sitesStatus, `Removed ${pattern}.`, "ok");
}

for (const preset of document.querySelectorAll("[data-pattern]")) {
  preset.addEventListener("click", () => {
    addForm.elements.pattern.value = preset.dataset.pattern;
    addForm.elements.selector.focus();
  });
}

api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "sites" in changes) renderSites();
});
api.permissions.onAdded.addListener(renderSites);
api.permissions.onRemoved.addListener(renderSites);

loadSettings();
renderSites();
