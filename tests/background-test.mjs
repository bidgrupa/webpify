// Checks the background's toolbar-popup flows (turning a site on, pausing) against faked
// browser APIs, without a browser:
//   ./build.sh && node --experimental-wasm-exnref tests/background-test.mjs
// (background.js imports the built WASM glue, so build first.)
const ext = new URL("../extension", import.meta.url).pathname;
const log = [];
const listeners = {};
const on = (name) => ({ addListener: (fn) => (listeners[name] ??= []).push(fn) });
const fire = async (name, ...args) => { for (const fn of listeners[name] ?? []) await fn(...args); };
const local = { sites: [], pausedUntil: 0 };
const session = {};
const granted = new Set();
const area = (store, name) => ({
  async get(k) { return typeof k === "string" ? { [k]: structuredClone(store[k]) } : structuredClone(store); },
  async set(v) { Object.assign(store, v); if (name === "local") await fire("storage.onChanged", Object.fromEntries(Object.keys(v).map((k) => [k, {}])), "local"); },
  async remove(k) { delete store[k]; },
});
globalThis.chrome = {
  storage: { local: area(local, "local"), session: area(session, "session"), onChanged: on("storage.onChanged") },
  permissions: {
    async contains({ origins }) { return granted.has(origins[0]); },
    onAdded: on("permissions.onAdded"), onRemoved: on("permissions.onRemoved"),
  },
  scripting: {
    async executeScript(d) { log.push(`inject tab ${d.target.tabId}: ${d.files.join(",")}`); return []; },
    async getRegisteredContentScripts() { return []; },
    async registerContentScripts(s) { log.push(`register ${s[0].matches.join(" ")}`); },
    async unregisterContentScripts() {},
  },
  runtime: { onMessage: on("runtime.onMessage"), onInstalled: on("runtime.onInstalled"), onStartup: on("runtime.onStartup"), getURL: (p) => p },
  alarms: { async create(name, info) { log.push(`alarm ${name} at +${Math.round((info.when - Date.now()) / 60000)} min`); }, async clear(name) { log.push(`clear alarm ${name}`); }, onAlarm: on("alarms.onAlarm") },
  action: {
    async setBadgeText({ text }) { log.push(`badge "${text}"`); },
    async setBadgeBackgroundColor() {}, async setBadgeTextColor() {},
  },
};
await import(`${ext}/background.js`);
const send = (message) => new Promise((resolve) => {
  const handled = listeners["runtime.onMessage"][0](message, {}, resolve);
  if (!handled) resolve("not handled");
});
const settle = () => new Promise((r) => setTimeout(r, 50));
let failures = 0;
const check = (label, ok) => { console.log(`${ok ? "ok  " : "FAIL"} ${label}`); if (!ok) failures++; };

// 1. Turn on from the popup: the message arrives before access is granted.
await send({ type: "enable-site", pattern: "https://admin.lauris.io/*", tabId: 7 });
check("nothing added before access is granted", local.sites.length === 0 && session.pendingSite);
granted.add("https://admin.lauris.io/*");
await fire("permissions.onAdded", { origins: ["https://admin.lauris.io/*"] });
await settle();
check("site added once access is granted", local.sites.some((s) => s.pattern === "https://admin.lauris.io/*" && s.selector === 'input[type="file"], .dropzone'));
check("started in the open tab", log.includes("inject tab 7: shared.js,content.js"));
check("content script registered for the site", log.some((l) => l.startsWith("register https://admin.lauris.io/*")));
check("pending request cleared", !session.pendingSite);

// 2. Access already granted (the prompt resolves at once, no onAdded event).
granted.add("https://admin-stage.lauris.io/*");
await send({ type: "enable-site", pattern: "https://admin-stage.lauris.io/*", tabId: 9 });
await settle();
check("already-granted site added straight away", local.sites.some((s) => s.pattern === "https://admin-stage.lauris.io/*") && log.includes("inject tab 9: shared.js,content.js"));

// 3. Pause: badge and alarm; the alarm ends the pause.
log.length = 0;
await chrome.storage.local.set({ pausedUntil: Date.now() + 10 * 60 * 1000 });
await settle();
check(`pausing shows the badge and sets the alarm (${log.join("; ")})`, log.includes('badge "off"') && log.some((l) => l.startsWith("alarm webpify-resume at +10")));
log.length = 0;
local.pausedUntil = Date.now() - 1; // time passes
await fire("alarms.onAlarm", { name: "webpify-resume" });
await settle();
check(`alarm ends the pause (${log.join("; ")})`, log.includes('badge ""') && local.pausedUntil === 0);

// 4. Other messages are left alone.
check("unknown messages aren't answered", (await send({ type: "something-else" })) === "not handled");
process.exit(failures ? 1 : 0);
