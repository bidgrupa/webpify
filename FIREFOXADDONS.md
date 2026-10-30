# addons.mozilla.org listing: webpify

> Last updated: 2026-10-14
>
> Everything the Firefox Add-on Developer Hub asks for, ready to paste, in the order the
> submission asks for it. The steps around it are in
> [docs/public-release.md](docs/public-release.md#addonsmozillaorg).

## Upload

- **How to distribute this version:** On this site.
- **File:** the Firefox package without `update_url`, e.g. `webpify-firefox-0.3.1-unsigned.xpi` built by `node scripts/package.mjs firefox`. Mozilla signs it.
- **Compatibility:** Firefox only. Leave Firefox for Android unticked; webpify isn't tested there.
- **Validation:** one expected warning, about Firefox for Android's minimum version. It doesn't apply to a desktop-only add-on.

## Source code

- **Do you need to submit source code?** Yes. The converter is WebAssembly compiled from Rust, and its JS bindings are generated.
- **File:** `webpify-source-<v>.zip` from the GitHub release of the same version.

## Describe the add-on

**Name**
webpify

**Add-on URL**
`https://addons.mozilla.org/firefox/addon/webpify/` (slug: `webpify`)

**Summary** (195 of 250 characters)
```
Converts images to WebP and videos to MP4 right before you upload them, on sites you choose. The conversion runs on your device, nothing is sent anywhere, and the site receives the smaller files.
```

**Description** (line breaks are kept)
```
webpify makes the images you upload smaller by converting them to WebP the moment you pick them, before the website receives them.

Choose the sites where it should work. On those sites, images you select with an upload button or drag onto an upload area are converted automatically, and the site uploads the smaller WebP files instead of the originals. It works with standard file upload fields and with common drag-and-drop upload areas such as Dropzone.js.

Videos are converted too, to MP4 (H.264) with your browser's own encoder, scaled to 1080p and 30 frames per second at most, with the sound kept as it is. A video that is already a compact MP4 is left alone. The notice shows the progress, with a Cancel link, and videos your browser can't read are uploaded unchanged. Firefox can't read HEVC (iPhone "High Efficiency") videos, so those are uploaded as they are.

Settings let you pick the quality, a maximum width and height for large photos, and lossless conversion. Screenshots, logos and other graphics are kept sharp automatically. If a WebP would come out larger than the original, the original is kept. Photos keep their colour profile, so colours stay true, and location and camera details are removed. A small notice at the bottom of the page shows how many images were converted and how much space was saved.

How to use it:
1. Open the site where you upload images and click the webpify button, in the toolbar or the Extensions menu.
2. Turn on "Convert uploads on this site" and allow access when Firefox asks.
3. Upload images as usual. To upload one image unchanged, pause webpify for 10 minutes from the same button.

Privacy: images are converted on your device and are never sent anywhere by the extension. It has no analytics and makes no network requests of its own. It can only see the sites you add, and only after you allow it.

The image converter is written in Rust and compiled to WebAssembly; videos are read and written by the mediabunny library (MPL-2.0) with Firefox's own codecs. webpify is free software under the AGPL-3.0; the source code is at https://github.com/bidgrupa/webpify
```

**Experimental:** not ticked. **Requires payment, non-free services or software, or additional hardware:** not ticked.

**Category**
Photos, Music & Videos

**Support email**
⬜ the same monitored team address as on the Chrome Web Store. It is shown publicly.

**Support website**
`https://github.com/bidgrupa/webpify/issues`

**License**
GNU Affero General Public License v3.0 (`AGPL-3.0-only`). It has to be this one: zenwebp, the encoder, is AGPL.

**Privacy policy**
Tick "This add-on has a privacy policy" and paste the text of [PRIVACY.md](PRIVACY.md), without its first heading. The add-on collects no data (the manifest says so in `data_collection_permissions`), so this is optional, but it answers the obvious question.

**Notes to reviewer**
Paste [store/firefox/approval-notes.txt](store/firefox/approval-notes.txt). The release workflow sends the same text with every later version.

For 0.3.1 only, add this line under step 5: `This version's package.mjs prints "no GitHub repo known ... no update_url"; that's expected, the listed package has no update_url.`

## Product page (after submitting: Edit Product Page)

**Screenshots** (1280×800; upload in this order, with these captions)

| File | Caption |
|---|---|
| `store/chrome/screenshot-1-convert.png` | Images you pick or drop are converted to WebP on your computer, before the site receives them. |
| `store/chrome/screenshot-2-popup.png` | Turn webpify on for the site you're on. Firefox asks for access to that one site. |
| `store/chrome/screenshot-3-settings.png` | Choose the quality and the largest size. Graphics stay sharp, and the original is kept when WebP isn't smaller. |

The same images as on the Chrome Web Store; `node store/chrome/src/render.mjs` renders them again.

**Icon:** taken from the package (`icons/icon-128.png`); nothing to upload.

**Homepage:** `https://github.com/bidgrupa/webpify`

## Version history

| Version | Date | Changes | Status |
|---|---|---|---|
| 0.4.0 | 2026-10-29 | Settings page: the Lauris CMS shortcuts are gone; add a site by typing its address. | In review (submitted 2026-10-29) |
| 0.3.1 | 2026-10-14 | First version on addons.mozilla.org. | In review (submitted 2026-10-14) |

## Review notes

### Rejection history
None yet.
