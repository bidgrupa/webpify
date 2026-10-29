# Mac App Store listing: webpify

> Last updated: 2026-10-29
>
> Everything App Store Connect asks for, ready to paste, page by page. The steps around it are in
> [docs/public-release.md](docs/public-release.md#mac-app-store-safari). Not submitted yet.

## New app (Apps → + → New App)

- **Platforms:** macOS
- **Name:** webpify. Shown on the App Store, at most 30 characters, and unique on the store (free as of 2026-10-29).
- **Primary language:** English (U.K.), matching the British spelling of the text below.
- **Bundle ID:** `agency.bid.webpify`. The extension inside it is `agency.bid.webpify.Extension`. Xcode registers both the first time it signs the project.
- **SKU:** `webpify`. Never shown to users.
- **User access:** Full Access.

## App Information

- **Subtitle:** Smaller images before upload (28 characters; the limit is 30)
- **Category:** Productivity. Secondary: Graphics & Design.
- **Content rights:** No, it does not contain, show, or access third-party content.
- **Age rating:** answer every question with None or No. The rating comes out 4+.
- **Digital Services Act:** trader, set once for the whole account (docs/public-release.md, "Prepare").

## Pricing and Availability

- **Price:** Free.
- **Availability:** all countries and regions.
- **Distribution:** Public until Apple approves the unlisted request below, then Unlisted App.

## App Privacy

- **Privacy Policy URL:** `https://github.com/bidgrupa/webpify/blob/main/PRIVACY.md`. Check that the link opens before submitting.
- **Data collection:** "No, we do not collect data from this app." For Apple, collecting means sending data off the device. webpify converts images on the Mac and never sends them anywhere, and its settings stay in Safari's extension storage on the Mac.

## Version page (macOS App → the version number)

**Screenshots** (1 to 10, at 16:10: 1280×800, 1440×900, 2560×1600 or 2880×1800)

| Screenshot | Status | File |
|---|---|---|
| 1 | ✅ Usable | `store/chrome/screenshot-1-convert.png` |
| 2 | ✅ Usable | `store/chrome/screenshot-2-popup.png` |
| 3 | ✅ Usable | `store/chrome/screenshot-3-settings.png` |

The Chrome Web Store screenshots are 1280×800 and show a generic browser window, so they work here too. Their toolbar has a puzzle-piece extensions button, which Safari doesn't have; a render with Safari's toolbar would look more at home (optional, `store/chrome/src/`).

**Promotional text** (can be changed without a new version; 147 characters, the limit is 170)

```
Pick or drop photos as you always do. webpify converts them to WebP on your Mac, right before they upload, and the site receives the smaller files.
```

**Description**

```
webpify makes the images you upload smaller by converting them to WebP the moment you pick them, before the website receives them. It's a Safari extension: this app installs it, and you turn it on in Safari's settings.

Choose the sites where it should work. On those sites, images you select with an upload button or drag onto an upload area are converted automatically, and the site uploads the smaller WebP files instead of the originals. It works with standard file upload fields and with common drag-and-drop upload areas.

Settings let you pick the quality, a maximum width and height for large photos, and lossless conversion. Screenshots, logos and other graphics are kept sharp automatically. If a WebP would come out larger than the original, the original is kept. Photos keep their colour profile, so colours stay true, and location and camera details are removed. A small notice at the bottom of the page shows how many images were converted and how much space was saved.

How to use it:
1. Open the webpify app once and click "Quit and Open Safari Settings…". In Safari's Extensions settings, tick webpify.
2. Open the site where you upload images, click the webpify button in Safari's toolbar and turn on "Convert uploads on this site". Allow access when Safari asks.
3. Upload images as usual. To upload one image unchanged, pause webpify for 10 minutes from the same button.

Privacy: images are converted on your Mac and are never sent anywhere by the extension. It has no analytics and makes no network requests of its own. It can only see the sites you add, and only after you allow it.

Source code and support: https://github.com/bidgrupa/webpify
```

**Keywords** (91 characters; the limit is 100)

```
webp,image,photo,compress,convert,upload,jpeg,png,resize,optimize,smaller,shrink,cms,safari
```

- **Support URL:** `https://github.com/bidgrupa/webpify/issues`
- **Marketing URL:** `https://github.com/bidgrupa/webpify`
- **Copyright:** ⬜ `2026 BID grupa`, with BID's legal name.
- **What's New in This Version** (from the second version on): the release commit's message body, as for addons.mozilla.org.

## App Review Information

- **Sign-in required:** No.
- **Contact:** ⬜ name, phone and email of someone at BID who can answer the reviewer.
- **Notes** (paste as plain text):

```
No account is needed. webpify does nothing until it is turned on for a site, so please follow these steps:

1. Open the webpify app and click "Quit and Open Safari Settings…". In Safari's Extensions settings, tick webpify.
2. In Safari, open the test page https://bidgrupa.github.io/webpify/ (several kinds of image upload fields).
3. Click the webpify button in Safari's toolbar, turn on "Convert uploads on this site", and allow access when Safari asks. Only that one site is requested.
4. In section 1 ("Plain input"), choose one or more JPEG or PNG photos. The page lists the files it received: .webp files of type image/webp, smaller than the originals. A notice at the bottom of the page shows the savings.
5. Section 4 only accepts JPEG and PNG, so webpify leaves those files unchanged on purpose.
6. Settings (quality, maximum size, the site list) are under "Open settings" in the same popup.

Site access: the extension lists all sites as an optional permission because the user can choose any site, but nothing is granted at install. It asks Safari for access to one site at a time, when the user turns it on there, and the user can revoke it in Safari's settings.

The converter is WebAssembly compiled from the Rust source in https://github.com/bidgrupa/webpify (src/). Images are converted on the Mac and never sent anywhere by the extension.

webpify is intended for unlisted distribution: it is used by BID grupa's employees and clients, and we will request unlisted distribution after submitting.
```

## Build

- **Export compliance:** the project sets `ITSAppUsesNonExemptEncryption` to NO, so App Store Connect doesn't ask. If it does ask for a build: "None of the algorithms mentioned above". webpify uses no encryption of its own.

## Unlisted app request

File it right after submitting a version for review, at <https://developer.apple.com/contact/request/unlisted-app/>. For the description of the app and its audience:

```
webpify is a Safari extension made by BID grupa for its employees and the clients whose websites BID builds. It converts images to WebP before they are uploaded to those sites' content management systems. It isn't meant for the general public, so we'd like it to be available by direct link only. It is distributed the same way, unlisted, on the Chrome Web Store.
```

## Version history

| Version | Date | Changes | Status |
|---|---|---|---|
| The first release after 0.3.1 | | First Mac App Store version: runs in Safari 26 and later. | Not submitted |

## Review notes

### Known limitations
- Paste uploads, uploads through the browser's newer file-picker API, and inputs inside closed shadow roots aren't converted; those files pass through unchanged.
- Animated GIFs, HEIC photos and folders pass through unchanged.

### Rejection history
None yet.
