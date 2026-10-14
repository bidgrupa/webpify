// Uploads a Chrome package to the Chrome Web Store and submits it for review, through the
// Chrome Web Store API v2 and a service account. Run by the release workflow after a tag:
//   node scripts/chrome-web-store.mjs dist/webpify-chrome-<v>.zip
//
// Environment (see docs/public-release.md for where each value comes from):
//   CWS_SERVICE_ACCOUNT  the service account's JSON key, the whole file
//   CWS_PUBLISHER_ID     Developer Dashboard → Settings → Publisher ID
//   CWS_ITEM_ID          the item's 32-letter ID, also the last part of its store URL
//   CWS_PUBLISH_TYPE     optional. STAGED_PUBLISH keeps an approved version back until someone
//                        publishes it in the dashboard; the default publishes it on approval.
//
// The API can't create items: the first version is submitted by hand in the dashboard.
// Running it again for a version that is already in review or published does nothing.
import { createSign } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://chromewebstore.googleapis.com";
const SCOPE = "https://www.googleapis.com/auth/chromewebstore";

const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(readFileSync(join(root, "extension/manifest.json"), "utf8"));

function fail(message) {
  console.error(`chrome-web-store: ${message}`);
  process.exit(1);
}

const [zip] = process.argv.slice(2);
if (!zip) fail("usage: node scripts/chrome-web-store.mjs <package.zip>");
for (const name of ["CWS_SERVICE_ACCOUNT", "CWS_PUBLISHER_ID", "CWS_ITEM_ID"]) {
  if (!process.env[name]) fail(`${name} is not set`);
}
const item = `publishers/${process.env.CWS_PUBLISHER_ID}/items/${process.env.CWS_ITEM_ID}`;
const publishType = process.env.CWS_PUBLISH_TYPE || "DEFAULT_PUBLISH";

/** An access token for the service account: Google's signed-JWT flow, no client library needed. */
async function accessToken() {
  let key;
  try {
    key = JSON.parse(process.env.CWS_SERVICE_ACCOUNT);
  } catch {
    fail("CWS_SERVICE_ACCOUNT isn't JSON; paste the whole key file");
  }
  const now = Math.floor(Date.now() / 1000);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const claims = { iss: key.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 };
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode(claims)}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key).toString("base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail(`no access token: ${body.error_description ?? body.error ?? response.status}`);
  return body.access_token;
}

const token = await accessToken();

async function call(method, path, { body, type } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  if (type) headers["Content-Type"] = type;
  const response = await fetch(`${API}${path}`, { method, headers, body });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  if (!response.ok) fail(`${method} ${path}: ${response.status} ${data?.error?.message ?? text}`);
  return data ?? {};
}

const status = () => call("GET", `/v2/${item}:fetchStatus`);
const versionsOf = (revision) => (revision?.distributionChannels ?? []).map((channel) => channel.crxVersion);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Where the item stands ---------------------------------------------------

let current = await status();
if (current.takenDown) fail("the item was taken down for a policy violation; see the Developer Dashboard");
if (current.warned) console.warn("chrome-web-store: the item has a policy warning; see the Developer Dashboard");

const published = current.publishedItemRevisionStatus;
const submitted = current.submittedItemRevisionStatus;
if (versionsOf(published).includes(version)) {
  console.log(`webpify ${version} is already published.`);
  process.exit(0);
}
if (submitted && versionsOf(submitted).includes(version) && ["PENDING_REVIEW", "STAGED"].includes(submitted.state)) {
  console.log(`webpify ${version} is already submitted (${submitted.state}).`);
  process.exit(0);
}
if (submitted?.state === "PENDING_REVIEW") {
  // Nothing new can be uploaded while an older version waits for review. This one includes
  // everything in it, so it takes its place in the queue.
  console.log(`Cancelling the review of ${versionsOf(submitted).join(", ")}, which ${version} replaces.`);
  await call("POST", `/v2/${item}:cancelSubmission`);
} else if (submitted?.state === "STAGED") {
  fail(`${versionsOf(submitted).join(", ")} is approved and staged. Publish or cancel it in the Developer Dashboard first.`);
}

// --- Upload ------------------------------------------------------------------

let upload = await call("POST", `/upload/v2/${item}:upload`, { body: readFileSync(zip), type: "application/zip" });
for (let waited = 0; /IN_PROGRESS$/.test(upload.uploadState ?? ""); waited += 5) {
  if (waited >= 300) fail("the upload was still being processed after 5 minutes");
  await sleep(5000);
  current = await status();
  upload = { ...upload, uploadState: current.lastAsyncUploadState };
}
if (upload.uploadState !== "SUCCEEDED") fail(`upload ${upload.uploadState ?? "failed"}`);
if (upload.crxVersion && upload.crxVersion !== version) {
  fail(`the package is version ${upload.crxVersion}, extension/manifest.json says ${version}`);
}
console.log(`Uploaded ${zip} (version ${version}).`);

// --- Submit ------------------------------------------------------------------

const result = await call("POST", `/v2/${item}:publish`, {
  body: JSON.stringify({ publishType }),
  type: "application/json",
});
for (const warning of result.warningInfo?.warnings ?? []) {
  console.warn(`chrome-web-store: warning ${warning.reason}: ${warning.description}`);
}
console.log(`Submitted webpify ${version} for review (${result.state ?? "state unknown"}, ${publishType}).`);
