// Smoke test for the built WASM module, run in Node (no browser needed):
//   ./build.sh && node --experimental-wasm-exnref tests/wasm-smoke.mjs [image ...]
// (wasm-bindgen 0.2.129 emits exnref exception handling; browsers support it,
// Node 24 still needs the flag.)
// Converts each image, prints size and time, then checks that the module
// recovers after a Rust panic (the same path the background script relies on).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import init, { convertToWebp, debugPanic, ensureReady } from "../extension/pkg/webpify.js";

const wasmPath = fileURLToPath(new URL("../extension/pkg/webpify_bg.wasm", import.meta.url));
await init({ module_or_path: readFileSync(wasmPath) });

const QUALITY = 80;
const MAX_DIMENSION = 2560;
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;

function convert(bytes) {
  ensureReady();
  return convertToWebp(bytes, QUALITY, MAX_DIMENSION, false);
}

function isWebp(bytes) {
  const tag = (from) => String.fromCharCode(...bytes.subarray(from, from + 4));
  return tag(0) === "RIFF" && tag(8) === "WEBP";
}

let failures = 0;
function check(label, ok) {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures++;
}

const images = process.argv.slice(2);
for (const path of images) {
  const input = readFileSync(path);
  const start = performance.now();
  const out = convert(input);
  const ms = (performance.now() - start).toFixed(0);
  check(`${path}: ${kb(input.length)} -> ${kb(out.length)} in ${ms} ms`, isWebp(out));
}

// Errors from Rust arrive as JS Errors with a readable message.
try {
  convert(new TextEncoder().encode("not an image"));
  check("garbage input throws", false);
} catch (e) {
  check(`garbage input throws: ${e.message}`, e.message.includes("decode") || e.message.includes("read"));
}

// After a panic the instance is dead; ensureReady() must rebuild it.
try {
  debugPanic();
} catch {
  // expected: the panic surfaces as a WebAssembly RuntimeError
}
const sample = images.length > 0 ? readFileSync(images[0]) : null;
if (sample) {
  try {
    check("converts again after a panic", isWebp(convert(sample)));
  } catch (e) {
    check(`converts again after a panic (${e.message})`, false);
  }
}

process.exit(failures === 0 ? 0 : 1);
