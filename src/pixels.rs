//! Small pixel-level helpers. Copied from sharpR's `imaging/pixels.rs`.

use std::collections::HashSet;

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

/// True when the image has at most `max` distinct colours (alpha included). Stops counting as
/// soon as it passes `max`, so photos (hundreds of thousands of colours) are rejected quickly.
pub fn has_few_colors(img: &DynamicImage, max: usize) -> bool {
    let mut seen = HashSet::with_capacity(max.min(4096) + 1);
    let mut within = |color: u32| {
        seen.insert(color);
        seen.len() <= max
    };
    match img {
        DynamicImage::ImageRgb8(buf) => buf.pixels().all(|p| within(u32::from_le_bytes([p[0], p[1], p[2], 255]))),
        DynamicImage::ImageRgba8(buf) => buf.pixels().all(|p| within(u32::from_le_bytes(p.0))),
        other => other.to_rgba8().pixels().all(|p| within(u32::from_le_bytes(p.0))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgb, RgbImage};

    #[test]
    fn counts_colors_up_to_the_limit() {
        let two = DynamicImage::ImageRgb8(RgbImage::from_fn(64, 64, |x, _| if x < 32 { Rgb([0, 0, 0]) } else { Rgb([255, 255, 255]) }));
        assert!(has_few_colors(&two, 2));
        assert!(!has_few_colors(&two, 1));
        let many = DynamicImage::ImageRgb8(RgbImage::from_fn(64, 64, |x, y| Rgb([x as u8, y as u8, 7])));
        assert!(!has_few_colors(&many, 4095));
        assert!(has_few_colors(&many, 4096));
    }
}
