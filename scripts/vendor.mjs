// Vendors mediabunny, the video reader/writer the content script uses, into extension/vendor/.
//   node scripts/vendor.mjs          fetch the release pinned in package.json and write the files
//   node scripts/vendor.mjs --check  verify the committed files are that release, byte for byte
//
// The file is the published `mediabunny.cjs` bundle, unmodified but named .js (the only extension
// scripting.executeScript injects): loaded as a classic script it defines a global `Mediabunny`,
// which is what a content script can use (they can't be ES modules).
// addons.mozilla.org only allows unmodified release files of third-party libraries, and its
// reviewers compare them with the published package, so nothing may be edited here; the release
// workflow runs --check. No node_modules are needed: the tarball comes straight from the registry,
// verified against the integrity hash the registry publishes for it.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const root = new URL("..", import.meta.url);
const check = process.argv.includes("--check");
const version = JSON.parse(readFileSync(new URL("package.json", root), "utf8")).dependencies.mediabunny;
if (!/^\d+\.\d+\.\d+$/.test(version)) fail(`package.json must pin an exact mediabunny version, not "${version}"`);

// What to take from the package and where to put it.
const FILES = {
  "package/dist/bundles/mediabunny.cjs": "extension/vendor/mediabunny.js", // .js: scripting.executeScript takes no other extension
  "package/LICENSE": "extension/vendor/mediabunny.LICENSE",
};

function fail(message) {
  console.error(`vendor: ${message}`);
  process.exit(1);
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function fetchBytes(url) {
  const response = await fetch(url);
  if (!response.ok) fail(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** The files of a (gzipped) npm tarball, by path. */
function untar(gzipped) {
  const tar = gunzipSync(gzipped);
  const files = new Map();
  const text = (from, length) => new TextDecoder().decode(tar.subarray(from, from + length)).replace(/\0.*$/s, "");
  let at = 0;
  while (at + 512 <= tar.length) {
    const name = text(at, 100);
    if (!name) break; // end-of-archive blocks
    const prefix = text(at + 345, 155); // ustar: a long path is split into prefix/name
    const size = parseInt(text(at + 124, 12), 8);
    const type = text(at + 156, 1);
    const path = prefix ? `${prefix}/${name}` : name;
    if (type === "" || type === "0") files.set(path, tar.subarray(at + 512, at + 512 + size));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

const meta = await (await fetch(`https://registry.npmjs.org/mediabunny/${version}`)).json();
if (!meta.dist?.tarball) fail(`mediabunny ${version} isn't on the npm registry`);
const tarball = await fetchBytes(meta.dist.tarball);
const [algorithm, expected] = meta.dist.integrity.split("-");
const actual = createHash(algorithm).update(tarball).digest("base64");
if (actual !== expected) fail(`the tarball's ${algorithm} hash doesn't match the registry's`);

const files = untar(tarball);
let differences = 0;
for (const [source, destination] of Object.entries(FILES)) {
  const bytes = files.get(source);
  if (!bytes) fail(`${source} isn't in the ${version} tarball`);
  const target = new URL(destination, root);
  if (check) {
    const current = existsSync(target) ? readFileSync(target) : null;
    const same = current !== null && Buffer.compare(current, Buffer.from(bytes)) === 0;
    console.log(`${same ? "ok  " : "FAIL"} ${destination} ${same ? "matches" : "differs from"} mediabunny ${version} (sha256 ${sha256(bytes)})`);
    if (!same) differences++;
  } else {
    mkdirSync(new URL(".", target), { recursive: true });
    writeFileSync(target, bytes);
    console.log(`wrote ${destination} from mediabunny ${version} (${bytes.length} bytes, sha256 ${sha256(bytes)})`);
  }
}
if (differences > 0) fail("re-run without --check to restore the release files");
