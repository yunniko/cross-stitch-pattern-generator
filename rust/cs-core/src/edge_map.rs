//! Port of `lib/pipeline/edge-map.ts`. `Float32Array` stores are `as f32` (round to nearest, as `Math.fround`).

use crate::jsmath;
use crate::Image;

const NOISE_FLOOR: f64 = 40.0;
const NORMALIZATION_PERCENTILE: f64 = 0.999;

/// `sourceLuminance`.
pub fn source_luminance(image: &Image) -> Vec<u8> {
    image
        .data
        .chunks_exact(4)
        .map(|p| {
            jsmath::round(0.2126 * p[0] as f64 + 0.7152 * p[1] as f64 + 0.0722 * p[2] as f64) as u8
        })
        .collect()
}

/// `computeEdgeMagnitude`: Sobel on luminance, noise-floored, normalised by the 99.9th percentile.
pub fn compute_edge_magnitude(image: &Image, gray: &[u8]) -> Vec<f32> {
    let (width, height) = (image.width, image.height);
    let mut magnitude = vec![0f32; width * height];
    for y in 0..height {
        let ym1 = y.saturating_sub(1);
        let yp1 = (y + 1).min(height - 1);
        for x in 0..width {
            let xm1 = x.saturating_sub(1);
            let xp1 = (x + 1).min(width - 1);
            let g = |yy: usize, xx: usize| gray[yy * width + xx] as i32;
            let (tl, tc, tr) = (g(ym1, xm1), g(ym1, x), g(ym1, xp1));
            let (ml, mr) = (g(y, xm1), g(y, xp1));
            let (bl, bc, br) = (g(yp1, xm1), g(yp1, x), g(yp1, xp1));
            let gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
            let gy = bl + 2 * bc + br - (tl + 2 * tc + tr);
            let m = ((gx * gx + gy * gy) as f64).sqrt();
            magnitude[y * width + x] = if m < NOISE_FLOOR { 0.0 } else { m as f32 };
        }
    }

    let k = ((magnitude.len() - 1) as f64 * NORMALIZATION_PERCENTILE).floor() as usize;
    let kth = select_kth(&magnitude, k) as f64;
    let normalizer = if kth == 0.0 || kth.is_nan() { 1.0 } else { kth };
    for m in magnitude.iter_mut() {
        *m = jsmath::min(1.0, *m as f64 / normalizer) as f32;
    }
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
pub fn compute_cell_importance(
    image: &Image,
    edge: &[f32],
    grid_width: usize,
    grid_height: usize,
    gray: &[u8],
) -> Vec<f32> {
    let (src_w, src_h) = (image.width, image.height);
    let cells = grid_width * grid_height;
    let mut max_edge = vec![0f32; cells];
    let mut sum = vec![0f64; cells];
    let mut sum_sq = vec![0f64; cells];
    let mut count = vec![0f64; cells];

    for y in 0..src_h {
        let cell_y = (grid_height - 1).min(y * grid_height / src_h);
        for x in 0..src_w {
            let cell_x = (grid_width - 1).min(x * grid_width / src_w);
            let c = cell_y * grid_width + cell_x;
            let s = y * src_w + x;
            if edge[s] > max_edge[c] {
                max_edge[c] = edge[s];
            }
            let l = gray[s] as f64 / 255.0;
            sum[c] += l;
            sum_sq[c] += l * l;
            count[c] += 1.0;
        }
    }

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
