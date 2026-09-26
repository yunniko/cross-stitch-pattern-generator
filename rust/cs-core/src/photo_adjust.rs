//! The four photo sliders (G-074): what each one does to a pixel.
//!
//! **Mirrors `lib/pipeline/photo-adjust.ts`**, because the browser previews in TypeScript and generation applies
//! it here. `scripts/rust-photo-adjust.ts` compares the two through the real binary, so a change to either alone
//! fails rather than quietly making a chart that does not match the preview it was made from.
//!
//! The work happens in OKLab, the space this project already clusters and matches threads in: lightness is
//! separate from colour there, so brightness and contrast move one without dragging the other.

use crate::color::{
    gamut_map_oklab_to_linear, linear_to_srgb, oklab_from_bytes, srgb_to_linear_table,
};
use crate::Image;

/// Each slider runs -100 to 100, neutral at 0.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PhotoAdjust {
    pub brightness: f64,
    pub contrast: f64,
    pub saturation: f64,
    /// Negative is cooler (bluer), positive warmer (more amber).
    pub temperature: f64,
}

pub const NEUTRAL_ADJUST: PhotoAdjust = PhotoAdjust {
    brightness: 0.0,
    contrast: 0.0,
    saturation: 0.0,
    temperature: 0.0,
};

/// OKLab lightness of mid grey (sRGB 128), the pivot contrast turns about. Measured, not assumed; the same
/// literal is in the TypeScript, which is what keeps the two in step.
pub const MID_L: f64 = 0.5999;

const BRIGHTNESS_REACH: f64 = 0.6;
const CONTRAST_REACH: f64 = 0.8;
/// Warmth is mostly amber, with a little red in it.
const TEMPERATURE_B: f64 = 0.055;
const TEMPERATURE_A: f64 = 0.018;

impl PhotoAdjust {
    pub fn is_neutral(&self) -> bool {
        self.brightness == 0.0
            && self.contrast == 0.0
            && self.saturation == 0.0
            && self.temperature == 0.0
    }
}

/// One pixel's OKLab, adjusted.
///
/// Brightness keeps both ends where they are — lifting pulls towards white rather than adding a constant, so a
/// bright photo does not lose its highlights the moment the slider moves.
pub fn adjust_oklab(l: f64, a: f64, b: f64, adjust: &PhotoAdjust) -> (f64, f64, f64) {
    let brightness = adjust.brightness / 100.0;
    let contrast = adjust.contrast / 100.0;
    let saturation = adjust.saturation / 100.0;
    let temperature = adjust.temperature / 100.0;

    let mut out_l = if brightness >= 0.0 {
        l + brightness * (1.0 - l) * BRIGHTNESS_REACH
    } else {
        l * (1.0 + brightness * BRIGHTNESS_REACH)
    };
    out_l = MID_L + (out_l - MID_L) * (1.0 + contrast * CONTRAST_REACH);
    out_l = out_l.clamp(0.0, 1.0);

    let scale = 1.0 + saturation;
    (
        out_l,
        a * scale + temperature * TEMPERATURE_A,
        b * scale + temperature * TEMPERATURE_B,
    )
}

/// A photo with the four sliders applied.
///
/// Neutral returns `None`: an untouched photo has to reach the pipeline as the bytes that were decoded, or a
/// chart made with every slider centred would not be the chart this app made before the sliders existed
/// (G-074 criterion 4).
pub fn adjust_image(image: &Image, adjust: &PhotoAdjust) -> Option<Image> {
    if adjust.is_neutral() {
        return None;
    }
    let table = srgb_to_linear_table();
    let mut data = vec![0u8; image.data.len()];
    for i in (0..image.data.len()).step_by(4) {
        let lab = oklab_from_bytes(table, image.data[i], image.data[i + 1], image.data[i + 2]);
        let (l, a, b) = adjust_oklab(lab[0], lab[1], lab[2], adjust);
        let linear = gamut_map_oklab_to_linear(l, a, b);
        data[i] = linear_to_srgb(linear[0]);
        data[i + 1] = linear_to_srgb(linear[1]);
        data[i + 2] = linear_to_srgb(linear[2]);
        // Transparency is absence (D196): an adjustment changes colour, never what is or is not there.
        data[i + 3] = image.data[i + 3];
    }
    Some(Image {
        data,
        width: image.width,
        height: image.height,
    })
}
