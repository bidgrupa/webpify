# Video uploads: compress and convert to MP4

> Proposal, 2026-10-30. Step 1 below is implemented on the `feat/video-compression` branch
> (`extension/video.js`, the README's "How it works") and passes `tests/browser-smoke.mjs` in
> headless Brave 1.98 (Chromium) and Firefox 159 on Linux: a 1080p60 clip re-encoded at 30 fps,
> a MOV remuxed, a VP9 WebM re-encoded with its Opus sound copied, a compact MP4 and an HEVC
> file kept, every output decoding cleanly in ffmpeg. Safari, Windows and macOS are untested.
> Step 2 is still open. Browser facts below were checked on that date against the WebCodecs
> spec, the Chromium, Firefox and WebKit sources, and a probe page run in the browsers installed
> on a Linux machine (sources at the end).

## Summary

Add video to what webpify intercepts: a video picked in a matching file input, or dropped on a
matching drop zone, is converted to an MP4 (H.264 video, AAC audio where possible) before the page's
upload code sees it, the same way images become WebP.

**Recommendation:** use the browser's own codecs through the **WebCodecs API**, with
**[mediabunny](https://mediabunny.dev)** (pure JavaScript, MPL-2.0) for reading the input, driving
the codecs and writing the MP4, and run the whole thing **inside the content script, in the page**.

- One code path for Chrome, Edge, Brave, Firefox, Zen and Safari. No new permissions, no WebAssembly,
  no change to the Rust image converter.
- Encoding is hardware-accelerated where the machine has it (Macs, most Windows PCs), and the
  browser's software H.264 encoder elsewhere.
- The gaps are per codec, not per browser, and every one of them ends the way image failures do:
  the original file is uploaded and the notice says so. iPhone "High Efficiency" (HEVC) videos
  can't be read in Firefox at all; AAC audio can't be *re-encoded* in Firefox or in Chrome on
  Linux, so there the audio is copied as it is (nearly always AAC already) or written as Opus.

## Why not the alternatives

| Option | Verdict |
|---|---|
| **ffmpeg.wasm** (all of FFmpeg compiled to WebAssembly) | 30 MB in the package, single-threaded software x264 runs at a frame or two per second for 1080p, and the multithreaded build needs SharedArrayBuffer, i.e. cross-origin isolation of extension pages. Minutes-long phone videos would take tens of minutes. |
| **Rust/WASM encoder**, like the image pipeline | No usable pure-Rust H.264 encoder exists; `openh264`/`x264` bindings need a C toolchain for wasm32 and would still be software-only, slower than the browser's own OpenH264 and without hardware encoders. Rust stays for images. |
| **`<video>` + canvas + MediaRecorder** | Real time only (a 5-minute clip takes 5 minutes), WebM output in Firefox, crude quality control, and it stalls when the tab is in the background. |
| **Server-side transcoding** | Defeats the point: the whole file would still be uploaded. |

WebCodecs gives the same encoders the browser uses for video calls, asynchronously and off the page
thread, in all five browsers. mediabunny is the missing demuxer/muxer: it reads MP4, MOV, WebM, MKV,
MPEG-TS and more, copies tracks when it can and transcodes only when it must, handles rotation
metadata, HEVC, edit lists and the WebCodecs plumbing, and has an official AAC encoder extension for
browsers without one. Zero dependencies, 1.6 MB unminified (0.7 MB minified), 1.64.0 released
2026-10-29, actively maintained (it also tracks the browsers' WebCodecs bugs).

## How it fits the current pipeline

```
page ── content.js (isolated world, document_start)
          input/change/drop captured as today
          video file matching the site's selector → "load-video" message
              │
              ▼
        background.js: scripting.executeScript(vendor/mediabunny.cjs, video.js)
                       into that frame (tabId + frameId from the sender), once per frame
              │
              ▼
        video.js (in the page, isolated world)
          mediabunny Input(BlobSource(file)) → inspect tracks → decide (see below)
          Conversion → VideoDecoder/VideoEncoder/AudioEncoder (WebCodecs, browser codecs)
          → Mp4OutputFormat → new File([...], "name.mp4", { type: "video/mp4" })
              │
              ▼
        content.js: DataTransfer → input.files, re-fire input + change (as for images)
```

Images keep going to the background's Rust/WASM converter. Videos never leave the tab.

### Why in the page, not in the background

1. **WebCodecs doesn't exist in service workers.** The spec exposes it to `Window` and dedicated
   workers only, so Chrome's background (a service worker) can't use it. Chrome would need an
   offscreen document (`offscreen` permission, Chrome 109+); Firefox and Safari have no offscreen API
   and use DOM event pages instead. That's two architectures, plus the service worker's 30-second
   idle and 5-minute limits to work around on Chrome.
2. **Safari can't pass a video to the background.** Its extension messages are JSON. Images go
   through as base64 text today; a 500 MB video would be a 670 MB string, copied several times.
   Chrome (148+, structured clone) and Firefox pass a `File` by reference, Safari can't. A hidden
   extension iframe in the page could take the file by `postMessage`, but that needs
   `web_accessible_resources`, which the project avoids on purpose.
3. **The page thread does little.** mediabunny reads the `File` lazily, the browser's media process
   does the decoding and encoding, and the page's JavaScript only shuffles packets. The result is
   built in page memory and handed over as a `File`, with no copy through messaging.

Consequences to accept:
- WebCodecs needs a secure context: `https://` pages, or `localhost`. A CMS on plain `http://` on a
  LAN address would get the original file, with a notice. (The demo on `http://localhost` works.)
- Content scripts can't start workers from extension files (SecurityError in Chrome and Firefox),
  so mediabunny's bookkeeping runs on the page's main thread. The codecs themselves are async and
  off-thread, so the page stays usable; a page that blocks its own thread slows the conversion.
- If the tab navigates away, the conversion dies with it. So does the upload, so nothing is lost.
- The library is injected only when a video is actually picked, not on every page load of the site.

## Browser support

Verified 2026-10-30. "Encode H.264" is what makes MP4 output possible at all; "AAC" only matters when
the source audio isn't AAC already; "Decode HEVC" is what iPhones record by default.

| | Chrome / Edge / Brave Windows | Chrome macOS | Chrome Linux | Firefox / Zen Windows | Firefox macOS | Firefox Linux | Safari 26 |
|---|---|---|---|---|---|---|---|
| WebCodecs video | ✓ (94+) | ✓ | ✓ | ✓ (130+) | ✓ | ✓ | ✓ (16.4+) |
| WebCodecs audio encode | ✓ | ✓ | ✓ | ✓ (130+) | ✓ | ✓ | ✓ (26+) |
| Encode H.264 | hardware, OpenH264 software fallback | same | OpenH264 software (hardware off by default) | Media Foundation (hardware/software) | VideoToolbox | only via the **system** libavcodec with libx264 or VA-API; Mozilla's build bundles none (the flatpak has it) | VideoToolbox |
| Encode AAC | ✓ (platform encoder) | ✓ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Encode Opus | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Decode HEVC | hardware only | hardware/Apple software | VA-API hardware only | ✗ in WebCodecs (Nightly only; `<video>` plays it since 134) | ✗ (same; `<video>` since 136) | ✗ (same; `<video>` since 137) | ✓ (17.4+) |
| Decode H.264, VP8, VP9, AV1 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (AV1 off by default) |

Also:
- Chromium builds **without proprietary codecs** (some Linux distro packages) have no H.264, HEVC or
  AAC at all. Google Chrome, Edge and Brave are fine.
- `bitrateMode: "quantizer"` (per-frame quality) is Chrome 117+ only; Firefox reports it as
  supported and silently uses VBR; Safari ignores `bitrateMode` and `hardwareAcceleration`.
- `hardwareAcceleration: "prefer-hardware"` fails outright on Chrome and Firefox without a hardware
  encoder. Use `"no-preference"`, which falls back to software on Chrome.
- Safari's H.264 encoder requires even width and height. mediabunny rounds; keep the scaler on even
  sizes anyway.

Measured on this machine (Linux, flatpak), with a probe page calling `isConfigSupported`:
- Google Chrome 156 (headless, no GPU): H.264 encode ✓ (software), AAC encode ✗, Opus ✓, HEVC decode ✗.
- Firefox 159 and Zen 1.23 (same Gecko 158 engine, headless): H.264 encode ✓ (software, through
  the flatpak's libavcodec), AAC encode ✗, Opus ✓, HEVC decode ✗.
- The desktop app's Chromium 152 with a GPU: the same, plus HEVC decode ✓ through VA-API, and
  hardware H.264 encoding ✗ (Chrome keeps it off on Linux).

## What gets converted

**Trigger.** The same inputs and drop zones as images, on the same sites. A file counts as a video by
MIME type (`video/mp4`, `video/quicktime`, `video/webm`, `video/x-matroska`, `video/3gpp`,
`video/x-m4v`) or, when the browser gives no type, by extension. The input's `accept` must allow
MP4: empty, `video/*`, `video/mp4` or `.mp4`; otherwise the file is left alone, like `image/jpeg`-only
inputs today.

**Inspect first.** Open the file with mediabunny (`BlobSource`, lazy), read the primary video and
audio tracks: codec, coded size, rotation, duration, average bitrate, frame rate, HDR flag. This takes
milliseconds and reads only the file's index.

**Decide**, in this order:

1. **Can't be parsed** (AVI, WMV, FLV, corrupt): keep the original. Notice: "This video format isn't
   supported".
2. **Video codec can't be decoded here** (HEVC in Firefox, HEVC on Linux Chrome without a VA-API GPU,
   AV1 on older machines): keep the original. Notice names the reason.
3. **No H.264 encoder here** (Chromium without proprietary codecs, Firefox on a Linux without
   libx264): keep the original.
4. **HDR source** (PQ or HLG transfer, BT.2020): keep the original in the first version. Converting
   10-bit HDR to 8-bit H.264 through the canvas path comes out washed out.
5. **Already good enough**: H.264, longest side within the limit, frame rate within the limit, and
   bitrate at or below the target.
   - already an MP4: untouched, nothing to gain;
   - MOV, MKV or similar: *remux* to MP4 (tracks copied, no re-encoding, seconds not minutes) and
     strip the metadata.
6. **Otherwise transcode the video** to H.264 (High profile), scaled so the longest side fits the
   limit (default 1920), frame rate capped (default 30; 60 fps phone clips halve in size), bitrate
   from the quality setting and the output size (mediabunny's `Quality` presets, to be tuned on
   real samples the way the image settings were). Key frame every 2 s. Hardware acceleration
   "no-preference".
7. **Audio**: copied when the source is AAC (phones, cameras, screen recorders, editors: almost
   always) or Opus (Chrome screen recordings, WebM); MP4 holds both. Re-encoded only when the source
   codec can't go into an MP4 (Vorbis, PCM, ...): to AAC where the browser can (Windows and macOS
   Chrome, Safari), otherwise Opus. mediabunny picks this automatically.
8. **Metadata**: all tags dropped (`tags: {}`), which removes the recording location that iPhone
   MOVs carry, matching what webpify does with EXIF. Rotation is kept as metadata, as every player
   expects.
9. **Keep the original when the result isn't smaller**, as for images. Also when the output's
   bitrate is far below what was asked for (say under a quarter): that's the signature of a known
   Firefox bug on Ubuntu 22.04 builds where the encoder ignores the bitrate and produces mush.

**Limits.** One video at a time, in order, like images. No fixed timeout: the job is cancelled when
a new selection replaces it (`conversion.cancel()`), by the Cancel link in the notice, or when
progress stops advancing for a long time. Files above a size limit (say 2 GB) pass through. The MP4
is built in memory with "fast start" (index at the front, so the uploaded file streams on the web);
memory use is about the output size, well under the input's.

## Settings and the notice

Options page, a new **Videos** group:
- *Convert videos to MP4* (on/off; default on).
- *Largest size*: 1080p (default), 720p, keep.
- *Quality*: lower, standard (default), higher. Maps to the encoder's bitrate per resolution.
- The existing *Keep the original when the result would be larger* applies to both.

Popup: "Images and videos you upload here are converted." Pause works as today.

Notice (the toast in the shadow root): "Converting the video to MP4 · 42% · about 1:20 left · Cancel"
during the job, then "1 video converted to MP4 · 180 MB → 24 MB, 87% smaller" or "Kept the original
video · This browser can't read HEVC video". Images and videos in one selection share the
"n of m" progress.

Speed to expect: hardware encoders (Macs, most Windows PCs) run 5-10× real time, so a 3-minute 4K
clip takes 20-40 seconds. Software OpenH264 at 1080p is about 1-2× real time: a 3-minute clip takes
a few minutes on Linux or a laptop without a usable hardware encoder. The notice has to show
progress and a time estimate, hence the Cancel link.

## Packaging, stores and licences

- **mediabunny** is vendored unmodified as `extension/vendor/mediabunny.js` (the published `.cjs` build that
  defines a global `Mediabunny`, under a `.js` name because `scripting.executeScript` injects nothing else;
  content scripts are classic scripts, so the ES module build can't be used). `package.json` pins the
  version; `scripts/vendor.mjs` fetches that release from the npm registry (verified against the
  registry's integrity hash, no `node_modules`) and, with `--check`, confirms the committed file is
  byte-identical. The release workflow runs the check, so a modified copy can't be released by accident.
- **addons.mozilla.org** allows third-party libraries only as unmodified release files, with the
  version cited, and reviewers compare checksums. The unmodified `.cjs` plus the `package.json`
  entry satisfies that; the approval notes get a line about it. The existing reproducible build is
  unaffected (no bundler, no new generated code).
- **Chrome Web Store**: still no remote code. The single purpose, description and screenshots
  change from "images" to "images and videos". **Mac App Store**: the description.
- **Licence**: MPL-2.0 is compatible with AGPL-3.0-only; the file stays unmodified with its licence
  header, and README's licence section mentions it.
- **Manifest**: no new permissions and no CSP change (no WASM in the content script). Minimum
  versions already fit: Chrome 148 (WebCodecs since 94), Firefox 140 (WebCodecs since 130),
  Safari 26 (its AudioEncoder arrived in 26).
- **PRIVACY.md**: videos are converted on the device; metadata including location is removed.
- **Demo page**: a section 6 with `<input type="file" accept="video/*">` that lists the received
  file and plays it in a `<video>`, for the store reviewers' test instructions too.
- **Tests**: the decision logic (which file to convert, how) is a pure function and gets a Node test
  like `background-test.mjs`. WebCodecs isn't in Node, so the conversion itself is checked by hand
  on the demo page in each browser; a Playwright run on the demo page can come later.

## Risks and open points

1. **Firefox's H.264 encoder has open bugs**: it writes an invalid `avcC` decoder description on
   Windows and Linux, and shifts chunk timestamps by one duration. On Linux (Firefox 159, system
   libavcodec) the smoke test's outputs decode cleanly in ffmpeg, so the description is usable
   there; Windows is untested. What did bite: a Firefox content script sees the page's objects
   through Xray wrappers, so the file is read through a custom source that copies each chunk into
   the script's realm, and the WebCodecs encoders are wrapped so the first chunk's metadata is
   copied too (see `video.js`). A cheap guard for all browsers remains an option: re-open the
   finished MP4 with mediabunny and check that its duration matches the source and the first
   packets decode; otherwise keep the original.
2. **HEVC in Firefox** (and on Linux Chrome without VA-API): iPhone videos recorded with the default
   "High Efficiency" setting are kept as they are. Second step: decode through a hidden `<video>`
   element (Firefox plays HEVC through the OS since 134/136/137) and feed its frames to the
   encoder. Works, but in real time.
3. **Opus audio in MP4 and Safari**: when audio has to be re-encoded on Firefox or Linux Chrome, the
   result is Opus. Chrome and Firefox play it; Apple lists it as supported since Safari 17 but field
   reports on current Safari are mixed. If the CMS *serves* uploaded MP4s unchanged, Safari visitors
   might get silent video in that (rare) case. Second step: `@mediabunny/aac-encoder` (FFmpeg's AAC
   encoder compiled to WebAssembly, MPL-2.0/LGPL, about 4.7 MB unpacked), registered only when the
   browser has no AAC encoder. WebAssembly inside a content script needs checking against the host
   page's CSP first; if it's blocked, the AAC step can run in an extension page. **Question for BID:
   does the CMS transcode uploaded videos on the server, or serve them as uploaded?**
4. **Software encoding is slow** on Linux and on Windows machines without a usable hardware
   encoder. Progress, time estimate and Cancel in the notice; the first version doesn't try to be
   faster than the browser's encoder.
5. **HDR** videos are kept as they are. Tone mapping is a later step, if it's needed at all.
6. **Memory**: the output is held in memory until the end (fast start). mediabunny's "reserve"
   mode can write it out as it goes once the frame count is known; a later optimisation.
7. **Quality and bitrate defaults** need measuring on real uploads (phone clips, screen
   recordings, hero videos exported from editors), like the image settings were.

## Plan

**Step 1, the feature** (3-5 days): detection in `content.js`, on-demand injection from
`background.js`, `extension/video.js` with the inspect-decide-convert flow, the notice with progress
and Cancel, the Videos settings, demo section, Node test for the decision logic, docs and store texts.
Manual check on the demo page: Chrome and Firefox on Linux, Chrome, Firefox and Safari on a Mac,
Chrome and Firefox on Windows; sample files: iPhone HEVC MOV, iPhone H.264 MOV, Android MP4, Chrome
WebM screen recording, OBS MKV, a 4K 60 fps clip, an HDR clip.

**Step 2, the gaps**: output sanity check, AAC through `@mediabunny/aac-encoder`, HEVC in Firefox
through `<video>`, low-memory output.

## Sources

- WebCodecs spec, exposure to Window and DedicatedWorker only: https://w3c.github.io/webcodecs/
- Firefox 130 release notes (WebCodecs on desktop): https://www.firefox.com/en-US/firefox/130.0/releasenotes/
- Firefox AudioEncoder, Opus and Vorbis only: https://github.com/mozilla-firefox/firefox/blob/main/dom/media/webcodecs/AudioEncoder.cpp
- Firefox H.264 encoding on Linux through the system libavcodec: https://github.com/mozilla-firefox/firefox/blob/main/dom/media/platforms/ffmpeg/FFmpegEncoderModule.cpp
- Firefox WebCodecs HEVC gated to Nightly: https://github.com/mozilla-firefox/firefox/blob/main/dom/media/webcodecs/WebCodecsUtils.cpp and https://bugzilla.mozilla.org/show_bug.cgi?id=1944991
- Firefox encoder bitrate ignored with FFmpeg 4.x headers: https://bugzilla.mozilla.org/show_bug.cgi?id=2081651
- Firefox quantizer mode not implemented: https://bugzilla.mozilla.org/show_bug.cgi?id=1871457
- Firefox has no offscreen API: https://bugzilla.mozilla.org/show_bug.cgi?id=1807830
- Chromium OpenH264 software encoder and proprietary codecs: https://github.com/chromium/chromium/blob/main/media/media_options.gni, https://github.com/chromium/chromium/blob/main/media/base/supported_types.cc
- Chromium AAC encoding only with a platform encoder (Windows, macOS, Android): https://github.com/chromium/chromium/blob/main/media/mojo/clients/mojo_audio_encoder.cc
- Chrome structured-clone messaging from 148: https://developer.chrome.com/blog/structured-clone-messaging
- Chrome offscreen documents: https://developer.chrome.com/docs/extensions/reference/api/offscreen
- Chrome service worker lifetime: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Safari 16.4 (WebCodecs video), 17.4 (HEVC), 26.0 (audio): https://webkit.org/blog/13966/webkit-features-in-safari-16-4/, https://developer.apple.com/documentation/safari-release-notes/safari-17_4-release-notes, https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- Safari runtime messaging is JSON: https://github.com/WebKit/WebKit/blob/main/Source/WebKit/WebProcess/Extensions/API/Cocoa/WebExtensionAPIRuntimeCocoa.mm
- Known WebCodecs bugs tracked by mediabunny: https://www.remotion.dev/docs/mediabunny/webcodecs-bugs
- mediabunny docs: https://mediabunny.dev/guide/converting-media-files, https://mediabunny.dev/guide/supported-formats-and-codecs, https://mediabunny.dev/guide/extensions/aac-encoder
- AMO third-party library policy: https://extensionworkshop.com/documentation/publish/third-party-library-usage/ and https://extensionworkshop.com/documentation/publish/add-on-policies/
