//! Port of `lib/pipeline/dither.ts` (G-052): a chart dithered to its palette, so neighbouring stitches take the two
//! threads either side of a colour instead of every stitch rounding to one. Threshold matrices are the patterns and
//! come from the same generated data the TypeScript reads (D198); `floyd-steinberg` is the error-diffusion family,
//! serpentine, which is what keeps the worm artifacts away.

use crate::color::{rgb_to_oklab, Oklab, Rgb};
use std::collections::HashMap;
use std::sync::OnceLock;

/// Which pattern, or none. The values are `DitherMode`'s in TypeScript.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DitherMode {
    Off,
    Bayer4,
    Bayer8,
    Clustered8,
    Ring8,
    LinesHorizontal,
    LinesDiagonal,
    BlueNoise16,
    FloydSteinberg,
    Atkinson,
}

impl DitherMode {
    pub fn id(self) -> &'static str {
        match self {
            DitherMode::Off => "off",
            DitherMode::Bayer4 => "bayer-4",
            DitherMode::Bayer8 => "bayer-8",
            DitherMode::Clustered8 => "clustered-8",
            DitherMode::Ring8 => "ring-8",
            DitherMode::LinesHorizontal => "lines-horizontal",
            DitherMode::LinesDiagonal => "lines-diagonal",
            DitherMode::BlueNoise16 => "blue-noise-16",
            DitherMode::FloydSteinberg => "floyd-steinberg",
            DitherMode::Atkinson => "atkinson",
        }
    }

    pub fn is_dithered(self) -> bool {
        self != DitherMode::Off
    }
}

struct Matrix {
    size: usize,
    ranks: Vec<u32>,
}

/// The generated patterns, parsed once: `name<TAB>size<TAB>comma-separated ranks in row-major order`.
fn matrices() -> &'static HashMap<String, Matrix> {
    static M: OnceLock<HashMap<String, Matrix>> = OnceLock::new();
    M.get_or_init(|| {
        let mut out = HashMap::new();
        for line in include_str!("../data/dither-matrices.tsv").lines() {
            let mut parts = line.split('\t');
            let (Some(name), Some(size), Some(ranks)) = (parts.next(), parts.next(), parts.next())
            else {
                continue;
            };
            out.insert(
                name.to_string(),
                Matrix {
                    size: size.parse().expect("matrix size"),
                    ranks: ranks
                        .split(',')
                        .map(|r| r.parse().expect("matrix rank"))
                        .collect(),
                },
            );
        }
        out
    })
}

/// `twoNearest`: the two nearest palette entries, nearest first, with the TypeScript's tie handling.
fn two_nearest(palette: &[f64], count: usize, l: f64, a: f64, b: f64) -> (usize, usize) {
    let mut best = 0usize;
    let mut best_dist = f64::INFINITY;
    let mut second = 0usize;
    let mut second_dist = f64::INFINITY;
    for c in 0..count {
        let o = c * 3;
        let dl = l - palette[o];
        let da = a - palette[o + 1];
        let db = b - palette[o + 2];
        let d = dl * dl + da * da + db * db;
        if d < best_dist {
            second_dist = best_dist;
            second = best;
            best_dist = d;
            best = c;
        } else if d < second_dist {
            second_dist = d;
            second = c;
        }
    }
    (
        best,
        if second_dist.is_infinite() {
            best
        } else {
            second
        },
    )
}

fn palette_to_oklab(palette: &[Rgb]) -> Vec<f64> {
    let mut out = vec![0f64; palette.len() * 3];
    for (i, &rgb) in palette.iter().enumerate() {
        let lab: Oklab = rgb_to_oklab(rgb);
        out[i * 3..i * 3 + 3].copy_from_slice(&lab);
    }
    out
}

/// `positionBetween`: where a colour sits between two palette entries, 0 at the first and 1 at the second.
fn position_between(palette: &[f64], first: usize, second: usize, l: f64, a: f64, b: f64) -> f64 {
    let (fo, so) = (first * 3, second * 3);
    let vl = palette[so] - palette[fo];
    let va = palette[so + 1] - palette[fo + 1];
    let vb = palette[so + 2] - palette[fo + 2];
    let length_squared = vl * vl + va * va + vb * vb;
    if length_squared == 0.0 {
        return 0.0;
    }
    let t = ((l - palette[fo]) * vl + (a - palette[fo + 1]) * va + (b - palette[fo + 2]) * vb)
        / length_squared;
    if t <= 0.0 {
        0.0
    } else if t >= 1.0 {
        1.0
    } else {
        t
    }
}

fn ordered(
    cell_oklab: &[f64],
    width: usize,
    height: usize,
    palette: &[Rgb],
    mode: DitherMode,
) -> Vec<u8> {
    let matrix = matrices()
        .get(mode.id())
        .unwrap_or_else(|| panic!("unknown dither pattern {}", mode.id()));
    let size = matrix.size;
    let scale = (size * size) as f64;
    let palette_oklab = palette_to_oklab(palette);
    let mut labels = vec![0u8; width * height];

    for y in 0..height {
        for x in 0..width {
            let i = y * width + x;
            let o = i * 3;
            let (l, a, b) = (cell_oklab[o], cell_oklab[o + 1], cell_oklab[o + 2]);
            let (first, second) = two_nearest(&palette_oklab, palette.len(), l, a, b);
            let t = position_between(&palette_oklab, first, second, l, a, b);
            let threshold = (matrix.ranks[(y % size) * size + (x % size)] as f64 + 0.5) / scale;
            labels[i] = if t > threshold {
                second as u8
            } else {
                first as u8
            };
        }
    }
    labels
}

/// The error-diffusion kernels as `(dx, dy, weight)` taps, mirrored in `dx` on a right-to-left row. Floyd-Steinberg
/// passes all of the error on; Atkinson passes six eighths and drops the rest, which keeps near-black and near-white
/// areas flat and makes the stitches it does place clump (D200). Mirrors `DIFFUSION_KERNELS` in `dither.ts`.
const FLOYD_STEINBERG: [(i64, i64, f64); 4] = [
    (1, 0, 7.0 / 16.0),
    (-1, 1, 3.0 / 16.0),
    (0, 1, 5.0 / 16.0),
    (1, 1, 1.0 / 16.0),
];
const ATKINSON: [(i64, i64, f64); 6] = [
    (1, 0, 1.0 / 8.0),
    (2, 0, 1.0 / 8.0),
    (-1, 1, 1.0 / 8.0),
    (0, 1, 1.0 / 8.0),
    (1, 1, 1.0 / 8.0),
    (0, 2, 1.0 / 8.0),
];

fn error_diffusion(
    cell_oklab: &[f64],
    width: usize,
    height: usize,
    palette: &[Rgb],
    mode: DitherMode,
) -> Vec<u8> {
    let kernel: &[(i64, i64, f64)] = match mode {
        DitherMode::Atkinson => &ATKINSON,
        _ => &FLOYD_STEINBERG,
    };
    let palette_oklab = palette_to_oklab(palette);
    let mut labels = vec![0u8; width * height];
    let mut working = cell_oklab.to_vec();

    for y in 0..height {
        let left_to_right = y % 2 == 0;
        for step in 0..width {
            let x = if left_to_right {
                step
            } else {
                width - 1 - step
            };
            let i = y * width + x;
            let o = i * 3;
            let (best, _) = two_nearest(
                &palette_oklab,
                palette.len(),
                working[o],
                working[o + 1],
                working[o + 2],
            );
            labels[i] = best as u8;
            let po = best * 3;
            let el = working[o] - palette_oklab[po];
            let ea = working[o + 1] - palette_oklab[po + 1];
            let eb = working[o + 2] - palette_oklab[po + 2];

            let ahead: i64 = if left_to_right { 1 } else { -1 };
            let mut spread = |nx: i64, ny: i64, weight: f64| {
                if nx < 0 || nx >= width as i64 || ny < 0 || ny >= height as i64 {
                    return;
                }
                let no = (ny as usize * width + nx as usize) * 3;
                working[no] += el * weight;
                working[no + 1] += ea * weight;
                working[no + 2] += eb * weight;
            };
            let (xi, yi) = (x as i64, y as i64);
            for &(dx, dy, weight) in kernel {
                spread(xi + ahead * dx, yi + dy, weight);
            }
        }
    }
    labels
}

/// `ditherToPalette`: every cell's palette entry, dithered by `mode`.
pub fn dither_to_palette(
    cell_oklab: &[f64],
    width: usize,
    height: usize,
    palette: &[Rgb],
    mode: DitherMode,
) -> Vec<u8> {
    if palette.is_empty() {
        return vec![0u8; width * height];
    }
    match mode {
        DitherMode::Off => panic!("dither_to_palette called with Off"),
        DitherMode::FloydSteinberg | DitherMode::Atkinson => {
            error_diffusion(cell_oklab, width, height, palette, mode)
        }
        _ => ordered(cell_oklab, width, height, palette, mode),
    }
}
