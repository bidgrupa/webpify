# Public release: Chrome Web Store and addons.mozilla.org

webpify is shared internally through GitHub Releases (see [RELEASING.md](../RELEASING.md)). This page covers putting it in the browser stores, so BID employees and clients can install it with one click and get updates automatically.

## Plan

| Browser | Channel | Why |
|---|---|---|
| Chrome, Edge, Brave | Chrome Web Store, **Unlisted** | Anyone with the link can install it (employees and clients), it doesn't show up in search, and updates install automatically. "Private" would limit it to one Google Workspace domain or a list of accounts, which leaves clients out. Edge users can install from the Chrome Web Store link too. |
| Firefox, Zen | Mozilla-signed `.xpi` on GitHub Releases ("unlisted" on addons.mozilla.org) | Already supported by the release workflow once the `AMO_JWT_*` secrets are set (see RELEASING.md). A public listing on addons.mozilla.org is optional. |

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

Unlisted signing is already automated (RELEASING.md, "Mozilla signing"). A **public listing** on addons.mozilla.org needs:
1. `web-ext sign --channel=listed` with an `--amo-metadata` JSON file (name, summary, categories, licence). Required for the first listed version.
2. **No `update_url`:** listed add-ons get updates from addons.mozilla.org, so `scripts/package.mjs` would have to drop `update_url` for listed builds.
3. **Source code with every version** (`--upload-source-code`, as the workflow already does). Reviewers rebuild it and compare. By default they build on ARM64 Ubuntu 24.04; our reproducible build was only checked on x86_64.

## Reproducible build

Mozilla's reviewers must get byte-identical output from the source zip. This is already set up:
- `rust-toolchain.toml` pins Rust 1.93.1.
- `Cargo.lock` is committed, and the build uses `--locked`.
- `build.sh` maps local paths away with `--remap-path-prefix`.
- The wasm-bindgen CLI is pinned to 0.2.129.

GitHub's release build of v0.1.0 matched a local build except for one string: zenwebp embeds `GITHUB_SHA` when it's set. `build.sh` clears that variable since v0.1.0, so from the next release on, CI, local and reviewer builds should be byte-identical. Check this on the first release you submit to Mozilla. The reviewer steps are in the README under "Building from source".
