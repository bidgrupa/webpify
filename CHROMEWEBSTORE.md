# Chrome Web Store listing: webpify

> Last updated: 2026-10-09
>
> Everything the Chrome Developer Dashboard asks for, ready to paste.

## Store listing

**Extension name**
webpify

**Short description** (matches the manifest, 76 characters)
Converts images to WebP right before you upload them, on sites you choose.

**Detailed description**
(The dashboard strips markdown. Paste as plain text with blank lines between paragraphs.)

```
webpify makes the images you upload smaller by converting them to WebP the moment you pick them, before the website receives them.

Choose the sites where it should work. On those sites, images you select with an upload button or drag onto an upload area are converted automatically, and the site uploads the smaller WebP files instead of the originals. It works with standard file upload fields and with common drag-and-drop upload areas.

Settings let you pick the quality, a maximum width and height for large photos, and lossless conversion. If a WebP would come out larger than the original, the original is kept. Photos keep their colour profile, so colours stay true, and location and camera details are removed. A small notice at the bottom of the page shows how many images were converted and how much space was saved.

How to use it:
1. Open the extension's settings and add a site, for example https://cms.example.com/*.
2. Allow access to that site when your browser asks.
3. Reload the site and upload images as usual.

Privacy: images are converted on your device and are never sent anywhere by the extension. It has no analytics and makes no network requests of its own. It can only see the sites you add, and only after you allow it.

Source code and support: https://github.com/bidgrupa/webpify
```

**Category**
Photos. If that category isn't offered, use Tools.

**Single purpose**
Converts images to WebP format when the user uploads them on websites they have chosen.

**Primary language**
English

## Graphics and assets

| Asset | Dimensions | Status | File |
|---|---|---|---|
| Store icon (required) | 128×128 PNG | ✅ Ready | `extension/icons/icon-128.png` |
| Screenshot 1 (required) | 1280×800 | ⬜ Not created | |
| Screenshot 2 | 1280×800 | ⬜ Not created | |
| Small promo tile | 440×280 | ⬜ Optional | |

Screenshot notes (take them in Chrome with the window sized to 1280×800):
1. An upload page, e.g. the bidcms image form or `demo/` section 5, right after dropping photos: the WebP files listed and the webpify notice at the bottom showing the savings.
2. The options page with one site added and the conversion settings visible.

## Permissions justification

| Permission | Type | Justification |
|---|---|---|
| `storage` | permissions | Saves the user's settings on the device: conversion quality, maximum size, the lossless and keep-original options, and the list of sites with their upload field selectors. |
| `scripting` | permissions | Registers the upload-handling script only on the sites the user adds in the settings, so it never runs on any other page. |
| `*://*/*` | optional_host_permissions | Not granted at install. When the user adds a site in the settings, the extension asks for access to that one site. It needs this access to see the images chosen in that site's upload fields and to hand back the converted WebP files. The user can revoke it at any time. |

Remote code: none. All code ships in the package. The image converter is a WebAssembly module compiled from the Rust source in the public repository (`src/`). Builds are reproducible: `./build.sh` on the tagged commit produces an identical `.wasm`.

## Privacy and data use

**Does the extension collect user data?** No.

Images are converted locally and never transmitted by the extension, and settings stay in `storage.local` on the device. If a reviewer counts locally handled images as collected data, the closest category is "Website content": processed on the device, not transmitted, not sold or shared.

Data use certification:
- [x] Data is not sold to third parties.
- [x] Data is not used for purposes unrelated to the extension's core functionality.
- [x] Data is not used for creditworthiness or lending purposes.

**Privacy policy URL:** `https://github.com/bidgrupa/webpify/blob/main/PRIVACY.md`. Check that the link opens before submitting.

## Distribution

- **Visibility:** Unlisted. Anyone with the link can install it (BID employees and clients), it doesn't appear in search, and updates install automatically.
- **Regions:** All regions.

## Developer info

- **Publisher:** a BID-owned group publisher account rather than a personal one, so the listing doesn't depend on one person's account.
- **Contact email:** ⬜ a monitored team address. It is shown publicly, and Google sends policy notices to it.
- **Support URL:** `https://github.com/bidgrupa/webpify/issues`
- **Homepage:** `https://github.com/bidgrupa/webpify`

## Version history

| Version | Date | Changes | Status |
|---|---|---|---|
| 0.2.0 | 2026-10-09 | Settings page and on-page notice in the bid look, Lauris CMS presets. | Internal (GitHub Releases) |
| 0.1.0 | 2026-10-09 | First release: WebP conversion for file inputs and Dropzone.js drop areas, per-site settings, colour profiles kept. | Internal (GitHub Releases) |

## Review notes

### Known limitations
- Paste uploads, uploads through the browser's newer file-picker API, and inputs inside closed shadow roots aren't converted; those files pass through unchanged.
- Animated GIFs and folders pass through unchanged.

### Rejection history
None yet.
