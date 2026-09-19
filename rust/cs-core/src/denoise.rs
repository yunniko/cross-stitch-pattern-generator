//! Port of `lib/pipeline/denoise.ts`: the quantizer-only 3×3 vector-medoid filter (D41, D51, D178). Only the OKLab
//! copy is returned; the quantizer never reads the denoised RGB.

use rayon::prelude::*;

const IMPORTANCE_PROTECTION_THRESHOLD: f64 = 0.5;
const RIDGE_STRENGTH_FLOOR: f64 = 0.05;
const ALLY_MATCH_DISTANCE_SQUARED: f64 = 0.0005;
const RIDGE_DIRECTIONS: [(i64, i64); 4] = [(1, 0), (0, 1), (1, 1), (1, -1)];

#[inline]
fn distance_sq(lab: &[f64], a: usize, b: usize) -> f64 {
    let (ao, bo) = (a * 3, b * 3);
    let dl = lab[ao] - lab[bo];
    let da = lab[ao + 1] - lab[bo + 1];
    let db = lab[ao + 2] - lab[bo + 2];
    dl * dl + da * da + db * db
}

fn ridge_strength(lab: &[f64], width: usize, height: usize, x: usize, y: usize) -> f64 {
    let (w, h) = (width as i64, height as i64);
    let io = (y * width + x) * 3;
    let mut max_ridge = 0.0;
    for &(dx, dy) in &RIDGE_DIRECTIONS {
        let (nx1, ny1, nx2, ny2) = (x as i64 - dx, y as i64 - dy, x as i64 + dx, y as i64 + dy);
        if nx1 < 0 || nx1 >= w || ny1 < 0 || ny1 >= h || nx2 < 0 || nx2 >= w || ny2 < 0 || ny2 >= h
        {
            continue;
        }
        let no = (ny1 * w + nx1) as usize * 3;
        let po = (ny2 * w + nx2) as usize * 3;
        let dl = lab[io] - (lab[no] + lab[po]) / 2.0;
        let da = lab[io + 1] - (lab[no + 1] + lab[po + 1]) / 2.0;
        let db = lab[io + 2] - (lab[no + 2] + lab[po + 2]) / 2.0;
        let ridge = dl * dl + da * da + db * db;
        if ridge > max_ridge {
            max_ridge = ridge;
        }
    }
    max_ridge
}

/// `denoiseForQuantization`, returning the denoised cells' OKLab.
pub fn denoise_for_quantization(
    width: usize,
    height: usize,
    cell_oklab: &[f64],
    importance: &[f32],
) -> Vec<f64> {
    let mut out = cell_oklab.to_vec();
    // Every cell reads only the undenoised input, so rows run independently.
    out.par_chunks_mut(width * 3)
        .enumerate()
        .for_each(|(y, out)| {
            let mut window = [0usize; 9];
            let mut pair = [0f64; 81];
            for x in 0..width {
                let i = y * width + x;
                if importance[i] as f64 > IMPORTANCE_PROTECTION_THRESHOLD {
                    continue;
                }
                let mut size = 0;
                window[size] = i;
                size += 1;
                for dy in -1i64..=1 {
                    for dx in -1i64..=1 {
                        if dx == 0 && dy == 0 {
                            continue;
                        }
                        let (nx, ny) = (x as i64 + dx, y as i64 + dy);
                        if nx < 0 || nx >= width as i64 || ny < 0 || ny >= height as i64 {
                            continue;
                        }
                        window[size] = ny as usize * width + nx as usize;
                        size += 1;
                    }
                }

                if ridge_strength(cell_oklab, width, height, x, y) > RIDGE_STRENGTH_FLOOR
                    && (1..size).any(|w| {
                        distance_sq(cell_oklab, i, window[w]) <= ALLY_MATCH_DISTANCE_SQUARED
                    })
                {
                    continue;
                }

                for a in 0..size {
                    pair[a * 9 + a] = 0.0;
                    for b in a + 1..size {
                        let d = distance_sq(cell_oklab, window[a], window[b]);
                        pair[a * 9 + b] = d;
                        pair[b * 9 + a] = d;
                    }
                }
                let mut best = i;
                let mut best_sum = f64::INFINITY;
                for a in 0..size {
                    let mut sum = 0.0;
                    for b in 0..size {
                        sum += pair[a * 9 + b];
                    }
                    if sum < best_sum {
                        best_sum = sum;
                        best = window[a];
                    }
                }
                if best != i {
                    out[x * 3..x * 3 + 3].copy_from_slice(&cell_oklab[best * 3..best * 3 + 3]);
                }
            }
        });
    out
}
