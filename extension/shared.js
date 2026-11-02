// Shared by content.js, video.js and the options page. Loaded as a classic script, so it
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
    keepIfLarger: true, // keep the original when the WebP or MP4 comes out bigger
    videos: true, // convert videos to H.264 MP4 (see video.js)
    videoMaxDimension: 1920, // longest side of a converted video; 0 keeps the original size
    videoQuality: "standard", // "lower" | "standard" | "higher"
    sites: [], // [{ pattern, selector }]
    pausedUntil: 0, // timestamp; nothing is converted anywhere until then
  }),

  /** Types the image converter takes. */
  IMAGE_TYPES: Object.freeze(["image/jpeg", "image/png", "image/bmp"]),

  /** Video containers the video converter can read (see video.js); browsers report these types. */
  VIDEO_TYPES: Object.freeze(["video/mp4", "video/quicktime", "video/webm", "video/x-matroska", "video/3gpp", "video/x-m4v", "video/mp2t"]),

  /** True for a video file. Some browsers give no type for MKV and TS files, so the name counts too. */
  isVideoFile(file) {
    if (globalThis.webpify.VIDEO_TYPES.includes(file.type)) return true;
    return !file.type && /\.(mp4|m4v|mov|webm|mkv|3gp|3g2|ts)$/i.test(file.name);
  },

  /**
   * True when an input's `accept` lets the converted file through: WebP for an image, MP4 for a
   * video. An input that only takes `image/jpeg,image/png` would reject a WebP, so it's left alone.
   */
  acceptAllows(accept, kind) {
    const allowed = kind === "video" ? ["video/*", "video/mp4", ".mp4"] : ["image/*", "image/webp", ".webp"];
    const tokens = (accept ?? "")
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    return tokens.length === 0 || tokens.some((t) => allowed.includes(t));
  },

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
