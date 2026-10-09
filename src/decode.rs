//! Decoding with EXIF orientation applied. Adapted from sharpR's `imaging/decode.rs`.

use std::io::Cursor;

use image::metadata::Orientation;
use image::{DynamicImage, ImageDecoder, ImageReader};

use crate::error::ConvertResult;

/// Decoded pixels plus the embedded ICC colour profile, if the file had one.
pub struct Decoded {
    pub image: DynamicImage,
    pub icc_profile: Option<Vec<u8>>,
}

/// Decode an encoded image (format sniffed from the bytes), apply its EXIF
/// orientation so pixels are upright, and keep its ICC profile.
pub fn load_oriented(bytes: &[u8]) -> ConvertResult<Decoded> {
    let reader = ImageReader::new(Cursor::new(bytes)).with_guessed_format()?;
    let mut decoder = reader.into_decoder()?;
    let orientation = decoder
        .orientation()
        .unwrap_or(Orientation::NoTransforms);
    // An unreadable profile shouldn't fail the conversion; the image then reads as sRGB.
    let icc_profile = decoder.icc_profile().ok().flatten();
    let mut image = DynamicImage::from_decoder(decoder)?;
    image.apply_orientation(orientation);
    Ok(Decoded { image, icc_profile })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn garbage_bytes_are_an_error() {
        assert!(load_oriented(b"definitely not an image").is_err());
        assert!(load_oriented(&[]).is_err());
    }
}
