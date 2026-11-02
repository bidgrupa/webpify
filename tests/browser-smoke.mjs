// Converts sample videos through the real extension in a headless browser, on the demo page,
// and checks what came out with ffprobe and a full decode with ffmpeg:
//   ./build.sh && node tests/browser-smoke.mjs [--browser "<command>"] [--work DIR] [--keep]
//                                              [--only <part of a sample name>] [--verbose]
// Needs ffmpeg and ffprobe (the samples, and the check) and a browser:
// - Chromium, Brave, Edge or Chrome for Testing, driven over the DevTools protocol. Google-branded
//   Chrome ignores --load-extension since version 137, so it can't be used here (the shipped
//   extension runs the same code in it).
// - Firefox or Zen, driven over Marionette, with the extension loaded temporarily like
//   about:debugging does.
// Without --browser, the first of chromium, brave-browser, firefox and their flatpaks is used; a
// command containing "firefox" or "zen" is driven as Firefox. Flatpak browsers can only read a
// few folders, so --work defaults to ~/Downloads/webpify-smoke; the folder is removed at the end
// unless --keep.
// The extension is given access to http://127.0.0.1/* here, standing in for the permission
// prompt a person would answer (static host_permissions in Chromium, the permissions store in
// Firefox); from there on it is the shipped code path: content.js holds the change event,
// video.js converts, the page gets the MP4s. Headless browsers have no GPU, so the HEVC sample
// is expected to be kept, like on a machine without a hardware decoder; the script says which
// way it went.
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { connect, createServer as createTcpServer } from "node:net";
import { homedir } from "node:os";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 ? args[at + 1] : fallback;
};
const keep = args.includes("--keep");
const only = option("--only", null); // run the samples whose name contains this
const verbose = args.includes("--verbose"); // print the browser's webpify console lines as they come
const work = resolve(option("--work", join(homedir(), "Downloads", "webpify-smoke")));
const browserOption = option("--browser", option("--chrome", null));
const SITE = "http://127.0.0.1/*";
const SELECTOR = 'input[type="file"], .dropzone';

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures++;
};
const mb = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(probe, timeoutMs, what, every = 250) {
  const until = Date.now() + timeoutMs;
  for (;;) {
    let result = null;
    try {
      result = await probe();
    } catch (error) {
      if (Date.now() > until) throw error;
    }
    if (result) return result;
    if (Date.now() > until) throw new Error(`timed out waiting for ${what}`);
    await sleep(every);
  }
}

function freePort() {
  return new Promise((done) => {
    const server = createTcpServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => done(port));
    });
  });
}

// --- Samples: short synthetic clips, one per decision the converter can make ---

const tone = ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000"];
const source = (size, rate) => ["-f", "lavfi", "-i", `testsrc2=size=${size}:rate=${rate}`];
const SAMPLES = [
  { name: "big-1080p60.mp4", expect: "transcode", why: "60 fps at 12 Mbit/s: re-encoded at 30 fps and ~3 Mbit/s",
    args: [...source("1920x1080", 60), ...tone, "-t", "6", "-c:v", "libx264", "-preset", "veryfast", "-b:v", "12M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart"] },
  { name: "compact-720p.mp4", expect: "unchanged", why: "already a compact H.264 MP4",
    args: [...source("1280x720", 30), ...tone, "-t", "4", "-c:v", "libx264", "-preset", "veryfast", "-b:v", "1M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart"] },
  { name: "clip-h264.mov", expect: "remux", why: "a compact H.264 MOV: repackaged as MP4 without re-encoding",
    args: [...source("1280x720", 30), ...tone, "-t", "4", "-c:v", "libx264", "-preset", "veryfast", "-b:v", "1M", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k"] },
  { name: "screen-vp9.webm", expect: "transcode", why: "VP9 + Opus at 6 Mbit/s: re-encoded to H.264, the Opus sound copied",
    args: [...source("1280x720", 30), ...tone, "-t", "4", "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "6M", "-pix_fmt", "yuv420p", "-c:a", "libopus", "-b:a", "96k"] },
  { name: "iphone-hevc.mov", expect: "hevc", why: "HEVC like an iPhone recording: converted only where the browser can decode HEVC",
    args: [...source("1920x1080", 30), ...tone, "-t", "4", "-c:v", "libx265", "-preset", "ultrafast", "-b:v", "4M", "-pix_fmt", "yuv420p", "-tag:v", "hvc1", "-c:a", "aac", "-b:a", "96k"] },
];

const samplesToRun = SAMPLES.filter((s) => !only || s.name.includes(only));
if (samplesToRun.length === 0) throw new Error(`no sample matches --only ${only}`);

function makeSamples(folder) {
  mkdirSync(folder, { recursive: true });
  for (const sample of samplesToRun) {
    const path = join(folder, sample.name);
    if (existsSync(path)) continue;
    process.stdout.write(`making ${sample.name}… `);
    execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...sample.args, path], { stdio: ["ignore", "inherit", "inherit"] });
    console.log(mb(statSync(path).size));
  }
}

// --- The extension, staged per browser like scripts/package.mjs does ---

function stageExtension(folder, firefox) {
  if (!existsSync(join(root, "extension/pkg/webpify_bg.wasm"))) throw new Error("extension/pkg is missing; run ./build.sh first");
  rmSync(folder, { recursive: true, force: true });
  cpSync(join(root, "extension"), folder, { recursive: true, filter: (src) => !/\/\.[^/]+$/.test(src) });
  const manifest = JSON.parse(readFileSync(join(folder, "manifest.json"), "utf8"));
  if (firefox) {
    delete manifest.background.service_worker;
    delete manifest.message_serialization;
  } else {
    delete manifest.background.scripts;
    delete manifest.browser_specific_settings;
    manifest.host_permissions = [SITE]; // Chromium has no way to grant an optional permission from outside
  }
  writeFileSync(join(folder, "manifest.json"), JSON.stringify(manifest, null, 2));
}

// --- The demo page, served from demo/ ---

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
function serveDemo() {
  const demo = join(root, "demo");
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/\/$/, "/index.html");
    const path = join(demo, pathname);
    if (!path.startsWith(demo) || !existsSync(path) || statSync(path).isDirectory()) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    response.end(readFileSync(path));
  });
  return new Promise((done) => server.listen(0, "127.0.0.1", () => done(server)));
}

// --- Which browser ---

function browserCommand() {
  if (browserOption) {
    const [cmd, ...rest] = browserOption.split(" ");
    return { cmd, args: rest };
  }
  for (const cmd of ["chromium", "chromium-browser", "brave-browser", "brave", "microsoft-edge", "firefox"]) {
    try {
      execFileSync("which", [cmd], { stdio: "ignore" });
      return { cmd, args: [] };
    } catch {}
  }
  for (const app of ["org.chromium.Chromium", "com.brave.Browser", "com.microsoft.Edge", "org.mozilla.firefox", "app.zen_browser.zen"]) {
    try {
      execFileSync("flatpak", ["info", app], { stdio: "ignore" });
      return { cmd: "flatpak", args: ["run", app] };
    } catch {}
  }
  throw new Error('no browser found; pass --browser "<command>" (Google Chrome itself can\'t load unpacked extensions headless)');
}

function launch(command, extra, env = {}, onStdout = null) {
  // A flatpak app only sees the environment it is given.
  const args = command.cmd === "flatpak" ? [command.args[0], ...Object.entries(env).map(([k, v]) => `--env=${k}=${v}`), ...command.args.slice(1)] : command.args;
  const child = spawn(command.cmd, [...args, ...extra], { stdio: ["ignore", onStdout ? "pipe" : "ignore", "pipe"], env: { ...process.env, ...env } });
  child.errors = "";
  child.stderr.on("data", (data) => (child.errors += data));
  if (onStdout) {
    let rest = "";
    child.stdout.on("data", (data) => {
      const lines = (rest + data).split("\n");
      rest = lines.pop();
      for (const line of lines) onStdout(line);
    });
  }
  return child;
}

// --- Chromium over the DevTools protocol ---

/** The id Chromium gives an unpacked extension: its path, hashed, in Chrome's a-p alphabet. */
function unpackedExtensionId(path) {
  return [...createHash("sha256").update(path).digest("hex").slice(0, 32)]
    .map((hex) => String.fromCharCode("a".charCodeAt(0) + parseInt(hex, 16)))
    .join("");
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.listeners = [];
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} ${message.error.data ?? ""}`));
        else resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners) listener(message);
      }
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error(`can't connect to ${url}`)), { once: true });
    });
    return new Cdp(socket);
  }

  send(method, params = {}, sessionId = undefined) {
    const id = ++this.nextId;
    this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  on(listener) {
    this.listeners.push(listener);
  }

  async attach(targetId) {
    const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
    return sessionId;
  }

  /** Evaluate in a session; promises are awaited and the value comes back by value. */
  async evaluate(sessionId, expression) {
    const result = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }
}

/** The text of a console argument: a string, or an object's preview. */
function argumentText(argument) {
  if (argument.value !== undefined) return typeof argument.value === "string" ? argument.value : JSON.stringify(argument.value);
  if (argument.preview) return `{ ${argument.preview.properties.map((p) => `${p.name}: ${p.value}`).join(", ")} }`;
  return argument.description ?? argument.type;
}

class ChromiumDriver {
  constructor(command, ext, profile) {
    this.command = command;
    this.ext = ext;
    this.profile = profile;
    this.consoleLines = [];
  }

  async start() {
    this.process = launch(this.command, [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--remote-debugging-port=0",
      "--remote-allow-origins=*",
      `--user-data-dir=${this.profile}`,
      `--load-extension=${this.ext}`,
      `--disable-extensions-except=${this.ext}`,
      "about:blank",
    ]);
    const portFile = join(this.profile, "DevToolsActivePort");
    const [port, path] = await waitFor(() => {
      if (!existsSync(portFile)) return null;
      const lines = readFileSync(portFile, "utf8").trim().split("\n");
      return lines.length >= 2 ? lines : null;
    }, 30_000, "the browser's DevTools port");
    this.cdp = await Cdp.connect(`ws://127.0.0.1:${port}${path}`);
  }

  /** Settings: the demo's origin is a site, as the popup or the options page would store it. */
  async enableSite() {
    // The browser's own component extensions have service workers too, so webpify's is told
    // apart by its id; if it has gone idle, opening its options page wakes it.
    const id = unpackedExtensionId(this.ext);
    const findWorker = async () => {
      const { targetInfos } = await this.cdp.send("Target.getTargets");
      return targetInfos.find((t) => t.type === "service_worker" && t.url === `chrome-extension://${id}/background.js`);
    };
    let worker = await waitFor(findWorker, 5_000, "webpify's service worker").catch(() => null);
    if (!worker) {
      await this.cdp.send("Target.createTarget", { url: `chrome-extension://${id}/options.html` });
      worker = await waitFor(findWorker, 15_000, "webpify's service worker");
    }
    const background = await this.cdp.attach(worker.targetId);
    await this.cdp.send("Runtime.enable", {}, background);
    // Right after it starts, the worker's extension APIs aren't there yet.
    await waitFor(() => this.cdp.evaluate(background, "typeof chrome === 'object' && typeof chrome.storage === 'object'").catch(() => false), 10_000, "the worker's extension APIs");
    await this.cdp.evaluate(background, `chrome.storage.local.set({ sites: [{ pattern: ${JSON.stringify(SITE)}, selector: ${JSON.stringify(SELECTOR)} }] }).then(() => "ok")`);
    await waitFor(
      () => this.cdp.evaluate(background, "chrome.scripting.getRegisteredContentScripts().then((scripts) => scripts.length > 0)"),
      10_000,
      "the content script's registration",
    );
  }

  async openDemo(url) {
    const { targetId } = await this.cdp.send("Target.createTarget", { url: "about:blank" });
    this.page = await this.cdp.attach(targetId);
    this.cdp.on((message) => {
      if (message.sessionId !== this.page) return;
      let line = null;
      if (message.method === "Runtime.consoleAPICalled") {
        line = `[${message.params.type}] ${message.params.args.map(argumentText).join(" ")}`;
      } else if (message.method === "Log.entryAdded") {
        line = `[${message.params.entry.level}] ${message.params.entry.text}`;
      }
      if (line === null) return;
      this.consoleLines.push(line);
      if (verbose && line.includes("webpify")) console.log(`  ${line}`);
    });
    await this.cdp.send("Runtime.enable", {}, this.page);
    await this.cdp.send("Log.enable", {}, this.page);
    await this.cdp.send("Page.enable", {}, this.page);
    const loaded = new Promise((done) => this.cdp.on((m) => m.sessionId === this.page && m.method === "Page.loadEventFired" && done()));
    await this.cdp.send("Page.navigate", { url }, this.page);
    await loaded;
  }

  evaluate(expression) {
    return this.cdp.evaluate(this.page, expression);
  }

  async pickFiles(paths) {
    const { root: document } = await this.cdp.send("DOM.getDocument", { depth: 1 }, this.page);
    const { nodeId } = await this.cdp.send("DOM.querySelector", { nodeId: document.nodeId, selector: "#video-input" }, this.page);
    await this.cdp.send("DOM.setFileInputFiles", { nodeId, files: paths }, this.page);
  }

  async stop() {
    // Through the protocol first: killing a flatpak launcher leaves the sandboxed browser running.
    await this.cdp?.send("Browser.close").catch(() => {});
    await new Promise((done) => {
      this.process.once("exit", done);
      setTimeout(() => this.process.kill(), 5_000).unref();
    });
  }
}

// --- Firefox over Marionette ---

class Marionette {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.buffer = Buffer.alloc(0);
    socket.on("data", (data) => {
      this.buffer = Buffer.concat([this.buffer, data]);
      for (;;) {
        // "<byte length>:<json>", so the framing is done in bytes, not characters.
        const colon = this.buffer.indexOf(":");
        if (colon < 0) return;
        const length = Number(this.buffer.subarray(0, colon).toString());
        if (this.buffer.length < colon + 1 + length) return;
        const message = JSON.parse(this.buffer.subarray(colon + 1, colon + 1 + length).toString("utf8"));
        this.buffer = this.buffer.subarray(colon + 1 + length);
        if (Array.isArray(message) && message[0] === 1 && this.pending.has(message[1])) {
          const { resolve, reject } = this.pending.get(message[1]);
          this.pending.delete(message[1]);
          if (message[2]) reject(new Error(`${message[2].error}: ${message[2].message}`));
          else resolve(message[3]);
        }
      }
    });
  }

  static async connect(port) {
    const socket = await waitFor(
      () => new Promise((resolve) => {
        const s = connect(port, "127.0.0.1", () => resolve(s));
        s.once("error", () => resolve(null));
      }),
      60_000,
      "Marionette",
      500,
    );
    return new Marionette(socket);
  }

  send(name, params = {}) {
    const id = ++this.nextId;
    const body = JSON.stringify([0, id, name, params]);
    this.socket.write(`${Buffer.byteLength(body)}:${body}`);
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  /** A script in the page; `arguments` are the args, the last one the callback that ends it. */
  async run(script, args = [], chrome = false) {
    if (chrome) await this.send("Marionette:SetContext", { value: "chrome" });
    try {
      const { value } = await this.send("WebDriver:ExecuteAsyncScript", { script, args, scriptTimeout: 120_000 });
      return value;
    } finally {
      if (chrome) await this.send("Marionette:SetContext", { value: "content" });
    }
  }
}

class FirefoxDriver {
  constructor(command, ext, profile) {
    this.command = command;
    this.ext = ext;
    this.profile = profile;
    this.consoleLines = [];
  }

  async start() {
    this.port = await freePort();
    writeFileSync(join(this.profile, "user.js"), [
      `user_pref("marionette.port", ${this.port});`,
      'user_pref("browser.shell.checkDefaultBrowser", false);',
      'user_pref("browser.aboutwelcome.enabled", false);',
      'user_pref("browser.startup.homepage_override.mstone", "ignore");',
      'user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);',
      'user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);',
      'user_pref("extensions.webextensions.restrictedDomains", "");',
      'user_pref("devtools.console.stdout.content", true);', // the pages' console, content scripts included, on stdout
      "",
    ].join("\n"));
    // Installing the add-on and granting its permission need Marionette's chrome context.
    this.process = launch(
      this.command,
      ["--headless", "--no-remote", "--marionette", "--profile", this.profile, "about:blank"],
      { MOZ_REMOTE_ALLOW_SYSTEM_ACCESS: "1" },
      (line) => {
        this.consoleLines.push(line);
        if (verbose && line.includes("webpify")) console.log(`  ${line}`);
      },
    );
    this.marionette = await Marionette.connect(this.port);
    await this.marionette.send("WebDriver:NewSession", { capabilities: { alwaysMatch: {} } });
  }

  async enableSite() {
    // Loaded temporarily, like about:debugging's "Load Temporary Add-on".
    const { value: id } = await this.marionette.send("Addon:Install", { path: this.ext, temporary: true });
    this.id = id;
    // The permission the browser's prompt would store, through the same store the prompt uses;
    // the extension gets permissions.onAdded like it would from the prompt.
    this.optionsUrl = await this.marionette.run(`
      const [id, origin, done] = arguments;
      (async () => {
        const { ExtensionPermissions } = ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
        const policy = WebExtensionPolicy.getByID(id);
        await ExtensionPermissions.add(id, { permissions: [], origins: [origin] }, policy?.extension);
        done(policy.getURL("options.html"));
      })().catch((error) => done("error: " + error));
    `, [id, SITE], true);
    if (String(this.optionsUrl).startsWith("error")) throw new Error(this.optionsUrl);
    // Settings, set from the extension's own options page.
    await this.marionette.send("WebDriver:Navigate", { url: this.optionsUrl });
    const result = await this.marionette.run(`
      const [json, done] = arguments;
      const page = window.wrappedJSObject ?? window; // with or without Xray wrappers, depending on the Firefox version
      page.browser.storage.local.set(page.JSON.parse(json)).then(() => done("ok"), (error) => done("error: " + error));
    `, [JSON.stringify({ sites: [{ pattern: SITE, selector: SELECTOR }] })]);
    if (result !== "ok") throw new Error(result);
    await waitFor(
      () => this.marionette.run(`
        const [id, done] = arguments;
        done(WebExtensionPolicy.getByID(id)?.contentScripts.length > 0);
      `, [id], true),
      10_000,
      "the content script's registration",
    );
  }

  async openDemo(url) {
    await this.marionette.send("WebDriver:Navigate", { url });
  }

  async evaluate(expression) {
    const { value } = await this.marionette.send("WebDriver:ExecuteScript", { script: `return (${expression});` });
    return value;
  }

  async pickFiles(paths) {
    const { value } = await this.marionette.send("WebDriver:FindElement", { using: "css selector", value: "#video-input" });
    const id = Object.values(value)[0];
    await this.marionette.send("WebDriver:ElementSendKeys", { id, text: paths.join("\n") });
  }

  async stop() {
    await this.marionette?.send("Marionette:Quit", { flags: ["eForceQuit"] }).catch(() => {});
    await new Promise((done) => {
      this.process.once("exit", done);
      setTimeout(() => this.process.kill(), 5_000).unref();
    });
  }
}

// --- Run ---

const command = browserCommand();
const firefox = /firefox|zen/i.test([command.cmd, ...command.args].join(" "));
const samples = join(work, "samples");
const ext = join(work, "ext");
const profile = join(work, "profile");
mkdirSync(work, { recursive: true });
makeSamples(samples);
stageExtension(ext, firefox);
rmSync(profile, { recursive: true, force: true });
mkdirSync(profile, { recursive: true });

const server = await serveDemo();
const demoUrl = `http://127.0.0.1:${server.address().port}/`;
console.log(`browser: ${[command.cmd, ...command.args].join(" ")} (${firefox ? "Marionette" : "DevTools protocol"})\ndemo: ${demoUrl}\nwork: ${work}`);
const driver = firefox ? new FirefoxDriver(command, ext, profile) : new ChromiumDriver(command, ext, profile);

try {
  await driver.start();
  await driver.enableSite();
  await driver.openDemo(demoUrl);

  // Pick the samples in section 6, as a person would.
  const started = Date.now();
  await driver.pickFiles(samplesToRun.map((s) => join(samples, s.name)));
  console.log(`picked ${samplesToRun.length} videos, converting…`);

  // The page lists what it received once content.js re-fires the change event.
  const received = await waitFor(async () => {
    const rows = await driver.evaluate(`document.querySelectorAll("#video-output tbody tr").length`);
    if (rows < samplesToRun.length) return null;
    return driver.evaluate(`[...document.querySelector("#video-input").files].map((f) => ({ name: f.name, type: f.type, size: f.size }))`);
  }, 15 * 60_000, "the converted files", 2000);
  console.log(`done in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  await waitFor(() => driver.evaluate(`[...document.querySelectorAll("#video-output video")].every((v) => v.readyState >= 1)`), 15_000, "the previews' metadata").catch(() => {});
  const dimensions = await driver.evaluate(`[...document.querySelectorAll("#video-output tbody tr")].map((tr) => tr.cells[4].textContent)`);

  const lines = driver.consoleLines.filter((l) => l.includes("webpify"));
  console.log(lines.length ? "\nwebpify's console lines:" : "\n(no webpify console lines)");
  for (const line of lines) console.log(`  ${line}`);
  console.log("");

  // The converted files themselves, read back out of the input and looked at with ffprobe.
  const out = join(work, "out");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const probed = [];
  for (const [i, sample] of samplesToRun.entries()) {
    const got = received[i];
    if (got.name === sample.name && got.size === statSync(join(samples, sample.name)).size) {
      probed.push(null); // unchanged
      continue;
    }
    const base64 = await driver.evaluate(`document.querySelector("#video-input").files[${i}].arrayBuffer().then((buffer) => new Uint8Array(buffer).toBase64())`);
    const bytes = Buffer.from(base64, "base64");
    const path = join(out, got.name);
    writeFileSync(path, bytes);
    const probe = JSON.parse(
      execFileSync("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,avg_frame_rate,bit_rate", "-of", "json", path], { encoding: "utf8" }),
    );
    const video = probe.streams.find((s) => s.codec_type === "video");
    const audio = probe.streams.find((s) => s.codec_type === "audio");
    // A full decode: a broken bitstream or decoder configuration (Firefox's encoder has had both)
    // shows up here as errors, and as fewer frames than the file claims.
    let decodeErrors = "";
    try {
      execFileSync("ffmpeg", ["-v", "error", "-xerror", "-i", path, "-f", "null", "-"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      decodeErrors = String(error.stderr ?? error.message).trim().split("\n")[0];
    }
    // Fast start: the index (moov) comes before the media (mdat), both in the first part of the file.
    const head = bytes.subarray(0, 256 * 1024).toString("latin1");
    const moov = head.indexOf("moov");
    const mdat = head.indexOf("mdat");
    probed.push({
      video: video ? `${video.codec_name} ${video.width}x${video.height} ${video.avg_frame_rate} fps` : "no video",
      audio: audio ? audio.codec_name : "no audio",
      fastStart: moov >= 0 && (mdat < 0 || moov < mdat),
      decodeErrors,
      fps: video ? eval(video.avg_frame_rate) : 0,
      videoCodec: video?.codec_name,
      audioCodec: audio?.codec_name,
    });
  }

  // What came back, against what the converter should have decided.
  for (const [i, sample] of samplesToRun.entries()) {
    const original = statSync(join(samples, sample.name)).size;
    const got = received[i];
    const label = `${sample.name} (${sample.why}): ${got.name}, ${got.type}, ${mb(original)} → ${mb(got.size)}, ${dimensions[i] || "no preview"}`;
    const base = sample.name.replace(/\.[^.]*$/, "");
    const unchanged = got.name === sample.name && got.size === original;
    const file = probed[i];
    const details = file ? ` [${file.video}, ${file.audio}, ${file.fastStart ? "fast start" : "index at the end"}${file.decodeErrors ? `, decode error: ${file.decodeErrors}` : ", decodes"}]` : "";
    // An MP4 with H.264 video that decodes, the index at the front, and the sound still there.
    const isMp4 = got.name === `${base}.mp4` && got.type === "video/mp4" && file?.videoCodec === "h264" && file.fastStart && !file.decodeErrors && Boolean(file.audioCodec);
    if (sample.expect === "transcode") {
      const fine = isMp4 && got.size < original * 0.8 && file.fps <= 30.5 && (dimensions[i] || "").startsWith(sample.name.includes("1080") ? "1920 × 1080" : "1280 × 720");
      check(label + details, fine && (sample.name.includes("vp9") ? file.audioCodec === "opus" : file.audioCodec === "aac"));
    } else if (sample.expect === "unchanged") {
      check(label, unchanged);
    } else if (sample.expect === "remux") {
      check(label + details, isMp4 && file.audioCodec === "aac" && Math.abs(got.size - original) < original * 0.15);
    } else if (sample.expect === "hevc") {
      // Kept without a HEVC decoder (headless browsers, Firefox, Linux without VA-API); converted with one.
      check(`${label}${details} [${unchanged ? "kept: no HEVC decoder here" : "converted: HEVC decoded"}]`, unchanged || (isMp4 && got.size < original));
    }
  }
} catch (error) {
  failures++;
  console.error(`FAIL ${error.message}`);
  const relevant = driver.consoleLines.filter((l) => l.includes("webpify") || l.startsWith("[error]"));
  if (relevant.length) console.error("console:\n  " + relevant.join("\n  "));
  const errors = driver.process?.errors?.trim();
  if (errors) console.error("browser stderr (tail):\n" + errors.split("\n").slice(-15).join("\n"));
} finally {
  await driver.stop();
  server.close();
  if (!keep) rmSync(work, { recursive: true, force: true });
  else console.log(`kept ${work}`);
}
process.exit(failures === 0 ? 0 : 1);
