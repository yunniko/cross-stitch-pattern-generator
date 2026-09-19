//! Port of `lib/pipeline/pair-edge-evidence.ts`: per-pair colour-structure-tensor edge evidence (D44).

use crate::color::{oklab_from_bytes, srgb_to_linear_table};
use crate::jsmath;
use crate::Image;

pub const SLOTS: usize = 4;
/// (dx, dy) per canonical slot: east, south, southeast, southwest.
pub const CANONICAL_OFFSETS: [(i32, i32); SLOTS] = [(1, 0), (0, 1), (1, 1), (-1, 1)];
const DEFAULT_TAU: f64 = 0.01;
const DEFAULT_BLUR_RADIUS: i64 = 2;

fn response_curve(s: f64, tau: f64) -> f64 {
    1.0 - jsmath::exp(-s / (2.0 * tau * tau))
}

fn box_blur(channel: &[f32], width: usize, height: usize, radius: i64) -> Vec<f32> {
    let (w, h) = (width as i64, height as i64);
    let mut horizontal = vec![0f32; width * height];
    for y in 0..height {
        let row = &channel[y * width..(y + 1) * width];
        let mut sum = 0.0f64;
        let mut count = 0.0f64;
        for x in -radius..=radius {
            sum += row[x.clamp(0, w - 1) as usize] as f64;
            count += 1.0;
        }
        horizontal[y * width] = (sum / count) as f32;
        for x in 1..w {
            let add = (x + radius).min(w - 1) as usize;
            let drop = (x - radius - 1).max(0) as usize;
            sum += row[add] as f64 - row[drop] as f64;
            horizontal[y * width + x as usize] = (sum / count) as f32;
        }
    }
    let mut result = vec![0f32; width * height];
    for x in 0..width {
        let mut sum = 0.0f64;
        let mut count = 0.0f64;
        for y in -radius..=radius {
            sum += horizontal[y.clamp(0, h - 1) as usize * width + x] as f64;
            count += 1.0;
        }
        result[x] = (sum / count) as f32;
        for y in 1..h {
            let add = (y + radius).min(h - 1) as usize;
            let drop = (y - radius - 1).max(0) as usize;
            sum += horizontal[add * width + x] as f64 - horizontal[drop * width + x] as f64;
            result[y as usize * width + x] = (sum / count) as f32;
        }
    }
    result
}

/// `computePairEdgeEvidence` with the default tau and blur radius.
pub fn compute_pair_edge_evidence(
    image: &Image,
    grid_width: usize,
    grid_height: usize,
) -> Vec<f32> {
    let (src_w, src_h) = (image.width, image.height);
    let table = srgb_to_linear_table();
    let n = src_w * src_h;
    let mut raw_l = vec![0f32; n];
    let mut raw_a = vec![0f32; n];
    let mut raw_b = vec![0f32; n];
    for i in 0..n {
        let p = &image.data[i * 4..i * 4 + 3];
        let lab = oklab_from_bytes(table, p[0], p[1], p[2]);
        raw_l[i] = lab[0] as f32;
        raw_a[i] = lab[1] as f32;
        raw_b[i] = lab[2] as f32;
    }
    let l = box_blur(&raw_l, src_w, src_h, DEFAULT_BLUR_RADIUS);
    drop(raw_l);
    let a = box_blur(&raw_a, src_w, src_h, DEFAULT_BLUR_RADIUS);
    drop(raw_a);
    let b = box_blur(&raw_b, src_w, src_h, DEFAULT_BLUR_RADIUS);
    drop(raw_b);

    // Rolling cache of derivative rows (Lx, Ly, Ax, Ay, Bx, By per pixel), dropped once no later window needs them.
    let mut rows: Vec<Option<Vec<f64>>> = vec![None; src_h];
    let mut lowest_cached = 0usize;
    let derivative_row = |y: usize| -> Vec<f64> {
        let mut row = vec![0f64; src_w * 6];
        let ym1 = y.saturating_sub(1);
        let yp1 = (y + 1).min(src_h - 1);
        let dy_den = ((yp1 - ym1) as f64).max(1.0);
        for x in 0..src_w {
            let xm1 = x.saturating_sub(1);
            let xp1 = (x + 1).min(src_w - 1);
            let dx_den = ((xp1 - xm1) as f64).max(1.0);
            let o = x * 6;
            row[o] = (l[y * src_w + xp1] as f64 - l[y * src_w + xm1] as f64) / dx_den;
            row[o + 1] = (l[yp1 * src_w + x] as f64 - l[ym1 * src_w + x] as f64) / dy_den;
            row[o + 2] = (a[y * src_w + xp1] as f64 - a[y * src_w + xm1] as f64) / dx_den;
            row[o + 3] = (a[yp1 * src_w + x] as f64 - a[ym1 * src_w + x] as f64) / dy_den;
            row[o + 4] = (b[y * src_w + xp1] as f64 - b[y * src_w + xm1] as f64) / dx_den;
            row[o + 5] = (b[yp1 * src_w + x] as f64 - b[ym1 * src_w + x] as f64) / dy_den;
        }
        row
    };

    let cell_x = src_w as f64 / grid_width as f64;
    let cell_y = src_h as f64 / grid_height as f64;
    let half_x = jsmath::max(1.0, cell_x / 2.0);
    let half_y = jsmath::max(1.0, cell_y / 2.0);
    let mut result = vec![0f32; grid_width * grid_height * SLOTS];

    for y in 0..grid_height {
        let lowest_needed = jsmath::max(0.0, ((y as f64 + 0.5) * cell_y - half_y).floor()) as usize;
        while lowest_cached < lowest_needed.min(src_h) {
            rows[lowest_cached] = None;
            lowest_cached += 1;
        }
        for x in 0..grid_width {
            let i = y * grid_width + x;
            for (slot, &(dx, dy)) in CANONICAL_OFFSETS.iter().enumerate() {
                let nx = x as i64 + dx as i64;
                let ny = y as i64 + dy as i64;
                if nx < 0 || nx >= grid_width as i64 || ny < 0 || ny >= grid_height as i64 {
                    continue;
                }
                let len = ((dx * dx + dy * dy) as f64).sqrt();
                let ux = dx as f64 / len;
                let uy = dy as f64 / len;
                let mid_x = ((x as f64 + 0.5 + nx as f64 + 0.5) / 2.0) * cell_x;
                let mid_y = ((y as f64 + 0.5 + ny as f64 + 0.5) / 2.0) * cell_y;
                let x_from = jsmath::max(0.0, (mid_x - half_x).floor()) as i64;
                let x_to = jsmath::min((src_w - 1) as f64, (mid_x + half_x).ceil()) as i64;
                let y_from = jsmath::max(0.0, (mid_y - half_y).floor()) as i64;
                let y_to = jsmath::min((src_h - 1) as f64, (mid_y + half_y).ceil()) as i64;

                let mut sum = 0.0;
                let mut count = 0.0;
                for sy in y_from..=y_to {
                    let sy = sy as usize;
                    if rows[sy].is_none() {
                        rows[sy] = Some(derivative_row(sy));
                    }
                    let row = rows[sy].as_ref().unwrap();
                    for sx in x_from..=x_to {
                        let o = sx as usize * 6;
                        let pl = row[o] * ux + row[o + 1] * uy;
                        let pa = row[o + 2] * ux + row[o + 3] * uy;
                        let pb = row[o + 4] * ux + row[o + 5] * uy;
                        sum += pl * pl + pa * pa + pb * pb;
                        count += 1.0;
                    }
                }
                let s = if count > 0.0 { sum / count } else { 0.0 };
                result[i * SLOTS + slot] = response_curve(s, DEFAULT_TAU) as f32;
            }
        }
    }
    result
}

/// `getPairEdgeEvidence`: the evidence for (cell `i`, its neighbour at (dx, dy)), resolving reverse directions to the
/// neighbour's canonical slot.
#[inline]
pub fn get_pair_edge_evidence(pair: &[f32], i: usize, dx: i32, dy: i32, width: usize) -> f32 {
    for (slot, &(cx, cy)) in CANONICAL_OFFSETS.iter().enumerate() {
        if cx == dx && cy == dy {
            return pair[i * SLOTS + slot];
        }
        if cx == -dx && cy == -dy {
            let x = (i % width) as i64;
            let y = (i / width) as i64;
            let n = (y + dy as i64) as usize * width + (x + dx as i64) as usize;
            return pair[n * SLOTS + slot];
        }
    }
    unreachable!("direction ({dx}, {dy}) is not a neighbour")
}
