//! Port of `lib/color/color.ts` (the parts generation uses): sRGB ↔ linear, OKLab, luminance.

use crate::jsmath;
use std::sync::OnceLock;

pub type Oklab = [f64; 3];
pub type Rgb = [u8; 3];

fn srgb_to_linear_formula(c: f64) -> f64 {
    let v = c / 255.0;
    if v <= 0.04045 {
        v / 12.92
    } else {
        jsmath::pow((v + 0.055) / 1.055, 2.4)
    }
}

/// `SRGB_TO_LINEAR`: the formula for every 8-bit value.
pub fn srgb_to_linear_table() -> &'static [f64; 256] {
    static TABLE: OnceLock<[f64; 256]> = OnceLock::new();
    TABLE.get_or_init(|| {
        let mut t = [0.0; 256];
        for (c, v) in t.iter_mut().enumerate() {
            *v = srgb_to_linear_formula(c as f64);
        }
        t
    })
}

/// `linearToSrgb`: rounded and clamped to 0–255.
#[inline]
pub fn linear_to_srgb(v: f64) -> u8 {
    let c = if v <= 0.0031308 {
        v * 12.92
    } else {
        1.055 * jsmath::pow(v, 1.0 / 2.4) - 0.055
    };
    jsmath::round(jsmath::min(1.0, jsmath::max(0.0, c)) * 255.0) as u8
}

/// `writeOklab` for 8-bit channels.
#[inline]
pub fn oklab_from_bytes(table: &[f64; 256], r: u8, g: u8, b: u8) -> Oklab {
    let rl = table[r as usize];
    let gl = table[g as usize];
    let bl = table[b as usize];

    let l = 0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl;
    let m = 0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl;
    let s = 0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl;

    let l_ = jsmath::cbrt(l);
    let m_ = jsmath::cbrt(m);
    let s_ = jsmath::cbrt(s);

    [
        0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    ]
}

/// `rgbToOklab`.
#[inline]
pub fn rgb_to_oklab(rgb: Rgb) -> Oklab {
    oklab_from_bytes(srgb_to_linear_table(), rgb[0], rgb[1], rgb[2])
}

/// `oklabToRgb`.
pub fn oklab_to_rgb(lab: Oklab) -> Rgb {
    let [ll, a, b] = lab;
    let l_ = ll + 0.3963377774 * a + 0.2158037573 * b;
    let m_ = ll - 0.1055613458 * a - 0.0638541728 * b;
    let s_ = ll - 0.0894841775 * a - 1.291485548 * b;

    let l = jsmath::pow(l_, 3.0);
    let m = jsmath::pow(m_, 3.0);
    let s = jsmath::pow(s_, 3.0);

    let rl = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    let gl = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

    [linear_to_srgb(rl), linear_to_srgb(gl), linear_to_srgb(bl)]
}

#[inline]
pub fn oklab_distance_sq(a: &Oklab, b: &Oklab) -> f64 {
    let dl = a[0] - b[0];
    let da = a[1] - b[1];
    let db = a[2] - b[2];
    dl * dl + da * da + db * db
}

/// `luminance`: relative luminance on the 0–255 scale, rounded.
#[inline]
pub fn luminance(rgb: Rgb) -> f64 {
    jsmath::round(0.2126 * rgb[0] as f64 + 0.7152 * rgb[1] as f64 + 0.0722 * rgb[2] as f64)
}

/// `oklabToLinearRgb`: unclamped linear sRGB.
fn oklab_to_linear_rgb(lab: Oklab) -> [f64; 3] {
    let [ll, a, b] = lab;
    let l = jsmath::pow(ll + 0.3963377774 * a + 0.2158037573 * b, 3.0);
    let m = jsmath::pow(ll - 0.1055613458 * a - 0.0638541728 * b, 3.0);
    let s = jsmath::pow(ll - 0.0894841775 * a - 1.291485548 * b, 3.0);
    [
        4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
        -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
        -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ]
}

const GAMUT_EPSILON: f64 = 1e-6;
const GAMUT_JND: f64 = 0.02;
const GAMUT_CHROMA_EPSILON: f64 = 1e-4;

fn linear_in_gamut(c: &[f64; 3]) -> bool {
    c.iter()
        .all(|&v| v >= -GAMUT_EPSILON && v <= 1.0 + GAMUT_EPSILON)
}

#[inline]
fn clamp01(v: f64) -> f64 {
    jsmath::min(1.0, jsmath::max(0.0, v))
}

fn clip_linear_to_oklab(c: &[f64; 3]) -> Oklab {
    let (rl, gl, bl) = (clamp01(c[0]), clamp01(c[1]), clamp01(c[2]));
    let l_ = jsmath::cbrt(0.4122214708 * rl + 0.5363325363 * gl + 0.0514459929 * bl);
    let m_ = jsmath::cbrt(0.2119034982 * rl + 0.6806995451 * gl + 0.1073969566 * bl);
    let s_ = jsmath::cbrt(0.0883024619 * rl + 0.2817188376 * gl + 0.6299787005 * bl);
    [
        0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    ]
}

/// `gamutMapOklabToLinear`: CSS Color 4 gamut mapping to linear sRGB (D111).
pub fn gamut_map_oklab_to_linear(ll: f64, a: f64, b: f64) -> [f64; 3] {
    if ll <= 0.0 {
        return [0.0; 3];
    }
    if ll >= 1.0 {
        return [1.0; 3];
    }
    let linear = oklab_to_linear_rgb([ll, a, b]);
    if linear_in_gamut(&linear) {
        return linear;
    }
    let mut best = [clamp01(linear[0]), clamp01(linear[1]), clamp01(linear[2])];
    if oklab_distance_sq(&clip_linear_to_oklab(&linear), &[ll, a, b]) >= GAMUT_JND * GAMUT_JND {
        let (mut low, mut high) = (0.0, 1.0);
        let mut low_in_gamut = true;
        let chroma = jsmath::hypot(a, b);
        while (high - low) * chroma > GAMUT_CHROMA_EPSILON {
            let scale = (low + high) / 2.0;
            let candidate = [ll, a * scale, b * scale];
            let cand = oklab_to_linear_rgb(candidate);
            if low_in_gamut && linear_in_gamut(&cand) {
                low = scale;
                best = cand;
                continue;
            }
            let error = oklab_distance_sq(&clip_linear_to_oklab(&cand), &candidate).sqrt();
            if error < GAMUT_JND {
                best = [clamp01(cand[0]), clamp01(cand[1]), clamp01(cand[2])];
                if GAMUT_JND - error < GAMUT_CHROMA_EPSILON {
                    break;
                }
                low_in_gamut = false;
                low = scale;
            } else {
                high = scale;
            }
        }
    }
    [clamp01(best[0]), clamp01(best[1]), clamp01(best[2])]
}
