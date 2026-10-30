# Chrome Web Store listing: webpify

> Last updated: 2026-10-14
>
> Everything the Chrome Developer Dashboard asks for, ready to paste, tab by tab. The steps
> around it are in [docs/public-release.md](docs/public-release.md#chrome-web-store).

## Store listing

**Extension name** and **summary** come from the package's manifest and can't be edited in the dashboard:
- webpify
- Converts images to WebP and videos to MP4 right before you upload them, on sites you choose. (92 characters; the limit is 132)

**Detailed description**
(The dashboard strips markdown. Paste as plain text with blank lines between paragraphs.)

```
webpify makes the images you upload smaller by converting them to WebP the moment you pick them, before the website receives them.

Choose the sites where it should work. On those sites, images you select with an upload button or drag onto an upload area are converted automatically, and the site uploads the smaller WebP files instead of the originals. It works with standard file upload fields and with common drag-and-drop upload areas.

Videos are converted too, to MP4 (H.264) with your browser's own encoder, scaled to 1080p and 30 frames per second at most, with the sound kept as it is. A video that is already a compact MP4 is left alone. The notice shows the progress, with a Cancel link, and videos your browser can't read are uploaded unchanged.

Settings let you pick the quality, a maximum width and height for large photos, and lossless conversion. Screenshots, logos and other graphics are kept sharp automatically. If a WebP would come out larger than the original, the original is kept. Photos keep their colour profile, so colours stay true, and location and camera details are removed. A small notice at the bottom of the page shows how many images were converted and how much space was saved.

How to use it:
1. Open the site where you upload images and click the webpify icon.
2. Turn on "Convert uploads on this site" and allow access when your browser asks.
3. Upload images as usual. To upload one image unchanged, pause webpify for 10 minutes from the same icon.

Privacy: images are converted on your device and are never sent anywhere by the extension. It has no analytics and makes no network requests of its own. It can only see the sites you add, and only after you allow it.

Source code and support: https://github.com/bidgrupa/webpify
```

**Category**
Productivity › Tools

**Single purpose** (Privacy tab)

```
webpify converts images to the WebP format, and videos to the MP4 format, right before the user uploads them, on websites the user has chosen. When the user picks or drops JPEG, PNG or BMP images, or MP4, MOV, WebM or MKV videos, in an upload field on one of those sites, webpify converts them on the device and hands the smaller files to the site's own upload. Every other part of the extension serves this purpose: the toolbar popup turns conversion on or off for the current site and can pause it for 10 minutes, and the settings page sets the quality, the maximum size and the list of sites.
```

**Primary language**
English

## Graphics and assets

| Asset | Dimensions | Status | File |
|---|---|---|---|
| Store icon (required) | 128×128 PNG, 96×96 artwork | ✅ Ready | `extension/icons/icon-128.png` |
| Screenshot 1 (at least one required) | 1280×800 | ✅ Ready | `store/chrome/screenshot-1-convert.png` |
| Screenshot 2 | 1280×800 | ✅ Ready | `store/chrome/screenshot-2-popup.png` |
| Screenshot 3 | 1280×800 | ✅ Ready | `store/chrome/screenshot-3-settings.png` |
| Small promo tile (required) | 440×280 | ✅ Ready | `store/chrome/promo-small.png` |
| Marquee promo tile | 1400×560 | ⬜ Optional, only needed to be featured | |
| YouTube video | | ⬜ Optional | |

Upload the screenshots in that order. `node store/chrome/src/render.mjs` renders them again after a UI change (run `./build.sh` first). They show webpify's real popup and settings page, and real conversions of four sample photos on a made-up upload page (`store/chrome/src/`).

## Permissions justification

| Permission | Type | Justification |
|---|---|---|
| `storage` | permissions | Saves the user's settings on the device: conversion quality, maximum size, the lossless and keep-original options, and the list of sites with their upload field selectors. |
| `scripting` | permissions | Registers the upload-handling script only on the sites the user turns on, so it never runs on any other page, and starts it on the open tab when the user turns a site on from the toolbar. |
| `activeTab` | permissions | When the user clicks the toolbar icon, the popup reads the current tab's address so it can offer to turn conversion on for that site. |
| `alarms` | permissions | Ends a pause the user starts from the toolbar ("Pause for 10 minutes") on time, even if the browser stopped the background in between. |
| `*://*/*` | optional_host_permissions | Not granted at install. When the user turns webpify on for a site, from the toolbar icon or the settings, the extension asks for access to that one site. It needs this access to see the images chosen in that site's upload fields and to hand back the converted WebP files. The user can revoke it at any time. |

**Are you using remote code?** No, I am not using remote code. All code ships in the package. The image converter is a WebAssembly module compiled from the Rust source in the public repository (`src/`). Builds are reproducible: `./build.sh` on the tagged commit produces an identical `.wasm`. The video reader/writer is the mediabunny library (MPL-2.0), included unmodified (as `vendor/mediabunny.js`) from its npm release; the video codecs are the browser's own, through the WebCodecs API.

## Privacy and data use

**What user data do you plan to collect?** Leave every box unticked.

Images are converted locally and never transmitted by the extension, and settings stay in `storage.local` on the device. If a reviewer counts locally handled images as collected data, the closest category is "Website content": processed on the device, not transmitted, not sold or shared.

Data use certification:
- [x] Data is not sold to third parties.
- [x] Data is not used for purposes unrelated to the extension's core functionality.
- [x] Data is not used for creditworthiness or lending purposes.

**Privacy policy URL:** `https://github.com/bidgrupa/webpify/blob/main/PRIVACY.md`. Check that the link opens before submitting.

## Distribution

- **Payments:** Free of charge.
- **Visibility:** Unlisted. Anyone with the link can install it (BID employees and clients), it doesn't appear in search, and updates install automatically. Public would also list it in search. Changing visibility later needs one manual publish from the dashboard before the release workflow can publish again.
- **Regions:** All regions.

## Additional fields (Store listing tab)

- **Official URL:** none. It needs a domain verified in Google Search Console.
- **Homepage URL:** `https://github.com/bidgrupa/webpify`
- **Support URL:** `https://github.com/bidgrupa/webpify/issues`
- **Mature content:** not ticked.

## Test instructions

**Username / password:** leave empty; nothing needs an account.

**Additional instructions** (paste as plain text):

```
No account is needed. webpify does nothing until it is turned on for a site, so please follow these steps:

1. Open the test page https://bidgrupa.github.io/webpify/ (several kinds of image upload fields).
2. Click the webpify icon in the toolbar, turn on "Convert uploads on this site", and click Allow when Chrome asks for access to the site. Only that one site is requested.
3. In section 1 ("Plain input"), choose one or more JPEG or PNG photos. The page lists the files it received: .webp files of type image/webp, smaller than the originals. A notice at the bottom of the page shows the savings.
4. Section 4 only accepts JPEG and PNG, so webpify leaves those files unchanged on purpose.
5. In section 6, choose a video (an H.264 MP4 or MOV, or a WebM). It arrives as an .mp4 of type video/mp4, smaller, and plays in the preview; the notice shows the progress and the savings. A video that is already a compact MP4 arrives unchanged, and the notice says so.
6. Settings (quality, maximum size, videos, the site list) are under "Open settings" in the same popup.

The converter is WebAssembly compiled from the Rust source in https://github.com/bidgrupa/webpify (src/); the build is reproducible with ./build.sh. Images are converted on the device and never sent anywhere by the extension.
```

## Developer info

- **Publisher:** a BID-owned publisher account rather than a personal one, with colleagues added as members, so the listing doesn't depend on one person.
- **Publisher name:** ⬜ e.g. BID grupa. Shown on the listing.
- **Contact email:** ⬜ a monitored team address. It is shown publicly, and Google sends policy notices to it.
- **Trader declaration:** ⬜ BID distributes webpify as a company, so most likely "Trader": legal name, address, phone and email, verified by Google and shown to EU users.

## Version history

| Version | Date | Changes | Status |
|---|---|---|---|
| 0.4.0 | 2026-10-29 | Settings page: the Lauris CMS shortcuts are gone; add a site by typing its address. | In review (submitted 2026-10-29) |
| 0.3.1 | 2026-10-14 | The Chrome package requires Chrome 148: older versions can't pass files to the converter. | In review (submitted 2026-10-14) |
| 0.3.0 | 2026-10-13 | Toolbar popup to turn a site on or off and pause for 10 minutes; screenshots, logos and graphics kept sharp. New permissions: activeTab, alarms. | Internal (GitHub Releases) |
| 0.2.0 | 2026-10-09 | Settings page and on-page notice in the bid look, Lauris CMS presets. | Internal (GitHub Releases) |
| 0.1.0 | 2026-10-09 | First release: WebP conversion for file inputs and Dropzone.js drop areas, per-site settings, colour profiles kept. | Internal (GitHub Releases) |

## Review notes

### Known limitations
- Paste uploads, uploads through the browser's newer file-picker API, and inputs inside closed shadow roots aren't converted; those files pass through unchanged.
- Animated GIFs and folders pass through unchanged.
- Videos the browser can't decode (HEVC from iPhones in Firefox, and in Chrome on Linux without a hardware decoder), HDR videos, videos over 2 GB and containers such as AVI pass through unchanged, with a notice saying why.
- Sound is copied as it is when it is AAC or Opus; other sound is re-encoded to AAC where the browser has an AAC encoder (Windows and macOS), otherwise to Opus.

### Rejection history
None yet.
