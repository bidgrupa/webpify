//! WebP encoding with zenwebp (pure Rust, so it builds for wasm32). Every output
//! is re-encoded from raw pixels. Only the ICC colour profile is carried over, so
//! wide-gamut photos (e.g. Display P3) keep their colours; EXIF (GPS included)
//! and XMP are dropped.

use image::{DynamicImage, GenericImageView};
use zenwebp::{EncodeRequest, LosslessConfig, LossyConfig, PixelLayout};

use crate::error::{ConvertError, ConvertResult};
use crate::pixels::has_transparency;

const MIN_QUALITY: f32 = 1.0;
const MAX_QUALITY: f32 = 100.0;
/// Speed/size trade-off, 0 (fastest) to 6 (smallest). 4 is libwebp's default.
const METHOD: u8 = 4;
/// Keep alpha lossless; it is usually a small part of the file.
const ALPHA_QUALITY: u8 = 100;
/// Largest width or height a WebP file can store.
pub const WEBP_MAX_DIMENSION: u32 = 16383;

/// Encode `img` as WebP, embedding `icc_profile` when given. `quality` (1..=100)
/// is ignored when `lossless` is set.
pub fn encode_webp(
    img: &DynamicImage,
    icc_profile: Option<&[u8]>,
    quality: f32,
    lossless: bool,
) -> ConvertResult<Vec<u8>> {
    let (width, height) = img.dimensions();
    if width > WEBP_MAX_DIMENSION || height > WEBP_MAX_DIMENSION {
        return Err(ConvertError::Invalid(format!(
            "WebP supports at most {WEBP_MAX_DIMENSION} px per side (image is {width}x{height})"
        )));
    }
    if !quality.is_finite() {
        return Err(ConvertError::Invalid(format!("quality must be a number, got {quality}")));
    }
    let quality = quality.clamp(MIN_QUALITY, MAX_QUALITY);

    // Only carry an alpha channel when something is actually transparent.
    let (pixels, layout) = if has_transparency(img) {
        (img.to_rgba8().into_raw(), PixelLayout::Rgba8)
    } else {
        (img.to_rgb8().into_raw(), PixelLayout::Rgb8)
    };

    let lossless_config = LosslessConfig::new();
    let lossy_config = LossyConfig::new()
        .with_quality(quality)
        .with_method(METHOD)
        .with_alpha_quality(ALPHA_QUALITY);
    let mut request = if lossless {
        EncodeRequest::lossless(&lossless_config, &pixels, layout, width, height)
    } else {
        EncodeRequest::lossy(&lossy_config, &pixels, layout, width, height)
    };
    if let Some(icc) = icc_profile {
        request = request.with_icc_profile(icc);
    }
    request.encode().map_err(|e| ConvertError::Encode(e.to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn sample(alpha: bool) -> DynamicImage {
        let mut img = RgbaImage::from_fn(48, 32, |x, y| Rgba([(x * 5) as u8, (y * 7) as u8, 120, 255]));
        if alpha {
            img.put_pixel(0, 0, Rgba([0, 0, 0, 0]));
        }
        DynamicImage::ImageRgba8(img)
    }

    /// FourCC of the first chunk after the 12-byte RIFF/WEBP header.
    fn first_chunk(bytes: &[u8]) -> &[u8] {
        assert_eq!(&bytes[0..4], b"RIFF");
        assert_eq!(&bytes[8..12], b"WEBP");
        &bytes[12..16]
    }

    #[test]
    fn lossy_opaque_is_plain_vp8() {
        let out = encode_webp(&sample(false), None, 80.0, false).unwrap();
        assert_eq!(first_chunk(&out), b"VP8 ");
        let decoded = image::load_from_memory(&out).unwrap();
        assert_eq!(decoded.dimensions(), (48, 32));
        assert!(!has_transparency(&decoded));
    }

    #[test]
    fn lossy_with_alpha_keeps_transparency() {
        let out = encode_webp(&sample(true), None, 80.0, false).unwrap();
        assert_eq!(first_chunk(&out), b"VP8X");
        assert!(out.windows(4).any(|w| w == b"ALPH"));
        let decoded = image::load_from_memory(&out).unwrap();
        assert!(has_transparency(&decoded));
    }

    #[test]
    fn lossless_is_vp8l_and_exact() {
        let src = sample(true);
        let out = encode_webp(&src, None, 80.0, true).unwrap();
        assert_eq!(first_chunk(&out), b"VP8L");
        let decoded = image::load_from_memory(&out).unwrap();
        assert_eq!(decoded.to_rgba8().get_pixel(10, 10), src.to_rgba8().get_pixel(10, 10));
        assert!(has_transparency(&decoded));
    }

    #[test]
    fn embeds_icc_profile_in_lossy_and_lossless() {
        use image::ImageDecoder;
        use image::codecs::webp::WebPDecoder;

        let profile = b"not a real profile, carried byte for byte";
        for lossless in [false, true] {
            let out = encode_webp(&sample(false), Some(profile), 80.0, lossless).unwrap();
            assert_eq!(first_chunk(&out), b"VP8X");
            let mut decoder = WebPDecoder::new(std::io::Cursor::new(&out)).unwrap();
            assert_eq!(decoder.icc_profile().unwrap().as_deref(), Some(&profile[..]));
        }
    }

    #[test]
    fn out_of_range_quality_is_clamped_and_nan_rejected() {
        assert!(encode_webp(&sample(false), None, 500.0, false).is_ok());
        assert!(encode_webp(&sample(false), None, -3.0, false).is_ok());
        assert!(encode_webp(&sample(false), None, f32::NAN, false).is_err());
    }

    #[test]
    fn rejects_images_wider_than_webp_allows() {
        let wide = DynamicImage::ImageRgba8(RgbaImage::new(WEBP_MAX_DIMENSION + 1, 1));
        assert!(matches!(encode_webp(&wide, None, 80.0, false), Err(ConvertError::Invalid(_))));
    }
}
