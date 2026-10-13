// webpify background (Chrome: module service worker, Firefox: event page).
// 1. Runs the Rust/WASM converter for files sent by content.js.
// 2. Keeps content.js registered on the sites the user added and granted.
import "./shared.js"; // globalThis.webpify: DEFAULT_SELECTOR
import init, { convertToWebp, ensureReady } from "./pkg/webpify.js";

const api = globalThis.browser ?? globalThis.chrome;
const SCRIPT_ID = "webpify";

// --- Converter ---------------------------------------------------------------

// Service workers can't use top-level await, so the module loads on first use.
let wasmReady = null;
function loadWasm() {
  wasmReady ??= init().catch((error) => {
    wasmReady = null; // try again on the next file
    throw error;
  });
  return wasmReady;
}

async function convert(file, options) {
  // Chrome only clones a File across messaging with "message_serialization": "structured_clone".
  if (!(file instanceof Blob)) {
    throw new Error("the file did not arrive (structured-clone messaging unavailable?)");
  }
  await loadWasm();
  const input = new Uint8Array(await file.arrayBuffer());
  ensureReady(); // rebuilds the instance if an earlier call panicked
  return convertToWebp(input, options.quality, options.maxDimension, options.lossless, options.sharpGraphics !== false);
}

// --- Styles for the on-page notice -------------------------------------------

// The content script draws its notice in a shadow root and needs these as one text with the
// @imports resolved. Reading them here, rather than fetching them from the page, means no
// extension file has to be web-accessible (visible to websites).
const UI_CSS_FILES = ["styles/tokens.css", "styles/base.css", "styles/controls.css", "styles/overlay.css", "toast.css"];
let uiCss = null;
function loadUiCss() {
  uiCss ??= Promise.all(UI_CSS_FILES.map((file) => fetch(api.runtime.getURL(file)).then((r) => r.text())))
    .then((texts) => texts.map((text) => text.replace(/@import[^;]+;/g, "")).join("\n"))
    .catch((error) => {
      uiCss = null;
      throw error;
    });
  return uiCss;
}

// --- Turning a site on from the toolbar popup -------------------------------

// The popup sends "enable-site" and then asks for access. Firefox closes the popup while its
// permission prompt is open, so the site is added here, once access shows up. The request is
// kept in session storage so it survives this service worker being stopped in between.
const PENDING_SITE_MS = 5 * 60 * 1000;

async function rememberPendingSite(pattern, tabId) {
  await api.storage.session.set({ pendingSite: { pattern, tabId, at: Date.now() } });
  await finishPendingSite(); // access may have been granted already
}

async function finishPendingSite() {
  const { pendingSite } = await api.storage.session.get("pendingSite");
  if (!pendingSite || Date.now() - pendingSite.at > PENDING_SITE_MS) return;
  if (!(await api.permissions.contains({ origins: [pendingSite.pattern] }))) return;
  await api.storage.session.remove("pendingSite");

  const { sites = [] } = await api.storage.local.get("sites");
  if (!sites.some((site) => site.pattern === pendingSite.pattern)) {
    const selector = globalThis.webpify.DEFAULT_SELECTOR;
    await api.storage.local.set({ sites: [...sites, { pattern: pendingSite.pattern, selector }] });
  }
  // Start in the open tab right away; pages loaded later get it from the registration.
  try {
    await api.scripting.executeScript({
      target: { tabId: pendingSite.tabId, allFrames: true },
      files: ["shared.js", "content.js"],
    });
  } catch (error) {
    console.warn("[webpify] couldn't start on the open tab; it starts after a reload:", error);
  }
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const work =
    message?.type === "convert"
      ? convert(message.file, message.options).then((bytes) => ({ ok: true, bytes }))
      : message?.type === "ui-css"
        ? loadUiCss().then((css) => ({ ok: true, css }))
        : message?.type === "enable-site"
          ? rememberPendingSite(message.pattern, message.tabId).then(() => ({ ok: true }))
          : null;
  if (!work) return false;
  work.then(sendResponse, (error) => sendResponse({ ok: false, error: String(error?.message ?? error) }));
  return true; // keep the channel open for the async response
});

// --- Content script registration --------------------------------------------

// Syncs run one after another; overlapping runs would fail with "duplicate script ID".
let syncQueue = Promise.resolve();
function scheduleSync() {
  syncQueue = syncQueue
    .then(syncContentScript)
    .catch((error) => console.error("[webpify] could not register the content script:", error));
}

async function grantedPatterns() {
  const { sites = [] } = await api.storage.local.get("sites");
  const granted = [];
  for (const pattern of new Set(sites.map((site) => site.pattern))) {
    if (await api.permissions.contains({ origins: [pattern] })) granted.push(pattern);
  }
  return granted.sort();
}

async function syncContentScript() {
  const matches = await grantedPatterns();
  const [current] = await api.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
  const currentMatches = [...(current?.matches ?? [])].sort();
  if (current && currentMatches.join("\n") === matches.join("\n")) return;

  if (current) await api.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
  if (matches.length === 0) return;
  await api.scripting.registerContentScripts([
    {
      id: SCRIPT_ID,
      matches,
      js: ["shared.js", "content.js"],
      runAt: "document_start", // listen before the page's own scripts do
      allFrames: true,
    },
  ]);
  console.info("[webpify] content script registered for", matches);
}

// --- Pause (from the toolbar popup) -------------------------------------------

// While paused the toolbar icon says "off", and an alarm ends the pause on time even if
// this service worker was stopped in between.
const RESUME_ALARM = "webpify-resume";

async function syncPause() {
  const { pausedUntil = 0 } = await api.storage.local.get("pausedUntil");
  if (pausedUntil > Date.now()) {
    await api.action.setBadgeText({ text: "off" });
    await api.action.setBadgeBackgroundColor({ color: "#1d1c2c" }); // --ink in styles/tokens.css
    await api.action.setBadgeTextColor?.({ color: "#ffa173" }); // --orange
    await api.alarms.create(RESUME_ALARM, { when: pausedUntil });
    return;
  }
  await api.action.setBadgeText({ text: "" });
  await api.alarms.clear(RESUME_ALARM);
  if (pausedUntil !== 0) await api.storage.local.set({ pausedUntil: 0 });
}

api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === RESUME_ALARM) syncPause();
});

// --- Events ------------------------------------------------------------------

function onStart() {
  scheduleSync();
  syncPause();
}

api.runtime.onInstalled.addListener(onStart);
api.runtime.onStartup.addListener(onStart);
api.permissions.onAdded.addListener(() => {
  scheduleSync();
  finishPendingSite();
});
api.permissions.onRemoved.addListener(scheduleSync);
api.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if ("sites" in changes) scheduleSync();
  if ("pausedUntil" in changes) syncPause();
});
