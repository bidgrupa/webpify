// Release packages, built from extension/ after build.sh. Run through release.sh or the
// GitHub release workflow:
//   node scripts/package.mjs [chrome] [firefox] [source]   (default: all three)
//
//   chrome   dist/webpify-chrome-<v>.zip              unzip and "Load unpacked" (Chrome, Edge,
//                                                     Brave), or upload to the Chrome Web Store
//   firefox  dist/firefox/                            folder for `web-ext sign` (addons.mozilla.org)
//            dist/webpify-firefox-<v>-unsigned.xpi    the same, zipped: upload it to addons.mozilla.org,
//                                                     or install it unsigned in Zen
//   source   dist/webpify-source-<v>.zip              the AGPL source, and what Mozilla rebuilds
//
// extension/manifest.json serves both browsers during development; each package gets a
// manifest with only its own browser's keys.
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const manifest = JSON.parse(readFileSync(join(root, "extension/manifest.json"), "utf8"));
const { version } = manifest;

function fail(message) {
  console.error(`package: ${message}`);
  process.exit(1);
}

function run(command, args, cwd = root) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const targets = process.argv.slice(2);
const known = ["chrome", "firefox", "source"];
for (const target of targets) if (!known.includes(target)) fail(`unknown target "${target}" (use ${known.join(", ")})`);
const wanted = (target) => targets.length === 0 || targets.includes(target);

// One version number per release: Cargo.toml has to agree with the manifest.
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(join(root, "Cargo.toml"), "utf8"))?.[1];
if (cargoVersion !== version) {
  fail(`version mismatch: extension/manifest.json has ${version}, Cargo.toml has ${cargoVersion}`);
}

function stageExtension(folder, browserManifest) {
  if (!existsSync(join(root, "extension/pkg/webpify_bg.wasm"))) fail("extension/pkg is missing; run ./build.sh");
  const stage = join(dist, folder);
  rmSync(stage, { recursive: true, force: true });
  cpSync(join(root, "extension"), stage, { recursive: true, filter: (src) => !/\/\.[^/]+$/.test(src) });
  writeFileSync(join(stage, "manifest.json"), `${JSON.stringify(browserManifest, null, 2)}\n`);
  return stage;
}

/** Zip a folder's contents (not the folder itself), so unzipping gives the extension's files. */
function zipFolder(folder, file) {
  rmSync(file, { force: true });
  run("zip", ["-q", "-r", "-X", file, "."], folder);
  return file;
}

function packChrome() {
  const m = structuredClone(manifest);
  delete m.browser_specific_settings;
  delete m.background.scripts;
  // Files only cross messaging from Chrome 148 ("message_serialization"); older versions would
  // install it and silently convert nothing. The Chrome Web Store doesn't offer it to them.
  m.minimum_chrome_version = "148";
  const stage = stageExtension("chrome", m);
  const zip = zipFolder(stage, join(dist, `webpify-chrome-${version}.zip`));
  rmSync(stage, { recursive: true, force: true });
  return [zip];
}

function packFirefox() {
  const m = structuredClone(manifest);
  delete m.background.service_worker;
  delete m.message_serialization;
  // No update_url: addons.mozilla.org refuses it on listed add-ons, which it updates itself.
  const stage = stageExtension("firefox", m); // kept: web-ext sign takes a folder
  return [stage, zipFolder(stage, join(dist, `webpify-firefox-${version}-unsigned.xpi`))];
}

function packSource() {
  const zip = join(dist, `webpify-source-${version}.zip`);
  rmSync(zip, { force: true });
  let inGit = false;
  try {
    inGit = run("git", ["rev-parse", "--is-inside-work-tree"]) === "true";
  } catch {}
  if (inGit) {
    if (run("git", ["status", "--porcelain"]) !== "") {
      console.warn("package: uncommitted changes are NOT in the source zip (it is built from HEAD)");
    }
    run("git", ["archive", "--format=zip", `--prefix=webpify-${version}/`, "-o", zip, "HEAD"]);
  } else {
    console.warn("package: not a git repository; zipping the working tree instead");
    run("zip", ["-q", "-r", "-X", zip, ".", "-x", "target/*", "dist/*", "extension/pkg/*", ".git/*",
      "web-ext-artifacts/*", "node_modules/*"]);
  }
  return [zip];
}

mkdirSync(dist, { recursive: true });
const outputs = [
  ...(wanted("chrome") ? packChrome() : []),
  ...(wanted("firefox") ? packFirefox() : []),
  ...(wanted("source") ? packSource() : []),
];

console.log(`webpify ${version}`);
for (const file of outputs) console.log(`  ${file.slice(root.length)}`);
