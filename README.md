# webpify

Browser extension (Chrome, Edge, Firefox, Zen; Manifest V3) that converts images to WebP **right before you upload them**. On sites you choose, images picked in a matching `<input type="file">`, or dropped onto a matching drop zone such as [Dropzone.js](https://www.dropzone.dev/), are converted. The page's own upload code receives the `.webp` files as if you had picked them.

The image work is Rust compiled to WebAssembly: decode (JPEG/PNG/BMP) → EXIF orientation → optional downscale → WebP via [zenwebp](https://crates.io/crates/zenwebp), a pure-Rust encoder. The decode/orient/resize code is adapted from sharpR. Images never leave the browser.

The source's ICC colour profile is embedded in the WebP, so wide-gamut photos such as iPhone Display P3 keep their colours. All other metadata (EXIF, including GPS location, and XMP) is dropped.

## Install

webpify is shared internally for now: download it from the [latest release](../../releases/latest) and follow **[INSTALL.md](INSTALL.md)**, a step-by-step guide for Chrome, Edge, Brave, Zen and Firefox. See [PRIVACY.md](PRIVACY.md) for what the extension does with your images (in short: nothing leaves your device).

Releases are built by GitHub Actions when a version tag is pushed; see [RELEASING.md](RELEASING.md). Publishing to the browser stores later is described in [docs/public-release.md](docs/public-release.md).

## How it works

```
page ── content.js (isolated world, document_start)
          window capture listeners on `input` + `change`
          matching file input → hold both events → send each File to the background
              │ runtime.sendMessage (structured clone)
              ▼
        background.js (Chrome service worker / Firefox event page)
          Rust/WASM convertToWebp()
              │ Uint8Array
              ▼
        content.js: DataTransfer → input.files, re-fire input + change
          → the page's handlers (plain JS, React, web components) see WebP files
```

Drop zones work the same way. A `drop` on (or inside) an element matching the site's selector is held back, its files are converted, and a new `drop` event carrying the WebP files is dispatched at the same spot.

The default selector `input[type="file"], .dropzone` covers both Dropzone.js paths:
- clicking, which goes through a hidden `input.dz-hidden-input` that Dropzone appends to `<body>`
- dragging, which goes through a `drop` on the `.dropzone` element

- Conversion runs in the extension's background, so the page stays responsive and the `.wasm` is never exposed to websites (no `web_accessible_resources`).
- Inputs whose `accept` rules out WebP (for example `image/jpeg,image/png`) are left alone. GIF, WebP, SVG and other files pass through unchanged.
- If a conversion fails, times out, or comes out larger than the original, the original file is kept. The page always gets its events.
- Sites are added on the options page. The extension asks for access to each one and registers its content script there at runtime.

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
./release.sh        # all release packages in dist/ (what the GitHub workflow publishes)
scripts/render-icons.sh   # re-render extension/icons/ from assets/*.svg (needs Inkscape)
```

### Building from source (for add-on reviewers)

The build is reproducible: the same commit gives a byte-identical `extension/pkg/webpify_bg.wasm` and `webpify.js`. The pinned toolchain plus `--remap-path-prefix` in `build.sh` keep machine-specific paths out of the binary. Checked on x86_64 Linux.

1. Install rustup (<https://rustup.rs>) and `zip`, e.g. on Ubuntu 24.04: `sudo apt install zip` and the rustup script.
2. Install the bindings generator: `cargo install wasm-bindgen-cli --version 0.2.129 --locked`.
3. From the source root, run `./build.sh`. Rust 1.93.1 and the wasm32 target are installed from `rust-toolchain.toml` automatically.
4. Compare `extension/pkg/webpify_bg.wasm` and `extension/pkg/webpify.js` with the same files in the submitted package. Every other file in the package is copied as-is from `extension/`; only `manifest.json` is trimmed per browser by `scripts/package.mjs`.

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

   A notice at the bottom of the page shows progress and savings.

Debugging: the background console is under *Inspect views: service worker* in Chrome, or *Inspect* in Firefox's about:debugging. The content script logs to the page console with a `[webpify]` prefix.

## Not covered

- Paste uploads, `showOpenFilePicker()`, and inputs inside closed shadow roots.
- Folder drops. These pass through unchanged.
- Drop libraries other than Dropzone.js are untested. Ones that read `dataTransfer.files`, or `items` with `getAsFile()`, should work.
- WebP limits on drop zones. Unlike an input's `accept`, a drop zone's file-type limit (for example Dropzone's `acceptedFiles`) isn't visible to the extension. The one exception is Dropzone's hidden input, whose `accept` is used as a hint.
- Safari.
- `wasm-opt` size optimisation.
- Animated images. GIFs pass through untouched.

## License

webpify is free software, licensed under the [GNU Affero General Public License v3.0 only](LICENSE) (`AGPL-3.0-only`). That licence comes from its WebP encoder, [zenwebp](https://crates.io/crates/zenwebp), which is `AGPL-3.0-only OR` commercial. Anyone who receives the extension is entitled to this source code. The source archive of each version is attached to its GitHub release.

The demo page bundles React and Dropzone.js (both MIT) in `demo/vendor/`. They are not part of the extension.
