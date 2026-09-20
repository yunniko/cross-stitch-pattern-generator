//! Port of `lib/pipeline/edge-map.ts`. `Float32Array` stores are `as f32` (round to nearest, as `Math.fround`).

use crate::jsmath;
use crate::Image;
use rayon::prelude::*;

const NOISE_FLOOR: f64 = 40.0;
const NORMALIZATION_PERCENTILE: f64 = 0.999;

/// `sourceLuminance`.
pub fn source_luminance(image: &Image) -> Vec<u8> {
    image
        .data
        .par_chunks_exact(4)
        .map(|p| {
            jsmath::round(0.2126 * p[0] as f64 + 0.7152 * p[1] as f64 + 0.0722 * p[2] as f64) as u8
        })
        .collect()
}

/// `computeEdgeMagnitude`: Sobel on luminance, noise-floored, normalised by the 99.9th percentile.
/// `opaquePixelMask`: 1 where the photo is there, 0 where it is fully transparent; `None` when it is opaque (G-050).
pub fn opaque_pixel_mask(image: &Image) -> Option<Vec<u8>> {
    let mut mask: Option<Vec<u8>> = None;
    for i in 0..image.width * image.height {
        if image.data[i * 4 + 3] != 0 {
            continue;
        }
        mask.get_or_insert_with(|| vec![1u8; image.width * image.height])[i] = 0;
    }
    mask
}

/// `computeEdgeMagnitude` without a mask.
pub fn compute_edge_magnitude(image: &Image, gray: &[u8]) -> Vec<f32> {
    compute_edge_magnitude_masked(image, gray, None)
}

/// `computeEdgeMagnitude`: with `opaque`, a transparent pixel has no magnitude and lends none, so the alpha boundary
/// is not read as an edge in the photo (G-050).
pub fn compute_edge_magnitude_masked(
    image: &Image,
    gray: &[u8],
    opaque: Option<&[u8]>,
) -> Vec<f32> {
    let (width, height) = (image.width, image.height);
    let mut magnitude = vec![0f32; width * height];
    magnitude
        .par_chunks_mut(width)
        .enumerate()
        .for_each(|(y, row)| {
            let ym1 = y.saturating_sub(1);
            let yp1 = (y + 1).min(height - 1);
            for x in 0..width {
                let xm1 = x.saturating_sub(1);
                let xp1 = (x + 1).min(width - 1);
                let centre = y * width + x;
                if let Some(mask) = opaque {
                    if mask[centre] == 0 {
                        row[x] = 0.0;
                        continue;
                    }
                }
                // A transparent neighbour reads as the centre's own luminance, so it adds no gradient (G-050).
                let g = |yy: usize, xx: usize| {
                    let index = yy * width + xx;
                    let index = match opaque {
                        Some(mask) if mask[index] == 0 => centre,
                        _ => index,
                    };
                    gray[index] as i32
                };
                let (tl, tc, tr) = (g(ym1, xm1), g(ym1, x), g(ym1, xp1));
                let (ml, mr) = (g(y, xm1), g(y, xp1));
                let (bl, bc, br) = (g(yp1, xm1), g(yp1, x), g(yp1, xp1));
                let gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
                let gy = bl + 2 * bc + br - (tl + 2 * tc + tr);
                let m = ((gx * gx + gy * gy) as f64).sqrt();
                row[x] = if m < NOISE_FLOOR { 0.0 } else { m as f32 };
            }
        });

    let k = ((magnitude.len() - 1) as f64 * NORMALIZATION_PERCENTILE).floor() as usize;
    let kth = select_kth(&magnitude, k) as f64;
    let normalizer = if kth == 0.0 || kth.is_nan() { 1.0 } else { kth };
    magnitude.par_iter_mut().for_each(|m| {
        *m = jsmath::min(1.0, *m as f64 / normalizer) as f32;
    });
    magnitude
}

/// `selectKth`: the k-th smallest value, as a numeric sort would place it. The magnitudes are finite and never `-0`,
/// so a total order on the values gives the same element.
pub fn select_kth(values: &[f32], k: usize) -> f32 {
    let mut copy = values.to_vec();
    let (_, kth, _) = copy.select_nth_unstable_by(k, |a, b| a.total_cmp(b));
    *kth
}

/// `computeCellImportance`: 0.7 × the cell's max edge + 0.3 × its luminance contrast.
/// `computeCellImportance` without a mask.
pub fn compute_cell_importance(
    image: &Image,
    edge: &[f32],
    grid_width: usize,
    grid_height: usize,
    gray: &[u8],
) -> Vec<f32> {
    compute_cell_importance_masked(image, edge, grid_width, grid_height, gray, None)
}

/// `computeCellImportance`: with `opaque`, a transparent pixel contributes neither edge nor contrast (G-050).
pub fn compute_cell_importance_masked(
    image: &Image,
    edge: &[f32],
    grid_width: usize,
    grid_height: usize,
    gray: &[u8],
    opaque: Option<&[u8]>,
) -> Vec<f32> {
    let (src_w, src_h) = (image.width, image.height);
    let cells = grid_width * grid_height;
    let mut max_edge = vec![0f32; cells];
    let mut sum = vec![0f64; cells];
    let mut sum_sq = vec![0f64; cells];
    let mut count = vec![0f64; cells];

    // The source rows of each cell row are contiguous, so rows of cells accumulate independently, in source order.
    let mut first_row = vec![src_h; grid_height + 1];
    for y in (0..src_h).rev() {
        first_row[(grid_height - 1).min(y * grid_height / src_h)] = y;
    }
    for cy in (0..grid_height).rev() {
        first_row[cy] = first_row[cy].min(first_row[cy + 1]);
    }
    let cell_x_of: Vec<usize> = (0..src_w)
        .map(|x| (grid_width - 1).min(x * grid_width / src_w))
        .collect();
    max_edge
        .par_chunks_mut(grid_width)
        .zip(sum.par_chunks_mut(grid_width))
        .zip(sum_sq.par_chunks_mut(grid_width))
        .zip(count.par_chunks_mut(grid_width))
        .enumerate()
        .for_each(|(cy, (((max_edge, sum), sum_sq), count))| {
            for y in first_row[cy]..first_row[cy + 1] {
                for x in 0..src_w {
                    let c = cell_x_of[x];
                    let s = y * src_w + x;
                    if let Some(mask) = opaque {
                        if mask[s] == 0 {
                            continue;
                        }
                    }
                    if edge[s] > max_edge[c] {
                        max_edge[c] = edge[s];
                    }
                    let l = gray[s] as f64 / 255.0;
                    sum[c] += l;
                    sum_sq[c] += l * l;
                    count[c] += 1.0;
                }
            }
        });

    (0..cells)
        .map(|i| {
            let n = if count[i] == 0.0 { 1.0 } else { count[i] };
            let mean = sum[i] / n;
            let variance = jsmath::max(0.0, sum_sq[i] / n - mean * mean);
            let contrast = jsmath::min(1.0, variance.sqrt() / 0.5);
            jsmath::min(1.0, 0.7 * max_edge[i] as f64 + 0.3 * contrast) as f32
        })
        .collect()
}
