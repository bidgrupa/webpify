// Release packages, built from extension/ after build.sh. Run through release.sh or the
// GitHub release workflow:
//   node scripts/package.mjs [chrome] [firefox] [source] [updates]   (default: first three)
//
//   chrome   dist/webpify-chrome-<v>.zip              unzip and "Load unpacked" (Chrome, Edge,
//                                                     Brave), or upload to the Chrome Web Store
//   firefox  dist/firefox/                            folder for `web-ext sign` (Mozilla signing)
//            dist/webpify-firefox-<v>-unsigned.xpi    installs permanently in Zen; temporary
//                                                     in regular Firefox
//   source   dist/webpify-source-<v>.zip              the AGPL source, and what Mozilla rebuilds
//   updates  dist/updates.json                        update manifest for the signed
//                                                     webpify-firefox-<v>.xpi on GitHub Releases
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
const geckoId = manifest.browser_specific_settings.gecko.id;

const signedXpiName = `webpify-firefox-${version}.xpi`;

function fail(message) {
  console.error(`package: ${message}`);
  process.exit(1);
}

function run(command, args, cwd = root) {
  return execFileSync(command, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

const targets = process.argv.slice(2);
const known = ["chrome", "firefox", "source", "updates"];
for (const target of targets) if (!known.includes(target)) fail(`unknown target "${target}" (use ${known.join(", ")})`);
const wanted = (target) => (targets.length === 0 ? target !== "updates" : targets.includes(target));

// One version number per release: Cargo.toml has to agree with the manifest.
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(readFileSync(join(root, "Cargo.toml"), "utf8"))?.[1];
if (cargoVersion !== version) {
  fail(`version mismatch: extension/manifest.json has ${version}, Cargo.toml has ${cargoVersion}`);
}

/** "owner/name" of the GitHub repo hosting releases. */
function githubRepo() {
  const fromEnv = process.env.WEBPIFY_GITHUB_REPO || process.env.GITHUB_REPOSITORY;
  if (fromEnv) return fromEnv;
  try {
    const url = run("git", ["remote", "get-url", "origin"]);
    return /github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url)?.[1] ?? null;
  } catch {
    return null;
  }
}
const repo = githubRepo();

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
  const stage = stageExtension("chrome", m);
  const zip = zipFolder(stage, join(dist, `webpify-chrome-${version}.zip`));
  rmSync(stage, { recursive: true, force: true });
  return [zip];
}

function packFirefox() {
  const m = structuredClone(manifest);
  delete m.background.service_worker;
  delete m.message_serialization;
  if (repo) {
    // Signed installs check this for updates; it always points at the newest release.
    m.browser_specific_settings.gecko.update_url = `https://github.com/${repo}/releases/latest/download/updates.json`;
  } else {
    console.warn("package: no GitHub repo known (WEBPIFY_GITHUB_REPO, GITHUB_REPOSITORY or an origin remote); no update_url");
  }
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

function writeUpdates() {
  if (!repo) fail("updates.json needs the GitHub repo (WEBPIFY_GITHUB_REPO or GITHUB_REPOSITORY)");
  const updates = {
    addons: {
      [geckoId]: {
        updates: [{ version, update_link: `https://github.com/${repo}/releases/download/v${version}/${signedXpiName}` }],
      },
    },
  };
  const file = join(dist, "updates.json");
  writeFileSync(file, `${JSON.stringify(updates, null, 2)}\n`);
  return [file];
}

mkdirSync(dist, { recursive: true });
const outputs = [
  ...(wanted("chrome") ? packChrome() : []),
  ...(wanted("firefox") ? packFirefox() : []),
  ...(wanted("source") ? packSource() : []),
  ...(wanted("updates") ? writeUpdates() : []),
];

console.log(`webpify ${version}${repo ? ` (github.com/${repo})` : ""}`);
for (const file of outputs) console.log(`  ${file.slice(root.length)}`);
