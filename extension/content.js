// webpify content script. Two ways in, one conversion loop:
// - File inputs: holds back the input/change events, converts the picked images
//   to WebP in the background, swaps the input's files and re-fires the events.
// - Drop zones (e.g. Dropzone.js): holds back the drop, converts, and re-dispatches
//   a drop carrying the WebP files.
// Either way the page's own upload code sees WebP files as if the user had chosen them.
(() => {
  if (globalThis.webpifyContentLoaded) return;
  globalThis.webpifyContentLoaded = true;

  const api = globalThis.browser ?? globalThis.chrome;
  const { DEFAULTS, DEFAULT_SELECTOR, matchesPattern } = globalThis.webpify;
  const CONVERTIBLE = new Set(["image/jpeg", "image/png", "image/bmp"]);
  const CONVERT_TIMEOUT_MS = 60_000;

  const isConvertible = (file) => CONVERTIBLE.has(file.type);

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

  /** An input that only accepts e.g. JPEG/PNG would reject WebP, so leave it alone. */
  function acceptsWebp(accept) {
    const tokens = accept
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return tokens.length === 0 || tokens.some((t) => ["image/*", "image/webp", ".webp"].includes(t));
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
    if (!selector || !matchesSelector(input, selector) || !acceptsWebp(input.accept)) return false;
    return [...(input.files ?? [])].some(isConvertible);
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
      const outcome = await convertAll(files, isCurrent);
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
    showToast(stats ? summary(stats) : "conversion failed, kept the originals", 4000);
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
    if (!files.some(isConvertible) || !acceptsWebp(dropAccept(zone))) return;

    event.preventDefault(); // otherwise the browser would open the dropped file
    event.stopImmediatePropagation();
    convertDrop(target, zone, files, event);
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
      return hidden.find((input) => !acceptsWebp(input.accept))?.accept ?? "";
    }
    return "";
  }

  async function convertDrop(target, zone, files, original) {
    let outcome = null;
    try {
      outcome = await convertAll(files, () => true);
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
    showToast(outcome ? summary(outcome.stats) : "conversion failed, kept the originals", 4000);
  }

  // --- Conversion ------------------------------------------------------------

  /**
   * Convert the convertible files one at a time, keeping the rest. Returns
   * { files, stats }, or null as soon as `isCurrent()` turns false.
   */
  async function convertAll(files, isCurrent) {
    const total = files.filter(isConvertible).length;
    const stats = { converted: 0, total, before: 0, after: 0 };
    const results = [];
    let index = 0;
    for (const file of files) {
      if (!isConvertible(file)) {
        results.push(file);
        continue;
      }
      showToast(`converting ${++index}/${total} to WebP…`);
      const webp = await convertFile(file).catch((error) => {
        console.warn(`[webpify] kept ${file.name}:`, error);
        return null;
      });
      if (!isCurrent()) return null;
      if (webp && !(settings.keepIfLarger && webp.size >= file.size)) {
        results.push(webp);
        stats.converted++;
        stats.before += file.size;
        stats.after += webp.size;
      } else {
        results.push(file);
      }
    }
    return { files: results, stats };
  }

  async function convertFile(file) {
    const options = {
      quality: settings.quality,
      maxDimension: settings.maxDimension,
      lossless: settings.lossless,
    };
    const response = await withTimeout(
      api.runtime.sendMessage({ type: "convert", file, options }),
      CONVERT_TIMEOUT_MS,
    );
    if (!response?.ok) throw new Error(response?.error ?? "no response from the background");
    const { bytes } = response;
    if (!ArrayBuffer.isView(bytes) && !(bytes instanceof ArrayBuffer)) {
      throw new Error("no bytes came back (structured-clone messaging unavailable?)");
    }
    const name = `${file.name.replace(/\.[^.]*$/, "")}.webp`;
    return new File([bytes], name, { type: "image/webp", lastModified: file.lastModified });
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

  // --- Toast -----------------------------------------------------------------

  let toastHost = null;
  let toastText = null;
  let hideTimer = 0;

  function showToast(message, hideAfterMs = 0) {
    if (!toastHost) {
      toastHost = document.createElement("webpify-toast");
      const root = toastHost.attachShadow({ mode: "closed" });
      root.innerHTML = `<style>
        :host { all: initial; position: fixed; right: 16px; bottom: 16px; z-index: 2147483647; }
        div { font: 13px/1.4 system-ui, sans-serif; color: #fff; background: #1d1c2c;
              padding: 10px 14px; border-radius: 8px; box-shadow: 0 4px 16px rgb(0 0 0 / 0.3); }
      </style><div></div>`;
      toastText = root.querySelector("div");
    }
    if (!toastHost.isConnected) document.documentElement.append(toastHost);
    toastText.textContent = `webpify: ${message}`;
    clearTimeout(hideTimer);
    if (hideAfterMs > 0) hideTimer = setTimeout(hideToast, hideAfterMs);
  }

  function hideToast() {
    clearTimeout(hideTimer);
    toastHost?.remove();
  }

  function summary({ converted, total, before, after }) {
    if (converted === 0) return total === 1 ? "kept the original image" : "kept the original images";
    const saved = Math.round((1 - after / before) * 100);
    const kept = total - converted;
    const keptNote = kept > 0 ? `, ${kept} kept as is` : "";
    return `${converted} image${converted === 1 ? "" : "s"} → WebP, ${formatBytes(before)} → ${formatBytes(after)} (−${saved}%)${keptNote}`;
  }

  function formatBytes(bytes) {
    return bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;
  }
})();
