//! Port of `lib/pipeline/downsample.ts`.

use crate::color::{gamut_map_oklab_to_linear, linear_to_srgb, rgb_to_oklab, srgb_to_linear_table, Rgb};
use crate::jsmath;
use crate::Image;
use rayon::prelude::*;

/// `gridDimensionsFor`.
pub fn grid_dimensions_for(
    source_width: usize,
    source_height: usize,
    longer_side_stitches: f64,
) -> (usize, usize) {
    let longer = jsmath::max(1.0, jsmath::round(longer_side_stitches));
    let (sw, sh) = (source_width as f64, source_height as f64);
    if source_width >= source_height {
        let height = jsmath::max(1.0, jsmath::round((longer * sh) / sw));
        (longer as usize, height as usize)
    } else {
        let width = jsmath::max(1.0, jsmath::round((longer * sw) / sh));
        (width as usize, longer as usize)
    }
}

/// `MIN_CELL_COVERAGE`: a cell covered less than this is an empty stitch, not a colour (G-050).
pub const MIN_CELL_COVERAGE: f32 = 0.5;

/// `emptyCellMask`: which cells the photo barely covers, or `None` when it covers them all.
pub fn empty_cell_mask(coverage: &[f32]) -> Option<Vec<u8>> {
    let mut mask: Option<Vec<u8>> = None;
    for (i, &c) in coverage.iter().enumerate() {
        if c >= MIN_CELL_COVERAGE {
            continue;
        }
        mask.get_or_insert_with(|| vec![0u8; coverage.len()])[i] = 1;
    }
    mask
}

/// `downsampleToGrid`: the colours alone, for callers with no use for coverage.
pub fn downsample_to_grid(image: &Image, grid_width: usize, grid_height: usize) -> Vec<u8> {
    downsample_to_grid_with_coverage(image, grid_width, grid_height).0
}

/// Vivid (G-061): the share of each cell's footprint, by weight, whose chroma the cell keeps. 0 is off.
pub const VIVID_TOP_SHARE: f64 = 0.25;

/// Vivid needs a stitch to hold enough pixels for "its most colourful quarter" to be a real subpopulation rather
/// than a lucky pixel; below this it stands down and the cell is its plain area mean (D211).
pub const VIVID_MIN_PIXELS_PER_CELL: f64 = 24.0;

/// Whether Vivid can act on this photo at this chart size, which is what a pattern records rather than what was asked.
pub fn vivid_applies(
    source_width: usize,
    source_height: usize,
    grid_width: usize,
    grid_height: usize,
) -> bool {
    (source_width * source_height) as f64 / (grid_width * grid_height) as f64
        >= VIVID_MIN_PIXELS_PER_CELL
}

/// `max - min` of the sRGB bytes: a whole-number stand-in for chroma, so both languages select the same pixels.
fn chroma_proxy(data: &[u8], p: usize) -> usize {
    let (r, g, b) = (data[p], data[p + 1], data[p + 2]);
    (r.max(g).max(b) - r.min(g).min(b)) as usize
}

/// `downsampleToGridWithCoverage`: area- and alpha-weighted mean in linear light, one RGB triple per cell, plus the
/// alpha-weighted share of each cell's footprint that is actually there.
pub fn downsample_to_grid_with_coverage(
    image: &Image,
    grid_width: usize,
    grid_height: usize,
) -> (Vec<u8>, Vec<f32>) {
    downsample_to_grid_vivid(image, grid_width, grid_height, 0.0)
}

/// `downsampleToGridWithCoverage` with Vivid's share: above 0 a cell keeps its area-mean lightness and the chroma of
/// its most colourful `vivid_top_share` of weight, unless the photo gives a stitch too few pixels to tell (D211).
pub fn downsample_to_grid_vivid(
    image: &Image,
    grid_width: usize,
    grid_height: usize,
    vivid_top_share: f64,
) -> (Vec<u8>, Vec<f32>) {
    let table = srgb_to_linear_table();
    let (src_w, src_h) = (image.width, image.height);
    // A whole-image decision, not a per-cell one, so both languages take the same branch from the same integers.
    let vivid = vivid_top_share > 0.0 && vivid_applies(src_w, src_h, grid_width, grid_height);
    let data = &image.data;
    let mut out = vec![0u8; grid_width * grid_height * 3];
    let mut coverage = vec![0f32; grid_width * grid_height];

    // Each cell's sum runs in the same order on any thread count: rows of cells are independent.
    out.par_chunks_mut(grid_width * 3)
        .zip(coverage.par_chunks_mut(grid_width))
        .enumerate()
        .for_each(|(cell_y, (out, coverage))| {
            // One bucket per value `max - min` can take, reused across this row's cells.
            let mut chroma_weight = [0f64; 256];
            let y_start = (cell_y * src_h) as f64 / grid_height as f64;
            let y_end = ((cell_y + 1) * src_h) as f64 / grid_height as f64;
            let y_first = jsmath::max(0.0, y_start.floor()) as usize;
            let y_last = jsmath::min((src_h - 1) as f64, y_end.ceil() - 1.0) as i64;

            for cell_x in 0..grid_width {
                let x_start = (cell_x * src_w) as f64 / grid_width as f64;
                let x_end = ((cell_x + 1) * src_w) as f64 / grid_width as f64;
                let x_first = jsmath::max(0.0, x_start.floor()) as usize;
                let x_last = jsmath::min((src_w - 1) as f64, x_end.ceil() - 1.0) as i64;

                let mut sum_r = 0.0;
                let mut sum_g = 0.0;
                let mut sum_b = 0.0;
                let mut sum_weight = 0.0;
                // The footprint's own area, so a cell clipped at the photo's border is judged on the part that exists.
                let mut sum_area = 0.0;

                let mut y = y_first as i64;
                while y <= y_last {
                    let yf = y as f64;
                    let y_weight = jsmath::min(yf + 1.0, y_end) - jsmath::max(yf, y_start);
                    if y_weight > 0.0 {
                        let mut x = x_first as i64;
                        while x <= x_last {
                            let xf = x as f64;
                            let x_weight = jsmath::min(xf + 1.0, x_end) - jsmath::max(xf, x_start);
                            if x_weight > 0.0 {
                                let p = (y as usize * src_w + x as usize) * 4;
                                let alpha = data[p + 3] as f64 / 255.0;
                                let area = x_weight * y_weight;
                                let weight = area * alpha;
                                sum_area += area;
                                sum_r += table[data[p] as usize] * weight;
                                sum_g += table[data[p + 1] as usize] * weight;
                                sum_b += table[data[p + 2] as usize] * weight;
                                sum_weight += weight;
                            }
                            x += 1;
                        }
                    }
                    y += 1;
                }

                let i = cell_x * 3;
                coverage[cell_x] = if sum_area > 0.0 {
                    (sum_weight / sum_area) as f32
                } else {
                    0.0
                };
                if sum_weight > 0.0 && vivid {
                    let mean: Rgb = [
                        linear_to_srgb(sum_r / sum_weight),
                        linear_to_srgb(sum_g / sum_weight),
                        linear_to_srgb(sum_b / sum_weight),
                    ];
                    let rgb = vivid_cell_color(
                        data,
                        mean,
                        src_w,
                        table,
                        x_first,
                        x_last,
                        y_first,
                        y_last,
                        x_start,
                        x_end,
                        y_start,
                        y_end,
                        sum_weight,
                        vivid_top_share,
                        &mut chroma_weight,
                    );
                    out[i] = rgb[0];
                    out[i + 1] = rgb[1];
                    out[i + 2] = rgb[2];
                } else if sum_weight > 0.0 {
                    out[i] = linear_to_srgb(sum_r / sum_weight);
                    out[i + 1] = linear_to_srgb(sum_g / sum_weight);
                    out[i + 2] = linear_to_srgb(sum_b / sum_weight);
                } else {
                    out[i] = 255;
                    out[i + 1] = 255;
                    out[i + 2] = 255;
                }
            }
        });
    (out, coverage)
}

/// One cell's Vivid colour: the area mean's lightness with the chroma of its most colourful `top_share` of weight
/// (G-061, D211). Port of `vividCellColor`, in the same two passes and the same order, so the doubles match.
#[allow(clippy::too_many_arguments)]
fn vivid_cell_color(
    data: &[u8],
    mean: Rgb,
    src_w: usize,
    table: &[f64; 256],
    x_first: usize,
    x_last: i64,
    y_first: usize,
    y_last: i64,
    x_start: f64,
    x_end: f64,
    y_start: f64,
    y_end: f64,
    sum_weight: f64,
    top_share: f64,
    chroma_weight: &mut [f64; 256],
) -> Rgb {
    chroma_weight.fill(0.0);
    let mut y = y_first as i64;
    while y <= y_last {
        let yf = y as f64;
        let y_weight = jsmath::min(yf + 1.0, y_end) - jsmath::max(yf, y_start);
        if y_weight > 0.0 {
            let mut x = x_first as i64;
            while x <= x_last {
                let xf = x as f64;
                let x_weight = jsmath::min(xf + 1.0, x_end) - jsmath::max(xf, x_start);
                if x_weight > 0.0 {
                    let p = (y as usize * src_w + x as usize) * 4;
                    chroma_weight[chroma_proxy(data, p)] +=
                        x_weight * y_weight * (data[p + 3] as f64 / 255.0);
                }
                x += 1;
            }
        }
        y += 1;
    }

    // The most colourful bucket whose weight, with everything above it, first reaches the share asked for.
    let wanted = sum_weight * top_share;
    let mut kept = 0.0;
    let mut cutoff = 0usize;
    for bucket in (0..=255usize).rev() {
        kept += chroma_weight[bucket];
        if kept >= wanted {
            cutoff = bucket;
            break;
        }
    }

    let mut sum_r = 0.0;
    let mut sum_g = 0.0;
    let mut sum_b = 0.0;
    let mut weight = 0.0;
    let mut y = y_first as i64;
    while y <= y_last {
        let yf = y as f64;
        let y_weight = jsmath::min(yf + 1.0, y_end) - jsmath::max(yf, y_start);
        if y_weight > 0.0 {
            let mut x = x_first as i64;
            while x <= x_last {
                let xf = x as f64;
                let x_weight = jsmath::min(xf + 1.0, x_end) - jsmath::max(xf, x_start);
                if x_weight > 0.0 {
                    let p = (y as usize * src_w + x as usize) * 4;
                    if chroma_proxy(data, p) >= cutoff {
                        let w = x_weight * y_weight * (data[p + 3] as f64 / 255.0);
                        sum_r += table[data[p] as usize] * w;
                        sum_g += table[data[p + 1] as usize] * w;
                        sum_b += table[data[p + 2] as usize] * w;
                        weight += w;
                    }
                }
                x += 1;
            }
        }
        y += 1;
    }
    if weight <= 0.0 {
        return mean;
    }

    let top = rgb_to_oklab([
        linear_to_srgb(sum_r / weight),
        linear_to_srgb(sum_g / weight),
        linear_to_srgb(sum_b / weight),
    ]);
    let lightness = rgb_to_oklab(mean)[0];
    let lin = gamut_map_oklab_to_linear(lightness, top[1], top[2]);
    [
        linear_to_srgb(lin[0]),
        linear_to_srgb(lin[1]),
        linear_to_srgb(lin[2]),
    ]
}
