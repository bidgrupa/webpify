// Shared by content.js and the options page. Loaded as a classic script, so it
// publishes one global object instead of top-level declarations (a content
// script injected twice would otherwise throw on redeclaration).
globalThis.webpify = {
  // Matches file inputs (Dropzone.js's hidden one included) and drops onto, or
  // inside, an element with Dropzone.js's `dropzone` class.
  DEFAULT_SELECTOR: 'input[type="file"], .dropzone',

  DEFAULTS: Object.freeze({
    quality: 80,
    maxDimension: 2560, // 0 keeps the original size
    lossless: false,
    sharpGraphics: true, // PNG/BMP screenshots and logos go lossless when that stays small
    keepIfLarger: true, // keep the original when the WebP comes out bigger
    sites: [], // [{ pattern, selector }]
    pausedUntil: 0, // timestamp; nothing is converted anywhere until then
  }),

  /** True when `href` matches a WebExtension match pattern. Ports are ignored, as in browsers. */
  matchesPattern(pattern, href) {
    let url;
    try {
      url = new URL(href);
    } catch {
      return false;
    }
    const scheme = url.protocol.slice(0, -1);
    if (pattern === "<all_urls>") return ["http", "https", "file", "ftp"].includes(scheme);

    const parts = /^(\*|https?|file|ftp):\/\/(\*|\*\.[^/*]+|[^/*]*)(\/.*)$/.exec(pattern);
    if (!parts) return false;
    const [, patternScheme, host, path] = parts;

    if (patternScheme === "*" ? !["http", "https"].includes(scheme) : patternScheme !== scheme) {
      return false;
    }
    if (host.startsWith("*.")) {
      const base = host.slice(2);
      if (url.hostname !== base && !url.hostname.endsWith(`.${base}`)) return false;
    } else if (host !== "*" && url.hostname !== host) {
      return false;
    }
    const escaped = path.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(`^${escaped.join(".*")}$`).test(url.pathname + url.search);
  },
};
