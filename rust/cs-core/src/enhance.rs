//! Port of `lib/pipeline/enhance.ts` (G-032, D112–D118): analysis of a stratified sample, then one fused per-pixel pass.
//! `Float32Array` stores are `as f32`, and every `Math` call goes through `jsmath`.

use crate::color::gamut_map_oklab_to_linear;
use crate::jsmath;
use crate::Image;
use rayon::prelude::*;
use std::sync::OnceLock;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Off,
    Brighten,
    Auto,
    Vivid,
    Portrait,
}

impl Mode {
    pub fn id(self) -> &'static str {
        match self {
            Mode::Off => "off",
            Mode::Brighten => "brighten",
            Mode::Auto => "auto",
            Mode::Vivid => "vivid",
            Mode::Portrait => "portrait",
        }
    }
}

struct WhiteBalance {
    strength: f64,
    bright_blend: f64,
    max_gain_ratio: f64,
    max_chroma_shift: f64,
}
struct Levels {
    low: f64,
    high: f64,
    max_stretch: f64,
}
#[derive(Clone, Copy)]
struct Midtone {
    band_low: f64,
    band_high: f64,
    gamma_min: f64,
    gamma_max: f64,
    only_with_levels: bool,
    keep_median: bool,
}
struct Clahe {
    clip: f64,
    blend: f64,
    tiles_long_side: f64,
    min_tile_px: f64,
}
struct Preset {
    wb: WhiteBalance,
    levels: Levels,
    midtone: Midtone,
    clahe: Option<Clahe>,
    vibrance_amount: f64,
    skin_protection: f64,
}

fn preset(mode: Mode) -> Preset {
    let wb_auto = WhiteBalance {
        strength: 0.7,
        bright_blend: 0.3,
        max_gain_ratio: 1.25,
        max_chroma_shift: 0.05,
    };
    let levels_auto = Levels {
        low: 0.005,
        high: 0.995,
        max_stretch: 2.5,
    };
    let midtone_auto = Midtone {
        band_low: 0.5,
        band_high: 0.64,
        gamma_min: 0.67,
        gamma_max: 1.5,
        only_with_levels: false,
        keep_median: false,
    };
    match mode {
        Mode::Off => unreachable!("off never reaches enhancement"),
        Mode::Brighten => Preset {
            wb: WhiteBalance {
                strength: 0.0,
                bright_blend: 0.0,
                max_gain_ratio: 1.0,
                max_chroma_shift: 0.0,
            },
            levels: Levels {
                low: 0.005,
                high: 0.995,
                max_stretch: 1.6,
            },
            midtone: Midtone {
                band_low: 0.5,
                band_high: 1.0,
                gamma_min: 0.75,
                gamma_max: 1.0,
                only_with_levels: true,
                keep_median: true,
            },
            clahe: None,
            vibrance_amount: 0.0,
            skin_protection: 1.0,
        },
        Mode::Auto => Preset {
            wb: wb_auto,
            levels: levels_auto,
            midtone: midtone_auto,
            clahe: Some(Clahe {
                clip: 1.8,
                blend: 0.25,
                tiles_long_side: 8.0,
                min_tile_px: 32.0,
            }),
            vibrance_amount: 0.2,
            skin_protection: 0.7,
        },
        Mode::Vivid => Preset {
            wb: wb_auto,
            levels: levels_auto,
            midtone: midtone_auto,
            clahe: Some(Clahe {
                clip: 2.5,
                blend: 0.4,
                tiles_long_side: 8.0,
                min_tile_px: 32.0,
            }),
            vibrance_amount: 0.4,
            skin_protection: 0.7,
        },
        Mode::Portrait => Preset {
            wb: WhiteBalance {
                strength: 0.5,
                bright_blend: 0.2,
                max_gain_ratio: 1.15,
                max_chroma_shift: 0.03,
            },
            levels: Levels {
                low: 0.002,
                high: 0.998,
                max_stretch: 1.8,
            },
            midtone: Midtone {
                band_low: 0.52,
                band_high: 0.66,
                gamma_min: 0.8,
                gamma_max: 1.25,
                only_with_levels: false,
                keep_median: false,
            },
            clahe: None,
            vibrance_amount: 0.15,
            skin_protection: 1.0,
        },
    }
}

const WB_MAX_NEUTRAL_CHROMA: f64 = 0.05;
const WB_MAX_CHANNEL: u8 = 250;
const WB_MIN_L: f64 = 0.1;
const WB_MIN_ELIGIBLE_FRACTION: f64 = 0.05;
const WB_MIN_NEUTRAL_L_SPREAD: f64 = 0.15;
const WB_DEADBAND_CHROMA: f64 = 0.01;
const WB_MINKOWSKI_P: f64 = 6.0;
const WB_BRIGHT_FRACTION: f64 = 0.03;
const MID_GREY_Y: f64 = 0.216;
const LEVELS_DEADBAND_LOW: f64 = 0.2;
const LEVELS_DEADBAND_HIGH: f64 = 0.9;
const LEVELS_MIN_SPREAD: f64 = 0.02;
const LEVELS_TARGET_LOW: f64 = 0.1;
const LEVELS_TARGET_HIGH: f64 = 0.95;
const MAX_TONE_SLOPE: f64 = 3.0;
const TONE_SLOPE_FROM: f64 = 0.02;
const CHROMA_COMP_MIN: f64 = 0.8;
const CHROMA_COMP_MAX: f64 = 1.3;
const SKIN_TAN_LOW: f64 = 0.4663;
const SKIN_TAN_HIGH: f64 = 11.43;
const CLAHE_BINS: usize = 256;
const CLAHE_FLAT_SPREAD: f64 = 0.6;
const CLAHE_FULL_OFF_SPREAD: f64 = 0.8;
const CLAHE_MIN_TILE_SAMPLES: usize = 1024;
const VIBRANCE_DEADBAND_START: f64 = 0.45;
const VIBRANCE_DEADBAND_END: f64 = 0.55;
const VIBRANCE_RAMP_LOW: f64 = 0.01;
const VIBRANCE_RAMP_HIGH: f64 = 0.03;
const TARGET_SAMPLES: f64 = 500_000.0;
const TONE_LUT_SIZE: usize = 4096;
const COMBINED_LUT_SIZE: usize = 1024;
const ENCODE_LUT_SIZE: usize = 4096;
const CMAX_L_STEPS: usize = 64;
const CMAX_H_STEPS: usize = 72;

fn decode() -> &'static [f64; 256] {
    static T: OnceLock<[f64; 256]> = OnceLock::new();
    T.get_or_init(|| {
        let mut t = [0.0; 256];
        for (i, v) in t.iter_mut().enumerate() {
            let x = i as f64 / 255.0;
            *v = if x <= 0.04045 {
                x / 12.92
            } else {
                jsmath::pow((x + 0.055) / 1.055, 2.4)
            };
        }
        t
    })
}

fn encode() -> &'static [u8] {
    static T: OnceLock<Vec<u8>> = OnceLock::new();
    T.get_or_init(|| {
        (0..=ENCODE_LUT_SIZE)
            .map(|i| {
                let v = i as f64 / ENCODE_LUT_SIZE as f64;
                let c = if v <= 0.0031308 {
                    v * 12.92
                } else {
                    1.055 * jsmath::pow(v, 1.0 / 2.4) - 0.055
                };
                jsmath::round(jsmath::min(1.0, jsmath::max(0.0, c)) * 255.0) as u8
            })
            .collect()
    })
}

fn encode_linear(v: f64) -> u8 {
    if v <= 0.0 {
        return 0;
    }
    if v >= 1.0 {
        return 255;
    }
    encode()[jsmath::round(v * ENCODE_LUT_SIZE as f64) as usize]
}

fn lms_to_lab(l: f64, m: f64, s: f64) -> [f64; 3] {
    let (l_, m_, s_) = (jsmath::cbrt(l), jsmath::cbrt(m), jsmath::cbrt(s));
    [
        0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    ]
}

fn in_gamut(ll: f64, a: f64, b: f64) -> bool {
    let lc = ll + 0.3963377774 * a + 0.2158037573 * b;
    let mc = ll - 0.1055613458 * a - 0.0638541728 * b;
    let sc = ll - 0.0894841775 * a - 1.291485548 * b;
    let (l, m, s) = (lc * lc * lc, mc * mc * mc, sc * sc * sc);
    let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    let bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    (-1e-6..=1.000001).contains(&r)
        && (-1e-6..=1.000001).contains(&g)
        && (-1e-6..=1.000001).contains(&bl)
}

#[inline]
fn ramp(x: f64, from: f64, to: f64) -> f64 {
    if x <= from {
        0.0
    } else if x >= to {
        1.0
    } else {
        (x - from) / (to - from)
    }
}

fn cmax_table() -> &'static [f32] {
    static T: OnceLock<Vec<f32>> = OnceLock::new();
    T.get_or_init(|| {
        let mut table = vec![0f32; (CMAX_L_STEPS + 1) * CMAX_H_STEPS];
        for li in 0..=CMAX_L_STEPS {
            let ll = li as f64 / CMAX_L_STEPS as f64;
            for hi in 0..CMAX_H_STEPS {
                let h = (hi as f64 / CMAX_H_STEPS as f64) * 2.0 * std::f64::consts::PI;
                let (ca, sa) = (jsmath::cos(h), jsmath::sin(h));
                let (mut low, mut high) = (0.0, 0.5);
                if ll > 0.0 && ll < 1.0 {
                    for _ in 0..24 {
                        let c = (low + high) / 2.0;
                        if in_gamut(ll, c * ca, c * sa) {
                            low = c;
                        } else {
                            high = c;
                        }
                    }
                }
                table[li * CMAX_H_STEPS + hi] = low as f32;
            }
        }
        table
    })
}

fn max_chroma(table: &[f32], ll: f64, hue: f64) -> f64 {
    let lf = jsmath::min(1.0, jsmath::max(0.0, ll)) * CMAX_L_STEPS as f64;
    let li = jsmath::min((CMAX_L_STEPS - 1) as f64, lf.floor()) as usize;
    let lt = lf - li as f64;
    let mut hf = (hue / (2.0 * std::f64::consts::PI)) * CMAX_H_STEPS as f64;
    if hf < 0.0 {
        hf += CMAX_H_STEPS as f64;
    }
    let hi0 = (hf.floor() as usize) % CMAX_H_STEPS;
    let hi1 = (hi0 + 1) % CMAX_H_STEPS;
    let ht = hf - hf.floor();
    let (row0, row1) = (li * CMAX_H_STEPS, (li + 1) * CMAX_H_STEPS);
    let top = table[row0 + hi0] as f64 * (1.0 - ht) + table[row0 + hi1] as f64 * ht;
    let bottom = table[row1 + hi0] as f64 * (1.0 - ht) + table[row1 + hi1] as f64 * ht;
    top * (1.0 - lt) + bottom * lt
}

fn skin_weight(ll: f64, chroma: f64, hue: f64) -> f64 {
    let gate = ramp(chroma, 0.01, 0.02)
        * (1.0 - ramp(chroma, 0.16, 0.2))
        * ramp(ll, 0.25, 0.3)
        * (1.0 - ramp(ll, 0.92, 0.96));
    if gate == 0.0 {
        return 0.0;
    }
    let mut deg = (hue * 180.0) / std::f64::consts::PI;
    if deg < 0.0 {
        deg += 360.0;
    }
    let hue_weight = if (40.0..=70.0).contains(&deg) {
        1.0
    } else if deg > 25.0 && deg < 40.0 {
        (deg - 25.0) / 15.0
    } else if deg > 70.0 && deg < 85.0 {
        (85.0 - deg) / 15.0
    } else {
        0.0
    };
    gate * hue_weight
}

fn chroma_compensation(l0: f64, ll: f64, skin: f64, skin_protection: f64) -> f64 {
    if l0 <= 1e-4 || ll == l0 {
        return 1.0;
    }
    let mut comp = (ll / l0).sqrt();
    if comp < CHROMA_COMP_MIN {
        comp = CHROMA_COMP_MIN;
    } else if comp > CHROMA_COMP_MAX {
        comp = CHROMA_COMP_MAX;
    }
    if comp > 1.0 {
        comp = 1.0 + (comp - 1.0) * (1.0 - skin_protection * skin);
    }
    comp
}

fn vibrance_boost(
    table: &[f32],
    ll: f64,
    chroma: f64,
    hue: f64,
    amount: f64,
    skin_protection: f64,
) -> f64 {
    let cmax = max_chroma(table, ll, hue);
    let saturation = if cmax > 1e-6 {
        jsmath::min(1.0, chroma / cmax)
    } else {
        1.0
    };
    let weight = (1.0 - saturation)
        * (1.0 - saturation)
        * ramp(chroma, VIBRANCE_RAMP_LOW, VIBRANCE_RAMP_HIGH)
        * (1.0 - skin_protection * skin_weight(ll, chroma, hue));
    1.0 + amount * weight
}

struct Samples {
    count: usize,
    lms: Vec<f32>,
    max_channel: Vec<u8>,
    u: Vec<f32>,
    v: Vec<f32>,
}

fn hash2(x: u32, y: u32) -> u32 {
    let mut h =
        x.wrapping_add(1).wrapping_mul(0x9e3779b1) ^ y.wrapping_add(1).wrapping_mul(0x85ebca6b);
    h = (h ^ (h >> 15)).wrapping_mul(0x2c1b3c6d);
    h ^= h >> 12;
    h = h.wrapping_mul(0x297a2d39);
    h ^ (h >> 15)
}

fn collect_samples(image: &Image) -> Samples {
    let (width, height) = (image.width, image.height);
    let data = &image.data;
    let t = decode();
    let stride = jsmath::max(
        1.0,
        ((width * height) as f64 / TARGET_SAMPLES).sqrt().ceil(),
    ) as usize;
    let cells_x = width.div_ceil(stride);
    let cells_y = height.div_ceil(stride);
    let mut s = Samples {
        count: 0,
        lms: Vec::new(),
        max_channel: Vec::new(),
        u: Vec::new(),
        v: Vec::new(),
    };
    for cy in 0..cells_y {
        for cx in 0..cells_x {
            let h = hash2(cx as u32, cy as u32);
            let x = (width - 1).min(
                cx * stride
                    + if stride > 1 {
                        (h % stride as u32) as usize
                    } else {
                        0
                    },
            );
            let y = (height - 1).min(
                cy * stride
                    + if stride > 1 {
                        ((h >> 8) % stride as u32) as usize
                    } else {
                        0
                    },
            );
            let o = (y * width + x) * 4;
            let alpha = data[o + 3];
            if alpha == 0 || (alpha < 255 && ((h >> 16) & 255) >= alpha as u32) {
                continue;
            }
            let (r, g, b) = (
                t[data[o] as usize],
                t[data[o + 1] as usize],
                t[data[o + 2] as usize],
            );
            s.lms
                .push((0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) as f32);
            s.lms
                .push((0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) as f32);
            s.lms
                .push((0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) as f32);
            s.max_channel
                .push(data[o].max(data[o + 1]).max(data[o + 2]));
            s.u.push(((x as f64 + 0.5) / width as f64) as f32);
            s.v.push(((y as f64 + 0.5) / height as f64) as f32);
            s.count += 1;
        }
    }
    s
}

fn sort_f32(values: &mut [f32]) {
    values.sort_by(|a, b| a.total_cmp(b));
}

fn percentile(sorted: &[f32], fraction: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let last = (sorted.len() - 1) as f64;
    let index = jsmath::min(last, jsmath::max(0.0, jsmath::round(fraction * last)));
    sorted[index as usize] as f64
}

fn estimate_gains(s: &Samples, p: &WhiteBalance) -> [f64; 3] {
    if p.strength <= 0.0 {
        return [1.0; 3];
    }
    let mut eligible = Vec::new();
    let mut eligible_l = Vec::new();
    for i in 0..s.count {
        if s.max_channel[i] >= WB_MAX_CHANNEL {
            continue;
        }
        let lab = lms_to_lab(
            s.lms[i * 3] as f64,
            s.lms[i * 3 + 1] as f64,
            s.lms[i * 3 + 2] as f64,
        );
        if lab[0] < WB_MIN_L || jsmath::hypot(lab[1], lab[2]) >= WB_MAX_NEUTRAL_CHROMA {
            continue;
        }
        eligible.push(i);
        eligible_l.push(lab[0]);
    }
    if s.count == 0 || (eligible.len() as f64) < WB_MIN_ELIGIBLE_FRACTION * s.count as f64 {
        return [1.0; 3];
    }
    let mut sorted: Vec<f32> = eligible_l.iter().map(|&v| v as f32).collect();
    sort_f32(&mut sorted);
    if percentile(&sorted, 0.9) - percentile(&sorted, 0.1) < WB_MIN_NEUTRAL_L_SPREAD {
        return [1.0; 3];
    }
    let mut minkowski = [0.0; 3];
    for &i in &eligible {
        for c in 0..3 {
            minkowski[c] += jsmath::pow(s.lms[i * 3 + c] as f64, WB_MINKOWSKI_P);
        }
    }
    let grey = minkowski.map(|sum| jsmath::pow(sum / eligible.len() as f64, 1.0 / WB_MINKOWSKI_P));
    let bright_threshold = percentile(&sorted, 1.0 - WB_BRIGHT_FRACTION);
    let mut bright = [0.0; 3];
    let mut bright_count = 0;
    for (k, &i) in eligible.iter().enumerate() {
        if eligible_l[k] < bright_threshold {
            continue;
        }
        for c in 0..3 {
            bright[c] += s.lms[i * 3 + c] as f64;
        }
        bright_count += 1;
    }
    let normalize = |v: [f64; 3]| -> [f64; 3] {
        let mean = (v[0] + v[1] + v[2]) / 3.0;
        if mean > 0.0 {
            v.map(|x| x / mean)
        } else {
            [1.0; 3]
        }
    };
    let g = normalize(grey);
    let br = if bright_count > 0 {
        normalize(bright)
    } else {
        g
    };
    let estimate = [0, 1, 2].map(|c| (1.0 - p.bright_blend) * g[c] + p.bright_blend * br[c]);

    let lab = lms_to_lab(
        estimate[0] * MID_GREY_Y,
        estimate[1] * MID_GREY_Y,
        estimate[2] * MID_GREY_Y,
    );
    if jsmath::hypot(lab[1], lab[2]) < WB_DEADBAND_CHROMA {
        return [1.0; 3];
    }
    let log_gains = estimate.map(|e| p.strength * -jsmath::log(jsmath::max(e, 1e-6)));
    let gains_at = |k: f64| -> [f64; 3] {
        let raw = log_gains.map(|lg| jsmath::exp(lg * k));
        let lab = lms_to_lab(
            MID_GREY_Y * raw[0],
            MID_GREY_Y * raw[1],
            MID_GREY_Y * raw[2],
        );
        let norm = jsmath::pow(0.6 / jsmath::max(lab[0], 1e-6), 3.0);
        [raw[0] * norm, raw[1] * norm, raw[2] * norm]
    };
    let shift_at = |k: f64| -> f64 {
        let g = gains_at(k);
        let lab = lms_to_lab(MID_GREY_Y * g[0], MID_GREY_Y * g[1], MID_GREY_Y * g[2]);
        jsmath::hypot(lab[1], lab[2])
    };
    let max_lg = log_gains
        .iter()
        .fold(f64::NEG_INFINITY, |m, &v| jsmath::max(m, v));
    let min_lg = log_gains
        .iter()
        .fold(f64::INFINITY, |m, &v| jsmath::min(m, v));
    let ratio = jsmath::exp(max_lg - min_lg);
    let mut scale = if ratio > p.max_gain_ratio {
        jsmath::log(p.max_gain_ratio) / jsmath::log(ratio)
    } else {
        1.0
    };
    if shift_at(scale) > p.max_chroma_shift {
        let (mut low, mut high) = (0.0, scale);
        for _ in 0..30 {
            let mid = (low + high) / 2.0;
            if shift_at(mid) > p.max_chroma_shift {
                high = mid;
            } else {
                low = mid;
            }
        }
        scale = low;
    }
    gains_at(scale)
}

fn plan_levels(sorted: &[f32], p: &Levels) -> Option<[f64; 4]> {
    let low = percentile(sorted, p.low);
    let high = percentile(sorted, p.high);
    if high - low < LEVELS_MIN_SPREAD {
        return None;
    }
    if low <= LEVELS_DEADBAND_LOW && high >= LEVELS_DEADBAND_HIGH {
        return None;
    }
    let mut out_low = jsmath::min(low, LEVELS_TARGET_LOW);
    let mut out_high = jsmath::max(high, LEVELS_TARGET_HIGH);
    if (out_high - out_low) / (high - low) > p.max_stretch {
        let center = (low + high) / 2.0;
        let half = ((high - low) * p.max_stretch) / 2.0;
        out_low = center - half;
        out_high = center + half;
        if out_low < 0.0 {
            out_high -= out_low;
            out_low = 0.0;
        }
        if out_high > 1.0 {
            out_low = jsmath::max(0.0, out_low - (out_high - 1.0));
            out_high = 1.0;
        }
    }
    Some([low, high, out_low, out_high])
}

fn plan_gamma(median: f64, p: &Midtone) -> f64 {
    if median <= 0.0 || median >= 1.0 {
        return 1.0;
    }
    let target = if median < p.band_low {
        p.band_low
    } else if median > p.band_high {
        p.band_high
    } else {
        median
    };
    if target == median {
        return 1.0;
    }
    let gamma = jsmath::log(target) / jsmath::log(median);
    jsmath::min(p.gamma_max, jsmath::max(p.gamma_min, gamma))
}

fn levels_curve(v: f64, [in_low, in_high, out_low, out_high]: [f64; 4]) -> f64 {
    if v <= in_low {
        return if in_low > 0.0 {
            (v / in_low) * out_low
        } else {
            out_low
        };
    }
    if v >= in_high {
        return if in_high < 1.0 {
            out_high + ((v - in_high) / (1.0 - in_high)) * (1.0 - out_high)
        } else {
            out_high
        };
    }
    out_low + ((v - in_low) * (out_high - out_low)) / (in_high - in_low)
}

fn build_tone_lut(levels: Option<[f64; 4]>, gamma: f64) -> Vec<f32> {
    (0..=TONE_LUT_SIZE)
        .map(|i| {
            let mut v = i as f64 / TONE_LUT_SIZE as f64;
            if let Some(l) = levels {
                v = jsmath::min(1.0, jsmath::max(0.0, levels_curve(v, l)));
            }
            (if gamma == 1.0 {
                v
            } else {
                jsmath::pow(v, gamma)
            }) as f32
        })
        .collect()
}

fn max_tone_slope(lut: &[f32]) -> f64 {
    let mut slope = 0.0;
    let from = (TONE_SLOPE_FROM * TONE_LUT_SIZE as f64).ceil() as usize;
    for i in from..TONE_LUT_SIZE {
        slope = jsmath::max(
            slope,
            (lut[i + 1] as f64 - lut[i] as f64) * TONE_LUT_SIZE as f64,
        );
    }
    slope
}

fn plan_tone_lut(levels: Option<[f64; 4]>, gamma: f64) -> Vec<f32> {
    let lut = build_tone_lut(levels, gamma);
    if gamma == 1.0 || max_tone_slope(&lut) <= MAX_TONE_SLOPE {
        return lut;
    }
    let (mut allowed, mut excessive) = (0.0, 1.0);
    for _ in 0..20 {
        let t = (allowed + excessive) / 2.0;
        if max_tone_slope(&build_tone_lut(levels, 1.0 + (gamma - 1.0) * t)) <= MAX_TONE_SLOPE {
            allowed = t;
        } else {
            excessive = t;
        }
    }
    build_tone_lut(levels, 1.0 + (gamma - 1.0) * allowed)
}

fn tone_lookup(lut: &[f32], ll: f64) -> f64 {
    let size = TONE_LUT_SIZE as f64;
    let mut f = ll * size;
    if f < 0.0 {
        f = 0.0;
    } else if f > size {
        f = size;
    }
    let i = if f < size {
        f as usize
    } else {
        TONE_LUT_SIZE - 1
    };
    lut[i] as f64 + (lut[i + 1] as f64 - lut[i] as f64) * (f - i as f64)
}

fn tile_grid(width: usize, height: usize, p: &Clahe) -> Option<(usize, usize)> {
    let long = width.max(height) as f64;
    let short = width.min(height) as f64;
    let tiles_long = jsmath::min(p.tiles_long_side, (long / p.min_tile_px).floor());
    let tiles_short = jsmath::min(
        jsmath::round((tiles_long * short) / long),
        (short / p.min_tile_px).floor(),
    );
    if tiles_long < 2.0 || tiles_short < 2.0 {
        return None;
    }
    let (tl, ts) = (tiles_long as usize, tiles_short as usize);
    Some(if width >= height { (tl, ts) } else { (ts, tl) })
}

fn build_clahe_luts(tile_l: &[Vec<f64>], clip: f64) -> Vec<f32> {
    let mut luts = vec![0f32; tile_l.len() * CLAHE_BINS];
    let mut histogram = [0f64; CLAHE_BINS];
    for (tile, values) in tile_l.iter().enumerate() {
        let base = tile * CLAHE_BINS;
        if values.len() < CLAHE_MIN_TILE_SAMPLES {
            for j in 0..CLAHE_BINS {
                luts[base + j] = ((j + 1) as f64 / CLAHE_BINS as f64) as f32;
            }
            continue;
        }
        histogram.fill(0.0);
        for &v in values {
            let bin = jsmath::min(
                (CLAHE_BINS - 1) as f64,
                jsmath::max(0.0, (v * CLAHE_BINS as f64).floor()),
            ) as usize;
            histogram[bin] += 1.0;
        }
        let limit = (clip * values.len() as f64) / CLAHE_BINS as f64;
        let mut excess = 0.0;
        for h in histogram.iter_mut() {
            if *h > limit {
                excess += *h - limit;
                *h = limit;
            }
        }
        let add = excess / CLAHE_BINS as f64;
        let mut cumulative = 0.0;
        for j in 0..CLAHE_BINS {
            cumulative += histogram[j] + add;
            luts[base + j] = (cumulative / values.len() as f64) as f32;
        }
    }
    luts
}

#[allow(clippy::too_many_arguments)]
fn clahe_bilinear(
    luts: &[f32],
    b00: usize,
    b10: usize,
    b01: usize,
    b11: usize,
    tx: f64,
    ty: f64,
    ll: f64,
) -> f64 {
    let f = ll * CLAHE_BINS as f64 - 1.0;
    let at = |i: usize| luts[i] as f64;
    let (v00, v10, v01, v11);
    if f <= 0.0 {
        let w = if f <= -1.0 { 0.0 } else { f + 1.0 };
        v00 = at(b00) * w;
        v10 = at(b10) * w;
        v01 = at(b01) * w;
        v11 = at(b11) * w;
    } else if f >= (CLAHE_BINS - 1) as f64 {
        v00 = at(b00 + CLAHE_BINS - 1);
        v10 = at(b10 + CLAHE_BINS - 1);
        v01 = at(b01 + CLAHE_BINS - 1);
        v11 = at(b11 + CLAHE_BINS - 1);
    } else {
        let j = f as usize;
        let t = f - j as f64;
        v00 = at(b00 + j) + (at(b00 + j + 1) - at(b00 + j)) * t;
        v10 = at(b10 + j) + (at(b10 + j + 1) - at(b10 + j)) * t;
        v01 = at(b01 + j) + (at(b01 + j + 1) - at(b01 + j)) * t;
        v11 = at(b11 + j) + (at(b11 + j + 1) - at(b11 + j)) * t;
    }
    let top = v00 + (v10 - v00) * tx;
    let bottom = v01 + (v11 - v01) * tx;
    top + (bottom - top) * ty
}

fn tile_axis(position: f64, tiles: usize) -> (usize, usize, f64) {
    let f = jsmath::min(
        (tiles - 1) as f64,
        jsmath::max(0.0, position * tiles as f64 - 0.5),
    );
    let t0 = f.floor();
    (
        t0 as usize,
        jsmath::min((tiles - 1) as f64, t0 + 1.0) as usize,
        f - t0,
    )
}

struct ClaheParams {
    tiles_x: usize,
    tiles_y: usize,
    blend: f64,
    luts: Vec<f32>,
}

fn clahe_at(c: &ClaheParams, u: f64, v: f64, ll: f64) -> f64 {
    let (x0, x1, tx) = tile_axis(u, c.tiles_x);
    let (y0, y1, ty) = tile_axis(v, c.tiles_y);
    let w = c.tiles_x;
    clahe_bilinear(
        &c.luts,
        (y0 * w + x0) * CLAHE_BINS,
        (y0 * w + x1) * CLAHE_BINS,
        (y1 * w + x0) * CLAHE_BINS,
        (y1 * w + x1) * CLAHE_BINS,
        tx,
        ty,
        ll,
    )
}

struct Params {
    gains: [f64; 3],
    tone_lut: Vec<f32>,
    clahe: Option<ClaheParams>,
    vibrance_amount: f64,
    skin_protection: f64,
}

fn analyze(image: &Image, p: &Preset) -> Params {
    let s = collect_samples(image);
    let gains = estimate_gains(&s, &p.wb);
    let mut labs = vec![0f32; s.count * 3];
    for i in 0..s.count {
        let lab = lms_to_lab(
            s.lms[i * 3] as f64 * gains[0],
            s.lms[i * 3 + 1] as f64 * gains[1],
            s.lms[i * 3 + 2] as f64 * gains[2],
        );
        labs[i * 3] = lab[0] as f32;
        labs[i * 3 + 1] = lab[1] as f32;
        labs[i * 3 + 2] = lab[2] as f32;
    }
    let mut sorted_l: Vec<f32> = (0..s.count).map(|i| labs[i * 3]).collect();
    sort_f32(&mut sorted_l);
    let levels = plan_levels(&sorted_l, &p.levels);
    let levels_only = build_tone_lut(levels, 1.0);
    let mut sorted_leveled: Vec<f32> = (0..s.count)
        .map(|i| tone_lookup(&levels_only, labs[i * 3] as f64) as f32)
        .collect();
    sort_f32(&mut sorted_leveled);
    let midtone = if p.midtone.keep_median {
        Midtone {
            band_low: jsmath::max(p.midtone.band_low, percentile(&sorted_l, 0.5)),
            ..p.midtone
        }
    } else {
        p.midtone
    };
    let gamma = if levels.is_none() && p.midtone.only_with_levels {
        1.0
    } else {
        plan_gamma(percentile(&sorted_leveled, 0.5), &midtone)
    };
    let tone_lut = plan_tone_lut(levels, gamma);
    let toned: Vec<f32> = (0..s.count)
        .map(|i| tone_lookup(&tone_lut, labs[i * 3] as f64) as f32)
        .collect();

    let mut clahe = None;
    if let (Some(pc), true) = (&p.clahe, s.count > 0) {
        if let Some((tiles_x, tiles_y)) = tile_grid(image.width, image.height, pc) {
            let mut sorted_toned = toned.clone();
            sort_f32(&mut sorted_toned);
            let spread = percentile(&sorted_toned, 0.95) - percentile(&sorted_toned, 0.05);
            let flatness = 1.0 - ramp(spread, CLAHE_FLAT_SPREAD, CLAHE_FULL_OFF_SPREAD);
            if flatness > 0.0 {
                let mut tile_l: Vec<Vec<f64>> = vec![Vec::new(); tiles_x * tiles_y];
                for i in 0..s.count {
                    let tx = jsmath::min(
                        (tiles_x - 1) as f64,
                        (s.u[i] as f64 * tiles_x as f64).floor(),
                    ) as usize;
                    let ty = jsmath::min(
                        (tiles_y - 1) as f64,
                        (s.v[i] as f64 * tiles_y as f64).floor(),
                    ) as usize;
                    tile_l[ty * tiles_x + tx].push(toned[i] as f64);
                }
                let clip = 1.0 + (pc.clip - 1.0) * flatness;
                clahe = Some(ClaheParams {
                    tiles_x,
                    tiles_y,
                    blend: pc.blend * flatness,
                    luts: build_clahe_luts(&tile_l, clip),
                });
            }
        }
    }

    let mut vibrance_amount = p.vibrance_amount;
    let skin_protection = p.skin_protection;
    if vibrance_amount > 0.0 && s.count > 0 {
        let table = cmax_table();
        let (mut weighted_saturation, mut weight) = (0.0, 0.0);
        for i in 0..s.count {
            let l0 = labs[i * 3] as f64;
            let mut ll = toned[i] as f64;
            if let Some(c) = &clahe {
                ll += c.blend * (clahe_at(c, s.u[i] as f64, s.v[i] as f64, ll) - ll);
            }
            let (a0, b0) = (labs[i * 3 + 1] as f64, labs[i * 3 + 2] as f64);
            let hue = jsmath::atan2(b0, a0);
            let chroma0 = (a0 * a0 + b0 * b0).sqrt();
            let chroma = chroma0
                * chroma_compensation(l0, ll, skin_weight(ll, chroma0, hue), skin_protection);
            let non_skin = 1.0 - skin_weight(ll, chroma, hue);
            if non_skin <= 0.0 {
                continue;
            }
            let cmax = max_chroma(table, ll, hue);
            weighted_saturation += non_skin
                * if cmax > 1e-6 {
                    jsmath::min(1.0, chroma / cmax)
                } else {
                    1.0
                };
            weight += non_skin;
        }
        if weight > 0.0 {
            vibrance_amount *= 1.0
                - ramp(
                    weighted_saturation / weight,
                    VIBRANCE_DEADBAND_START,
                    VIBRANCE_DEADBAND_END,
                );
        }
    }
    Params {
        gains,
        tone_lut,
        clahe,
        vibrance_amount,
        skin_protection,
    }
}

fn is_identity(p: &Params) -> bool {
    if p.clahe.is_some() || p.vibrance_amount > 0.0 || p.gains.iter().any(|&g| g != 1.0) {
        return false;
    }
    (0..=TONE_LUT_SIZE).all(|i| p.tone_lut[i] == (i as f64 / TONE_LUT_SIZE as f64) as f32)
}

fn apply(image: &Image, p: &Params) -> Image {
    let (width, height) = (image.width, image.height);
    let data = &image.data;
    let mut out = vec![0u8; data.len()];
    let t = decode();
    let enc = encode();
    let table = if p.vibrance_amount > 0.0 {
        Some(cmax_table())
    } else {
        None
    };
    let [gl, gm, gs] = p.gains;
    let stride = COMBINED_LUT_SIZE + 1;

    let mut combined: Option<Vec<f32>> = None;
    let mut col0 = Vec::new();
    let mut col1 = Vec::new();
    let mut col_t: Vec<f32> = Vec::new();
    if let Some(c) = &p.clahe {
        let tiles = c.tiles_x * c.tiles_y;
        let mut comb = vec![0f32; tiles * stride];
        for tile in 0..tiles {
            let base = tile * CLAHE_BINS;
            for i in 0..=COMBINED_LUT_SIZE {
                let toned = tone_lookup(&p.tone_lut, i as f64 / COMBINED_LUT_SIZE as f64);
                let cdf = clahe_bilinear(&c.luts, base, base, base, base, 0.0, 0.0, toned);
                comb[tile * stride + i] = (toned + c.blend * (cdf - toned)) as f32;
            }
        }
        combined = Some(comb);
        for x in 0..width {
            let (t0, t1, tt) = tile_axis((x as f64 + 0.5) / width as f64, c.tiles_x);
            col0.push(t0);
            col1.push(t1);
            col_t.push(tt as f32);
        }
    }

    // Every pixel reads only the source and the tables, so rows run independently.
    out.par_chunks_mut(width * 4)
        .enumerate()
        .for_each(|(y, out)| {
            let (mut row0, mut row1, mut row_t) = (0, 0, 0.0);
            if let Some(c) = &p.clahe {
                let (t0, t1, tt) = tile_axis((y as f64 + 0.5) / height as f64, c.tiles_y);
                row0 = t0 * c.tiles_x;
                row1 = t1 * c.tiles_x;
                row_t = tt;
            }
            for x in 0..width {
                let o = (y * width + x) * 4;
                let q = x * 4;
                let alpha = data[o + 3];
                out[q + 3] = alpha;
                if alpha == 0 {
                    out[q..q + 3].copy_from_slice(&data[o..o + 3]);
                    continue;
                }
                let (r, g, b) = (
                    t[data[o] as usize],
                    t[data[o + 1] as usize],
                    t[data[o + 2] as usize],
                );
                let l_ =
                    jsmath::cbrt((0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) * gl);
                let m_ =
                    jsmath::cbrt((0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) * gm);
                let s_ =
                    jsmath::cbrt((0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) * gs);
                let l0 = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
                let mut a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
                let mut bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

                let ll = if let Some(comb) = &combined {
                    let size = COMBINED_LUT_SIZE as f64;
                    let mut f = l0 * size;
                    if f < 0.0 {
                        f = 0.0;
                    } else if f > size {
                        f = size;
                    }
                    let i = if f < size {
                        f as usize
                    } else {
                        COMBINED_LUT_SIZE - 1
                    };
                    let tt = f - i as f64;
                    let at = |k: usize| comb[k] as f64;
                    let b00 = (row0 + col0[x]) * stride + i;
                    let b10 = (row0 + col1[x]) * stride + i;
                    let b01 = (row1 + col0[x]) * stride + i;
                    let b11 = (row1 + col1[x]) * stride + i;
                    let v00 = at(b00) + (at(b00 + 1) - at(b00)) * tt;
                    let v10 = at(b10) + (at(b10 + 1) - at(b10)) * tt;
                    let v01 = at(b01) + (at(b01 + 1) - at(b01)) * tt;
                    let v11 = at(b11) + (at(b11 + 1) - at(b11)) * tt;
                    let tx = col_t[x] as f64;
                    let top = v00 + (v10 - v00) * tx;
                    top + (v01 + (v11 - v01) * tx - top) * row_t
                } else {
                    tone_lookup(&p.tone_lut, l0)
                };

                let dl = ll - l0;
                if l0 > 1e-4 && (dl > 1e-6 || dl < -1e-6) {
                    let mut comp = (ll / l0).sqrt();
                    if comp > 1.0 {
                        let c2 = a * a + bb * bb;
                        if a > 0.0
                            && bb >= SKIN_TAN_LOW * a
                            && bb <= SKIN_TAN_HIGH * a
                            && c2 > 1e-4
                            && c2 < 0.04
                            && ll > 0.25
                            && ll < 0.96
                        {
                            comp = chroma_compensation(
                                l0,
                                ll,
                                skin_weight(ll, c2.sqrt(), jsmath::atan2(bb, a)),
                                p.skin_protection,
                            );
                        } else if comp > CHROMA_COMP_MAX {
                            comp = CHROMA_COMP_MAX;
                        }
                    } else if comp < CHROMA_COMP_MIN {
                        comp = CHROMA_COMP_MIN;
                    }
                    a *= comp;
                    bb *= comp;
                }
                if let Some(table) = table {
                    let chroma = (a * a + bb * bb).sqrt();
                    if chroma > VIBRANCE_RAMP_LOW {
                        let boost = vibrance_boost(
                            table,
                            ll,
                            chroma,
                            jsmath::atan2(bb, a),
                            p.vibrance_amount,
                            p.skin_protection,
                        );
                        a *= boost;
                        bb *= boost;
                    }
                }

                let lc = ll + 0.3963377774 * a + 0.2158037573 * bb;
                let mc = ll - 0.1055613458 * a - 0.0638541728 * bb;
                let sc = ll - 0.0894841775 * a - 1.291485548 * bb;
                let (lk, mk, sk) = (lc * lc * lc, mc * mc * mc, sc * sc * sc);
                let rr = 4.0767416621 * lk - 3.3077115913 * mk + 0.2309699292 * sk;
                let gg = -1.2684380046 * lk + 2.6097574011 * mk - 0.3413193965 * sk;
                let bl = -0.0041960863 * lk - 0.7034186147 * mk + 1.707614701 * sk;
                if ll > 0.0
                    && ll < 1.0
                    && (0.0..=1.0).contains(&rr)
                    && (0.0..=1.0).contains(&gg)
                    && (0.0..=1.0).contains(&bl)
                {
                    let lut = ENCODE_LUT_SIZE as f64;
                    out[q] = enc[(rr * lut + 0.5) as usize];
                    out[q + 1] = enc[(gg * lut + 0.5) as usize];
                    out[q + 2] = enc[(bl * lut + 0.5) as usize];
                } else {
                    let lin = gamut_map_oklab_to_linear(ll, a, bb);
                    out[q] = encode_linear(lin[0]);
                    out[q + 1] = encode_linear(lin[1]);
                    out[q + 2] = encode_linear(lin[2]);
                }
            }
        });
    Image {
        width,
        height,
        data: out,
    }
}

/// `enhancePixelBuffer`: `None` when the source is used untouched (Off, or every stage abstained).
pub fn enhance(image: &Image, mode: Mode) -> Option<Image> {
    if mode == Mode::Off {
        return None;
    }
    let params = analyze(image, &preset(mode));
    if is_identity(&params) {
        None
    } else {
        Some(apply(image, &params))
    }
}
