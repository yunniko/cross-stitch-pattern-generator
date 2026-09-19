//! Shared text: finished size (`finished-size.ts`), stitch and colour counts (`types.ts`), skein estimates
//! (`floss-estimate.ts`) and hex colours (`color.ts`).

use crate::jsfmt::{locale_int, to_fixed};
use crate::model::SizeUnit;

const CM_PER_INCH: f64 = 2.54;

fn to_unit(stitches: f64, aida: f64, unit: SizeUnit) -> f64 {
    let inches = stitches / aida;
    match unit {
        SizeUnit::In => inches,
        SizeUnit::Cm => inches * CM_PER_INCH,
    }
}

/// `formatFinishedSize`: "54.4 × 36.3 cm".
pub fn finished_size(w: usize, h: usize, aida: f64, unit: SizeUnit) -> String {
    format!(
        "{} × {} {}",
        to_fixed(to_unit(w as f64, aida, unit), 1),
        to_fixed(to_unit(h as f64, aida, unit), 1),
        unit.id()
    )
}

/// `formatStitchCount`.
pub fn stitch_count(n: usize) -> String {
    format!(
        "{} {}",
        locale_int(n as u64),
        if n == 1 { "stitch" } else { "stitches" }
    )
}

/// `formatColorCount`.
pub fn color_count(n: usize) -> String {
    format!(
        "{} {}",
        locale_int(n as u64),
        if n == 1 { "color" } else { "colors" }
    )
}

/// `estimateSkeins`.
pub fn skeins(count: usize, aida: f64) -> u64 {
    if count == 0 {
        return 0;
    }
    let strands = if aida <= 11.0 { 3.0 } else { 2.0 };
    let working = (2.0 * (std::f64::consts::SQRT_2 + 1.0) * CM_PER_INCH * 2.0) / aida;
    let per_stitch = strands * working;
    ((count as f64 * per_stitch) / 4800.0).ceil().max(1.0) as u64
}

/// `formatSkeinEstimate`.
pub fn skein_estimate(count: usize, aida: f64) -> String {
    let n = skeins(count, aida);
    format!("{n} skein{}", if n == 1 { "" } else { "s" })
}

/// `rgbToHex`: "#1a2b3c".
pub fn hex(rgb: [u8; 3]) -> String {
    format!("#{:02x}{:02x}{:02x}", rgb[0], rgb[1], rgb[2])
}

/// `luminance`: rounded relative luminance on 0–255.
pub fn luminance(rgb: [u8; 3]) -> f64 {
    (0.2126 * rgb[0] as f64 + 0.7152 * rgb[1] as f64 + 0.0722 * rgb[2] as f64).round()
}

/// `formatThreadName`'s inverse for display (`splitThreadCodeName`).
pub fn split_thread_code_name(full: &str) -> (String, String) {
    match full.find(" - ") {
        Some(i) => (full[..i].to_string(), full[i + 3..].to_string()),
        None => (full.to_string(), String::new()),
    }
}
