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

pub use encode::WEBP_MAX_DIMENSION;
pub use error::{ConvertError, ConvertResult};

#[derive(Clone, Copy, Debug)]
pub struct Options {
    /// 1..=100; ignored when `lossless` is set.
    pub quality: f32,
    /// Downscale so the longest side fits; `None` keeps the original size.
    pub max_dimension: Option<u32>,
    pub lossless: bool,
}

/// Decode `bytes` (JPEG, PNG or BMP), apply EXIF orientation, cap the size and
/// encode as WebP, keeping the source's ICC colour profile.
pub fn convert(bytes: &[u8], opts: &Options) -> ConvertResult<Vec<u8>> {
    let decoded = decode::load_oriented(bytes)?;
    let img = resize::cap_max_dimension(decoded.image, opts.max_dimension);
    encode::encode_webp(&img, decoded.icc_profile.as_deref(), opts.quality, opts.lossless)
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::codecs::jpeg::JpegEncoder;
    use image::{DynamicImage, GenericImageView, ImageEncoder, ImageFormat, Rgb, RgbImage};
    use std::io::Cursor;

    const OPTS: Options = Options { quality: 80.0, max_dimension: None, lossless: false };

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
}
