# Public release: Chrome Web Store and addons.mozilla.org

webpify is shared internally through GitHub Releases (see [RELEASING.md](../RELEASING.md)). This page covers putting it in the browser stores, so BID employees and clients can install it with one click and get updates automatically.

## Plan

| Browser | Channel | Why |
|---|---|---|
| Chrome, Edge, Brave | Chrome Web Store, **Unlisted** | Anyone with the link can install it (employees and clients), it doesn't show up in search, and updates install automatically. "Private" would limit it to one Google Workspace domain or a list of accounts, which leaves clients out. Edge users can install from the Chrome Web Store link too. |
| Firefox, Zen | addons.mozilla.org, **listed** | AMO has no link-only option: an add-on is either listed (public, searchable) or self-distributed. Listed gives one-click installs and automatic updates from AMO, with no update feed of our own. |

## Before the first store submission

- **Licence.** The extension is AGPL-3.0-only because of zenwebp, so the source has to be available to everyone who gets it. The release workflow attaches the source zip to every release; also link the repository from the store listing. If the AGPL ever becomes a problem: zenwebp 0.1.0–0.2.1 were MIT/Apache (an older, slower encoder), or Imazen sells a commercial licence.
- **Listing text.** [CHROMEWEBSTORE.md](../CHROMEWEBSTORE.md) has the description, single purpose, permission justifications and data-use answers, ready to paste.
- **Privacy policy.** [PRIVACY.md](../PRIVACY.md). Its GitHub URL (`https://github.com/bidgrupa/webpify/blob/main/PRIVACY.md`) works as the policy link (the repository is public).
- **Graphics.** Three 1280×800 screenshots and the 440×280 promo tile are in `store/chrome/`; `node store/chrome/src/render.mjs` renders them again after a UI change.
- **Accounts.** Both should be owned by BID, not a person:
  - Chrome Web Store developer account (one-time $5) with colleagues added as members and a monitored contact email.
  - addons.mozilla.org account, the same one whose API keys sign the Firefox builds.

## Chrome Web Store

The first version goes in by hand. After that, the release workflow's `chrome-web-store` job submits every tagged release ([scripts/chrome-web-store.mjs](../scripts/chrome-web-store.mjs)), and Chrome updates installed copies within hours of Google approving it. Everything to paste is in [CHROMEWEBSTORE.md](../CHROMEWEBSTORE.md).

### 1. Prepare (once)

1. **Google account.** A BID-owned Google account, not a personal one, with 2-Step Verification on. Publishing requires it.
2. **Developer registration.** Open the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), accept the developer agreement and pay the one-time $5 fee.
3. **Publisher settings** in the dashboard:
   - Publisher name, e.g. BID grupa. It's shown on the listing.
   - Contact email: a team address someone reads. Verify it.
   - Trader declaration (EU rules): see "Developer info" in CHROMEWEBSTORE.md.
   - Members: add colleagues, so the item doesn't depend on one account.
4. **Demo page for reviewers.** In the GitHub repository, **Settings → Pages → Build and deployment → Source: GitHub Actions**. Then run the **Demo page** workflow from the Actions tab and check that <https://bidgrupa.github.io/webpify/> opens.
5. **Package.** Make a release (RELEASING.md) and download its `webpify-chrome-<v>.zip`. The package requires Chrome 148 (`minimum_chrome_version`), the first Chrome that passes files to the converter.

### 2. First submission (by hand)

1. Dashboard → **Add new item** → upload the zip. Write down the item's 32-letter **item ID**.
2. **Store listing** tab: the description, category and language from CHROMEWEBSTORE.md. Graphics: the store icon `extension/icons/icon-128.png`, the screenshots `store/chrome/screenshot-1…3` in that order, and the small promo tile `store/chrome/promo-small.png`. Under additional fields, the homepage and support URLs.
3. **Privacy** tab: the single purpose, a justification for each permission and for the host permission, remote code "No", no data-use boxes ticked, the three certifications ticked, and the privacy policy URL.
4. **Distribution** tab: free, visibility **Unlisted**, all regions.
5. **Test instructions** tab: paste the instructions from CHROMEWEBSTORE.md.
6. **Submit for review.** Leave automatic publishing after review on, or turn it off to publish by hand. Reviews take a few days, longer for a broad optional host permission like `*://*/*`. Google emails the contact address.
7. **Once it's published**, the listing is at `https://chromewebstore.google.com/detail/<item ID>`:
   - Put the link in INSTALL.md and in the release notes in `.github/workflows/release.yml`.
   - People with a "Load unpacked" copy remove it and install from the link. They add their sites again, because the store copy has a different extension ID.
   - Edge and Brave users can install from the same link.

### 3. Updates on every release (once)

1. **Google Cloud project.** In the [Google Cloud console](https://console.cloud.google.com/), create a project (e.g. `webpify-publishing`), then **APIs & Services → Library → Chrome Web Store API → Enable**.
2. **Service account.** **IAM & Admin → Service accounts → Create service account** (e.g. `chrome-web-store`), with no roles. On its **Keys** tab, **Add key → Create new key → JSON**. The file downloads once.
3. **Let it publish.** In the Developer Dashboard's **Account** section, add the service account's email. A publisher can have one.
4. **IDs.** The publisher ID is under **Settings** in the dashboard; the item ID is from step 2.1.
5. **GitHub.** Repository **Settings → Secrets and variables → Actions**:
   - Secret `CWS_SERVICE_ACCOUNT`: the whole JSON key file. Delete the downloaded file afterwards.
   - Variables `CWS_PUBLISHER_ID` and `CWS_ITEM_ID`.
   - Optional variable `CWS_PUBLISH_TYPE` = `STAGED_PUBLISH`: approved versions then wait until someone publishes them in the dashboard.

From the next tag on, the job uploads the release's Chrome zip and submits it for review. It's skipped while `CWS_ITEM_ID` isn't set. Things to know:
- **Versions only go up.** The store refuses a package whose version isn't higher than the last one uploaded; the usual release bump takes care of it.
- **A newer release replaces one still in review.** The job cancels the older submission and submits the new version, which contains everything.
- **A staged version blocks the job.** Publish or cancel it in the dashboard, then re-run the job. Re-running for a version that's already submitted or published does nothing.
- **Visibility changes** made in the dashboard need one manual publish before the API can publish again.
- **New permissions.** A permission that shows a warning disables webpify for existing users until they accept it. Optional host permissions don't.

## addons.mozilla.org

Like the Chrome Web Store: the first version goes in by hand, then the release workflow submits every tagged release (the "Submit to addons.mozilla.org" step), and Firefox updates installed copies from AMO within a day of approval. Everything to paste is in [FIREFOXADDONS.md](../FIREFOXADDONS.md).

### 1. Prepare (once)

1. **Mozilla account.** A BID-owned account at <https://addons.mozilla.org> (Log in creates a Mozilla account), not a personal one. Turn on two-step authentication in the account settings; AMO requires it to submit add-ons.
2. **Developer profile.** On AMO, **Tools → Submit a New Add-on** asks you to accept the developer agreement and set a display name, e.g. BID grupa. It's shown on the listing.
3. **Files.** The Firefox package without `update_url`: `dist/webpify-firefox-<v>-unsigned.xpi` from `node scripts/package.mjs firefox` (the Firefox packages attached to releases up to 0.3.1 still have it). And the source zip of the same version from GitHub Releases, `webpify-source-<v>.zip`.

### 2. First submission (by hand)

1. <https://addons.mozilla.org/developers/addon/submit/distribution> → **On this site** → upload the package. Compatibility: Firefox only. Validation shows one warning about Firefox for Android; it doesn't apply.
2. **Source code:** Yes → upload the source zip.
3. **Describe add-on:** name, summary, description, category, support email and website, licence (AGPL-3.0-only), privacy policy, and the notes to reviewer, all from FIREFOXADDONS.md. The add-on ID `webpify@bid.agency` is tied to this account from now on.
4. **Submit.** Listed versions usually pass the automatic review and are public within hours; some are picked for a human review first, which can take days. AMO emails the account.
5. **Edit Product Page:** the three screenshots with their captions, and the homepage.
6. **Once it's public** (`https://addons.mozilla.org/firefox/addon/webpify/`):
   - Point INSTALL.md's Firefox and Zen sections at the listing, and the release notes in `.github/workflows/release.yml`.
   - People with a temporary or unsigned copy install from the listing. It's the same add-on ID, so Zen users who installed the unsigned file keep their settings.

### 3. Updates on every release (once)

1. **API keys.** On AMO, **Tools → Manage API Keys** → generate credentials.
2. **GitHub.** Repository **Settings → Secrets and variables → Actions** → secrets `AMO_JWT_ISSUER` (the JWT issuer) and `AMO_JWT_SECRET` (the JWT secret).

From the next tag on, the workflow submits the version as listed, with the source zip, the release commit's message body as release notes, and [store/firefox/approval-notes.txt](../store/firefox/approval-notes.txt) for the reviewers. It doesn't wait for the review. Things to know:
- **Each version number once.** AMO refuses a version number it has seen, even a rejected one. Fixing a release means a new version.
- **Reviewers rebuild the source.** The approval notes and the README's "Building from source" give the steps, on x86_64 Ubuntu 24.04. Their default machine is ARM64, which builds a `.wasm` that works the same but isn't byte-identical, so both say to use x86_64.

## Reproducible build

Mozilla's reviewers must get byte-identical output from the source zip. This is already set up:
- `rust-toolchain.toml` pins Rust 1.93.1.
- `Cargo.lock` is committed, and the build uses `--locked`.
- `build.sh` maps local paths away with `--remap-path-prefix`.
- The wasm-bindgen CLI is pinned to 0.2.129.

Checked for v0.3.1: the `.wasm` in the GitHub release is byte-identical to a local build, and rebuilding from the release's source zip in a fresh folder (build.sh, then package.mjs) gives a Firefox package identical to the one submitted to AMO. ARM64 doesn't reproduce it: Cargo's hash of each crate includes its proc macros, which are built for the build machine, and those hashes decide the order of functions in the `.wasm`. Changing only how the proc macros are built changes the `.wasm` at the same byte as the ARM64 build did, and stable Cargo has no setting to avoid it, so x86_64 is required. The reviewer steps are in the README under "Building from source".
