// webpify background (Chrome: module service worker, Firefox: event page).
// 1. Runs the Rust/WASM converter for files sent by content.js.
// 2. Keeps content.js registered on the sites the user added and granted.
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
  return convertToWebp(input, options.quality, options.maxDimension, options.lossless);
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "convert") return false;
  convert(message.file, message.options).then(
    (bytes) => sendResponse({ ok: true, bytes }),
    (error) => sendResponse({ ok: false, error: String(error?.message ?? error) }),
  );
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

api.runtime.onInstalled.addListener(scheduleSync);
api.runtime.onStartup.addListener(scheduleSync);
api.permissions.onAdded.addListener(scheduleSync);
api.permissions.onRemoved.addListener(scheduleSync);
api.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && "sites" in changes) scheduleSync();
});

api.action.onClicked.addListener(() => api.runtime.openOptionsPage());
