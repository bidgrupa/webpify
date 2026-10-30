// webpify content script. Two ways in, one conversion loop:
// - File inputs: holds back the input/change events, converts the picked files, swaps the
//   input's files and re-fires the events.
// - Drop zones (e.g. Dropzone.js): holds back the drop, converts, and re-dispatches
//   a drop carrying the converted files.
// Either way the page's own upload code sees WebP images and MP4 videos as if the user had
// chosen them. Images go to the background's Rust/WASM converter; videos are converted here in
// the page by video.js, which the background injects on first use.
(() => {
  if (globalThis.webpifyContentLoaded) return;
  globalThis.webpifyContentLoaded = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const { DEFAULTS, DEFAULT_SELECTOR, IMAGE_TYPES, matchesPattern, isVideoFile, acceptAllows } = globalThis.webpify;
  const CONVERT_TIMEOUT_MS = 60_000; // one image in the background
  const VIDEO_STALL_MS = 3 * 60_000; // a video conversion that makes no progress for this long is given up

  /** "image", "video" (when videos are on), or null for files that pass through. */
  function kindOf(file) {
    if (IMAGE_TYPES.includes(file.type)) return "image";
    if (settings?.videos && isVideoFile(file)) return "video";
    return null;
  }

  /** The kind to convert `file` to, or null: the input's `accept` must take the result. */
  function convertibleKind(file, accept) {
    const kind = kindOf(file);
    return kind && acceptAllows(accept, kind) ? kind : null;
  }

  // --- Settings --------------------------------------------------------------

  let settings = null; // nothing is intercepted until settings have loaded

  async function loadSettings() {
    settings = { ...DEFAULTS, ...(await api.storage.local.get(null)) };
  }
  loadSettings().catch((error) => console.warn("[webpify] could not load settings:", error));
  api.storage.onChanged.addListener((_changes, area) => {
    if (area === "local") loadSettings().catch(() => {});
  });

  /** The selector for this page, or null when webpify shouldn't act here. */
  function activeSelector() {
    // runtime.id disappears when the extension is reloaded and this script is orphaned.
    if (!settings || !api.runtime?.id) return null;
    if (settings.pausedUntil > Date.now()) return null; // paused from the toolbar popup
    const site = settings.sites.find((s) => matchesPattern(s.pattern, location.href));
    return site ? site.selector || DEFAULT_SELECTOR : null;
  }

  function matchesSelector(element, selector) {
    try {
      return element.matches(selector);
    } catch {
      return false; // invalid selector in settings
    }
  }

  // Capture phase on window runs before the page's listeners (including React's root
  // and Dropzone's listeners on its element).
  window.addEventListener("input", onFileEvent, true);
  window.addEventListener("change", onFileEvent, true);
  window.addEventListener("drop", onDrop, true);

  // --- File inputs -----------------------------------------------------------

  // input element -> { signature, generation } of the selection being converted
  const jobs = new WeakMap();
  const hookedRoots = new WeakSet();
  let lastGeneration = 0;

  function onFileEvent(event) {
    // Events we (or the page) dispatch from script are left alone.
    if (!event.isTrusted) return;
    // composedPath()[0] is the real target, even inside an open shadow root.
    const input = event.composedPath()[0];
    if (input?.localName !== "input" || input.type !== "file") return;

    const signature = signatureOf(input.files);
    const job = jobs.get(input);
    if (job?.signature === signature) {
      // The second event (input + change both fire) of a selection already in progress.
      event.stopImmediatePropagation();
      return;
    }
    if (job) {
      // A new selection replaces the one still converting; its results are dropped.
      jobs.delete(input);
      cancelVideo();
      hideToast();
    }
    if (!shouldInterceptInput(input)) return;

    event.stopImmediatePropagation();
    hookShadowRoot(input);
    const generation = ++lastGeneration;
    jobs.set(input, { signature, generation });
    convertInput(input, [...input.files], generation);
  }

  function shouldInterceptInput(input) {
    const selector = activeSelector();
    if (!selector || !matchesSelector(input, selector)) return false;
    return [...(input.files ?? [])].some((file) => convertibleKind(file, input.accept));
  }

  function signatureOf(files) {
    return [...(files ?? [])].map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|");
  }

  /** `change` isn't composed, so from inside a shadow root it never reaches window. */
  function hookShadowRoot(input) {
    const root = input.getRootNode();
    if (!root.host || hookedRoots.has(root)) return;
    hookedRoots.add(root);
    root.addEventListener("change", onFileEvent, true);
  }

  async function convertInput(input, files, generation) {
    const isCurrent = () => jobs.get(input)?.generation === generation;
    let stats = null;
    try {
      const outcome = await convertAll(files, input.accept, isCurrent);
      if (!outcome) return; // a newer selection replaced this one
      if (outcome.stats.converted > 0) input.files = toTransfer(outcome.files).files;
      stats = outcome.stats;
    } catch (error) {
      console.error("[webpify] conversion failed, the original files are kept:", error);
    }
    if (!isCurrent()) return;
    jobs.delete(input);
    // Hand the selection to the page as if the user had just picked it.
    input.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    showOutcome(stats);
  }

  // --- Drop zones ------------------------------------------------------------

  function onDrop(event) {
    if (!event.isTrusted) return; // includes the drop we re-dispatch
    const selector = activeSelector();
    if (!selector) return;
    const path = event.composedPath().filter((node) => node.nodeType === Node.ELEMENT_NODE);
    const target = path[0];
    // Drops onto a file input are handled by the browser and arrive as input/change.
    if (!target || (target.localName === "input" && target.type === "file")) return;
    const zone = path.find((element) => matchesSelector(element, selector));
    if (!zone) return;

    const transfer = event.dataTransfer;
    if (!transfer || hasDirectory(transfer)) return; // leave folder drops to the page
    // The DataTransfer is only readable during this event, so copy the files now.
    const files = [...transfer.files];
    const accept = dropAccept(zone);
    if (!files.some((file) => convertibleKind(file, accept))) return;

    event.preventDefault(); // otherwise the browser would open the dropped file
    event.stopImmediatePropagation();
    convertDrop(target, zone, files, accept, event);
  }

  function hasDirectory(transfer) {
    return [...transfer.items].some((item) => item.kind === "file" && item.webkitGetAsEntry?.()?.isDirectory);
  }

  /**
   * Accept rules for a drop zone: those of a file input inside it, or, for
   * Dropzone.js, of its hidden input (which it appends to <body>, not the zone).
   */
  function dropAccept(zone) {
    const inner = zone.querySelector('input[type="file"]');
    if (inner) return inner.accept;
    if (zone.classList.contains("dropzone")) {
      // With several Dropzones we can't tell which input is this one's; use the strictest.
      const hidden = [...document.querySelectorAll("input.dz-hidden-input")];
      return hidden.find((input) => !acceptAllows(input.accept, "image") || !acceptAllows(input.accept, "video"))?.accept ?? "";
    }
    return "";
  }

  async function convertDrop(target, zone, files, accept, original) {
    let outcome = null;
    try {
      outcome = await convertAll(files, accept, () => true);
    } catch (error) {
      console.error("[webpify] conversion failed, the original files are kept:", error);
    }
    const drop = new DragEvent("drop", {
      bubbles: true,
      cancelable: true,
      composed: true,
      dataTransfer: toTransfer(outcome?.files ?? files),
      clientX: original.clientX,
      clientY: original.clientY,
      screenX: original.screenX,
      screenY: original.screenY,
      altKey: original.altKey,
      ctrlKey: original.ctrlKey,
      metaKey: original.metaKey,
      shiftKey: original.shiftKey,
    });
    (target.isConnected ? target : zone).dispatchEvent(drop);
    showOutcome(outcome?.stats ?? null);
  }

  // --- Conversion ------------------------------------------------------------

  /**
   * Convert the convertible files one at a time, keeping the rest. Returns
   * { files, stats }, or null as soon as `isCurrent()` turns false.
   */
  async function convertAll(files, accept, isCurrent) {
    const kinds = files.map((file) => convertibleKind(file, accept));
    const count = (kind) => kinds.filter((k) => k === kind).length;
    const total = count("image") + count("video");
    // converted/failed/total count files; kinds says how many of each were picked; larger counts
    // results that weren't smaller; notes say why videos were kept.
    const stats = {
      converted: 0,
      failed: 0,
      total,
      before: 0,
      after: 0,
      kinds: { image: count("image"), video: count("video") },
      larger: 0,
      notes: [],
    };
    const results = [];
    let index = 0;
    for (const [i, file] of files.entries()) {
      const kind = kinds[i];
      if (!kind) {
        results.push(file);
        continue;
      }
      const progress = { current: ++index, total, kind };
      showProgress(progress);
      let outcome = null; // { file }, or for a video { kept: reason } or { cancelled: true }
      try {
        outcome = kind === "image" ? { file: await convertFile(file) } : await convertVideo(file, progress);
      } catch (error) {
        console.warn(`[webpify] kept ${file.name}:`, error);
        stats.failed++;
      }
      if (!isCurrent()) return null;
      const result = outcome?.file;
      if (result && !(settings.keepIfLarger && result.size >= file.size)) {
        results.push(result);
        stats.converted++;
        stats.before += file.size;
        stats.after += result.size;
      } else {
        results.push(file);
        if (result) stats.larger++;
        else if (outcome?.cancelled) stats.notes.push("Cancelled");
        else if (outcome?.kept) stats.notes.push(outcome.kept);
      }
    }
    return { files: results, stats };
  }

  // Safari sends messages as JSON, so a File can't go through as it is. The background says so
  // on the first file, and from then on the bytes go both ways as base64 text.
  let sendAsText = false;

  async function convertFile(file) {
    const options = {
      quality: settings.quality,
      maxDimension: settings.maxDimension,
      lossless: settings.lossless,
      sharpGraphics: settings.sharpGraphics,
    };
    let response = await requestConversion(file, options);
    if (response?.sendAsText && !sendAsText) {
      sendAsText = true;
      response = await requestConversion(file, options);
    }
    if (!response?.ok) throw new Error(response?.error ?? "no response from the background");
    const bytes = sendAsText ? Uint8Array.fromBase64(response.base64) : response.bytes;
    if (!ArrayBuffer.isView(bytes) && !(bytes instanceof ArrayBuffer)) {
      throw new Error("no bytes came back from the background");
    }
    const name = `${file.name.replace(/\.[^.]*$/, "")}.webp`;
    return new File([bytes], name, { type: "image/webp", lastModified: file.lastModified });
  }

  async function requestConversion(file, options) {
    const message = sendAsText
      ? { type: "convert", base64: new Uint8Array(await file.arrayBuffer()).toBase64(), options }
      : { type: "convert", file, options };
    return withTimeout(api.runtime.sendMessage(message), CONVERT_TIMEOUT_MS);
  }

  function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`timed out after ${ms / 1000} s`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  function toTransfer(files) {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(file);
    return transfer;
  }

  // --- Videos ------------------------------------------------------------------
  // Converted here in the page by video.js (WebCodecs isn't available to service workers, and
  // Safari can't pass a video through a message). The background injects video.js and the
  // mediabunny library into this frame on the first video; both are plain scripts.

  let videoConverter = null; // Promise of globalThis.webpifyVideo, loaded on first use
  let activeVideo = null; // AbortController of the conversion in progress

  function loadVideoConverter() {
    videoConverter ??= api.runtime
      .sendMessage({ type: "load-video" })
      .then((response) => {
        if (!response?.ok) throw new Error(response?.error ?? "no response from the background");
        if (!globalThis.webpifyVideo) throw new Error("the video converter didn't load");
        return globalThis.webpifyVideo;
      })
      .catch((error) => {
        videoConverter = null; // try again on the next video
        throw error;
      });
    return videoConverter;
  }

  function cancelVideo() {
    activeVideo?.abort("cancelled");
  }

  /** Resolves like video.js's convert: { file }, { kept: reason } or { cancelled: true }. */
  async function convertVideo(file, progress) {
    const converter = await loadVideoConverter();
    const controller = new AbortController();
    activeVideo = controller;
    const started = performance.now();
    let stall = setTimeout(() => controller.abort("stalled"), VIDEO_STALL_MS);
    try {
      const conversion = converter.convert(file, settings, {
        signal: controller.signal,
        onProgress(fraction) {
          clearTimeout(stall);
          stall = setTimeout(() => controller.abort("stalled"), VIDEO_STALL_MS);
          const elapsed = (performance.now() - started) / 1000;
          const remaining = fraction > 0.03 && elapsed > 2 ? (elapsed / fraction) * (1 - fraction) : null;
          showProgress({ ...progress, fraction, remaining, cancel: cancelVideo });
        },
      });
      // The signal ends the wait at once, even where the converter can't notice it (while it
      // reads the file, say); whatever it still does is dropped.
      const aborted = new Promise((resolve) => controller.signal.addEventListener("abort", () => resolve({ cancelled: true }), { once: true }));
      const outcome = await Promise.race([conversion, aborted]);
      conversion.catch(() => {});
      if (outcome.cancelled && controller.signal.reason === "stalled") {
        return { kept: "The conversion stopped making progress" };
      }
      return outcome;
    } finally {
      clearTimeout(stall);
      if (activeVideo === controller) activeVideo = null;
    }
  }

  // --- Toast ---------------------------------------------------------------
  // The bid .toast (styles/overlay.css) in a shadow root, so the site's CSS can't reach it
  // and ours can't leak out. The background hands over the stylesheet text, which keeps every
  // extension file private to the extension.

  const SVG_NS = "http://www.w3.org/2000/svg";
  const ICONS = {
    // The orange round check of a finished toast.
    check: ["0 0 16 16", "2.2", [["path", { d: "M3.5 8.5l3 3 6-7" }]]],
    // The danger mark for an error.
    alert: ["0 0 20 20", "1.8", [
      ["circle", { cx: "10", cy: "10", r: "8.1" }],
      ["path", { d: "M10 5.75v5" }],
      ["circle", { cx: "10", cy: "14", r: "0.9", fill: "currentColor", stroke: "none" }],
    ]],
  };
  const MAX_SEGMENTS = 12; // one progress segment per image, up to this many

  let toastMount = null; // Promise of the .toast element, created on first use
  let hideTimer = 0;

  function toastElement() {
    toastMount ??= mountToast().catch((error) => {
      toastMount = null;
      throw error;
    });
    return toastMount;
  }

  async function mountToast() {
    const response = await api.runtime.sendMessage({ type: "ui-css" });
    if (!response?.ok) throw new Error(response?.error ?? "no styles");
    const host = document.createElement("webpify-ui");
    host.style.setProperty("all", "initial"); // through the CSSOM, so a site's CSP can't block it
    const root = host.attachShadow({ mode: "closed" });
    adoptStyles(root, response.css);
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    root.append(toast);
    document.documentElement.append(host); // <html>, not <body>: some sites replace <body>
    return toast;
  }

  /** Constructed stylesheets are immune to a site's style-src CSP; Firefox content scripts need the <style> fallback. */
  function adoptStyles(root, css) {
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(css);
      root.adoptedStyleSheets = [sheet];
    } catch {
      const style = document.createElement("style");
      style.textContent = css;
      root.prepend(style);
    }
  }

  async function renderToast({ icon = null, title, meta = "", progress = null, action = null }, hideAfterMs = 0) {
    let toast;
    try {
      toast = await toastElement();
    } catch (error) {
      console.warn("[webpify] can't show the notice:", error); // conversion works without it
      return;
    }
    if (!toast.isConnected) document.documentElement.append(toast.getRootNode().host);

    const parts = [];
    if (icon) {
      const mark = span(icon === "alert" ? "toast-icon toast-icon--alert" : "toast-icon");
      mark.append(svgIcon(...ICONS[icon]));
      parts.push(mark);
    }
    const text = span("toast-text");
    text.append(span("toast-title", title));
    if (meta) text.append(span("toast-meta", meta));
    if (progress && progress.total <= MAX_SEGMENTS) text.append(progressTrack(progress));
    parts.push(text);
    if (action) {
      // A link-styled button, e.g. Cancel while a video converts.
      const button = document.createElement("button");
      button.type = "button";
      button.className = "toast-link";
      button.textContent = action.label;
      button.addEventListener("click", action.onClick);
      parts.push(button);
    }
    toast.replaceChildren(...parts);

    // A frame after it's in the page, so it slides in rather than appearing.
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    clearTimeout(hideTimer);
    if (hideAfterMs > 0) hideTimer = setTimeout(hideToast, hideAfterMs);
  }

  function hideToast() {
    clearTimeout(hideTimer);
    toastMount?.then((toast) => toast.classList.remove("is-visible"), () => {});
  }

  /** A line icon in the bid manner: round caps and joins, currentColor. */
  function svgIcon(viewBox, strokeWidth, shapes) {
    const svg = setAttributes(document.createElementNS(SVG_NS, "svg"), {
      viewBox,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": strokeWidth,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      "aria-hidden": "true",
    });
    for (const [tag, attributes] of shapes) svg.append(setAttributes(document.createElementNS(SVG_NS, tag), attributes));
    return svg;
  }

  function setAttributes(element, attributes) {
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    return element;
  }

  function span(className, text) {
    const element = document.createElement("span");
    element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  /** Earlier images done, the current one filling with gold. */
  function progressTrack({ current, total }) {
    const track = span("progress-track");
    for (let i = 1; i <= total; i++) {
      track.append(span(i < current ? "progress-seg is-done" : i === current ? "progress-seg is-active" : "progress-seg"));
    }
    return track;
  }

  /** While converting: which file of how many; for a video, how far along, and a Cancel link. */
  function showProgress({ current, total, kind, fraction = null, remaining = null, cancel = null }) {
    let title = `Converting ${current} of ${total} files`;
    if (total === 1) title = kind === "video" ? "Converting the video to MP4" : "Converting the image to WebP";
    let meta = "";
    if (fraction !== null) {
      meta = `${Math.floor(fraction * 100)}%`;
      if (remaining !== null) meta += ` · about ${formatDuration(remaining)} left`;
    } else if (kind === "video") {
      meta = "Reading the video…";
    }
    renderToast({
      title,
      meta,
      progress: { current, total },
      action: cancel ? { label: "Cancel", onClick: cancel } : null,
    });
  }

  /** The result: what was converted and saved, or what was kept and why. */
  function showOutcome(stats) {
    const plural = (n, one, many) => (n === 1 ? one : many);
    const { converted = 0, failed = 0, total = 1, before = 0, after = 0, larger = 0, notes = [], kinds = {} } = stats ?? {};
    // "image", "video" or "file", depending on what was picked; the format the title names.
    const onlyVideos = kinds.video > 0 && !kinds.image;
    const onlyImages = kinds.image > 0 && !kinds.video;
    const noun = (n) => plural(n, onlyVideos ? "video" : onlyImages ? "image" : "file", onlyVideos ? "videos" : onlyImages ? "images" : "files");
    const format = onlyVideos ? "MP4" : onlyImages ? "WebP" : null;

    if (!stats || (converted === 0 && failed > 0 && notes.length === 0)) {
      renderToast(
        {
          icon: "alert",
          title: `The ${noun(total)} ${plural(total, "wasn't", "weren't")} converted`,
          meta: plural(total, "The original file is used instead.", "The original files are used instead."),
        },
        7000,
      );
      return;
    }
    if (converted === 0) {
      const why =
        notes[0] ??
        (larger > 0 ? `The ${format ?? "converted"} ${plural(total, "version", "versions")} ${plural(total, "wasn't", "weren't")} smaller.` : "");
      renderToast({ title: `Kept the original ${noun(total)}`, meta: why }, notes.length > 0 ? 6000 : 3500);
      return;
    }
    const saved = Math.round((1 - after / before) * 100);
    const details = [`${formatBytes(before)} → ${formatBytes(after)}, ${saved}% smaller`];
    const kept = total - converted - failed;
    if (kept > 0) details.push(`${kept} kept as ${plural(kept, "it was", "they were")}`);
    if (failed > 0) details.push(`${failed} couldn't be converted`);
    if (notes.length > 0) details.push(notes[0]);
    renderToast(
      {
        icon: "check",
        title: `${converted} ${noun(converted)} converted${format ? ` to ${format}` : ""}`,
        meta: details.join(" · "),
      },
      failed > 0 || notes.length > 0 ? 7000 : 3500,
    );
  }

  function formatBytes(bytes) {
    if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(2)} GB`;
    return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;
  }

  /** Seconds as m:ss, or h:mm:ss from an hour. */
  function formatDuration(seconds) {
    const s = Math.max(0, Math.round(seconds));
    const parts = s >= 3600 ? [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60] : [Math.floor(s / 60), s % 60];
    return parts.map((n, i) => (i === 0 ? String(n) : String(n).padStart(2, "0"))).join(":");
  }
})();
