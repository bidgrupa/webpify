//! Small pixel-level helpers. Copied from sharpR's `imaging/pixels.rs`.

use image::DynamicImage;

const OPAQUE: u8 = 255;

/// True when the image has an alpha channel with at least one non-opaque pixel.
pub fn has_transparency(img: &DynamicImage) -> bool {
    if !img.color().has_alpha() {
        return false;
    }
    match img {
        DynamicImage::ImageRgba8(buf) => buf.pixels().any(|p| p[3] != OPAQUE),
        DynamicImage::ImageLumaA8(buf) => buf.pixels().any(|p| p[1] != OPAQUE),
        other => other.to_rgba8().pixels().any(|p| p[3] != OPAQUE),
    }
}
