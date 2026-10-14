// Stands in for the extension APIs while render.mjs shows webpify's own pages and scripts on a
// plain local page, with sample settings. Nothing else is faked: content.js, background.js and
// the .wasm run unchanged, so the conversions and the notice in the screenshots are real.
(() => {
  const DEFAULT_SELECTOR = 'input[type="file"], .dropzone';
  const sampleSite = location.pathname.endsWith("/cms.html");

  const local = {
    quality: 80,
    maxDimension: 2560,
    lossless: false,
    sharpGraphics: true,
    keepIfLarger: true,
    pausedUntil: 0,
    sites: sampleSite
      ? [{ pattern: `${location.protocol}//${location.hostname}/*`, selector: DEFAULT_SELECTOR }]
      : [
          { pattern: "https://cms.example.com/*", selector: DEFAULT_SELECTOR },
          { pattern: "https://shop.example.org/*", selector: ".product-photos input[type=file]" },
        ],
  };
  const session = {};

  function event() {
    const listeners = [];
    return { listeners, addListener: (fn) => listeners.push(fn), removeListener() {}, hasListener: () => false };
  }

  function area(store) {
    return {
      async get(keys) {
        if (keys == null) return structuredClone(store);
        const names = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
        return Object.fromEntries(names.filter((name) => name in store).map((name) => [name, structuredClone(store[name])]));
      },
      async set(values) {
        Object.assign(store, structuredClone(values));
      },
      async remove(keys) {
        for (const name of [].concat(keys)) delete store[name];
      },
    };
  }

  const ok = async () => {};
  const onMessage = event();
  const api = {
    runtime: {
      id: "webpify-screenshots",
      getURL: (path) => `/extension/${path}`,
      openOptionsPage: ok,
      onMessage,
      onInstalled: event(),
      onStartup: event(),
      // Calls background.js's real listener, like the browser would.
      sendMessage: (message) =>
        new Promise((resolve) => {
          for (const listener of onMessage.listeners) if (listener(message, {}, resolve) === true) return;
          resolve(undefined);
        }),
    },
    storage: { local: area(local), session: area(session), onChanged: event() },
    permissions: { contains: async () => true, request: async () => true, remove: async () => true, onAdded: event(), onRemoved: event() },
    tabs: { query: async () => [{ id: 1, url: "https://cms.example.com/media" }] },
    scripting: { getRegisteredContentScripts: async () => [], registerContentScripts: ok, unregisterContentScripts: ok, executeScript: ok },
    action: { setBadgeText: ok, setBadgeBackgroundColor: ok },
    alarms: { create: ok, clear: ok, onAlarm: event() },
  };
  // webpify reads `browser` before `chrome`, and Chromium's own window.chrome can't be replaced.
  globalThis.browser = api;
})();
