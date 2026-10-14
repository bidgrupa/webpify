// Renders the Chrome Web Store screenshots (1280×800) and the small promo tile (440×280) into
// store/chrome/. Run after ./build.sh, since the screenshots use the real converter:
//   node store/chrome/src/render.mjs
//
// Each screenshot is shot.html: a caption over a browser window showing a page. The pages are
// webpify's own (popup, settings) and a sample site (cms.html), with stub.js standing in for
// the extension APIs. The photos are drawn here, and picking them in the sample site runs the
// real content.js, background.js and .wasm, so the WebP sizes and the notice are genuine.
//
// Needs Chrome or Chromium 137 or later (WebAssembly exnref): set CHROME to its path, or it
// uses Playwright's cached Chromium or one on the PATH.
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const out = fileURLToPath(new URL("..", import.meta.url));

// --- Sample photos: made-up landscapes, 12 MP like a phone's, with grain -------

const PHOTOS = [
  {
    name: "IMG_2041.jpg",
    sky: ["#f2b99a", "#ffd6b5", "#fbeee0"],
    sun: { x: 0.68, y: 0.5, r: 0.032, rgb: [255, 238, 214] },
    layers: [
      { colors: ["#b48676", "#93685c"], base: 0.56, amp: 0.05, jagged: false },
      { water: true, colors: ["#efc3a6", "#a77566"], base: 0.6 },
      { colors: ["#5e4038", "#3c2723"], base: 0.86, amp: 0.05, jagged: false },
    ],
  },
  {
    name: "IMG_2057.jpg",
    sky: ["#28274a", "#6c4a70", "#f39b74"],
    sun: { x: 0.3, y: 0.58, r: 0.03, rgb: [255, 196, 150] },
    layers: [
      { colors: ["#4a3d63", "#3a3152"], base: 0.5, amp: 0.16, jagged: true },
      { colors: ["#2d2645", "#241f38"], base: 0.64, amp: 0.09, jagged: true },
      { colors: ["#1c1829", "#120f1b"], base: 0.8, amp: 0.05, jagged: false },
    ],
  },
  {
    name: "IMG_2063.jpg",
    sky: ["#5b9bd6", "#a6cdef", "#e9f4fb"],
    sun: { x: 0.82, y: 0.17, r: 0.028, rgb: [255, 255, 244] },
    layers: [
      { colors: ["#8aa7b8", "#7593a5"], base: 0.52, amp: 0.08, jagged: true },
      { colors: ["#4d7d5b", "#3c6548"], base: 0.6, amp: 0.04, jagged: false },
      { water: true, colors: ["#6c9cbc", "#2c5068"], base: 0.64 },
      { colors: ["#2f4a33", "#1f3322"], base: 0.9, amp: 0.03, jagged: false },
    ],
  },
  {
    name: "IMG_2088.jpg",
    sky: ["#f0c38a", "#f8dbb2", "#fff2e0"],
    sun: { x: 0.22, y: 0.33, r: 0.04, rgb: [255, 249, 232] },
    layers: [
      { colors: ["#e3a86c", "#cc8a4e"], base: 0.6, amp: 0.05, jagged: false },
      { colors: ["#d18c50", "#a96634"], base: 0.72, amp: 0.06, jagged: false },
      { colors: ["#b9713b", "#874b21"], base: 0.86, amp: 0.05, jagged: false },
    ],
  },
];

/** Runs in the browser: draws each photo on a canvas and returns it as base64 JPEG. */
async function drawPhotos(photos) {
  const width = 4032;
  const height = 3024;
  const results = [];
  let seed = 20261014;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  for (const photo of photos) {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    const vertical = (top, bottom, colors) => {
      const gradient = ctx.createLinearGradient(0, top, 0, bottom);
      colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color));
      return gradient;
    };

    ctx.fillStyle = vertical(0, height * 0.66, photo.sky);
    ctx.fillRect(0, 0, width, height);
    // Soft clouds.
    for (let i = 0; i < 140; i++) {
      ctx.fillStyle = `rgba(255, 255, 255, ${0.02 + rand() * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(rand() * width, rand() * height * 0.45, 80 + rand() * 520, 18 + rand() * 70, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const { x, y, r, rgb } = photo.sun;
    const [sx, sy, sr] = [x * width, y * height, r * width];
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr * 9);
    glow.addColorStop(0, `rgba(${rgb}, 0.95)`);
    glow.addColorStop(0.12, `rgba(${rgb}, 0.55)`);
    glow.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();

    for (const layer of photo.layers) {
      const top = layer.base * height;
      if (layer.water) {
        ctx.fillStyle = vertical(top, height, layer.colors);
        ctx.fillRect(0, top, width, height - top);
        // Ripples, finer towards the horizon.
        for (let i = 0; i < 26000; i++) {
          const depth = rand();
          ctx.fillStyle = rand() < 0.5 ? `rgba(255, 255, 255, ${0.04 + rand() * 0.08})` : `rgba(0, 0, 0, ${0.04 + rand() * 0.08})`;
          ctx.fillRect(rand() * width, top + depth * (height - top), (10 + rand() * 90) * (0.3 + depth), 1 + depth * 4);
        }
        // The sun's reflection: short bright strokes, sparser further down.
        ctx.fillStyle = `rgba(${rgb}, 0.5)`;
        for (let i = 0; i < 260; i++) {
          const depth = rand() ** 1.6;
          const w = sr * (0.4 + rand() * 2.2) * (1 - depth * 0.6);
          ctx.fillRect(sx - w / 2 + (rand() - 0.5) * sr * 2.5 * (1 + depth), top + depth * (height - top), w, 3 + rand() * 6);
        }
        continue;
      }
      const waves = Array.from({ length: 5 }, (_, i) => ({ f: (i + 1) * (1 + rand()), p: rand() * Math.PI * 2, a: 1 / (i + 1) }));
      const total = waves.reduce((sum, w) => sum + w.a, 0);
      const ridge = new Path2D();
      ridge.moveTo(0, height);
      for (let px = 0; px <= width; px += 8) {
        let v = 0;
        for (const w of waves) {
          const s = Math.sin((px / width) * Math.PI * 2 * w.f + w.p);
          v += w.a * (layer.jagged ? 1 - 2 * Math.abs(s) : s);
        }
        ridge.lineTo(px, top - (v / total) * layer.amp * height);
      }
      ridge.lineTo(width, height);
      ridge.closePath();
      ctx.fillStyle = vertical(top - layer.amp * height, height, layer.colors);
      ctx.fill(ridge);
      // Rock, grass and shrubs: small light and dark marks inside the ridge.
      ctx.save();
      ctx.clip(ridge);
      for (let i = 0; i < 70000; i++) {
        ctx.fillStyle = rand() < 0.5 ? `rgba(255, 255, 255, ${0.03 + rand() * 0.07})` : `rgba(0, 0, 0, ${0.05 + rand() * 0.1})`;
        const y = top - layer.amp * height + rand() * (height - top + layer.amp * height);
        ctx.fillRect(rand() * width, y, 2 + rand() * 6, 3 + rand() * 14);
      }
      ctx.restore();
    }

    const vignette = ctx.createRadialGradient(width / 2, height / 2, height * 0.45, width / 2, height / 2, width * 0.75);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, 0.28)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    // Sensor grain, so the JPEG is as big as a real photo's.
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      const n = (rand() - 0.5) * 18;
      data[i] += n;
      data[i + 1] += n;
      data[i + 2] += n;
    }
    ctx.putImageData(image, 0, 0);

    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    results.push({ name: photo.name, base64: btoa(binary) });
  }
  return results;
}

// --- A static server for the repository, with stub.js put into extension pages -------

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".wasm": "application/wasm", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

const server = createServer((request, response) => {
  const path = normalize(decodeURIComponent(new URL(request.url, "http://x").pathname));
  const file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || path.endsWith("/")) {
    response.writeHead(404).end();
    return;
  }
  let body = readFileSync(file);
  if (path.startsWith("/extension/") && path.endsWith(".html")) {
    body = body.toString().replace("<head>", '<head>\n    <script src="/store/chrome/src/stub.js"></script>');
  }
  response.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" }).end(body);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

// --- Chromium over the DevTools protocol ------------------------------------------

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const cache = join(homedir(), ".cache/ms-playwright");
  if (existsSync(cache)) {
    for (const dir of readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()) {
      const binary = join(cache, dir, "chrome-linux64/chrome");
      if (existsSync(binary)) return binary;
    }
  }
  for (const name of ["chromium", "chromium-browser", "google-chrome"]) {
    try {
      return execFileSync("which", [name], { encoding: "utf8" }).trim();
    } catch {}
  }
  throw new Error("no Chrome or Chromium found; set CHROME");
}

const profile = mkdtempSync(join(tmpdir(), "webpify-shots-"));
const chrome = spawn(findChrome(), [
  "--headless", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
  "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });
const endpoint = await new Promise((resolve, reject) => {
  let log = "";
  chrome.stderr.on("data", (chunk) => {
    log += chunk;
    const match = /DevTools listening on (ws:\/\/\S+)/.exec(log);
    if (match) resolve(match[1]);
  });
  chrome.on("exit", () => reject(new Error(`Chromium exited:\n${log}`)));
});

const socket = new WebSocket(endpoint);
await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
let nextId = 0;
const pending = new Map();
const waiters = [];
socket.addEventListener("message", ({ data }) => {
  const message = JSON.parse(data);
  if (message.id !== undefined) {
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
    return;
  }
  if (message.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(message.params.type)) {
    console.warn(`  page: ${message.params.args.map((arg) => arg.value ?? arg.description).join(" ")}`);
  } else if (message.method === "Runtime.exceptionThrown") {
    console.warn(`  page: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`);
  }
  for (const waiter of waiters.filter((w) => w.method === message.method && w.sessionId === message.sessionId)) {
    waiters.splice(waiters.indexOf(waiter), 1);
    waiter.resolve(message.params);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
const once = (method, sessionId) => new Promise((resolve) => waiters.push({ method, sessionId, resolve }));

async function openPage(width, height) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId); // page warnings and errors are printed
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sessionId);
  const page = {
    async goto(path) {
      const loaded = once("Page.loadEventFired", sessionId);
      await send("Page.navigate", { url: `${origin}${path}` }, sessionId);
      await loaded;
    },
    async evaluate(expression, { byValue = true } = {}) {
      const { result, exceptionDetails } = await send("Runtime.evaluate",
        { expression, awaitPromise: true, returnByValue: byValue }, sessionId);
      if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
      return byValue ? result.value : result;
    },
    async pickFiles(expression, files) {
      const { objectId } = await page.evaluate(expression, { byValue: false });
      await send("DOM.setFileInputFiles", { files, objectId }, sessionId);
    },
    async capture(name) {
      const { data } = await send("Page.captureScreenshot", { format: "png" }, sessionId);
      writeFileSync(join(out, name), Buffer.from(data, "base64"));
      console.log(`  store/chrome/${name}`);
    },
  };
  return page;
}

// --- The images ------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const photosDir = mkdtempSync(join(tmpdir(), "webpify-photos-"));
try {
  const drawer = await openPage(800, 600);
  await drawer.goto("/store/chrome/src/promo.html");
  const photos = await drawer.evaluate(`(${drawPhotos})(${JSON.stringify(PHOTOS)})`);
  const photoFiles = photos.map(({ name, base64 }) => {
    const file = join(photosDir, name);
    writeFileSync(file, Buffer.from(base64, "base64"));
    return file;
  });
  const megabytes = photoFiles.reduce((sum, file) => sum + readFileSync(file).length, 0) / 1e6;
  console.log(`sample photos: ${photos.length}, ${megabytes.toFixed(1)} MB of JPEG`);

  for (const shot of [1, 2, 3]) {
    const page = await openPage(1280, 800);
    await page.goto(`/store/chrome/src/shot.html?shot=${shot}`);
    await page.evaluate("window.pageReady");
    if (shot !== 3) {
      await page.pickFiles(`document.getElementById("page").contentDocument.querySelector('input[type="file"]')`, photoFiles);
      const cards = await page.evaluate(`window.uploadsShown(${photoFiles.length})`);
      if (shot === 1) console.log(`the sample site received: ${cards.join("; ")}`);
      // Shot 1 catches the notice once it has slid in; shot 2 waits until it has gone (3.5 s).
      await sleep(shot === 1 ? 400 : 4200);
    }
    await page.capture(`screenshot-${shot}-${["convert", "popup", "settings"][shot - 1]}.png`);
  }

  const promo = await openPage(440, 280);
  await promo.goto("/store/chrome/src/promo.html");
  await promo.capture("promo-small.png");
} finally {
  socket.close();
  chrome.kill();
  server.close();
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
  rmSync(photosDir, { recursive: true, force: true });
}
