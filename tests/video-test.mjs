// Checks the video converter's decisions (extension/video.js) in Node, without a browser:
//   node tests/video-test.mjs
// `plan` works from what `inspect` found out about a file, so neither WebCodecs nor mediabunny
// is needed here; the conversion itself is tried in each browser on the demo page.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const extension = new URL("../extension/", import.meta.url);
const context = vm.createContext({ console });
for (const file of ["shared.js", "video.js"]) {
  vm.runInContext(readFileSync(new URL(file, extension), "utf8"), context, { filename: file });
}
const { DEFAULTS, isVideoFile, acceptAllows } = context.webpify;
const { plan, targetBitrate, fitDimensions, MAX_FRAME_RATE } = context.webpifyVideo;

let failures = 0;
const check = (label, ok) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}`);
  if (!ok) failures++;
};

// --- Which files count as videos, and which inputs take an MP4 ---

check("an MP4 by type", isVideoFile({ type: "video/mp4", name: "a.mp4" }));
check("a MOV by type", isVideoFile({ type: "video/quicktime", name: "a.mov" }));
check("an MKV without a type, by name", isVideoFile({ type: "", name: "clip.MKV" }));
check("a PNG isn't a video", !isVideoFile({ type: "image/png", name: "a.png" }));
check("an unknown file without a type isn't a video", !isVideoFile({ type: "", name: "a.txt" }));

check("no accept takes MP4", acceptAllows("", "video"));
check("video/* takes MP4", acceptAllows("video/*", "video"));
check(".mp4,.mov takes MP4", acceptAllows(".mp4,.mov", "video"));
check("video/webm only refuses MP4", !acceptAllows("video/webm", "video"));
check("image/* refuses MP4", !acceptAllows("image/*", "video"));
check("image/jpeg,image/png refuses WebP", !acceptAllows("image/jpeg,image/png", "image"));
check("image/* takes WebP", acceptAllows("image/*", "image"));

// --- Sizes ---

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
check("4K fits 1080p", same(fitDimensions(3840, 2160, 1920), { width: 1920, height: 1080 }));
check("portrait 1080p fits as it is", fitDimensions(1080, 1920, 1920) === null);
check("4:3 keeps its ratio", same(fitDimensions(4000, 3000, 1920), { width: 1920, height: 1440 }));
check("odd sizes become even, never bigger", same(fitDimensions(1921, 1081, 0), { width: 1920, height: 1080 }));
check("0 keeps the size", fitDimensions(3840, 2160, 0) === null);

// --- Bitrates ---

const standard1080 = targetBitrate(1920, 1080, 30, "standard");
check(`1080p30 standard is about 3 Mbit/s (${standard1080})`, standard1080 === 3_000_000);
check("720p is lower than 1080p", targetBitrate(1280, 720, 30, "standard") < standard1080);
check("lower < standard < higher", targetBitrate(1920, 1080, 30, "lower") < standard1080 && standard1080 < targetBitrate(1920, 1080, 30, "higher"));
check("60 fps gets more than 30 fps", targetBitrate(1920, 1080, 60, "standard") > standard1080);
check("an unknown frame rate counts as 30", targetBitrate(1920, 1080, 0, "standard") === standard1080);
check("never below 250 kbit/s", targetBitrate(160, 90, 30, "lower") === 250_000);

// --- Decisions ---

const info = (overrides = {}) => ({
  readable: true,
  isMp4: true,
  container: "MP4",
  codec: "avc",
  decodable: true,
  width: 1920,
  height: 1080,
  duration: 60,
  hdr: false,
  bitrate: 2_500_000,
  frameRate: 30,
  audioCodec: "aac",
  audioUndecodable: false,
  ...overrides,
});
const settings = { ...DEFAULTS };

let decision = plan(info({ readable: false }), settings);
check(`an unreadable file is kept (${decision.reason})`, decision.action === "keep" && /format isn't supported/.test(decision.reason));
decision = plan(info({ codec: null }), settings);
check(`a file without a known video track is kept (${decision.reason})`, decision.action === "keep");
decision = plan(info({ codec: "hevc", decodable: false }), settings);
check(`an undecodable HEVC video is kept, naming the codec (${decision.reason})`, decision.action === "keep" && decision.reason.includes("HEVC"));
decision = plan(info({ hdr: true }), settings);
check(`HDR is kept (${decision.reason})`, decision.action === "keep" && /HDR/.test(decision.reason));
decision = plan(info({ audioCodec: "dts", audioUndecodable: true }), settings);
check(`undecodable sound keeps the file (${decision.reason})`, decision.action === "keep" && /sound/.test(decision.reason));

decision = plan(info(), settings);
check(`a compact 1080p H.264 MP4 is kept and fine (${decision.reason})`, decision.action === "keep" && decision.fine === true);
decision = plan(info({ isMp4: false, container: "QuickTime" }), settings);
check("a compact H.264 MOV is remuxed", decision.action === "remux");
decision = plan(info({ bitrate: 8_000_000 }), settings);
check(`a heavy 1080p H.264 MP4 is transcoded to ${decision.bitrate}`, decision.action === "transcode" && decision.bitrate === standard1080 && decision.width === 1920 && decision.frameRate === undefined);
decision = plan(info({ frameRate: 59.94 }), settings);
check(`60 fps is brought down to ${MAX_FRAME_RATE}`, decision.action === "transcode" && decision.frameRate === MAX_FRAME_RATE);
decision = plan(info({ width: 3840, height: 2160, bitrate: 20_000_000 }), settings);
check("4K is transcoded at 1080p", decision.action === "transcode" && decision.width === 1920 && decision.height === 1080);
decision = plan(info({ width: 3840, height: 2160, bitrate: 20_000_000 }), { ...settings, videoMaxDimension: 0 });
check("size 0 keeps 4K at 4K", decision.action === "transcode" && decision.width === 3840 && decision.bitrate > standard1080);
decision = plan(info({ isMp4: false, container: "WebM", codec: "vp9", bitrate: 1_000_000, audioCodec: "opus" }), settings);
check("a small VP9 WebM is still transcoded (not H.264)", decision.action === "transcode");
decision = plan(info({ bitrate: 5_000_000 }), { ...settings, videoQuality: "higher" });
check("at higher quality a 5 Mbit/s MP4 counts as compact", decision.action === "keep" && decision.fine === true);
decision = plan(info({ bitrate: 5_000_000 }), { ...settings, videoQuality: "lower" });
check("at lower quality the same file is transcoded", decision.action === "transcode" && decision.bitrate < standard1080);

process.exit(failures === 0 ? 0 : 1);
