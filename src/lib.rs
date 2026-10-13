//! Image → WebP conversion for the webpify browser extension.
//!
//! `convert` is plain Rust so it can be tested natively with `cargo test`.
//! The `wasm` module wraps it for JavaScript and only exists in wasm32 builds.

mod decode;
mod encode;
mod error;
mod pixels;
mod resize;
#[cfg(target_arch = "wasm32")]
mod wasm;

use image::ImageFormat;

pub use encode::WEBP_MAX_DIMENSION;
pub use error::{ConvertError, ConvertResult};

/// Above this many distinct colours a PNG or BMP is treated as a photo and only encoded lossy.
/// Screenshots, logos and flat graphics measured 500-2,200; photos 100,000+.
const GRAPHIC_MAX_COLORS: usize = 32_768;
/// A graphic keeps lossless WebP when that is at most this much larger than lossy. Measured:
/// a UI screenshot was 9x smaller lossless, a logo and a flat pattern 1.3x larger, and a photo
/// saved as PNG 7.8x larger.
const LOSSLESS_MAX_RATIO: f64 = 1.5;

#[derive(Clone, Copy, Debug)]
pub struct Options {
    /// 1..=100; ignored when `lossless` is set.
    pub quality: f32,
    /// Downscale so the longest side fits; `None` keeps the original size.
    pub max_dimension: Option<u32>,
    /// Always lossless.
    pub lossless: bool,
    /// PNG/BMP graphics (screenshots, logos) become lossless when that stays small.
    pub sharp_graphics: bool,
}

/// Decode `bytes` (JPEG, PNG or BMP), apply EXIF orientation, cap the size and
/// encode as WebP, keeping the source's ICC colour profile.
///
/// Lossy WebP smudges text and hard edges, so with `sharp_graphics` a PNG or BMP with few
/// colours is encoded both ways and keeps lossless when it isn't much bigger. JPEGs are
/// photos (and already lossy), so they always go lossy.
pub fn convert(bytes: &[u8], opts: &Options) -> ConvertResult<Vec<u8>> {
    let decoded = decode::load_oriented(bytes)?;
    // Judge the original pixels: downscaling blends edges into many new colours.
    let maybe_graphic = opts.sharp_graphics
        && !opts.lossless
        && matches!(decoded.format, Some(ImageFormat::Png | ImageFormat::Bmp))
        && pixels::has_few_colors(&decoded.image, GRAPHIC_MAX_COLORS);
    let img = resize::cap_max_dimension(decoded.image, opts.max_dimension);
    let icc = decoded.icc_profile.as_deref();

    let first = encode::encode_webp(&img, icc, opts.quality, opts.lossless)?;
    if !maybe_graphic {
        return Ok(first);
    }
    let lossless = encode::encode_webp(&img, icc, opts.quality, true)?;
    let keep_lossless = lossless.len() as f64 <= first.len() as f64 * LOSSLESS_MAX_RATIO;
    Ok(if keep_lossless { lossless } else { first })
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::codecs::jpeg::JpegEncoder;
    use image::{DynamicImage, GenericImageView, ImageEncoder, ImageFormat, Rgb, RgbImage};
    use std::io::Cursor;

    const OPTS: Options = Options { quality: 80.0, max_dimension: None, lossless: false, sharp_graphics: false };
    const SHARP: Options = Options { sharp_graphics: true, ..OPTS };

    fn photo(w: u32, h: u32) -> DynamicImage {
        DynamicImage::ImageRgb8(RgbImage::from_fn(w, h, |x, y| {
            Rgb([(x % 256) as u8, (y % 256) as u8, ((x + y) % 256) as u8])
        }))
    }

    fn encode_as(img: &DynamicImage, format: ImageFormat) -> Vec<u8> {
        let mut buf = Cursor::new(Vec::new());
        img.write_to(&mut buf, format).unwrap();
        buf.into_inner()
    }

    #[test]
    fn converts_jpeg_png_and_bmp() {
        for format in [ImageFormat::Jpeg, ImageFormat::Png, ImageFormat::Bmp] {
            let input = encode_as(&photo(64, 40), format);
            let out = convert(&input, &OPTS).unwrap();
            // No profile in, none out: the plain single-chunk WebP layout.
            assert_eq!(&out[12..16], b"VP8 ", "{format:?}");
            let decoded = image::load_from_memory(&out).unwrap();
            assert_eq!(decoded.dimensions(), (64, 40), "{format:?}");
        }
    }

    #[test]
    fn keeps_the_icc_profile_of_jpeg_and_png() {
        use image::ImageDecoder;
        use image::codecs::png::PngEncoder;
        use image::codecs::webp::WebPDecoder;

        let profile = b"stand-in for a Display P3 profile".to_vec();
        let img = photo(40, 30);
        let pixels = img.as_bytes();

        let mut jpeg = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg, 90);
        encoder.set_icc_profile(profile.clone()).unwrap();
        encoder.write_image(pixels, 40, 30, image::ExtendedColorType::Rgb8).unwrap();

        let mut png = Vec::new();
        let mut encoder = PngEncoder::new(&mut png);
        encoder.set_icc_profile(profile.clone()).unwrap();
        encoder.write_image(pixels, 40, 30, image::ExtendedColorType::Rgb8).unwrap();

        for (label, input) in [("jpeg", jpeg), ("png", png)] {
            let out = convert(&input, &OPTS).unwrap();
            let mut decoder = WebPDecoder::new(Cursor::new(&out)).unwrap();
            assert_eq!(decoder.icc_profile().unwrap(), Some(profile.clone()), "{label}");
        }
    }

    #[test]
    fn caps_max_dimension() {
        let input = encode_as(&photo(400, 200), ImageFormat::Png);
        let opts = Options { max_dimension: Some(100), ..OPTS };
        let decoded = image::load_from_memory(&convert(&input, &opts).unwrap()).unwrap();
        assert_eq!(decoded.dimensions(), (100, 50));
    }

    #[test]
    fn applies_exif_orientation() {
        // Orientation 6 = rotate 90° clockwise, so a 40x20 JPEG displays as 20x40.
        let exif: &[u8] = &[
            b'M', b'M', 0, 42, 0, 0, 0, 8, // big-endian TIFF header, IFD at offset 8
            0, 1, // one entry
            0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, // Orientation, SHORT, 1, value 6
            0, 0, 0, 0, // no next IFD
        ];
        let img = photo(40, 20);
        let mut jpeg = Vec::new();
        let mut encoder = JpegEncoder::new_with_quality(&mut jpeg, 90);
        encoder.set_exif_metadata(exif.to_vec()).unwrap();
        encoder
            .write_image(img.as_bytes(), 40, 20, image::ExtendedColorType::Rgb8)
            .unwrap();

        let decoded = image::load_from_memory(&convert(&jpeg, &OPTS).unwrap()).unwrap();
        assert_eq!(decoded.dimensions(), (20, 40));
    }

    #[test]
    fn rejects_garbage() {
        assert!(convert(b"not an image", &OPTS).is_err());
    }

    /// A flat UI-like graphic: panels and thin "text" lines in a handful of colours.
    fn screenshot(w: u32, h: u32) -> DynamicImage {
        DynamicImage::ImageRgb8(RgbImage::from_fn(w, h, |x, y| {
            if y < 40 {
                Rgb([29, 28, 44])
            } else if (y % 24 < 2) || (x % 160 < 2) {
                Rgb([216, 215, 224])
            } else if y % 24 > 8 && y % 24 < 14 && x % 160 > 12 && x % 160 < 120 && (x / 3) % 4 != 0 {
                Rgb([29, 28, 44])
            } else {
                Rgb([247, 247, 250])
            }
        }))
    }

    /// Photo-like: every pixel a different colour.
    fn noisy(w: u32, h: u32) -> DynamicImage {
        let mut state = 0x2545_f491_u32;
        DynamicImage::ImageRgb8(RgbImage::from_fn(w, h, |_, _| {
            state ^= state << 13;
            state ^= state >> 17;
            state ^= state << 5;
            let [r, g, b, _] = state.to_le_bytes();
            Rgb([r, g, b])
        }))
    }

    fn chunk(webp: &[u8]) -> &[u8] {
        // VP8X (extended) is followed by optional chunks; find the image chunk itself.
        if &webp[12..16] == b"VP8X" {
            let at = webp.windows(4).position(|w| w == b"VP8 " || w == b"VP8L").unwrap();
            return &webp[at..at + 4];
        }
        &webp[12..16]
    }

    #[test]
    fn graphics_go_lossless_when_sharp_graphics_is_on() {
        for format in [ImageFormat::Png, ImageFormat::Bmp] {
            let input = encode_as(&screenshot(640, 360), format);
            assert_eq!(chunk(&convert(&input, &SHARP).unwrap()), b"VP8L", "{format:?}");
            assert_eq!(chunk(&convert(&input, &OPTS).unwrap()), b"VP8 ", "{format:?} with the option off");
        }
    }

    #[test]
    fn photos_and_jpegs_stay_lossy() {
        let photo_png = encode_as(&noisy(256, 256), ImageFormat::Png);
        assert_eq!(chunk(&convert(&photo_png, &SHARP).unwrap()), b"VP8 ");
        let graphic_jpeg = encode_as(&screenshot(640, 360), ImageFormat::Jpeg);
        assert_eq!(chunk(&convert(&graphic_jpeg, &SHARP).unwrap()), b"VP8 ");
    }

    #[test]
    fn lossless_option_still_wins() {
        let input = encode_as(&noisy(128, 128), ImageFormat::Png);
        let opts = Options { lossless: true, ..SHARP };
        assert_eq!(chunk(&convert(&input, &opts).unwrap()), b"VP8L");
    }
}
