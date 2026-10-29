# Public release: Chrome Web Store, addons.mozilla.org and the Mac App Store

webpify is shared internally through GitHub Releases (see [RELEASING.md](../RELEASING.md)). This page covers putting it in the browser stores, so BID employees and clients can install it with one click and get updates automatically.

## Plan

| Browser | Channel | Why |
|---|---|---|
| Chrome, Edge, Brave | Chrome Web Store, **Unlisted** | Anyone with the link can install it (employees and clients), it doesn't show up in search, and updates install automatically. "Private" would limit it to one Google Workspace domain or a list of accounts, which leaves clients out. Edge users can install from the Chrome Web Store link too. |
| Firefox, Zen | addons.mozilla.org, **listed** | AMO has no link-only option: an add-on is either listed (public, searchable) or self-distributed. Listed gives one-click installs and automatic updates from AMO, with no update feed of our own. |
| Safari (Mac) | Mac App Store, **Unlisted** | Safari only installs extensions that come inside a signed Mac app. Unlisted works like the Chrome Web Store's: only people with the link find it, and the App Store installs updates. Apple grants it on request, once a version has been submitted for review; until then the app would be public. |

## Before the first store submission

- **Licence.** The extension is AGPL-3.0-only because of zenwebp, so the source has to be available to everyone who gets it. The release workflow attaches the source zip to every release; also link the repository from the store listing. If the AGPL ever becomes a problem: zenwebp 0.1.0–0.2.1 were MIT/Apache (an older, slower encoder), or Imazen sells a commercial licence.
  - **Mac App Store:** the App Store's terms are widely considered incompatible with the GPL family, the AGPL included, and BID doesn't hold zenwebp's copyright, so it can't grant an exception itself. Before the first App Store submission, get Imazen's written permission or their commercial licence, or a lawyer's OK.
- **Listing text.** [CHROMEWEBSTORE.md](../CHROMEWEBSTORE.md) has the description, single purpose, permission justifications and data-use answers, ready to paste. [FIREFOXADDONS.md](../FIREFOXADDONS.md) and [APPSTORE.md](../APPSTORE.md) do the same for the other two stores.
- **Privacy policy.** [PRIVACY.md](../PRIVACY.md). Its GitHub URL (`https://github.com/bidgrupa/webpify/blob/main/PRIVACY.md`) works as the policy link (the repository is public).
- **Graphics.** Three 1280×800 screenshots and the 440×280 promo tile are in `store/chrome/`; `node store/chrome/src/render.mjs` renders them again after a UI change.
- **Accounts.** All should be owned by BID, not a person:
  - Chrome Web Store developer account (one-time $5) with colleagues added as members and a monitored contact email.
  - addons.mozilla.org account, the same one whose API keys sign the Firefox builds.
  - Apple Developer Program membership as an organisation ($99 a year), see [Mac App Store](#mac-app-store-safari).

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

## Mac App Store (Safari)

Safari only installs extensions that come inside a Mac app, so webpify ships as a small app whose window tells people to turn the extension on in Safari's settings. Xcode builds that app around `dist/safari/` (from `node scripts/package.mjs safari`), Apple's cloud signing signs it, and it goes to App Store Connect, through TestFlight and then App Review. Everything to paste is in [APPSTORE.md](../APPSTORE.md).

Unlike the other two stores, every version is built and uploaded by hand on a Mac. Not tried end to end yet: the extension itself is tested in Safari 27, and the project steps below in Xcode 27.1, but nothing has been signed or uploaded.

### 1. Prepare (once)

1. **Licence.** Clear the App Store question in "Before the first store submission" above first.
2. **Apple Account.** A BID-owned Apple Account, not a personal one, with two-factor authentication on.
3. **Apple Developer Program.** Enrol at <https://developer.apple.com/programs/enroll/> as an **organisation**. Apple asks for:
   - BID's legal entity name and its D-U-N-S number. Apple looks the number up; getting a new one can take up to two weeks.
   - A website on BID's own domain.
   - Someone with the authority to sign legal agreements for BID.

   It costs $99 a year. The person who enrols becomes the Account Holder.
4. **Team.** In [App Store Connect](https://appstoreconnect.apple.com/) → **Users and Access**, add the colleagues who will build releases as **Admin**. Admins can sign with the team's cloud-managed distribution certificates; with a lower role, uploads fail until an Admin grants that access.
5. **Trader status** (Digital Services Act; Account Holder or Admin). **Business → Agreements → Compliance → Digital Services Act → Complete Compliance Requirements** → "This is a trader account". The address comes from the D-U-N-S record; add a phone number and email, both verified with codes, and upload a document showing BID's name and address. The details are shown on the App Store page in EU countries, and without verified trader status the app isn't offered there. The free-apps agreement is part of the program; a free app needs no other agreement, tax or bank details.
6. **Xcode.** On the Mac that builds releases: Xcode 26 or later from the Mac App Store. Accept its licence once with `sudo xcodebuild -license`. Then **Xcode → Settings → Accounts → +** and sign in with an Apple Account that's an Admin in BID's team.

### 2. The Xcode project (once)

1. **Generate it** from the Safari package, inside the repository:
   ```bash
   ./build.sh && node scripts/package.mjs safari
   xcrun safari-web-extension-packager dist/safari --project-location safari --app-name webpify \
     --bundle-identifier agency.bid.webpify --swift --macos-only --no-open --no-prompt
   ```
   The project in `safari/webpify/` points at the files in `dist/safari/` (relative paths, no copies), so every build packs whatever `package.mjs safari` made last. The packager warns that Safari doesn't support `type` and `open_in_tab`. Ignore both: the background does run as a module in Safari (tested), and `open_in_tab` only changes how the settings page opens.
2. **Open** `safari/webpify/webpify.xcodeproj`. There are two targets, **webpify** (the app) and **webpify Extension**. Change these settings (some on both targets):
   - **Signing & Capabilities**, both targets: Team = BID, "Automatically manage signing" on. Xcode registers the App IDs `agency.bid.webpify` and `agency.bid.webpify.Extension`. Leave App Sandbox on; the Mac App Store requires it.
   - **General → Identity**, both targets: **Version** = the manifest version (the packager puts 1.0), **Build** = 1. Keep both targets the same; App Store Connect flags an extension whose version differs from its app's.
   - **General → Minimum Deployments**, both targets: macOS 14.0. Safari 26, the oldest Safari webpify runs in, needs macOS 14 Sonoma; older Macs can't use the extension.
   - **General → App Category**, webpify target: Productivity. Uploads to the Mac App Store are refused without one.
   - **Info**, webpify target: add `ITSAppUsesNonExemptEncryption` (Boolean) = NO, so App Store Connect doesn't ask about encryption for every build. Optionally set `NSHumanReadableCopyright` to the copyright line from APPSTORE.md.
   - **App icon**, webpify target: the packager enlarges the 128 px manifest icon to 1024 px, which looks blurry on the App Store. Make a proper one in Icon Composer (**Xcode → Open Developer Tool → Icon Composer**): ink `#1d1c2c` background, `assets/mark.svg` in orange `#ffa173`. Then use it in place of the generated `AppIcon` in `Assets.xcassets`.
3. **Check it.** Choose the **webpify** scheme and **My Mac**, then **Product → Run**. The app opens and says the extension is off. Turn webpify on in Safari's settings and convert a few images on the demo page. A copy loaded with "Add Temporary Extension" should be removed first.
4. **Commit** `safari/`, and add `xcuserdata/` (Xcode's per-user state) to `.gitignore`.

### 3. App record (once)

1. App Store Connect → **Apps → + → New App**, with the platform, name, language, bundle ID and SKU from APPSTORE.md. The bundle ID appears in the list once Xcode has registered it (step 2.2).
2. Fill in **App Information**, **Pricing and Availability** and **App Privacy** from APPSTORE.md.

### 4. Build and upload (every version)

1. On the release commit (RELEASING.md), run `./build.sh && node scripts/package.mjs safari`.
2. In Xcode, both targets: Version = the new manifest version, Build = one more than the last upload. App Store Connect refuses a build number it has seen for that version.
3. Destination **Any Mac**, then **Product → Archive**. The Organizer window opens with the archive.
4. **Distribute App → App Store Connect → Distribute.** Xcode signs the app with the team's cloud-managed Apple Distribution and Mac Installer Distribution certificates, checks it and uploads it. App Store Connect emails when the build has been processed, usually within half an hour.

### 5. TestFlight (every version)

1. App Store Connect → webpify → **TestFlight**. The processed build is listed under macOS.
2. **Internal testing:** add BID colleagues who are App Store Connect users (up to 100) to an internal group. They install the TestFlight app from the Mac App Store and get the build right away, without a review. Clients can be added to an external group, which needs a Beta App Review first.
3. Install it, turn it on in Safari's settings, and run through the demo page and a real upload before submitting. TestFlight builds expire after 90 days.

### 6. First submission (by hand)

1. App Store Connect → webpify → the macOS version: screenshots, promotional text, description, keywords, URLs and copyright from APPSTORE.md.
2. **Build:** select the build tested in TestFlight.
3. **App Review Information:** the contact and notes from APPSTORE.md. The notes say the app is meant for unlisted distribution.
4. **App Store Version Release:** manual, so nothing is public before the unlisted request is answered.
5. **Add for Review → Submit for Review.** Reviews usually take a day or two. Apple emails the Account Holder and the review contact.
6. **Unlisted request:** right after submitting, send <https://developer.apple.com/contact/request/unlisted-app/> with the text from APPSTORE.md. Once approved, Pricing and Availability shows "Unlisted App", which then applies to every later version. Apple's page doesn't name platforms, but the program covered Mac apps when it launched.
7. **Release** the approved version once it's unlisted. App Store Connect then shows the link, `https://apps.apple.com/app/webpify/id<number>`:
   - Add a Safari section to INSTALL.md: open the link → **Get** → open webpify once → **Quit and Open Safari Settings…** → tick webpify → [choose your sites](../INSTALL.md#choose-your-sites).
   - Add the link to the release notes in `.github/workflows/release.yml`, as for the other stores.

### 7. Updates on every release

1. Build, upload and test the new version (sections 4 and 5).
2. App Store Connect → webpify → **+** next to macOS App → the new version number. Fill in **What's New** (the release commit's message body) and select the build.
3. Submit for review, then release it. The App Store updates installed copies automatically.

Things to know:
- **Version numbers only go up.** Every App Store version needs a higher Version than the last, and every upload a new Build.
- **Registered content scripts don't survive an update in Safari.** background.js registers them again on `runtime.onInstalled`, which also runs after an update, so sites keep working.
- **Settings survive updates.** They're tied to the extension's bundle ID, `agency.bid.webpify.Extension`, which must never change.

### Without a Mac: App Store Connect's packager

App Store Connect can build and sign the app itself: **Users and Access → Xcode Cloud → Safari Web Extension Packager → Upload**, with `dist/webpify-safari-<v>.zip` (from `node scripts/package.mjs safari`). The build then appears in TestFlight, and everything from section 5 on is the same. Packaging uses Xcode Cloud time; membership includes 25 hours a month.

Not tried yet. It most likely makes the same default app as the command-line packager in section 2, so check three things in TestFlight before relying on it: the version (the command-line packager puts 1.0), the app icon (enlarged from 128 px) and the app category. It also leaves no project to adjust. The Xcode route above avoids all of that, so use this route only when no Mac is available.

## Reproducible build

Mozilla's reviewers must get byte-identical output from the source zip. This is already set up:
- `rust-toolchain.toml` pins Rust 1.93.1.
- `Cargo.lock` is committed, and the build uses `--locked`.
- `build.sh` maps local paths away with `--remap-path-prefix`.
- The wasm-bindgen CLI is pinned to 0.2.129.

Checked for v0.3.1: the `.wasm` in the GitHub release is byte-identical to a local build, and rebuilding from the release's source zip in a fresh folder (build.sh, then package.mjs) gives a Firefox package identical to the one submitted to AMO. ARM64 doesn't reproduce it: Cargo's hash of each crate includes its proc macros, which are built for the build machine, and those hashes decide the order of functions in the `.wasm`. Changing only how the proc macros are built changes the `.wasm` at the same byte as the ARM64 build did, and stable Cargo has no setting to avoid it, so x86_64 is required. The reviewer steps are in the README under "Building from source".
