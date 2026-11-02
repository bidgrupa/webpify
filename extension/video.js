// webpify video converter. Runs inside the page, next to content.js: the background injects it
// together with vendor/mediabunny.js the first time a video is picked on a page (see "load-video"
// in background.js). WebCodecs, the browser's own decoders and encoders, isn't available to
// service workers, and Safari can't pass a video through a message, so the work happens here.
//
// mediabunny reads the file (lazily, from the Blob), drives the codecs and writes the MP4.
// `plan` decides what to do with a file and is plain logic; tests/video-test.mjs runs it in Node.
(() => {
  if (globalThis.webpifyVideo) return;

  const { isVideoFile } = globalThis.webpify;

  const MAX_INPUT_BYTES = 2 * 1024 ** 3; // bigger files pass through unchanged
  const MAX_FRAME_RATE = 30; // 60 fps phone clips are halved: half the size, nobody notices on a web page
  const KEY_FRAME_INTERVAL = 2; // seconds; what streaming players expect
  // The source counts as compact when its bitrate is at most this much above the target.
  const COMPACT_TOLERANCE = 1.25;
  // A transcode whose output bitrate is below this share of what was asked for came out wrong
  // (Firefox on some Linux builds ignores the bitrate and produces mush), so the original is kept.
  const BROKEN_BITRATE_RATIO = 0.25;
  const CODEC_NAMES = { avc: "H.264", hevc: "HEVC", vp8: "VP8", vp9: "VP9", av1: "AV1", prores: "ProRes" };

  // --- Decisions ---------------------------------------------------------------

  /**
   * The bitrate to aim for, in bits per second. Like mediabunny's presets: 3 Mbit/s for 1080p,
   * scaled a little under linearly with the pixel count, then by the frame rate and the quality
   * setting. 1080p30 standard ≈ 3.0 Mbit/s, 720p30 ≈ 1.4, 4K30 ≈ 11.5. To be tuned on real uploads.
   */
  function targetBitrate(width, height, frameRate, quality) {
    const factor = { lower: 0.6, standard: 1, higher: 1.8 }[quality] ?? 1;
    const pixels = ((width * height) / (1920 * 1080)) ** 0.95;
    const motion = Math.sqrt(Math.min(Math.max(frameRate || 30, 10), 60) / 30);
    const bitrate = 3e6 * pixels * motion * factor;
    return Math.round(Math.min(Math.max(bitrate, 250e3), 25e6) / 1e3) * 1e3;
  }

  /**
   * The size that fits `maxDimension` on the longest side (0 keeps the size), as even numbers:
   * H.264 encoders want them, Safari's refuses odd ones. Null when nothing has to change.
   */
  function fitDimensions(width, height, maxDimension) {
    const even = (n) => Math.max(2, Math.floor(n / 2) * 2);
    const longest = Math.max(width, height);
    const scale = maxDimension > 0 && longest > maxDimension ? maxDimension / longest : 1;
    const fitted = { width: even(width * scale), height: even(height * scale) };
    return fitted.width === width && fitted.height === height ? null : fitted;
  }

  /**
   * What to do with a video, from what `inspect` found out and the settings:
   *   { action: "keep", reason, fine? }  the original is uploaded; `fine` when it's already a compact MP4
   *   { action: "remux" }                 the tracks are copied into an MP4 as they are, in seconds
   *   { action: "transcode", width, height, frameRate?, bitrate }  re-encoded to H.264
   */
  function plan(info, settings) {
    const keep = (reason, fine = false) => ({ action: "keep", reason, fine });
    if (!info.readable) return keep("This video format isn't supported");
    if (!info.codec) return keep("The video's format isn't recognised");
    if (!info.decodable) return keep(`This browser can't read ${CODEC_NAMES[info.codec] ?? info.codec} video`);
    if (info.hdr) return keep("HDR video is kept as it is");
    if (info.audioUndecodable) return keep("The sound can't be converted");

    const fitted = fitDimensions(info.width, info.height, settings.videoMaxDimension);
    const width = fitted?.width ?? info.width;
    const height = fitted?.height ?? info.height;
    const frameRate = info.frameRate > MAX_FRAME_RATE + 0.5 ? MAX_FRAME_RATE : undefined;
    const bitrate = targetBitrate(width, height, frameRate ?? info.frameRate, settings.videoQuality);

    const compact = info.codec === "avc" && !fitted && !frameRate && info.bitrate <= bitrate * COMPACT_TOLERANCE;
    if (compact) return info.isMp4 ? keep("It's already a compact MP4", true) : { action: "remux" };
    return { action: "transcode", width, height, frameRate, bitrate };
  }

  // --- Reading the file ----------------------------------------------------------

  /** What `plan` needs to know, from the file's index: no decoding happens here. */
  async function inspect(input) {
    const M = globalThis.Mediabunny;
    if (!(await input.canRead())) return { readable: false };
    const format = await input.getFormat();
    const video = await input.getPrimaryVideoTrack();
    if (!video) return { readable: true, codec: null };
    const audio = await input.getPrimaryAudioTrack();
    const [codec, decodable, width, height, duration, hdr, stats, frameRate, audioCodec, audioDecodable] =
      await Promise.all([
        video.getCodec(),
        video.canDecode(),
        video.getDisplayWidth(),
        video.getDisplayHeight(),
        input.computeDuration(),
        video.hasHighDynamicRange(),
        video.computePacketStats(400), // the first few hundred packets: a quick bitrate estimate
        video.computeFrameRateMetrics({ targetPacketCount: 128 }).then((metrics) => metrics.averageFrameRate),
        audio?.getCodec() ?? null,
        audio?.canDecode() ?? true,
      ]);
    return {
      readable: true,
      isMp4: format === M.MP4,
      container: format.name,
      codec,
      decodable,
      width,
      height,
      duration,
      hdr,
      bitrate: stats.averageBitrate,
      frameRate,
      audioCodec,
      audioUndecodable: audioCodec !== null && !audioDecodable,
    };
  }

  // --- Firefox: WebCodecs callbacks through Xray wrappers --------------------------

  // A Firefox content script sees the page's objects through Xray wrappers, and WebCodecs hands
  // its callbacks page-realm objects: the metadata of an encoder's first chunk arrives as one.
  // mediabunny reads the decoder description's constructor and writes a codec string into that
  // metadata, and both are refused through the wrapper ("permission denied"); the chunk is then
  // lost and the MP4 fails for want of a decoder configuration. So in Firefox the encoders are
  // wrapped to copy the metadata into this realm first. Chrome and Safari have no Xrays.
  const XRAYS = typeof window !== "undefined" && window.wrappedJSObject !== undefined;

  /** A plain copy of `value` in this realm: buffers byte for byte, objects key by key. */
  function toOwnRealm(value) {
    if (value === null || typeof value !== "object") return value;
    if (typeof value.byteLength === "number" && typeof value.slice === "function") {
      const view = new Uint8Array(value.buffer ?? value, value.byteOffset ?? 0, value.byteLength);
      const copy = new Uint8Array(view.length);
      copy.set(view);
      return copy;
    }
    if (typeof value.toJSON === "function") return toOwnRealm(value.toJSON()); // VideoColorSpace
    if (Array.isArray(value)) return value.map(toOwnRealm);
    const copy = {};
    for (const key of Object.keys(value)) copy[key] = toOwnRealm(value[key]);
    return copy;
  }

  function wrapEncoder(name) {
    const Native = globalThis[name];
    if (!XRAYS || typeof Native !== "function") return;
    function Encoder(init) {
      return new Native({ ...init, output: (chunk, metadata) => init.output(chunk, metadata === undefined ? undefined : toOwnRealm(metadata)) });
    }
    Encoder.isConfigSupported = (config) => Native.isConfigSupported(config);
    globalThis[name] = Encoder;
  }
  wrapEncoder("VideoEncoder");
  wrapEncoder("AudioEncoder");

  // --- Reading the file ----------------------------------------------------------

  /**
   * Hands mediabunny the file's bytes, chunk by chunk as it asks. A plain BlobSource would do in
   * Chrome and Safari, but a Firefox content script sees the page's File through Xray wrappers:
   * a stream taken from it never delivers, and the buffers its reads return live in the page's
   * realm, where the library trips over them ("permission denied" on their constructor). So each
   * chunk is copied into this realm, which costs little next to decoding it.
   */
  function fileSource(M, file) {
    return new M.CustomSource({
      getSize: () => file.size,
      prefetchProfile: "fileSystem",
      async read(start, end) {
        const view = new Uint8Array(await file.slice(start, end).arrayBuffer());
        const bytes = new Uint8Array(view.length);
        bytes.set(view);
        return bytes;
      },
    });
  }

  // --- Converting ------------------------------------------------------------------

  /**
   * Convert `file` as the settings say. Resolves to { file } with the MP4, { kept: reason, fine? }
   * when the original should be uploaded, or { cancelled: true } after `signal` aborts.
   * `onProgress(fraction)` is called as the conversion advances. Throws when something breaks.
   */
  async function convert(file, settings, { onProgress = () => {}, signal } = {}) {
    const M = globalThis.Mediabunny;
    if (!M) throw new Error("mediabunny isn't loaded");
    if (typeof VideoEncoder === "undefined") {
      return { kept: globalThis.isSecureContext ? "This browser can't convert video" : "Video conversion needs a secure (https) page" };
    }
    if (!isVideoFile(file)) return { kept: "Not a video" };
    if (file.size > MAX_INPUT_BYTES) return { kept: "The video is too big to convert here" };

    const input = new M.Input({ formats: M.ALL_FORMATS, source: fileSource(M, file) });
    console.info(`[webpify] reading ${file.name}`);
    const info = await inspect(input);
    const decision = plan(info, settings);
    console.info(`[webpify] ${file.name}:`, info, decision);
    if (decision.action === "keep") return { kept: decision.reason, fine: decision.fine };

    const video = {};
    if (decision.action === "transcode") {
      const { width, height, frameRate, bitrate } = decision;
      if (!(await M.canEncodeVideo("avc", { width, height }))) return { kept: "This browser can't make H.264 video" };
      video.codec = "avc";
      video.quality = new M.Quality({ bitrate });
      video.keyFrameInterval = KEY_FRAME_INTERVAL;
      video.hardwareAcceleration = "no-preference"; // "prefer-hardware" fails outright without one
      // Only the longest side: mediabunny keeps the aspect ratio and makes the other side even.
      if (width !== info.width || height !== info.height) {
        if (width >= height) video.width = width;
        else video.height = height;
      }
      if (frameRate) video.frameRate = frameRate;
    }

    const output = new M.Output({
      format: new M.Mp4OutputFormat({ fastStart: "in-memory" }), // index first: streams on the web
      target: new M.BufferTarget(),
    });
    const conversion = await M.Conversion.init({
      input,
      output,
      video,
      tags: {}, // drops the recording's metadata, location included, as the image converter drops EXIF
    });
    // Every track has to make it: a video without its sound would be a nasty surprise.
    const dropped = conversion.discardedTracks.find((d) => d.reason !== "discarded_by_user");
    if (dropped || !conversion.isValid) {
      await conversion.cancel().catch(() => {});
      return { kept: dropped?.track.type === "audio" ? "The sound can't be converted" : "This video can't be converted" };
    }

    if (signal?.aborted) return { cancelled: true };
    const onAbort = () => conversion.cancel().catch(() => {});
    signal?.addEventListener("abort", onAbort, { once: true });
    conversion.onProgress = (fraction) => onProgress(fraction);
    try {
      await conversion.execute();
    } catch (error) {
      if (signal?.aborted || error instanceof M.ConversionCanceledError) return { cancelled: true };
      throw error;
    } finally {
      signal?.removeEventListener("abort", onAbort);
    }

    const bytes = output.target.buffer;
    if (!bytes || bytes.byteLength === 0) throw new Error("the conversion produced nothing");
    if (decision.action === "transcode" && info.duration > 2) {
      const outputBitrate = (bytes.byteLength * 8) / info.duration;
      if (outputBitrate < decision.bitrate * BROKEN_BITRATE_RATIO) return { kept: "The conversion came out wrong" };
    }
    const name = `${file.name.replace(/\.[^.]*$/, "")}.mp4`;
    return { file: new File([bytes], name, { type: "video/mp4", lastModified: file.lastModified }) };
  }

  globalThis.webpifyVideo = { MAX_INPUT_BYTES, MAX_FRAME_RATE, targetBitrate, fitDimensions, plan, inspect, convert };
})();
