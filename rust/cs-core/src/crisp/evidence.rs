//! Ports of `lib/crisp/crisp-edge-evidence.ts` (per-cell boundary evidence, D57–D64, D139, D175) and
//! `lib/crisp/crisp-evidence-layer.ts` (the frozen layer, D65). Only what later stages read is kept: the modes, their
//! in-cell coverage and the confidence.

use crate::color::{oklab_from_bytes, srgb_to_linear_table, Oklab};
use crate::jsmath;
use crate::Image;
use rayon::prelude::*;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EdgeModel {
    Step,
    BlurredStep,
}

const NEIGHBORHOOD_MARGIN: f64 = 0.75;
const MIN_MODE_SEPARATION: f64 = 0.02;
const MAX_LLOYD_ITERATIONS: usize = 6;
const CONFIDENCE_THRESHOLD: f64 = 0.7;
const SEPARATION_BOUND_MARGIN: f64 = 1e-9;

/// A confident cell's two source-side modes and their coverage within the cell's own footprint.
#[derive(Clone, Debug)]
pub struct Evidence {
    pub modes: [Oklab; 2],
    pub coverage: [f64; 2],
}

/// One evaluation: `modes`/`coverage` hold one entry when only one mode was found.
struct Evaluated {
    modes: [Oklab; 2],
    coverage: [f64; 2],
    mode_count: usize,
    confidence: f64,
}

fn single_mode(mode: Oklab) -> Evaluated {
    Evaluated {
        modes: [mode, [0.0; 3]],
        coverage: [1.0, 0.0],
        mode_count: 1,
        confidence: 0.0,
    }
}

/// `SourceOklabRows`: each source row's OKLab, computed once and dropped once no later neighbourhood needs it.
struct SourceRows<'a> {
    image: &'a Image,
    rows: Vec<Option<Vec<f64>>>,
    lowest: usize,
}

impl<'a> SourceRows<'a> {
    fn new(image: &'a Image) -> Self {
        SourceRows {
            image,
            rows: vec![None; image.height],
            lowest: 0,
        }
    }

    fn release(&mut self, first_needed: usize) {
        while self.lowest < first_needed.min(self.rows.len()) {
            self.rows[self.lowest] = None;
            self.lowest += 1;
        }
    }

    fn row(&mut self, y: usize) -> &[f64] {
        if self.rows[y].is_none() {
            let table = srgb_to_linear_table();
            let w = self.image.width;
            let data = &self.image.data[y * w * 4..(y + 1) * w * 4];
            let mut row = vec![0f64; w * 3];
            for x in 0..w {
                let lab = oklab_from_bytes(table, data[x * 4], data[x * 4 + 1], data[x * 4 + 2]);
                row[x * 3..x * 3 + 3].copy_from_slice(&lab);
            }
            self.rows[y] = Some(row);
        }
        self.rows[y].as_deref().unwrap()
    }
}

#[derive(Default)]
struct Samples {
    count: usize,
    l: Vec<f64>,
    a: Vec<f64>,
    b: Vec<f64>,
    weight: Vec<f64>,
    nx: Vec<f64>,
    ny: Vec<f64>,
    cell_weight: Vec<f64>,
    assignment: Vec<u8>,
    projection: Vec<f64>,
}

impl Samples {
    fn clear(&mut self) {
        self.count = 0;
        self.l.clear();
        self.a.clear();
        self.b.clear();
        self.weight.clear();
        self.nx.clear();
        self.ny.clear();
        self.cell_weight.clear();
    }
}

#[inline]
fn overlap(a0: f64, a1: f64, b0: f64, b1: f64) -> f64 {
    jsmath::min(a1, b1) - jsmath::max(a0, b0)
}

fn collect(rows: &mut SourceRows, gw: usize, gh: usize, cx: usize, cy: usize, s: &mut Samples) {
    let (src_w, src_h) = (rows.image.width, rows.image.height);
    let (sw, sh) = (src_w as f64, src_h as f64);
    let cell_x_start = (cx * src_w) as f64 / gw as f64;
    let cell_x_end = ((cx + 1) * src_w) as f64 / gw as f64;
    let cell_y_start = (cy * src_h) as f64 / gh as f64;
    let cell_y_end = ((cy + 1) * src_h) as f64 / gh as f64;
    let cell_w = cell_x_end - cell_x_start;
    let cell_h = cell_y_end - cell_y_start;

    let nb_x_start = jsmath::max(0.0, cell_x_start - cell_w * NEIGHBORHOOD_MARGIN);
    let nb_x_end = jsmath::min(sw, cell_x_end + cell_w * NEIGHBORHOOD_MARGIN);
    let nb_y_start = jsmath::max(0.0, cell_y_start - cell_h * NEIGHBORHOOD_MARGIN);
    let nb_y_end = jsmath::min(sh, cell_y_end + cell_h * NEIGHBORHOOD_MARGIN);

    let x_first = jsmath::max(0.0, nb_x_start.floor()) as i64;
    let x_last = jsmath::min(sw - 1.0, nb_x_end.ceil() - 1.0) as i64;
    let y_first = jsmath::max(0.0, nb_y_start.floor()) as i64;
    let y_last = jsmath::min(sh - 1.0, nb_y_end.ceil() - 1.0) as i64;

    let nb_w = {
        let v = nb_x_end - nb_x_start;
        if v == 0.0 || v.is_nan() {
            1.0
        } else {
            v
        }
    };
    let nb_h = {
        let v = nb_y_end - nb_y_start;
        if v == 0.0 || v.is_nan() {
            1.0
        } else {
            v
        }
    };

    rows.release(y_first as usize);
    s.clear();
    let data = &rows.image.data;
    for y in y_first..=y_last {
        let yf = y as f64;
        let y_weight = overlap(yf, yf + 1.0, nb_y_start, nb_y_end);
        if y_weight <= 0.0 {
            continue;
        }
        let y_cell_weight = overlap(yf, yf + 1.0, cell_y_start, cell_y_end);
        let mut loaded = false;
        for x in x_first..=x_last {
            let xf = x as f64;
            let x_weight = overlap(xf, xf + 1.0, nb_x_start, nb_x_end);
            if x_weight <= 0.0 {
                continue;
            }
            let p = (y as usize * src_w + x as usize) * 4;
            let alpha = data[p + 3] as f64 / 255.0;
            let weight = x_weight * y_weight * alpha;
            if weight <= 0.0 {
                continue;
            }
            let x_cell_weight = overlap(xf, xf + 1.0, cell_x_start, cell_x_end);
            if !loaded {
                rows.row(y as usize);
                loaded = true;
            }
            let row = rows.rows[y as usize].as_deref().unwrap();
            let o = x as usize * 3;
            s.l.push(row[o]);
            s.a.push(row[o + 1]);
            s.b.push(row[o + 2]);
            s.weight.push(weight);
            s.nx.push((xf + 0.5 - nb_x_start) / nb_w);
            s.ny.push((yf + 0.5 - nb_y_start) / nb_h);
            s.cell_weight
                .push(jsmath::max(0.0, x_cell_weight) * jsmath::max(0.0, y_cell_weight) * alpha);
        }
    }
    s.count = s.l.len();
    s.assignment.clear();
    s.assignment.resize(s.count, 0);
    s.projection.clear();
    s.projection.resize(s.count, 0.0);
}

fn fit_two_modes(s: &mut Samples) -> (Oklab, Oklab) {
    let n = s.count;
    let (l, a, b, w) = (&s.l, &s.a, &s.b, &s.weight);
    let (mut ml, mut ma, mut mb, mut tw) = (0.0, 0.0, 0.0, 0.0);
    for i in 0..n {
        ml += l[i] * w[i];
        ma += a[i] * w[i];
        mb += b[i] * w[i];
        tw += w[i];
    }
    if tw > 0.0 {
        ml /= tw;
        ma /= tw;
        mb /= tw;
    } else {
        ml = l[0];
        ma = a[0];
        mb = b[0];
    }
    let mut seed0 = 0;
    let mut best = -1.0;
    for i in 0..n {
        let (dl, da, db) = (l[i] - ml, a[i] - ma, b[i] - mb);
        let d = dl * dl + da * da + db * db;
        if d > best {
            best = d;
            seed0 = i;
        }
    }
    let mut seed1 = 0;
    best = -1.0;
    for i in 0..n {
        let (dl, da, db) = (l[i] - l[seed0], a[i] - a[seed0], b[i] - b[seed0]);
        let d = dl * dl + da * da + db * db;
        if d > best {
            best = d;
            seed1 = i;
        }
    }
    let mut c0 = [l[seed0], a[seed0], b[seed0]];
    let mut c1 = [l[seed1], a[seed1], b[seed1]];
    let asg = &mut s.assignment;
    asg.iter_mut().for_each(|v| *v = 0);
    for _ in 0..MAX_LLOYD_ITERATIONS {
        let mut changed = false;
        for i in 0..n {
            let (dl, da, db) = (l[i] - c0[0], a[i] - c0[1], b[i] - c0[2]);
            let d0 = dl * dl + da * da + db * db;
            let (dl, da, db) = (l[i] - c1[0], a[i] - c1[1], b[i] - c1[2]);
            let d1 = dl * dl + da * da + db * db;
            let label = if d1 < d0 { 1 } else { 0 };
            if asg[i] != label {
                asg[i] = label;
                changed = true;
            }
        }
        let (mut s0, mut s1) = ([0.0; 3], [0.0; 3]);
        let (mut w0, mut w1) = (0.0, 0.0);
        for i in 0..n {
            if asg[i] == 1 {
                s1[0] += l[i] * w[i];
                s1[1] += a[i] * w[i];
                s1[2] += b[i] * w[i];
                w1 += w[i];
            } else {
                s0[0] += l[i] * w[i];
                s0[1] += a[i] * w[i];
                s0[2] += b[i] * w[i];
                w0 += w[i];
            }
        }
        if w0 > 0.0 {
            c0 = [s0[0] / w0, s0[1] / w0, s0[2] / w0];
        }
        if w1 > 0.0 {
            c1 = [s1[0] / w1, s1[1] / w1, s1[2] / w1];
        }
        if !changed {
            break;
        }
    }
    (c0, c1)
}

fn edge_sharpness(
    s: &mut Samples,
    dir_x: f64,
    dir_y: f64,
    mid_x: f64,
    mid_y: f64,
    step_residual: f64,
) -> f64 {
    let n = s.count;
    let (mut sw, mut swt, mut swl, mut swa, mut swb) = (0.0, 0.0, 0.0, 0.0, 0.0);
    for i in 0..n {
        let t = (s.nx[i] - mid_x) * dir_x + (s.ny[i] - mid_y) * dir_y;
        s.projection[i] = t;
        let w = s.weight[i];
        sw += w;
        swt += w * t;
        swl += w * s.l[i];
        swa += w * s.a[i];
        swb += w * s.b[i];
    }
    if sw <= 0.0 {
        return 1.0;
    }
    let t_mean = swt / sw;
    let (cl, ca, cb) = (swl / sw, swa / sw, swb / sw);
    let (mut sxx, mut sl, mut sa, mut sb) = (0.0, 0.0, 0.0, 0.0);
    for i in 0..n {
        let w = s.weight[i];
        let dt = s.projection[i] - t_mean;
        sxx += w * dt * dt;
        sl += w * dt * (s.l[i] - cl);
        sa += w * dt * (s.a[i] - ca);
        sb += w * dt * (s.b[i] - cb);
    }
    let slope_l = if sxx > 0.0 { sl / sxx } else { 0.0 };
    let slope_a = if sxx > 0.0 { sa / sxx } else { 0.0 };
    let slope_b = if sxx > 0.0 { sb / sxx } else { 0.0 };
    let il = cl - slope_l * t_mean;
    let ia = ca - slope_a * t_mean;
    let ib = cb - slope_b * t_mean;
    let mut sum = 0.0;
    for i in 0..n {
        let t = s.projection[i];
        let dl = s.l[i] - (il + slope_l * t);
        let da = s.a[i] - (ia + slope_a * t);
        let db = s.b[i] - (ib + slope_b * t);
        sum += s.weight[i] * (dl * dl + da * da + db * db);
    }
    let affine = sum / sw;
    let denom = affine + step_residual;
    if denom > 0.0 {
        affine / denom
    } else {
        1.0
    }
}

const BLUR_BINS: usize = 48;
const BLUR_WIDTHS: [f64; 5] = [0.02, 0.04, 0.07, 0.1, 0.14];
const BLUR_CENTRE_OFFSETS: [f64; 9] = [-0.12, -0.09, -0.06, -0.03, 0.0, 0.03, 0.06, 0.09, 0.12];
const PLATEAU_LEVEL: f64 = 0.12;
const MIN_PLATEAU_SHARE: f64 = 0.08;

#[inline]
fn logistic(x: f64) -> f64 {
    1.0 / (1.0 + jsmath::exp(-x))
}

struct BlurredFit {
    modes: [Oklab; 2],
    coverage: [f64; 2],
    spread: [f64; 2],
    edge_sharpness: f64,
}

fn fit_blurred_step(s: &Samples, mid_t: f64) -> Option<BlurredFit> {
    let n = s.count;
    let (mut t_min, mut t_max) = (f64::INFINITY, f64::NEG_INFINITY);
    for i in 0..n {
        if s.weight[i] <= 0.0 {
            continue;
        }
        if s.projection[i] < t_min {
            t_min = s.projection[i];
        }
        if s.projection[i] > t_max {
            t_max = s.projection[i];
        }
    }
    if !(t_max > t_min) {
        return None;
    }
    let mut bw = [0f64; BLUR_BINS];
    let mut bt = [0f64; BLUR_BINS];
    let mut bl = [0f64; BLUR_BINS];
    let mut ba = [0f64; BLUR_BINS];
    let mut bb = [0f64; BLUR_BINS];
    let scale = BLUR_BINS as f64 / (t_max - t_min);
    let (mut total_w, mut total_sq) = (0.0, 0.0);
    for i in 0..n {
        let w = s.weight[i];
        if w <= 0.0 {
            continue;
        }
        let k = jsmath::min(
            (BLUR_BINS - 1) as f64,
            ((s.projection[i] - t_min) * scale).floor(),
        ) as usize;
        bw[k] += w;
        bt[k] += w * s.projection[i];
        bl[k] += w * s.l[i];
        ba[k] += w * s.a[i];
        bb[k] += w * s.b[i];
        total_w += w;
        total_sq += w * (s.l[i] * s.l[i] + s.a[i] * s.a[i] + s.b[i] * s.b[i]);
    }
    if total_w <= 0.0 {
        return None;
    }
    let (mut ml, mut ma, mut mb, mut between_sq) = (0.0, 0.0, 0.0, 0.0);
    for k in 0..BLUR_BINS {
        let w = bw[k];
        if w <= 0.0 {
            continue;
        }
        bt[k] /= w;
        bl[k] /= w;
        ba[k] /= w;
        bb[k] /= w;
        ml += w * bl[k];
        ma += w * ba[k];
        mb += w * bb[k];
        between_sq += w * (bl[k] * bl[k] + ba[k] * ba[k] + bb[k] * bb[k]);
    }
    ml /= total_w;
    ma /= total_w;
    mb /= total_w;
    let mean_sq = ml * ml + ma * ma + mb * mb;
    let within = jsmath::max(0.0, total_sq - between_sq);
    let between = jsmath::max(0.0, between_sq - total_w * mean_sq);

    // The TypeScript evaluates the feature twice per bin; it is a pure function, so evaluating it once gives the same
    // doubles.
    let residual_for = |feature: &dyn Fn(f64) -> f64| -> f64 {
        let mut values = [0f64; BLUR_BINS];
        let mut x_mean = 0.0;
        for k in 0..BLUR_BINS {
            if bw[k] > 0.0 {
                values[k] = feature(bt[k]);
                x_mean += bw[k] * values[k];
            }
        }
        x_mean /= total_w;
        let (mut sxx, mut sl, mut sa, mut sb) = (0.0, 0.0, 0.0, 0.0);
        for k in 0..BLUR_BINS {
            let w = bw[k];
            if w <= 0.0 {
                continue;
            }
            let dx = values[k] - x_mean;
            sxx += w * dx * dx;
            sl += w * dx * (bl[k] - ml);
            sa += w * dx * (ba[k] - ma);
            sb += w * dx * (bb[k] - mb);
        }
        let explained = if sxx > 0.0 {
            (sl * sl + sa * sa + sb * sb) / sxx
        } else {
            0.0
        };
        (within + jsmath::max(0.0, between - explained)) / total_w
    };

    let affine = residual_for(&|t| t);
    let mut best_residual = f64::INFINITY;
    let mut best_t0 = mid_t;
    let mut best_width = BLUR_WIDTHS[0];
    for &width in &BLUR_WIDTHS {
        for &offset in &BLUR_CENTRE_OFFSETS {
            let t0 = mid_t + offset;
            let residual = residual_for(&|t| logistic((t - t0) / width));
            if residual < best_residual {
                best_residual = residual;
                best_t0 = t0;
                best_width = width;
            }
        }
    }

    let mut sums = [[0f64; 5]; 2];
    let (mut in0, mut in1) = (0.0, 0.0);
    for i in 0..n {
        let w = s.weight[i];
        if w > 0.0 {
            let level = logistic((s.projection[i] - best_t0) / best_width);
            let side = if level < PLATEAU_LEVEL {
                Some(0)
            } else if level > 1.0 - PLATEAU_LEVEL {
                Some(1)
            } else {
                None
            };
            if let Some(k) = side {
                let side = &mut sums[k];
                side[0] += w;
                side[1] += w * s.l[i];
                side[2] += w * s.a[i];
                side[3] += w * s.b[i];
                side[4] += w * (s.l[i] * s.l[i] + s.a[i] * s.a[i] + s.b[i] * s.b[i]);
            }
        }
        if s.projection[i] < best_t0 {
            in0 += s.cell_weight[i];
        } else {
            in1 += s.cell_weight[i];
        }
    }
    if sums[0][0] < MIN_PLATEAU_SHARE * total_w || sums[1][0] < MIN_PLATEAU_SHARE * total_w {
        return None;
    }
    let in_cell = in0 + in1;
    if in_cell <= 0.0 {
        return None;
    }
    let modes = [0, 1].map(|k| {
        let [w, sl, sa, sb, _] = sums[k];
        [sl / w, sa / w, sb / w]
    });
    let spread = [0, 1].map(|k| {
        let m = modes[k];
        jsmath::max(
            0.0,
            sums[k][4] / sums[k][0] - (m[0] * m[0] + m[1] * m[1] + m[2] * m[2]),
        )
    });
    let denom = affine + best_residual;
    Some(BlurredFit {
        modes,
        coverage: [in0 / in_cell, in1 / in_cell],
        spread,
        edge_sharpness: if denom > 0.0 { affine / denom } else { 1.0 },
    })
}

fn weighted_mean(s: &Samples) -> Oklab {
    let (mut sl, mut sa, mut sb, mut sw) = (0.0, 0.0, 0.0, 0.0);
    for i in 0..s.count {
        sl += s.l[i] * s.weight[i];
        sa += s.a[i] * s.weight[i];
        sb += s.b[i] * s.weight[i];
        sw += s.weight[i];
    }
    if sw > 0.0 {
        [sl / sw, sa / sw, sb / sw]
    } else {
        [0.0; 3]
    }
}

fn bounding_box_diagonal_sq(s: &Samples) -> f64 {
    let (mut min_l, mut max_l) = (s.l[0], s.l[0]);
    let (mut min_a, mut max_a) = (s.a[0], s.a[0]);
    let (mut min_b, mut max_b) = (s.b[0], s.b[0]);
    for i in 1..s.count {
        let (l, a, b) = (s.l[i], s.a[i], s.b[i]);
        if l < min_l {
            min_l = l;
        } else if l > max_l {
            max_l = l;
        }
        if a < min_a {
            min_a = a;
        } else if a > max_a {
            max_a = a;
        }
        if b < min_b {
            min_b = b;
        } else if b > max_b {
            max_b = b;
        }
    }
    jsmath::pow(max_l - min_l, 2.0)
        + jsmath::pow(max_a - min_a, 2.0)
        + jsmath::pow(max_b - min_b, 2.0)
}

fn extract(
    rows: &mut SourceRows,
    gw: usize,
    gh: usize,
    cx: usize,
    cy: usize,
    model: EdgeModel,
    s: &mut Samples,
) -> Evaluated {
    collect(rows, gw, gh, cx, cy, s);
    let n = s.count;
    if n < 2 {
        return single_mode(if n == 1 {
            [s.l[0], s.a[0], s.b[0]]
        } else {
            [0.0; 3]
        });
    }
    if bounding_box_diagonal_sq(s) < MIN_MODE_SEPARATION - SEPARATION_BOUND_MARGIN {
        return single_mode(weighted_mean(s));
    }
    let (c0, c1) = fit_two_modes(s);
    let (sl, sa, sb) = (c0[0] - c1[0], c0[1] - c1[1], c0[2] - c1[2]);
    let separation = sl * sl + sa * sa + sb * sb;
    if separation < MIN_MODE_SEPARATION {
        return single_mode(weighted_mean(s));
    }

    let (mut spread_sum0, mut spread_sum1, mut spread_w0, mut spread_w1) = (0.0, 0.0, 0.0, 0.0);
    let (mut in0, mut in1) = (0.0, 0.0);
    let (mut px0, mut px1, mut py0, mut py1, mut pw0, mut pw1) = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0);
    for i in 0..n {
        let one = s.assignment[i] == 1;
        let c = if one { c1 } else { c0 };
        let (dl, da, db) = (s.l[i] - c[0], s.a[i] - c[1], s.b[i] - c[2]);
        let w = s.weight[i];
        let d = (dl * dl + da * da + db * db) * w;
        if one {
            spread_sum1 += d;
            spread_w1 += w;
            px1 += s.nx[i] * w;
            py1 += s.ny[i] * w;
            pw1 += w;
            in1 += s.cell_weight[i];
        } else {
            spread_sum0 += d;
            spread_w0 += w;
            px0 += s.nx[i] * w;
            py0 += s.ny[i] * w;
            pw0 += w;
            in0 += s.cell_weight[i];
        }
    }
    let spread = [
        if spread_w0 > 0.0 {
            spread_sum0 / spread_w0
        } else {
            0.0
        },
        if spread_w1 > 0.0 {
            spread_sum1 / spread_w1
        } else {
            0.0
        },
    ];
    let total_in = in0 + in1;
    if total_in <= 0.0 {
        return single_mode(weighted_mean(s));
    }
    let coverage = [in0 / total_in, in1 / total_in];
    let cx0 = if pw0 > 0.0 { px0 / pw0 } else { 0.5 };
    let cy0 = if pw0 > 0.0 { py0 / pw0 } else { 0.5 };
    let cx1 = if pw1 > 0.0 { px1 / pw1 } else { 0.5 };
    let cy1 = if pw1 > 0.0 { py1 / pw1 } else { 0.5 };
    let spatial = jsmath::hypot(cx0 - cx1, cy0 - cy1);

    let mut has_direction = false;
    let mut sharpness = 1.0;
    if spatial > 0.0 {
        has_direction = true;
        let dir = [(cx1 - cx0) / spatial, (cy1 - cy0) / spatial];
        let step_residual = (spread_sum0 + spread_sum1) / (spread_w0 + spread_w1);
        sharpness = edge_sharpness(
            s,
            dir[0],
            dir[1],
            (cx0 + cx1) / 2.0,
            (cy0 + cy1) / 2.0,
            step_residual,
        );
    }
    let max_spread = jsmath::max(spread[0], spread[1]);
    let color_confidence = separation / (separation + max_spread);
    let spatial_confidence = jsmath::min(1.0, spatial / 0.5);
    let confidence = color_confidence * spatial_confidence * sharpness;

    if model == EdgeModel::BlurredStep && has_direction {
        if let Some(blurred) = fit_blurred_step(s, 0.0) {
            let [m0, m1] = blurred.modes;
            let plateau_sep = jsmath::pow(m0[0] - m1[0], 2.0)
                + jsmath::pow(m0[1] - m1[1], 2.0)
                + jsmath::pow(m0[2] - m1[2], 2.0);
            let plateau_spread = jsmath::max(blurred.spread[0], blurred.spread[1]);
            if plateau_sep >= MIN_MODE_SEPARATION {
                let blurred_confidence = (plateau_sep / (plateau_sep + plateau_spread))
                    * spatial_confidence
                    * blurred.edge_sharpness;
                if blurred_confidence > confidence {
                    return Evaluated {
                        modes: blurred.modes,
                        coverage: blurred.coverage,
                        mode_count: 2,
                        confidence: blurred_confidence,
                    };
                }
            }
        }
    }
    Evaluated {
        modes: [c0, c1],
        coverage,
        mode_count: 2,
        confidence,
    }
}

/// The frozen evidence layer: confident cells in ascending cell order (the TypeScript map's insertion order), with a
/// per-cell index into them.
pub struct EvidenceLayer {
    pub cells: Vec<(usize, Evidence)>,
    index: Vec<u32>,
}

impl EvidenceLayer {
    #[inline]
    pub fn get(&self, cell: usize) -> Option<&Evidence> {
        match self.index[cell] {
            u32::MAX => None,
            k => Some(&self.cells[k as usize].1),
        }
    }

    #[inline]
    pub fn slot(&self, cell: usize) -> Option<usize> {
        match self.index[cell] {
            u32::MAX => None,
            k => Some(k as usize),
        }
    }

    pub fn len(&self) -> usize {
        self.cells.len()
    }

    pub fn is_empty(&self) -> bool {
        self.cells.is_empty()
    }
}

/// `buildCrispEvidenceLayer` over every cell (D132), with neighbour agreement.
pub fn build_evidence_layer(
    image: &Image,
    gw: usize,
    gh: usize,
    model: EdgeModel,
) -> EvidenceLayer {
    let cell_count = gw * gh;
    // Each cell's evidence depends only on the source, so bands of cell rows run independently; each band caches its
    // own source rows. Only confident cells are kept, in cell order, as the TypeScript Map holds them: one slot per
    // cell cost about 72 bytes per cell (108 MB at 1500 stitches).
    let band = (gh / (rayon::current_num_threads() * 8)).max(1);
    let bands = gh.div_ceil(band);
    let raw: Vec<(usize, Evidence)> = (0..bands)
        .into_par_iter()
        .map(|band_index| {
            let mut rows = SourceRows::new(image);
            let mut samples = Samples::default();
            let mut found = Vec::new();
            let first = band_index * band * gw;
            let last = ((band_index + 1) * band * gw).min(cell_count);
            for cell in first..last {
                let (cx, cy) = (cell % gw, cell / gw);
                let e = extract(&mut rows, gw, gh, cx, cy, model, &mut samples);
                if e.confidence >= CONFIDENCE_THRESHOLD {
                    debug_assert_eq!(e.mode_count, 2);
                    found.push((
                        cell,
                        Evidence {
                            modes: e.modes,
                            coverage: e.coverage,
                        },
                    ));
                }
            }
            found
        })
        .flatten()
        .collect();
    let mut confident = vec![false; cell_count];
    for (cell, _) in &raw {
        confident[*cell] = true;
    }
    let mut cells = Vec::new();
    let mut index = vec![u32::MAX; cell_count];
    const OFFSETS: [(i64, i64); 8] = [
        (1, 0),
        (-1, 0),
        (0, 1),
        (0, -1),
        (1, 1),
        (1, -1),
        (-1, 1),
        (-1, -1),
    ];
    for (cell, e) in raw {
        let (cx, cy) = ((cell % gw) as i64, (cell / gw) as i64);
        let agreed = OFFSETS.iter().any(|&(dx, dy)| {
            let (nx, ny) = (cx + dx, cy + dy);
            nx >= 0
                && nx < gw as i64
                && ny >= 0
                && ny < gh as i64
                && confident[ny as usize * gw + nx as usize]
        });
        if agreed {
            index[cell] = cells.len() as u32;
            cells.push((cell, e));
        }
    }
    EvidenceLayer { cells, index }
}
