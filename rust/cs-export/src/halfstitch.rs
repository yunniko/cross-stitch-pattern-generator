//! Half stitches (G-082): a cell holds a whole stitch or half of one, laid along a diagonal. Drawn as the cell with two
//! opposite corners cut away. `lib/export/half-stitch-shape.ts` is the same shape in TypeScript, and the two must agree
//! exactly (D259): the constant, the polygon and the supersampled mask.

pub const WHOLE: u8 = 0;
/// "/": the thread from the bottom-left corner to the top-right; the top-left and bottom-right corners are cut away.
pub const SLASH: u8 = 1;
/// "\": top-left to bottom-right; the top-right and bottom-left corners are cut away.
pub const BACKSLASH: u8 = 2;

/// Each cut is a right triangle whose legs are this share of the cell's side (Owner, 2026-10-01).
pub const HALF_STITCH_CUT: f64 = 0.3;

/// The six corners of what is left of a `size` × `size` cell, clockwise; empty for a whole stitch.
pub fn polygon(kind: u8, size: f64) -> Vec<(f64, f64)> {
    let c = size * HALF_STITCH_CUT;
    let s = size;
    match kind {
        SLASH => vec![
            (c, 0.0),
            (s, 0.0),
            (s, s - c),
            (s - c, s),
            (0.0, s),
            (0.0, c),
        ],
        BACKSLASH => vec![
            (0.0, 0.0),
            (s - c, 0.0),
            (s, c),
            (s, s),
            (c, s),
            (0.0, s - c),
        ],
        _ => Vec::new(),
    }
}

fn point_inside(kind: u8, size: f64, x: f64, y: f64) -> bool {
    if kind != SLASH && kind != BACKSLASH {
        return true;
    }
    let c = size * HALF_STITCH_CUT;
    if kind == SLASH {
        x + y >= c && x + y <= 2.0 * size - c
    } else {
        size - x + y >= c && size - x + y <= 2.0 * size - c
    }
}

const SAMPLES: usize = 4;

/// How much of each pixel of a `size` × `size` stitch tile a half stitch keeps, 0 to 255, row-major: a 4 × 4 grid of
/// samples per pixel (`halfStitchMask` in TypeScript).
pub fn mask(kind: u8, size: usize) -> Vec<u8> {
    let mut out = vec![0u8; size * size];
    let s = size as f64;
    for py in 0..size {
        for px in 0..size {
            let mut hits = 0u32;
            for sy in 0..SAMPLES {
                for sx in 0..SAMPLES {
                    let x = px as f64 + (sx as f64 + 0.5) / SAMPLES as f64;
                    let y = py as f64 + (sy as f64 + 0.5) / SAMPLES as f64;
                    if point_inside(kind, s, x, y) {
                        hits += 1;
                    }
                }
            }
            out[py * size + px] = (hits as f64 * 255.0 / (SAMPLES * SAMPLES) as f64).round() as u8;
        }
    }
    out
}

/// The legend's word for a kind.
pub fn label(kind: u8) -> &'static str {
    match kind {
        SLASH => "half /",
        BACKSLASH => "half \\",
        _ => "whole",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_polygon_cuts_the_corners_the_name_says() {
        assert_eq!(
            polygon(SLASH, 100.0),
            vec![
                (30.0, 0.0),
                (100.0, 0.0),
                (100.0, 70.0),
                (70.0, 100.0),
                (0.0, 100.0),
                (0.0, 30.0)
            ]
        );
        assert_eq!(
            polygon(BACKSLASH, 100.0),
            vec![
                (0.0, 0.0),
                (70.0, 0.0),
                (100.0, 30.0),
                (100.0, 100.0),
                (30.0, 100.0),
                (0.0, 70.0)
            ]
        );
        assert!(polygon(WHOLE, 100.0).is_empty());
    }

    #[test]
    fn the_mask_is_clear_in_the_cut_corners_full_elsewhere_and_mirrored_for_the_other_kind() {
        let m = mask(SLASH, 20);
        assert_eq!(m[0], 0);
        assert_eq!(m[19 * 20 + 19], 0);
        assert_eq!(m[19], 255);
        assert_eq!(m[19 * 20], 255);
        assert_eq!(m[10 * 20 + 10], 255);
        assert!(m.iter().any(|&v| v > 0 && v < 255));
        let b = mask(BACKSLASH, 20);
        for y in 0..20 {
            for x in 0..20 {
                assert_eq!(b[y * 20 + x], m[y * 20 + (19 - x)]);
            }
        }
        assert!(mask(WHOLE, 4).iter().all(|&v| v == 255));
    }

    /// The same sums `tests/unit/half-stitch-export.spec.ts` computes from `halfStitchMask` in TypeScript: the two
    /// implementations of the cut must give the same coverage (D259).
    #[test]
    fn the_mask_sums_match_the_typescript() {
        for (size, sum) in [(4usize, 3762u32), (10, 23394), (24, 133944)] {
            for kind in [SLASH, BACKSLASH] {
                let total: u32 = mask(kind, size).iter().map(|&v| v as u32).sum();
                assert_eq!(total, sum, "size {size} kind {kind}");
            }
        }
    }
}
