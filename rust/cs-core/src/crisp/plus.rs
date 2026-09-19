//! Crisp+ passes (G-038): ports of `lib/crisp/transition-snap.ts` (D140), `blend-label-pruning.ts` (D141) and
//! `palette-refill.ts` (D142), each with its default options.

use crate::color::{oklab_distance_sq, rgb_to_oklab, srgb_to_linear_table, Oklab, Rgb};
use crate::jsmath;
use crate::quantize::mean_oklab_as_rgb;
use crate::Image;
use rayon::prelude::*;
use std::collections::HashMap;

const MAX_COLORS: usize = 100;

#[inline]
fn sq(x: f64) -> f64 {
    jsmath::pow(x, 2.0)
}

fn linear_of(c: Rgb) -> [f64; 3] {
    let t = srgb_to_linear_table();
    [t[c[0] as usize], t[c[1] as usize], t[c[2] as usize]]
}

// ---- Transition-strip snapping ----

const SNAP_MAX_SPAN: i64 = 5;
const SNAP_MIN_SIDE_RUN: i64 = 3;
const SNAP_MAX_PERPENDICULAR: f64 = 0.25;
const SNAP_MIN_SIDE_DISTANCE: f64 = 0.1;
const SNAP_MIN_EDGE_SHARPNESS: f64 = 0.75;
const SNAP_LINE_RESIDUAL_RATIO: f64 = 0.5;
const SNAP_PASSES: usize = 2;
/// Cells per parallel task in strip snapping.
const CHUNK_CELLS: usize = 2048;
const DIRECTIONS: [(i64, i64); 4] = [(1, 0), (0, 1), (1, 1), (1, -1)];
const PROFILE_WIDTHS: [f64; 6] = [0.05, 0.15, 0.3, 0.6, 1.0, 1.5];
const MAX_PROFILE_BINS: f64 = 64.0;
const MAX_CENTRE_STEPS: f64 = 24.0;
const LINE_MARGIN: f64 = 0.05;
const MONOTONE_SLACK: f64 = 0.1;

pub struct SnapResult {
    pub labels: Vec<u8>,
    pub changes: usize,
}

#[derive(Clone, Copy)]
struct Verdict {
    a: u8,
    b: u8,
    centre: f64,
}

pub fn snap_transition_strips(
    labels: &[u8],
    gw: usize,
    gh: usize,
    palette: &[Rgb],
    source: &Image,
) -> SnapResult {
    let linear: Vec<[f64; 3]> = palette.iter().map(|&c| linear_of(c)).collect();
    let oklab: Vec<Oklab> = palette.iter().map(|&c| rgb_to_oklab(c)).collect();
    let min_side2 = sq(SNAP_MIN_SIDE_DISTANCE);
    let cell_w = source.width as f64 / gw as f64;
    let cell_h = source.height as f64 / gh as f64;
    let plen = palette.len() as i64;

    let on_line = |c: usize, a: usize, b: usize| -> (f64, f64) {
        let (aa, bb, cc) = (linear[a], linear[b], linear[c]);
        let ab = [bb[0] - aa[0], bb[1] - aa[1], bb[2] - aa[2]];
        let len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
        if len2 <= 0.0 {
            return (f64::NAN, f64::INFINITY);
        }
        let ac = [cc[0] - aa[0], cc[1] - aa[1], cc[2] - aa[2]];
        let t = (ab[0] * ac[0] + ab[1] * ac[1] + ab[2] * ac[2]) / len2;
        let p = [ac[0] - t * ab[0], ac[1] - t * ab[1], ac[2] - t * ab[2]];
        (t, ((p[0] * p[0] + p[1] * p[1] + p[2] * p[2]) / len2).sqrt())
    };

    let mut current = labels.to_vec();
    let mut changes = 0;
    for _ in 0..SNAP_PASSES {
        let read = current.clone();
        let mut next = read.clone();
        let label_at = |x: i64, y: i64| -> i64 {
            if x < 0 || y < 0 || x >= gw as i64 || y >= gh as i64 {
                -1
            } else {
                read[y as usize * gw + x as usize] as i64
            }
        };
        let is_run = |x: i64, y: i64, dx: i64, dy: i64, value: i64| -> bool {
            (0..SNAP_MIN_SIDE_RUN).all(|k| label_at(x + dx * k, y + dy * k) == value)
        };

        // Every decision reads only the previous pass's labels, so cells are decided in parallel. Each thread memoizes
        // chain verdicts itself; a verdict is a pure function of its chain, so duplicates agree.
        let changed: usize = next
            .par_chunks_mut(CHUNK_CELLS)
            .enumerate()
            .map_init(
                HashMap::<(usize, usize, usize), Verdict>::new,
                |verdicts, (chunk, next)| {
                    let mut changed = 0usize;
                    for (offset, slot) in next.iter_mut().enumerate() {
                        let p = chunk * CHUNK_CELLS + offset;
                        let c = read[p] as i64;
                        if c >= plen {
                            continue;
                        }
                        let px = (p % gw) as i64;
                        let py = (p / gw) as i64;
                        // (verdict, distance, direction)
                        let mut best: Option<(Verdict, f64, usize)> = None;

                        for (d, &(dx, dy)) in DIRECTIONS.iter().enumerate() {
                            let mut run = 1;
                            while run <= SNAP_MAX_SPAN
                                && label_at(px + dx * run, py + dy * run) == c
                            {
                                run += 1;
                            }
                            let mut k = 1;
                            while run <= SNAP_MAX_SPAN && label_at(px - dx * k, py - dy * k) == c {
                                run += 1;
                                k += 1;
                            }
                            if run > SNAP_MAX_SPAN {
                                continue;
                            }
                            let sides = |sign: i64| -> Vec<(i64, i64)> {
                                let mut found = Vec::new();
                                for k in 1..=SNAP_MAX_SPAN + 1 {
                                    let (x, y) = (px + sign * dx * k, py + sign * dy * k);
                                    let v = label_at(x, y);
                                    if v < 0 || v >= plen {
                                        break;
                                    }
                                    if v != c && is_run(x, y, sign * dx, sign * dy, v) {
                                        found.push((k, v));
                                    }
                                }
                                found
                            };
                            let back = sides(-1);
                            if back.is_empty() {
                                continue;
                            }
                            let forward = sides(1);
                            if forward.is_empty() {
                                continue;
                            }
                            for &(sak, sav) in &back {
                                for &(sbk, sbv) in &forward {
                                    if sav == sbv || sak - 1 + sbk - 1 + 1 > SNAP_MAX_SPAN {
                                        continue;
                                    }
                                    let distance = oklab_distance_sq(
                                        &oklab[sav as usize],
                                        &oklab[sbv as usize],
                                    );
                                    if distance < min_side2 || best.is_some_and(|b| distance <= b.1)
                                    {
                                        continue;
                                    }
                                    let mut ok = true;
                                    let mut last_t = f64::NEG_INFINITY;
                                    let mut k = -(sak - 1);
                                    while k <= sbk - 1 && ok {
                                        let v = label_at(px + dx * k, py + dy * k);
                                        let (t, perp) =
                                            on_line(v as usize, sav as usize, sbv as usize);
                                        if !(t > LINE_MARGIN && t < 1.0 - LINE_MARGIN)
                                            || perp > SNAP_MAX_PERPENDICULAR
                                            || t < last_t - MONOTONE_SLACK
                                        {
                                            ok = false;
                                        }
                                        last_t = jsmath::max(last_t, t);
                                        k += 1;
                                    }
                                    if !ok {
                                        continue;
                                    }
                                    let (ax, ay) = (px - dx * sak, py - dy * sak);
                                    let (bx, by) = (px + dx * sbk, py + dy * sbk);
                                    let key = (
                                        d,
                                        (ay * gw as i64 + ax) as usize,
                                        (by * gw as i64 + bx) as usize,
                                    );
                                    let verdict = *verdicts.entry(key).or_insert_with(|| {
                                        let centre = fit_chain_profile(
                                            source,
                                            cell_w,
                                            cell_h,
                                            dx,
                                            dy,
                                            ax,
                                            ay,
                                            sak + sbk,
                                            linear[sav as usize],
                                            linear[sbv as usize],
                                        );
                                        Verdict {
                                            a: sav as u8,
                                            b: sbv as u8,
                                            centre,
                                        }
                                    });
                                    if verdict.centre.is_nan() {
                                        continue;
                                    }
                                    best = Some((verdict, distance, d));
                                }
                            }
                        }

                        let Some((verdict, _, direction)) = best else {
                            continue;
                        };
                        let (dx, dy) = DIRECTIONS[direction];
                        let norm = jsmath::hypot(dx as f64, dy as f64);
                        let cell_centre = (((px as f64 + 0.5) * cell_w) * dx as f64
                            + ((py as f64 + 0.5) * cell_h) * dy as f64)
                            / norm;
                        let target = if cell_centre < verdict.centre {
                            verdict.a
                        } else {
                            verdict.b
                        };
                        if target as i64 != c {
                            *slot = target;
                            changed += 1;
                        }
                    }
                    changed
                },
            )
            .sum();

        current = next;
        changes += changed;
        if changed == 0 {
            break;
        }
    }
    SnapResult {
        labels: current,
        changes,
    }
}

#[allow(clippy::too_many_arguments)]
fn fit_chain_profile(
    source: &Image,
    cell_w: f64,
    cell_h: f64,
    dx: i64,
    dy: i64,
    ax: i64,
    ay: i64,
    length: i64,
    a: [f64; 3],
    b: [f64; 3],
) -> f64 {
    let table = srgb_to_linear_table();
    let ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    let len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
    let norm = jsmath::hypot(dx as f64, dy as f64);
    let (src_w, src_h) = (source.width as f64, source.height as f64);
    let (dxf, dyf) = (dx as f64, dy as f64);

    let first = -(SNAP_MIN_SIDE_RUN - 1);
    let last = length + SNAP_MIN_SIDE_RUN - 1;
    let cells: Vec<(f64, f64)> = (first..=last)
        .map(|k| ((ax + dx * k) as f64, (ay + dy * k) as f64))
        .collect();

    let (mut u_min, mut u_max) = (f64::INFINITY, f64::NEG_INFINITY);
    for &(cx, cy) in &cells {
        let x0 = jsmath::round(cx * cell_w);
        let x1 = jsmath::round((cx + 1.0) * cell_w);
        let y0 = jsmath::round(cy * cell_h);
        let y1 = jsmath::round((cy + 1.0) * cell_h);
        for (x, y) in [(x0, y0), (x1, y0), (x0, y1), (x1, y1)] {
            let u = (x * dxf + y * dyf) / norm;
            u_min = jsmath::min(u_min, u);
            u_max = jsmath::max(u_max, u);
        }
    }
    let bin_count =
        jsmath::max(4.0, jsmath::min(MAX_PROFILE_BINS, (u_max - u_min).ceil())) as usize;
    let bin_scale = bin_count as f64 / (u_max - u_min);
    let mut w = vec![0f64; bin_count];
    let mut sum_u = vec![0f64; bin_count];
    let mut sum_t = vec![0f64; bin_count];
    let mut total_sq = 0.0;
    let data = &source.data;
    for &(cx, cy) in &cells {
        let x0 = jsmath::max(0.0, jsmath::round(cx * cell_w)) as i64;
        let x1 = jsmath::min(src_w, jsmath::round((cx + 1.0) * cell_w)) as i64;
        let y0 = jsmath::max(0.0, jsmath::round(cy * cell_h)) as i64;
        let y1 = jsmath::min(src_h, jsmath::round((cy + 1.0) * cell_h)) as i64;
        for y in y0..y1 {
            for x in x0..x1 {
                let o = (y as usize * source.width + x as usize) * 4;
                if data[o + 3] == 0 {
                    continue;
                }
                let t = ((table[data[o] as usize] - a[0]) * ab[0]
                    + (table[data[o + 1] as usize] - a[1]) * ab[1]
                    + (table[data[o + 2] as usize] - a[2]) * ab[2])
                    / len2;
                let u = ((x as f64 + 0.5) * dxf + (y as f64 + 0.5) * dyf) / norm;
                let bin = jsmath::min(
                    (bin_count - 1) as f64,
                    jsmath::max(0.0, ((u - u_min) * bin_scale).floor()),
                ) as usize;
                w[bin] += 1.0;
                sum_u[bin] += u;
                sum_t[bin] += t;
                total_sq += t * t;
            }
        }
    }

    let (mut total, mut between_sq, mut mean_t) = (0.0, 0.0, 0.0);
    let (mut bin_u, mut bin_t, mut bin_w) = (Vec::new(), Vec::new(), Vec::new());
    for i in 0..bin_count {
        if w[i] <= 0.0 {
            continue;
        }
        let u = sum_u[i] / w[i];
        let t = sum_t[i] / w[i];
        bin_u.push(u);
        bin_t.push(t);
        bin_w.push(w[i]);
        total += w[i];
        mean_t += w[i] * t;
        between_sq += w[i] * t * t;
    }
    if bin_u.len() < 4 || total <= 0.0 {
        return f64::NAN;
    }
    mean_t /= total;
    let within = jsmath::max(0.0, total_sq - between_sq);
    let between = jsmath::max(0.0, between_sq - total * mean_t * mean_t);

    // Each feature evaluated once per bin (the TypeScript evaluates it twice; a pure function gives the same doubles).
    let mut values = vec![0f64; bin_u.len()];
    let mut regression = |feature: &dyn Fn(f64) -> f64| -> (f64, f64) {
        let mut x_mean = 0.0;
        for i in 0..bin_u.len() {
            values[i] = feature(bin_u[i]);
            x_mean += bin_w[i] * values[i];
        }
        x_mean /= total;
        let (mut sxx, mut sxy) = (0.0, 0.0);
        for i in 0..bin_u.len() {
            let dxv = values[i] - x_mean;
            sxx += bin_w[i] * dxv * dxv;
            sxy += bin_w[i] * dxv * (bin_t[i] - mean_t);
        }
        let slope = if sxx > 0.0 { sxy / sxx } else { 0.0 };
        let explained = if sxx > 0.0 { (sxy * sxy) / sxx } else { 0.0 };
        (
            (within + jsmath::max(0.0, between - explained)) / total,
            slope,
        )
    };

    let affine = regression(&|u| u).0;
    let cell_size = dx.abs() as f64 * cell_w + dy.abs() as f64 * cell_h;
    let strip_start = u_min + (SNAP_MIN_SIDE_RUN as f64 * cell_size) / norm;
    let strip_end = u_max - (SNAP_MIN_SIDE_RUN as f64 * cell_size) / norm;
    let steps = jsmath::max(
        1.0,
        jsmath::min(MAX_CENTRE_STEPS, (strip_end - strip_start).ceil()),
    );
    let mut logistic_residual = f64::INFINITY;
    let mut centre = f64::NAN;
    let mut slope = 0.0;
    let cell_px = jsmath::min(cell_w, cell_h);
    for &share in &PROFILE_WIDTHS {
        let width = jsmath::max(0.25, share * cell_px);
        let mut s = 0.0;
        while s <= steps {
            let u0 = strip_start + ((strip_end - strip_start) * s) / steps;
            let (residual, fit_slope) =
                regression(&|u| 1.0 / (1.0 + jsmath::exp(-(u - u0) / width)));
            if residual < logistic_residual {
                logistic_residual = residual;
                centre = u0;
                slope = fit_slope;
            }
            s += 1.0;
        }
    }

    let n = bin_u.len();
    let mut pw = vec![0f64; n + 1];
    let mut pt = vec![0f64; n + 1];
    let mut ptt = vec![0f64; n + 1];
    for i in 0..n {
        pw[i + 1] = pw[i] + bin_w[i];
        pt[i + 1] = pt[i] + bin_w[i] * bin_t[i];
        ptt[i + 1] = ptt[i] + bin_w[i] * bin_t[i] * bin_t[i];
    }
    let segment = |from: usize, to: usize| -> f64 {
        let ww = pw[to] - pw[from];
        if ww <= 0.0 {
            return 0.0;
        }
        let tt = pt[to] - pt[from];
        ptt[to] - ptt[from] - (tt * tt) / ww
    };
    let mut three = f64::INFINITY;
    for i in 1..n.saturating_sub(1) {
        for j in i + 1..n {
            let r = segment(0, i) + segment(i, j) + segment(j, n);
            if r < three {
                three = r;
            }
        }
    }
    three = (within + three) / total;

    let sharpness = if affine + logistic_residual > 0.0 {
        affine / (affine + logistic_residual)
    } else {
        1.0
    };
    if slope < 0.5 || sharpness < SNAP_MIN_EDGE_SHARPNESS {
        return f64::NAN;
    }
    if three < SNAP_LINE_RESIDUAL_RATIO * logistic_residual {
        return f64::NAN;
    }
    centre
}

// ---- Blend-label pruning ----

const PRUNE_MAX_CANDIDATE_INTERIOR: f64 = 0.2;
const PRUNE_MIN_REGION_INTERIOR: f64 = 0.3;
const PRUNE_RADIUS: i64 = 2;
const PRUNE_MIN_SUPPORT: f64 = 0.3;
const PRUNE_MIN_CONSTITUENT_DISTANCE: f64 = 0.1;
const PRUNE_MAX_MIX_RESIDUAL: f64 = 0.2;
const PRUNE_MIN_GRADIENT_STD: f64 = 0.1;
const PRUNE_MAX_FLAT_SHARE: f64 = 0.25;
const PRUNE_MAX_ROUNDS: usize = 3;
const MAX_GRADIENT_SAMPLE_CELLS: usize = 400;

/// `mixWeights` over two or three points: weights summing to 1, and the fit's residual.
fn mix_weights(x: [f64; 3], points: &[[f64; 3]]) -> (Vec<f64>, f64) {
    let p0 = points[0];
    let d: Vec<[f64; 3]> = points[1..]
        .iter()
        .map(|p| [p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]])
        .collect();
    let v = [x[0] - p0[0], x[1] - p0[1], x[2] - p0[2]];
    let coef: Vec<f64> = if d.len() == 1 {
        let len2 = sq(d[0][0]) + sq(d[0][1]) + sq(d[0][2]);
        vec![if len2 > 0.0 {
            (d[0][0] * v[0] + d[0][1] * v[1] + d[0][2] * v[2]) / len2
        } else {
            0.0
        }]
    } else {
        let a = sq(d[0][0]) + sq(d[0][1]) + sq(d[0][2]);
        let b = d[0][0] * d[1][0] + d[0][1] * d[1][1] + d[0][2] * d[1][2];
        let c = sq(d[1][0]) + sq(d[1][1]) + sq(d[1][2]);
        let e = d[0][0] * v[0] + d[0][1] * v[1] + d[0][2] * v[2];
        let f = d[1][0] * v[0] + d[1][1] * v[1] + d[1][2] * v[2];
        let det = a * c - b * b;
        if det != 0.0 {
            vec![(c * e - b * f) / det, (a * f - b * e) / det]
        } else {
            vec![0.0, 0.0]
        }
    };
    let mut sum = 0.0;
    for &k in &coef {
        sum += k;
    }
    let mut weights = vec![1.0 - sum];
    weights.extend_from_slice(&coef);
    let mut r2 = 0.0;
    for k in 0..3 {
        let mut fit = 0.0;
        for j in 0..points.len() {
            fit += weights[j] * points[j][k];
        }
        r2 += sq(x[k] - fit);
    }
    (weights, r2.sqrt())
}

fn cell_bounds(
    i: usize,
    gw: usize,
    cell_w: f64,
    cell_h: f64,
    source: &Image,
) -> (usize, usize, usize, usize) {
    let (cx, cy) = ((i % gw) as f64, (i / gw) as f64);
    let x0 = jsmath::max(0.0, jsmath::round(cx * cell_w)) as usize;
    let x1 = jsmath::min(source.width as f64, jsmath::round((cx + 1.0) * cell_w)) as usize;
    let y0 = jsmath::max(0.0, jsmath::round(cy * cell_h)) as usize;
    let y1 = jsmath::min(source.height as f64, jsmath::round((cy + 1.0) * cell_h)) as usize;
    (x0, x1, y0, y1)
}

pub struct PruneResult {
    pub labels: Vec<u8>,
    pub pruned: usize,
}

pub fn prune_blend_labels(
    labels: &[u8],
    gw: usize,
    gh: usize,
    palette: &[Rgb],
    source: &Image,
) -> PruneResult {
    let table = srgb_to_linear_table();
    let linear: Vec<[f64; 3]> = palette.iter().map(|&c| linear_of(c)).collect();
    let oklab: Vec<Oklab> = palette.iter().map(|&c| rgb_to_oklab(c)).collect();
    let min_distance2 = sq(PRUNE_MIN_CONSTITUENT_DISTANCE);
    let cell_w = source.width as f64 / gw as f64;
    let cell_h = source.height as f64 / gh as f64;
    let mut current = labels.to_vec();
    let mut pruned = 0;
    let np = palette.len();
    let data = &source.data;

    for _ in 0..PRUNE_MAX_ROUNDS {
        let mut count = vec![0usize; np];
        let mut interior = vec![0usize; np];
        for y in 0..gh {
            for x in 0..gw {
                let v = current[y * gw + x] as usize;
                if v >= np {
                    continue;
                }
                count[v] += 1;
                let (mut same, mut seen) = (0, 0);
                for dy in -1i64..=1 {
                    for dx in -1i64..=1 {
                        let (xx, yy) = (x as i64 + dx, y as i64 + dy);
                        if (dx != 0 || dy != 0)
                            && xx >= 0
                            && yy >= 0
                            && xx < gw as i64
                            && yy < gh as i64
                        {
                            seen += 1;
                            if current[yy as usize * gw + xx as usize] as usize == v {
                                same += 1;
                            }
                        }
                    }
                }
                if seen > 0 && same >= seen - 1 {
                    interior[v] += 1;
                }
            }
        }
        let share: Vec<f64> = (0..np)
            .map(|i| {
                if count[i] > 0 {
                    interior[i] as f64 / count[i] as f64
                } else {
                    0.0
                }
            })
            .collect();
        let is_region: Vec<bool> = (0..np)
            .map(|i| count[i] >= 9 && share[i] >= PRUNE_MIN_REGION_INTERIOR)
            .collect();

        let mut pruned_this_round = 0;
        for label in 0..np {
            if count[label] == 0 || is_region[label] || share[label] > PRUNE_MAX_CANDIDATE_INTERIOR
            {
                continue;
            }
            let mut support: HashMap<usize, usize> = HashMap::new();
            let mut cells_of_label = Vec::new();
            let mut near: Vec<usize> = Vec::new();
            for i in 0..current.len() {
                if current[i] as usize != label {
                    continue;
                }
                cells_of_label.push(i);
                let (x, y) = ((i % gw) as i64, (i / gw) as i64);
                near.clear();
                for dy in -PRUNE_RADIUS..=PRUNE_RADIUS {
                    for dx in -PRUNE_RADIUS..=PRUNE_RADIUS {
                        let (xx, yy) = (x + dx, y + dy);
                        if xx < 0 || yy < 0 || xx >= gw as i64 || yy >= gh as i64 {
                            continue;
                        }
                        let v = current[yy as usize * gw + xx as usize] as usize;
                        if v < np && v != label && is_region[v] && !near.contains(&v) {
                            near.push(v);
                        }
                    }
                }
                for &v in &near {
                    *support.entry(v).or_insert(0) += 1;
                }
            }
            let mut constituents: Vec<(usize, usize)> = support
                .into_iter()
                .filter(|&(_, n)| n as f64 / cells_of_label.len() as f64 >= PRUNE_MIN_SUPPORT)
                .collect();
            constituents.sort_by(|a, b| b.1.cmp(&a.1).then(a.0.cmp(&b.0)));
            let constituents: Vec<usize> =
                constituents.into_iter().take(3).map(|(v, _)| v).collect();
            if constituents.len() < 2 {
                continue;
            }

            let mut sets: Vec<Vec<usize>> = Vec::new();
            for a in 0..constituents.len() {
                for b in a + 1..constituents.len() {
                    sets.push(vec![constituents[a], constituents[b]]);
                }
            }
            if constituents.len() == 3 {
                sets.push(constituents.clone());
            }
            let mut best: Option<(Vec<usize>, f64)> = None;
            for set in &sets {
                let mut scale = 0.0;
                let mut distinct = true;
                for a in 0..set.len() {
                    for b in a + 1..set.len() {
                        if oklab_distance_sq(&oklab[set[a]], &oklab[set[b]]) < min_distance2 {
                            distinct = false;
                        }
                        let (pa, pb) = (linear[set[a]], linear[set[b]]);
                        scale = jsmath::max(
                            scale,
                            jsmath::hypot_n(&[pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]]),
                        );
                    }
                }
                if !distinct || scale <= 0.0 {
                    continue;
                }
                let points: Vec<[f64; 3]> = set.iter().map(|&v| linear[v]).collect();
                let (weights, residual) = mix_weights(linear[label], &points);
                if weights.iter().any(|&w| w < -0.05) {
                    continue;
                }
                let normalized = residual / scale;
                if normalized <= PRUNE_MAX_MIX_RESIDUAL
                    && best.as_ref().is_none_or(|b| normalized < b.1)
                {
                    best = Some((set.clone(), normalized));
                }
            }
            let Some((best_set, _)) = best else { continue };
            let points: Vec<[f64; 3]> = best_set.iter().map(|&v| linear[v]).collect();
            let (weights, _) = mix_weights(linear[label], &points);
            let mut order: Vec<(usize, f64)> = best_set
                .iter()
                .zip(&weights)
                .map(|(&v, &w)| (v, w))
                .collect();
            // Stable, largest weight first, as `sort((p, q) => q.w - p.w)`.
            order.sort_by(|p, q| q.1.partial_cmp(&p.1).unwrap());
            let (pa, pb) = (linear[order[0].0], linear[order[1].0]);
            let ab = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
            let len2 = sq(ab[0]) + sq(ab[1]) + sq(ab[2]);
            if len2 <= 0.0 {
                continue;
            }
            let (mut flat, mut sampled) = (0usize, 0usize);
            let stride = (cells_of_label.len() / MAX_GRADIENT_SAMPLE_CELLS).max(1);
            let mut k = 0;
            while k < cells_of_label.len() {
                let (x0, x1, y0, y1) = cell_bounds(cells_of_label[k], gw, cell_w, cell_h, source);
                let (mut n, mut sum, mut sum_sq) = (0usize, 0.0, 0.0);
                for y in y0..y1 {
                    for x in x0..x1 {
                        let o = (y * source.width + x) * 4;
                        if data[o + 3] == 0 {
                            continue;
                        }
                        let t = ((table[data[o] as usize] - pa[0]) * ab[0]
                            + (table[data[o + 1] as usize] - pa[1]) * ab[1]
                            + (table[data[o + 2] as usize] - pa[2]) * ab[2])
                            / len2;
                        n += 1;
                        sum += t;
                        sum_sq += t * t;
                    }
                }
                k += stride;
                if n < 2 {
                    continue;
                }
                let nf = n as f64;
                if jsmath::max(0.0, sum_sq / nf - sq(sum / nf)).sqrt() < PRUNE_MIN_GRADIENT_STD {
                    flat += 1;
                }
                sampled += 1;
            }
            if sampled == 0 || flat as f64 / sampled as f64 > PRUNE_MAX_FLAT_SHARE {
                continue;
            }
            for &i in &cells_of_label {
                let (x0, x1, y0, y1) = cell_bounds(i, gw, cell_w, cell_h, source);
                let mut mean = [0.0; 3];
                let mut n = 0usize;
                for y in y0..y1 {
                    for x in x0..x1 {
                        let o = (y * source.width + x) * 4;
                        if data[o + 3] == 0 {
                            continue;
                        }
                        mean[0] += table[data[o] as usize];
                        mean[1] += table[data[o + 1] as usize];
                        mean[2] += table[data[o + 2] as usize];
                        n += 1;
                    }
                }
                let colour = if n > 0 {
                    let nf = n as f64;
                    [mean[0] / nf, mean[1] / nf, mean[2] / nf]
                } else {
                    linear[label]
                };
                let (w, _) = mix_weights(colour, &points);
                let mut target = 0;
                for k in 1..w.len() {
                    if w[k] > w[target] {
                        target = k;
                    }
                }
                current[i] = best_set[target] as u8;
            }
            pruned += 1;
            pruned_this_round += 1;
        }
        if pruned_this_round == 0 {
            break;
        }
    }
    PruneResult {
        labels: current,
        pruned,
    }
}

// ---- Palette refill ----

const REFILL_MIN_CELLS: usize = 12;
const REFILL_MIN_VARIANCE: f64 = 0.0004;
const REFILL_MAX_LLOYD: usize = 8;
const REFILL_MAX_MIX_RESIDUAL: f64 = 0.25;
const REFILL_MIN_MIX_SIDE_DISTANCE: f64 = 0.1;

fn looks_like_blend(colour: [f64; 3], palette: &[Rgb], skip: usize) -> bool {
    let labs: Vec<Oklab> = palette.iter().map(|&c| rgb_to_oklab(c)).collect();
    for a in 0..labs.len() {
        if a == skip {
            continue;
        }
        for b in a + 1..labs.len() {
            if b == skip {
                continue;
            }
            let (pa, pb) = (labs[a], labs[b]);
            let ab = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
            let length2 = sq(ab[0]) + sq(ab[1]) + sq(ab[2]);
            if length2 < sq(REFILL_MIN_MIX_SIDE_DISTANCE) {
                continue;
            }
            let ac = [colour[0] - pa[0], colour[1] - pa[1], colour[2] - pa[2]];
            let t = (ab[0] * ac[0] + ab[1] * ac[1] + ab[2] * ac[2]) / length2;
            if t <= 0.1 || t >= 0.9 {
                continue;
            }
            let perp = ((sq(ac[0] - t * ab[0]) + sq(ac[1] - t * ab[1]) + sq(ac[2] - t * ab[2]))
                / length2)
                .sqrt();
            if perp <= REFILL_MAX_MIX_RESIDUAL {
                return true;
            }
        }
    }
    false
}

struct Group {
    label: usize,
    usable: Vec<usize>,
    total_error: f64,
    variance: f64,
}

fn group_of(label: usize, labels: &[u8], excluded: &[u8], lab: &[f64]) -> Group {
    let mut usable = Vec::new();
    for i in 0..labels.len() {
        if labels[i] as usize == label && excluded[i] == 0 {
            usable.push(i);
        }
    }
    let (mut ml, mut ma, mut mb) = (0.0, 0.0, 0.0);
    for &i in &usable {
        ml += lab[i * 3];
        ma += lab[i * 3 + 1];
        mb += lab[i * 3 + 2];
    }
    let n = usable.len();
    if n > 0 {
        let nf = n as f64;
        ml /= nf;
        ma /= nf;
        mb /= nf;
    }
    let mut total = 0.0;
    for &i in &usable {
        total += sq(lab[i * 3] - ml) + sq(lab[i * 3 + 1] - ma) + sq(lab[i * 3 + 2] - mb);
    }
    Group {
        label,
        usable,
        total_error: total,
        variance: if n > 0 { total / n as f64 } else { 0.0 },
    }
}

fn centre(group: &[usize], lab: &[f64]) -> [f64; 3] {
    let (mut l, mut a, mut b) = (0.0, 0.0, 0.0);
    for &i in group {
        l += lab[i * 3];
        a += lab[i * 3 + 1];
        b += lab[i * 3 + 2];
    }
    let n = group.len() as f64;
    [l / n, a / n, b / n]
}

#[inline]
fn dist3(lab: &[f64], i: usize, c: &[f64; 3]) -> f64 {
    sq(lab[i * 3] - c[0]) + sq(lab[i * 3 + 1] - c[1]) + sq(lab[i * 3 + 2] - c[2])
}

fn split_group(cells: &[usize], lab: &[f64]) -> Option<(Vec<usize>, Vec<usize>)> {
    if cells.len() < 2 {
        return None;
    }
    let mean = centre(cells, lab);
    let mut seed0 = cells[0];
    let mut best = -1.0;
    for &i in cells {
        let d = dist3(lab, i, &mean);
        if d > best {
            best = d;
            seed0 = i;
        }
    }
    let s0 = [lab[seed0 * 3], lab[seed0 * 3 + 1], lab[seed0 * 3 + 2]];
    let mut seed1 = cells[0];
    best = -1.0;
    for &i in cells {
        let d = dist3(lab, i, &s0);
        if d > best {
            best = d;
            seed1 = i;
        }
    }
    let mut c0 = s0;
    let mut c1 = [lab[seed1 * 3], lab[seed1 * 3 + 1], lab[seed1 * 3 + 2]];
    let mut first = Vec::new();
    let mut second = Vec::new();
    for _ in 0..REFILL_MAX_LLOYD {
        first.clear();
        second.clear();
        for &i in cells {
            if dist3(lab, i, &c0) <= dist3(lab, i, &c1) {
                first.push(i);
            } else {
                second.push(i);
            }
        }
        if first.is_empty() || second.is_empty() {
            return None;
        }
        let n0 = centre(&first, lab);
        let n1 = centre(&second, lab);
        let settled = n0 == c0 && n1 == c1;
        c0 = n0;
        c1 = n1;
        if settled {
            break;
        }
    }
    Some((first, second))
}

pub fn refill_freed_slots(
    labels: &[u8],
    palette: &[Rgb],
    lab: &[f64],
    excluded: &[u8],
    target: usize,
) -> (Vec<u8>, Vec<Rgb>) {
    let mut out = labels.to_vec();
    let mut next = palette.to_vec();
    // The TypeScript `Set` of used labels, in insertion order.
    let mut used: Vec<usize> = Vec::new();
    let mut is_used = [false; MAX_COLORS + 1];
    for &l in labels {
        let l = l as usize;
        if l < next.len() && !is_used[l] {
            is_used[l] = true;
            used.push(l);
        }
    }
    let mut added = 0;
    let mut refused = [false; MAX_COLORS + 1];
    while used.len() + added < target.min(MAX_COLORS) && next.len() < MAX_COLORS {
        let mut candidates: Vec<Group> = Vec::new();
        for &label in &used {
            if refused[label] {
                continue;
            }
            let g = group_of(label, &out, excluded, lab);
            if g.usable.len() < REFILL_MIN_CELLS || g.variance < REFILL_MIN_VARIANCE {
                continue;
            }
            candidates.push(g);
        }
        // Stable, as Array.prototype.sort is.
        candidates.sort_by(|a, b| b.total_error.partial_cmp(&a.total_error).unwrap());

        let mut chosen: Option<(usize, Vec<usize>, [f64; 3], [f64; 3])> = None;
        for g in &candidates {
            let Some((first, second)) = split_group(&g.usable, lab) else {
                refused[g.label] = true;
                continue;
            };
            let (k0, k1) = (centre(&first, lab), centre(&second, lab));
            if looks_like_blend(k0, &next, g.label) || looks_like_blend(k1, &next, g.label) {
                refused[g.label] = true;
                continue;
            }
            chosen = Some((g.label, g.usable.clone(), k0, k1));
            break;
        }
        let Some((label, usable, c0, c1)) = chosen else {
            break;
        };
        let new_label = next.len();
        let mut second_cells = Vec::new();
        for &i in &usable {
            if dist3(lab, i, &c1) < dist3(lab, i, &c0) {
                out[i] = new_label as u8;
                second_cells.push(i);
            }
        }
        if second_cells.is_empty() || second_cells.len() == usable.len() {
            for &i in &second_cells {
                out[i] = label as u8;
            }
            break;
        }
        let kept: Vec<usize> = usable
            .iter()
            .copied()
            .filter(|&i| out[i] as usize == label)
            .collect();
        next[label] = mean_oklab_as_rgb(lab, &kept);
        next.push(mean_oklab_as_rgb(lab, &second_cells));
        used.push(new_label);
        is_used[new_label] = true;
        added += 1;
    }
    (out, next)
}
