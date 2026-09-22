//! Port of `lib/pipeline/hue-reserve.ts`: Vivid, part two (G-062, D212).
//!
//! k-means allocates by squared error, so a colour covering half a percent of the chart loses to one more step in
//! the dominant ramp however visible it is. This gives each hue the cells hold, and the palette does not speak for,
//! a slot of its own, paid for by merging the closest pair of threads.

use crate::color::{oklab_distance_sq, oklab_to_rgb, rgb_to_oklab, Oklab, Rgb};
use crate::jsmath;

pub const HUE_BINS: usize = 12;
pub const HUE_RESERVE_CHROMA_FLOOR: f64 = 0.02;
pub const HUE_RESERVE_MIN_SHARE: f64 = 0.001;
pub const HUE_RESERVE_MAX_THREADS: usize = 6;
pub const HUE_RESERVE_COVERAGE_SHARE: f64 = 0.5;
pub const HUE_RESERVE_COVERAGE_FLOOR: f64 = 0.03;

const FLOOR_SQUARED: f64 = HUE_RESERVE_CHROMA_FLOOR * HUE_RESERVE_CHROMA_FLOOR;
const COVERAGE_SHARE_SQUARED: f64 = HUE_RESERVE_COVERAGE_SHARE * HUE_RESERVE_COVERAGE_SHARE;
const COVERAGE_FLOOR_SQUARED: f64 = HUE_RESERVE_COVERAGE_FLOOR * HUE_RESERVE_COVERAGE_FLOOR;

/// `Math.atan2` is bit-exact in both languages (fdlibm), as photo enhancement already relies on.
pub fn hue_bin_of(a: f64, b: f64) -> usize {
    let turns = (jsmath::atan2(b, a) / (2.0 * std::f64::consts::PI) + 1.0) % 1.0;
    let bin = (turns * HUE_BINS as f64).floor() as usize;
    bin.min(HUE_BINS - 1)
}

pub struct HueReserveResult {
    pub cell_palette_index: Vec<u8>,
    pub palette: Vec<Rgb>,
    pub reserved: usize,
}

pub fn reserve_hue_threads(
    cell_oklab: &[f64],
    cell_palette_index: &[u8],
    palette: &[Rgb],
    empty_mask: Option<&[u8]>,
) -> HueReserveResult {
    let cell_count = cell_palette_index.len();
    if palette.len() < 2 {
        return HueReserveResult {
            cell_palette_index: cell_palette_index.to_vec(),
            palette: palette.to_vec(),
            reserved: 0,
        };
    }

    let mut bin_weight = [0usize; HUE_BINS];
    let mut bin_best: [i64; HUE_BINS] = [-1; HUE_BINS];
    let mut bin_best_chroma = [0f64; HUE_BINS];
    let mut stitched = 0usize;
    for i in 0..cell_count {
        if empty_mask.is_some_and(|m| m[i] != 0) {
            continue;
        }
        stitched += 1;
        let a = cell_oklab[i * 3 + 1];
        let b = cell_oklab[i * 3 + 2];
        let chroma = a * a + b * b;
        if chroma < FLOOR_SQUARED {
            continue;
        }
        let bin = hue_bin_of(a, b);
        bin_weight[bin] += 1;
        if chroma > bin_best_chroma[bin] {
            bin_best_chroma[bin] = chroma;
            bin_best[bin] = i as i64;
        }
    }

    let oklab: Vec<Oklab> = palette.iter().map(|&c| rgb_to_oklab(c)).collect();
    let mut bin_thread_chroma = [0f64; HUE_BINS];
    for lab in &oklab {
        let chroma = lab[1] * lab[1] + lab[2] * lab[2];
        if chroma < FLOOR_SQUARED {
            continue;
        }
        let bin = hue_bin_of(lab[1], lab[2]);
        if chroma > bin_thread_chroma[bin] {
            bin_thread_chroma[bin] = chroma;
        }
    }

    let mut wanted: Vec<(usize, usize)> = Vec::new();
    for bin in 0..HUE_BINS {
        let covered = bin_thread_chroma[bin] >= COVERAGE_FLOOR_SQUARED
            && bin_thread_chroma[bin] >= COVERAGE_SHARE_SQUARED * bin_best_chroma[bin];
        if covered || bin_best[bin] < 0 {
            continue;
        }
        if (bin_weight[bin] as f64) < HUE_RESERVE_MIN_SHARE * stitched as f64 {
            continue;
        }
        wanted.push((bin, bin_weight[bin]));
    }
    // Heaviest hue first; a tie goes to the lower bin, so the order never depends on the sort's stability.
    wanted.sort_by(|x, y| y.1.cmp(&x.1).then(x.0.cmp(&y.0)));
    wanted.truncate(HUE_RESERVE_MAX_THREADS);
    if wanted.is_empty() {
        return HueReserveResult {
            cell_palette_index: cell_palette_index.to_vec(),
            palette: palette.to_vec(),
            reserved: 0,
        };
    }

    let mut centroids = oklab.clone();
    let mut counts = vec![0usize; centroids.len()];
    for i in 0..cell_count {
        if empty_mask.is_some_and(|m| m[i] != 0) {
            continue;
        }
        counts[cell_palette_index[i] as usize] += 1;
    }

    for &(bin, _) in &wanted {
        let mut pair_i = 0usize;
        let mut pair_j = 1usize;
        let mut best_dist = f64::INFINITY;
        for i in 0..centroids.len() {
            for j in i + 1..centroids.len() {
                let d = oklab_distance_sq(&centroids[i], &centroids[j]);
                if d < best_dist {
                    best_dist = d;
                    pair_i = i;
                    pair_j = j;
                }
            }
        }
        let loser = if counts[pair_i] <= counts[pair_j] { pair_i } else { pair_j };
        let winner = if loser == pair_i { pair_j } else { pair_i };
        counts[winner] += counts[loser];
        let seed = bin_best[bin] as usize;
        centroids[loser] = [
            cell_oklab[seed * 3],
            cell_oklab[seed * 3 + 1],
            cell_oklab[seed * 3 + 2],
        ];
        counts[loser] = 0;
    }

    // Each cell to its nearest thread, once: re-converging Lloyd here loses every reserved hue.
    let mut assignment = vec![0u8; cell_count];
    let mut used = vec![0usize; centroids.len()];
    for i in 0..cell_count {
        if empty_mask.is_some_and(|m| m[i] != 0) {
            assignment[i] = crate::EMPTY_CELL;
            continue;
        }
        let cell: Oklab = [cell_oklab[i * 3], cell_oklab[i * 3 + 1], cell_oklab[i * 3 + 2]];
        let mut best = 0usize;
        let mut best_dist = f64::INFINITY;
        for (c, centroid) in centroids.iter().enumerate() {
            let d = oklab_distance_sq(&cell, centroid);
            if d < best_dist {
                best_dist = d;
                best = c;
            }
        }
        assignment[i] = best as u8;
        used[best] += 1;
    }

    let mut remap = vec![-1i32; centroids.len()];
    let mut next_palette: Vec<Rgb> = Vec::new();
    for (c, centroid) in centroids.iter().enumerate() {
        if used[c] == 0 {
            continue;
        }
        remap[c] = next_palette.len() as i32;
        next_palette.push(oklab_to_rgb(*centroid));
    }
    let next_index: Vec<u8> = assignment
        .iter()
        .map(|&a| {
            if a == crate::EMPTY_CELL {
                crate::EMPTY_CELL
            } else {
                remap[a as usize] as u8
            }
        })
        .collect();

    HueReserveResult {
        cell_palette_index: next_index,
        palette: next_palette,
        reserved: wanted.len(),
    }
}
