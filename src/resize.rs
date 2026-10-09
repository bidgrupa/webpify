//! Resizing helpers. Copied from sharpR's `imaging/resize.rs`.

use image::imageops::FilterType;
use image::DynamicImage;

/// Downscale so the longest side is at most `max` pixels, keeping the aspect
/// ratio. Never upscales; `None` (or 0) leaves the image untouched.
pub fn cap_max_dimension(img: DynamicImage, max: Option<u32>) -> DynamicImage {
    match max {
        Some(limit) if limit > 0 && img.width().max(img.height()) > limit => {
            img.resize(limit, limit, FilterType::Lanczos3)
        }
        _ => img,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{GenericImageView, Rgba, RgbaImage};

    fn blank(w: u32, h: u32) -> DynamicImage {
        DynamicImage::ImageRgba8(RgbaImage::from_pixel(w, h, Rgba([0, 0, 0, 255])))
    }

    #[test]
    fn caps_longest_side_and_keeps_aspect() {
        let out = cap_max_dimension(blank(4000, 2000), Some(800));
        assert_eq!(out.dimensions(), (800, 400));
        let tall = cap_max_dimension(blank(1000, 3000), Some(600));
        assert_eq!(tall.dimensions(), (200, 600));
    }

    #[test]
    fn never_upscales_and_ignores_none() {
        assert_eq!(cap_max_dimension(blank(500, 300), Some(800)).dimensions(), (500, 300));
        assert_eq!(cap_max_dimension(blank(500, 300), None).dimensions(), (500, 300));
        assert_eq!(cap_max_dimension(blank(500, 300), Some(0)).dimensions(), (500, 300));
    }
}
