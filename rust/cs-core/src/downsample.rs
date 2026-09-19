//! Port of `lib/pipeline/downsample.ts`.

use crate::color::{linear_to_srgb, srgb_to_linear_table};
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

/// `downsampleToGrid`: area- and alpha-weighted mean in linear light, one RGB triple per cell.
pub fn downsample_to_grid(image: &Image, grid_width: usize, grid_height: usize) -> Vec<u8> {
    let table = srgb_to_linear_table();
    let (src_w, src_h) = (image.width, image.height);
    let data = &image.data;
    let mut out = vec![0u8; grid_width * grid_height * 3];

    // Each cell's sum runs in the same order on any thread count: rows of cells are independent.
    out.par_chunks_mut(grid_width * 3)
        .enumerate()
        .for_each(|(cell_y, out)| {
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
                                let weight = x_weight * y_weight * alpha;
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
                if sum_weight > 0.0 {
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
    out
}
