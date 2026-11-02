# webpify

Browser extension (Chrome, Edge, Firefox, Zen, Safari; Manifest V3) that converts images to WebP **right before you upload them**. On sites you choose, images picked in a matching `<input type="file">`, or dropped onto a matching drop zone such as [Dropzone.js](https://www.dropzone.dev/), are converted. The page's own upload code receives the `.webp` files as if you had picked them.

The image work is Rust compiled to WebAssembly: decode (JPEG/PNG/BMP) → EXIF orientation → optional downscale → WebP via [zenwebp](https://crates.io/crates/zenwebp), a pure-Rust encoder. The decode/orient/resize code is adapted from sharpR. Images never leave the browser.

The source's ICC colour profile is embedded in the WebP, so wide-gamut photos such as iPhone Display P3 keep their colours. All other metadata (EXIF, including GPS location, and XMP) is dropped.

Videos picked the same way are converted to MP4 (H.264), at most 1080p and 30 fps, by the browser's own encoder through the WebCodecs API; [mediabunny](https://mediabunny.dev) (MPL-2.0, vendored unmodified in `extension/vendor/`) reads the file and writes the MP4. The sound is kept as it is whenever an MP4 can hold it (AAC, Opus), and the recording's metadata, location included, is dropped. A video that is already a compact H.264 MP4 is left alone; a MOV that is one is repackaged without re-encoding. One the browser can't read, such as an iPhone HEVC video in Firefox, is uploaded unchanged and the notice says why. Videos never leave the browser either. The design and the browser support matrix are in [docs/video-proposal.md](docs/video-proposal.md).

## Install

webpify is shared internally for now: download it from the [latest release](../../releases/latest) and follow **[INSTALL.md](INSTALL.md)**, a step-by-step guide for Chrome, Edge, Brave, Zen and Firefox. See [PRIVACY.md](PRIVACY.md) for what the extension does with your images (in short: nothing leaves your device).

Releases are built by GitHub Actions when a version tag is pushed; see [RELEASING.md](RELEASING.md). Publishing to the browser stores later is described in [docs/public-release.md](docs/public-release.md).

## How it works

```
page ── content.js (isolated world, document_start)
          window capture listeners on `input` + `change`
          matching file input → hold both events → convert each file, one at a time
              │
              ├─ image: runtime.sendMessage (structured clone; Safari: JSON, so base64 text)
              │     ▼
              │   background.js (Chrome service worker / Firefox event page / Safari background page)
              │     Rust/WASM convertToWebp()
              │     │ Uint8Array (Safari: base64 text)
              │     ▼
              └─ video: "load-video" → background injects vendor/mediabunny.js + video.js into
                   this frame (once), then video.js converts here in the page:
                   mediabunny reads the File → WebCodecs decode/encode (the browser's codecs) → MP4
              ▼
        content.js: DataTransfer → input.files, re-fire input + change
          → the page's handlers (plain JS, React, web components) see WebP and MP4 files
```

Videos are converted in the page rather than the background because WebCodecs isn't exposed to service workers (Chrome's background), and because Safari's extension messages are JSON, which can't carry a video. The page's own thread only shuffles packets; decoding and encoding run in the browser's media process, with hardware encoders where the machine has them.

Drop zones work the same way. A `drop` on (or inside) an element matching the site's selector is held back, its files are converted, and a new `drop` event carrying the WebP files is dispatched at the same spot.

The default selector `input[type="file"], .dropzone` covers both Dropzone.js paths:
- clicking, which goes through a hidden `input.dz-hidden-input` that Dropzone appends to `<body>`
- dragging, which goes through a `drop` on the `.dropzone` element

- Conversion runs in the extension's background, so the page stays responsive and the `.wasm` is never exposed to websites (no `web_accessible_resources`).
- Inputs whose `accept` rules out WebP (for example `image/jpeg,image/png`) are left alone. GIF, WebP, SVG and other files pass through unchanged.
- If a conversion fails, times out, or comes out larger than the original, the original file is kept. The page always gets its events.
- A video conversion shows its progress and a Cancel link in the notice. It is given up when it makes no progress for three minutes, and dropped when a new selection replaces it.
- Sites are turned on from the toolbar popup ("Convert uploads on this site", which also starts it on the open tab) or added on the options page. The extension asks for access to each one and registers its content script there at runtime. Firefox closes the popup while the permission prompt is open, so the background finishes turning a site on.
- The popup can pause conversion everywhere for 10 minutes; the icon shows "off" until an alarm ends the pause.
- Screenshots, logos and other graphics: a PNG or BMP with few colours (up to 32,768) is also encoded lossless, and keeps that when it's at most 1.5× the lossy size. Measured on samples: a UI screenshot came out 9× smaller lossless, a logo 1.3× larger, a photo saved as PNG 7.8× larger (so it stays lossy).

## Build

Prerequisites (once): [rustup](https://rustup.rs), `zip`, Node 24 (for packaging and the smoke test) and the wasm-bindgen CLI:

```bash
cargo install wasm-bindgen-cli --version 0.2.129 --locked
```

The CLI version must match the `wasm-bindgen` version pinned in `Cargo.toml`. `rust-toolchain.toml` pins Rust 1.93.1 with the wasm32 target, and rustup installs it on the first build.

```bash
./build.sh          # → extension/pkg/webpify.js + webpify_bg.wasm (~1 MB), dist/webpify.zip
cargo test          # native unit tests of the Rust pipeline
node --experimental-wasm-exnref tests/wasm-smoke.mjs path/to/photo.jpg   # the built .wasm, in Node
node --js-base-64 --experimental-wasm-exnref tests/background-test.mjs    # popup flows and the video injection in background.js, faked browser APIs (Node 24 needs the base64 flag)
node tests/video-test.mjs         # the video converter's decisions (what to keep, remux or transcode)
node tests/browser-smoke.mjs      # converts sample videos through the real extension in a headless Chromium or Firefox, checks them with ffprobe (needs ffmpeg)
node scripts/vendor.mjs --check   # extension/vendor/ is the unmodified mediabunny release that package.json pins
node scripts/vendor.mjs           # fetch that release into extension/vendor/ (after changing the version in package.json)
./release.sh        # all release packages in dist/ (what the GitHub workflow publishes)
node scripts/package.mjs safari   # dist/safari/ only, to load in Safari (after ./build.sh)
scripts/render-icons.sh   # re-render extension/icons/ from assets/*.svg (needs Inkscape)
node store/chrome/src/render.mjs   # re-render the Chrome Web Store screenshots and promo tile (after ./build.sh)
```

### Building from source (for add-on reviewers)

The build is reproducible: the same commit gives a byte-identical `extension/pkg/webpify_bg.wasm` and `webpify.js`. The pinned toolchain plus `--remap-path-prefix` in `build.sh` keep machine-specific paths out of the binary.

**Build environment:** Ubuntu 24.04 on **x86_64**, like GitHub's `ubuntu-24.04` runner that builds the releases. Use x86_64. An ARM64 machine builds a `.wasm` that works the same but isn't byte-identical, because Cargo's hash of each crate includes its proc macros, which are compiled for the build machine, and those hashes decide the order of functions in the `.wasm`.

1. Install a C toolchain, curl and zip: `sudo apt install build-essential curl zip`.
2. Install rustup (<https://rustup.rs>): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y`, then `. "$HOME/.cargo/env"`.
3. Install the bindings generator: `cargo install wasm-bindgen-cli --version 0.2.129 --locked`.
4. From the source root, run `./build.sh`. Rust 1.93.1 and the wasm32 target are installed from `rust-toolchain.toml` automatically.
5. Run `node scripts/package.mjs firefox` (Node 22 or later). `dist/firefox/` is then identical to the submitted Firefox package.

Only `pkg/webpify_bg.wasm` and `pkg/webpify.js` are generated. Every other file in the package is copied as-is from `extension/`; only `manifest.json` is trimmed per browser by `scripts/package.mjs`.

The browser smoke test loads the extension into a headless browser, picks synthetic sample videos on the demo page and checks what the page received with ffprobe and a full ffmpeg decode (`--only <name>` runs one sample, `--verbose` prints the extension's console lines as they come). It drives Chromium, Brave or Edge over the DevTools protocol and Firefox or Zen over Marionette (`--browser "flatpak run org.mozilla.firefox"`); Google-branded Chrome ignores `--load-extension` since version 137, so it can't be used, but the shipped extension runs the same code in it. Headless browsers have no GPU, so the HEVC sample is expected to be kept.

`extension/vendor/mediabunny.js` is the unmodified `dist/bundles/mediabunny.cjs` of the [mediabunny](https://www.npmjs.com/package/mediabunny) release that `package.json` pins (its licence is next to it), under a `.js` name because `scripting.executeScript` injects nothing else. `node scripts/vendor.mjs --check` fetches that release from the npm registry and confirms the file is identical; no `npm install` is involved.

## Load the extension (development)

**Flatpak browsers** can only read a few home folders. Give them read access to `extension/` once, then restart the browser:

```bash
flatpak override --user --filesystem="$PWD/extension:ro" com.google.Chrome
flatpak override --user --filesystem="$PWD/extension:ro" org.mozilla.firefox
```

- **Chrome:** `chrome://extensions` → enable Developer mode → *Load unpacked* → select `extension/`.
- **Firefox / Zen:** `about:debugging#/runtime/this-firefox` → *Load Temporary Add-on…* → select `dist/webpify.zip`, which `build.sh` writes. It stays loaded until the browser restarts.
  - Don't pick `extension/manifest.json` in a flatpak browser. The file picker shares only that one file, so the rest of the extension is missing and the options page comes up blank.
  - After a rebuild, click *Reload* in `about:debugging`.
- **Safari (26 or later):** run `node scripts/package.mjs safari` after `./build.sh`. In Safari → Settings → Advanced, tick *Show features for web developers*. Then Settings → Developer → allow unsigned extensions → *Add Temporary Extension…* → select `dist/safari/`, and turn webpify on under Settings → Extensions. It stays loaded until Safari quits.
  - After a rebuild, package again and add the folder again.

Click the toolbar icon to open the options page.

## Try the demo

```bash
python3 -m http.server 8000 --directory demo
```

1. In the options, click the **localhost** preset, then **Add site**, and allow access.
2. Open <http://localhost:8000> (reload it if it was already open).
3. Pick a few photos in each section.
   - Sections 1–3 (plain input, React, shadow DOM) should list `.webp` files with type `image/webp` and smaller sizes.
   - Section 4 (JPEG/PNG only) should keep the originals.
   - In section 5 (Dropzone.js), try both clicking and dragging files from your file manager.
   - In section 6, pick a video: a phone clip or a screen recording. It should arrive as an `.mp4` of type `video/mp4`, smaller, and play in the preview. A compact MP4 arrives unchanged, with a notice saying so.

   A notice at the bottom of the page shows progress and savings.

Debugging: the background console is under *Inspect views: service worker* in Chrome, *Inspect* in Firefox's about:debugging, or Develop → *Web Extension Background Content* in Safari. The content script logs to the page console with a `[webpify]` prefix.

## Not covered

- Paste uploads, `showOpenFilePicker()`, and inputs inside closed shadow roots.
- Folder drops. These pass through unchanged.
- Drop libraries other than Dropzone.js are untested. Ones that read `dataTransfer.files`, or `items` with `getAsFile()`, should work.
- WebP limits on drop zones. Unlike an input's `accept`, a drop zone's file-type limit (for example Dropzone's `acceptedFiles`) isn't visible to the extension. The one exception is Dropzone's hidden input, whose `accept` is used as a hint.
- Installing in Safari for everyday use. Safari only installs extensions that come inside a signed Mac app, which isn't built yet; for now webpify loads as a temporary extension.
- `wasm-opt` size optimisation.
- Animated images. GIFs pass through untouched.
- Videos the browser can't decode through WebCodecs: HEVC (iPhone "High Efficiency" recordings) in Firefox, and on Linux Chrome without a VA-API GPU; anything on a Chromium built without proprietary codecs. They pass through unchanged, and the notice says why.
- HDR videos (PQ or HLG), which would come out washed out as 8-bit H.264. They pass through unchanged.
- Re-encoding sound to AAC in Firefox and in Chrome on Linux, which have no AAC encoder. Sound that is already AAC or Opus is copied as it is (nearly always the case); other sound becomes Opus there, which plays in Chrome and Firefox and, per Apple, in Safari 17 and later.
- Containers mediabunny doesn't read (AVI, WMV, FLV) and videos over 2 GB pass through unchanged.
- Firefox's H.264 encoder has open bugs (an invalid decoder description on Windows and Linux, shifted timestamps). The smoke test's files made by Firefox 159 on Linux decode cleanly with ffmpeg; the converted file itself is only checked for a plausible bitrate, not decoded back. Test on Firefox for Windows before relying on it there.

## License

webpify is free software, licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`). That licence comes from its WebP encoder, [zenwebp](https://crates.io/crates/zenwebp), which is `AGPL-3.0-only OR` commercial. Anyone who receives the extension is entitled to this source code. The source archive of each version is attached to its GitHub release.

The video reader/writer, [mediabunny](https://github.com/Vanilagy/mediabunny), is included unmodified under the Mozilla Public License 2.0 (`extension/vendor/mediabunny.LICENSE`), which is compatible with the AGPL.

The demo page bundles React and Dropzone.js (both MIT) in `demo/vendor/`. They are not part of the extension.
