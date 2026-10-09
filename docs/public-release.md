# Public release: Chrome Web Store and addons.mozilla.org

Kept for later. webpify is currently shared internally through GitHub Releases (see [RELEASING.md](../RELEASING.md)). This page covers putting it in the browser stores, so BID employees and clients can install it with one click and get updates automatically.

## Plan

| Browser | Channel | Why |
|---|---|---|
| Chrome, Edge, Brave | Chrome Web Store, **Unlisted** | Anyone with the link can install it (employees and clients), it doesn't show up in search, and updates install automatically. "Private" would limit it to one Google Workspace domain or a list of accounts, which leaves clients out. Edge users can install from the Chrome Web Store link too. |
| Firefox, Zen | Mozilla-signed `.xpi` on GitHub Releases ("unlisted" on addons.mozilla.org) | Already supported by the release workflow once the `AMO_JWT_*` secrets are set (see RELEASING.md). A public listing on addons.mozilla.org is optional. |

## Before the first store submission

- **Licence.** The extension is AGPL-3.0-only because of zenwebp, so the source has to be available to everyone who gets it. The release workflow attaches the source zip to every release; also link the repository from the store listing. If the AGPL ever becomes a problem: zenwebp 0.1.0–0.2.1 were MIT/Apache (an older, slower encoder), or Imazen sells a commercial licence.
- **Listing text.** [CHROMEWEBSTORE.md](../CHROMEWEBSTORE.md) has the description, single purpose, permission justifications and data-use answers, ready to paste.
- **Privacy policy.** [PRIVACY.md](../PRIVACY.md). Its GitHub URL (`https://github.com/bidgrupa/webpify/blob/main/PRIVACY.md`) works as the policy link (the repository is public).
- **Screenshots.** At least one at 1280×800 (see CHROMEWEBSTORE.md for what to show).
- **Accounts.** Both should be owned by BID, not a person:
  - Chrome Web Store developer account (one-time $5; a group publisher is best) with a monitored contact email.
  - addons.mozilla.org account, the same one whose API keys sign the Firefox builds.

## Chrome Web Store

1. Make a normal release (RELEASING.md). Its `webpify-chrome-<v>.zip` is the package to upload; it contains only Chrome's manifest keys.
2. In the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole), click **New item** and upload the zip.
3. Fill in the listing, privacy and permission justification tabs from CHROMEWEBSTORE.md. Set **Visibility** to **Unlisted**.
4. Submit for review. Reviews of a broad optional host permission (`*://*/*`) can take a few days. The justification in CHROMEWEBSTORE.md explains that access is requested one site at a time.
5. For later versions, upload the new release's chrome zip under **Package** and submit. The version must be higher each time.

Once it's published:
- **Switching people over.** People can uninstall their "Load unpacked" copy and install from the store link. Their settings don't carry over, because the store version has a different extension ID.
- **INSTALL.md.** Update the Chrome section to point at the store link.

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

Building from a second checkout gave an identical `.wasm`. The reviewer steps are in the README under "Building from source".
