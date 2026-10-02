//! Ridges and chains: the thin lines and streaks of a picture, found to a fraction of a pixel (D272).
//!
//! A thin line is a ridge of the picture: in each colour channel the second derivative across it is large and the first
//! derivative along its normal vanishes. The Gaussian derivatives at a few scales give, for each pixel, the direction across
//! the line, how strongly the pixel is a ridge, and where inside the pixel the ridge passes. This is Steger's curvilinear-line
//! detector. It finds dark, light and coloured lines alike, and leaves edges and areas alone. The points are then linked,
//! strongest first, along the line's own direction into ordered chains. Used by the line tracing (G-084, `lines.rs`) and
//! the texture strokes (G-085, `texture.rs`).

use crate::color::{oklab_distance_sq, rgb_to_oklab, Rgb};
use crate::Image;
use std::collections::HashMap;

/// The largest Gaussian scale looked at, as a share of a stitch: a line wider than about a stitch is an area.
pub(crate) const MAX_SCALE_OF_STITCH: f64 = 0.22;
/// The picture the ridges are found in is reduced until a stitch is no more than this many pixels across.
const MAX_ANALYSIS_STITCH_PX: f64 = 20.0;
/// ... and until it has no more pixels than this, so the derivative maps stay small.
const MAX_ANALYSIS_PIXELS: f64 = 3.0e6;
/// The flanks of a line are about equally steep; of two flanks the gentler is at least this share of the steeper.
const EDGE_FLANK_SYMMETRY: f32 = 0.3;
/// Ridge points this many pixels apart (times two for each halving of the picture) along a line are still one line.
const LINK_GAP_PX: f32 = 3.2;
/// A ridge point is a line and not a dot when its weaker curvature is at most this share of its stronger.
const MAX_ANISOTROPY: f32 = 0.6;

/// A box-averaged reduction by an integer factor.
pub(crate) fn reduce(gray: &[f32], w: usize, h: usize, f: usize) -> (Vec<f32>, usize, usize) {
    if f == 1 {
        return (gray.to_vec(), w, h);
    }
    let (wa, ha) = (w.div_ceil(f), h.div_ceil(f));
    let mut out = vec![0f32; wa * ha];
    for y in 0..ha {
        for x in 0..wa {
            let (mut sum, mut n) = (0f32, 0f32);
            for yy in (y * f)..((y + 1) * f).min(h) {
                for xx in (x * f)..((x + 1) * f).min(w) {
                    sum += gray[yy * w + xx];
                    n += 1.0;
                }
            }
            out[y * wa + x] = sum / n;
        }
    }
    (out, wa, ha)
}

/// One colour channel of the picture, box-averaged by an integer factor; a transparent pixel reads as white.
pub(crate) fn channel_reduced(
    data: &[u8],
    w: usize,
    h: usize,
    channel: usize,
    f: usize,
) -> (Vec<f32>, usize, usize) {
    let (wa, ha) = (w.div_ceil(f), h.div_ceil(f));
    let mut out = vec![0f32; wa * ha];
    for y in 0..ha {
        for x in 0..wa {
            let (mut sum, mut n) = (0f32, 0f32);
            for yy in (y * f)..((y + 1) * f).min(h) {
                for xx in (x * f)..((x + 1) * f).min(w) {
                    let i = (yy * w + xx) * 4;
                    sum += if data[i + 3] < 128 {
                        255.0
                    } else {
                        data[i + channel] as f32
                    };
                    n += 1.0;
                }
            }
            out[y * wa + x] = sum / n;
        }
    }
    (out, wa, ha)
}

// ---------------------------------------------------------------------------------------------------------------------
// Ridges

/// The Gaussian and its first and second derivatives, sampled out to three standard deviations.
fn gaussian_kernels(sigma: f64) -> (Vec<f32>, Vec<f32>, Vec<f32>, usize) {
    let r = (3.0 * sigma).ceil().max(1.0) as usize;
    let mut g0 = Vec::with_capacity(2 * r + 1);
    let mut g1 = Vec::with_capacity(2 * r + 1);
    let mut g2 = Vec::with_capacity(2 * r + 1);
    let mut sum = 0.0;
    for i in -(r as i64)..=r as i64 {
        let x = i as f64;
        let g = (-x * x / (2.0 * sigma * sigma)).exp();
        sum += g;
        g0.push(g);
        // Correlated with the picture, not convolved, so the sign is that of the derivative itself.
        g1.push(x / (sigma * sigma) * g);
        g2.push((x * x / sigma.powi(4) - 1.0 / (sigma * sigma)) * g);
    }
    let norm = |v: Vec<f64>| {
        v.into_iter()
            .map(|x| (x / sum) as f32)
            .collect::<Vec<f32>>()
    };
    (norm(g0), norm(g1), norm(g2), r)
}

/// `src` convolved along rows with `kernel`, edges clamped.
fn convolve_rows(src: &[f32], w: usize, h: usize, kernel: &[f32], r: usize) -> Vec<f32> {
    let mut out = vec![0f32; w * h];
    for y in 0..h {
        let row = &src[y * w..(y + 1) * w];
        let out_row = &mut out[y * w..(y + 1) * w];
        for x in 0..w {
            let mut acc = 0f32;
            for (k, &c) in kernel.iter().enumerate() {
                let xx = (x + k).saturating_sub(r).min(w - 1);
                acc += c * row[xx];
            }
            out_row[x] = acc;
        }
    }
    out
}

/// `src` convolved down columns with `kernel`, edges clamped.
fn convolve_columns(src: &[f32], w: usize, h: usize, kernel: &[f32], r: usize) -> Vec<f32> {
    let mut out = vec![0f32; w * h];
    for y in 0..h {
        let out_row = &mut out[y * w..(y + 1) * w];
        for (k, &c) in kernel.iter().enumerate() {
            let yy = (y + k).saturating_sub(r).min(h - 1);
            let row = &src[yy * w..(yy + 1) * w];
            for x in 0..w {
                out_row[x] += c * row[x];
            }
        }
    }
    out
}

/// The five Gaussian derivatives of a channel at one scale: Ix, Iy, Ixx, Ixy, Iyy.
fn derivatives(channel: &[f32], w: usize, h: usize, sigma: f64) -> [Vec<f32>; 5] {
    let (g0, g1, g2, r) = gaussian_kernels(sigma);
    let a0 = convolve_rows(channel, w, h, &g0, r);
    let a1 = convolve_rows(channel, w, h, &g1, r);
    let a2 = convolve_rows(channel, w, h, &g2, r);
    [
        convolve_columns(&a1, w, h, &g0, r),
        convolve_columns(&a0, w, h, &g1, r),
        convolve_columns(&a2, w, h, &g0, r),
        convolve_columns(&a1, w, h, &g1, r),
        convolve_columns(&a0, w, h, &g2, r),
    ]
}

/// A point of a ridge, in the coordinates of the analysis picture (a pixel's centre is a whole number).
#[derive(Clone, Copy, Debug)]
pub(crate) struct Ridge {
    pub(crate) x: f32,
    pub(crate) y: f32,
    /// The strength: the scale-normalised curvature across the line, in levels of 0 to 255.
    pub(crate) strength: f32,
    /// The unit direction across the line.
    pub(crate) nx: f32,
    pub(crate) ny: f32,
    /// The Gaussian scale it was found at, in analysis pixels.
    pub(crate) sigma: f32,
    /// A dark line (a valley) as against a light one (a ridge).
    pub(crate) dark: bool,
    /// How many times the picture was halved for it.
    pub(crate) level: u8,
}

/// Where inside its pixel the ridge passes, and how strongly, from the derivatives at a pixel; `None` when the pixel is
/// not on a ridge. Returns the offset in x and y, the strength and the unit normal.
fn ridge_at(
    ix: f32,
    iy: f32,
    ixx: f32,
    ixy: f32,
    iyy: f32,
    sigma: f32,
) -> Option<(f32, f32, f32, f32, f32, bool)> {
    // Eigenvalues of [[ixx, ixy], [ixy, iyy]] and the eigenvector of the one that is larger in magnitude.
    let half = 0.5 * (ixx + iyy);
    let diff = 0.5 * (ixx - iyy);
    let root = (diff * diff + ixy * ixy).sqrt();
    let (l1, l2) = (half + root, half - root);
    let (big, small) = if l1.abs() >= l2.abs() {
        (l1, l2)
    } else {
        (l2, l1)
    };
    if big.abs() < 1e-6 || small.abs() > MAX_ANISOTROPY * big.abs() {
        return None;
    }
    // The eigenvector for `big`, from the angle of the principal axis, which is stable where the Hessian is nearly diagonal.
    let theta = 0.5 * (2.0 * ixy).atan2(ixx - iyy);
    let (c, sn) = (theta.cos(), theta.sin());
    let (nx, ny) = if (big - l1).abs() <= (big - l2).abs() {
        (c, sn)
    } else {
        (-sn, c)
    };
    // The first derivative along the normal vanishes at the ridge.
    let curvature = nx * nx * ixx + 2.0 * nx * ny * ixy + ny * ny * iyy;
    if curvature.abs() < 1e-9 {
        return None;
    }
    let t = -(nx * ix + ny * iy) / curvature;
    // Inside the pixel, a little over so that a line falling between two pixels is found in both; the pixel across the line
    // that is the weaker of the two is then dropped (D272).
    if (t * nx).abs() > 0.6 || (t * ny).abs() > 0.6 {
        return None;
    }
    Some((t * nx, t * ny, big.abs() * sigma * sigma, nx, ny, big > 0.0))
}

/// The ridge points of the picture: for every level of reduction, the best of the three channels and the scales of that
/// level at each pixel, kept where it is at least `low`.
pub(crate) fn find_ridges(
    channels: &[Vec<f32>; 3],
    wa: usize,
    ha: usize,
    stitch_a: f64,
    low: f32,
    max_sigma: Option<f64>,
) -> Vec<Ridge> {
    let sigma_max = (MAX_SCALE_OF_STITCH * stitch_a)
        .min(max_sigma.unwrap_or(f64::MAX))
        .max(1.0);
    let mut scales: Vec<f64> = Vec::new();
    let mut sigma = 1.0;
    while sigma <= sigma_max + 1e-9 {
        scales.push(sigma);
        sigma *= 1.5;
    }
    // A scale above 2.2 pixels is looked at on a picture halved as often as it takes to bring it under 2.2.
    let level_of = |sigma: f64| {
        let mut m = 0u32;
        while sigma / (1u32 << m) as f64 > 2.2 {
            m += 1;
        }
        m as usize
    };
    let levels = scales.iter().map(|&s| level_of(s)).max().unwrap_or(0) + 1;
    let mut pictures: Vec<[Vec<f32>; 3]> = Vec::new();
    let mut sizes: Vec<(usize, usize)> = vec![(wa, ha)];
    for m in 0..levels {
        let (w, h) = sizes[m];
        let chans: [Vec<f32>; 3] = if m == 0 {
            [
                channels[0].clone(),
                channels[1].clone(),
                channels[2].clone(),
            ]
        } else {
            let (pw, ph) = sizes[m - 1];
            [0, 1, 2].map(|c| reduce(&pictures[m - 1][c], pw, ph, 2).0)
        };
        pictures.push(chans);
        sizes.push((w.div_ceil(2), h.div_ceil(2)));
    }
    let mut ridges: Vec<Ridge> = Vec::new();
    for m in 0..levels {
        let (w, h) = sizes[m];
        let here: Vec<f64> = scales
            .iter()
            .copied()
            .filter(|&s| level_of(s) == m)
            .collect();
        if here.is_empty() || w < 3 || h < 3 {
            continue;
        }
        let factor = (1u32 << m) as f32;
        let mut best = vec![0f32; w * h];
        let mut found: Vec<Option<Ridge>> = vec![None; w * h];
        for &sigma in &here {
            let sigma_level = sigma / factor as f64;
            for c in 0..3 {
                let [ix, iy, ixx, ixy, iyy] = derivatives(&pictures[m][c], w, h, sigma_level);
                for i in 0..w * h {
                    if let Some((tx, ty, strength, nx, ny, curvature_sign)) =
                        ridge_at(ix[i], iy[i], ixx[i], ixy[i], iyy[i], sigma_level as f32)
                    {
                        // The shoulder of a step edge looks like a faint line. A line has the slope of the picture across
                        // it of opposite sign on its two flanks, and roughly as steep on both; an edge has the same sign
                        // on both sides (D272).
                        let flank = |side: f32| -> f32 {
                            let d = (1.5 * sigma_level as f32).max(1.0) * side;
                            let x = (i % w) as i64 + (d * nx).round() as i64;
                            let y = (i / w) as i64 + (d * ny).round() as i64;
                            if x >= 0 && y >= 0 && (x as usize) < w && (y as usize) < h {
                                let q = y as usize * w + x as usize;
                                nx * ix[q] + ny * iy[q]
                            } else {
                                0.0
                            }
                        };
                        let (before, after) = (flank(-1.0), flank(1.0));
                        let is_line = before * after < 0.0
                            && before.abs().min(after.abs())
                                >= EDGE_FLANK_SYMMETRY * before.abs().max(after.abs());
                        if strength > best[i] && strength >= low && is_line {
                            best[i] = strength;
                            let (px, py) = ((i % w) as f32 + tx, (i / w) as f32 + ty);
                            found[i] = Some(Ridge {
                                // Back to the coordinates of the analysis picture.
                                x: (px + 0.5) * factor - 0.5,
                                y: (py + 0.5) * factor - 0.5,
                                strength,
                                nx,
                                ny,
                                sigma: sigma as f32,
                                dark: curvature_sign,
                                level: m as u8,
                            });
                        }
                    }
                }
            }
        }
        // Of ridge points side by side across the line only the strongest stays.
        for i in 0..w * h {
            let Some(r) = found[i] else { continue };
            let (dx, dy) = (r.nx.round() as i64, r.ny.round() as i64);
            let (x, y) = ((i % w) as i64, (i / w) as i64);
            let beaten = [-1i64, 1].iter().any(|&side| {
                let (qx, qy) = (x + side * dx, y + side * dy);
                if (dx == 0 && dy == 0) || qx < 0 || qy < 0 || qx >= w as i64 || qy >= h as i64 {
                    return false;
                }
                let q = qy as usize * w + qx as usize;
                best[q] > best[i] || (best[q] == best[i] && found[q].is_some() && q < i)
            });
            if beaten {
                found[i] = None;
            }
        }
        ridges.extend(found.into_iter().flatten());
    }
    ridges
}

// ---------------------------------------------------------------------------------------------------------------------
// Chains

/// Ridge points found near a position, by a grid of square cells.
struct Neighbours {
    cell: f32,
    cells: HashMap<(i32, i32), Vec<u32>>,
}

impl Neighbours {
    fn new(ridges: &[Ridge], cell: f32) -> Neighbours {
        let mut cells: HashMap<(i32, i32), Vec<u32>> = HashMap::new();
        for (i, r) in ridges.iter().enumerate() {
            cells
                .entry(((r.x / cell).floor() as i32, (r.y / cell).floor() as i32))
                .or_default()
                .push(i as u32);
        }
        Neighbours { cell, cells }
    }

    fn near(&self, x: f32, y: f32, radius: f32) -> Vec<u32> {
        let (cx, cy) = (
            (x / self.cell).floor() as i32,
            (y / self.cell).floor() as i32,
        );
        let reach = (radius / self.cell).ceil() as i32;
        let mut out = Vec::new();
        for gx in cx - reach..=cx + reach {
            for gy in cy - reach..=cy + reach {
                if let Some(v) = self.cells.get(&(gx, gy)) {
                    out.extend(v.iter().copied());
                }
            }
        }
        out
    }
}

/// The ridge points linked into chains, strongest seed first, along the line's direction. A chain is the indices of its
/// points in order.
pub(crate) fn link_chains(ridges: &[Ridge], high: f32, low: f32) -> Vec<Vec<u32>> {
    let grid = Neighbours::new(ridges, 8.0);
    let mut used = vec![false; ridges.len()];
    // A line is flanked by weak ridges of the opposite kind, the lobes of the filter; they are not lines.
    for (i, a) in ridges.iter().enumerate() {
        if a.strength < high {
            continue;
        }
        for j in grid.near(a.x, a.y, 4.0 * a.sigma + 3.0) {
            let b = &ridges[j as usize];
            if b.dark != a.dark
                && b.strength < 0.5 * a.strength
                && (b.x - a.x).hypot(b.y - a.y) <= 4.0 * a.sigma + 2.0
                && j as usize != i
            {
                used[j as usize] = true;
            }
        }
    }
    let mut seeds: Vec<u32> = (0..ridges.len() as u32)
        .filter(|&i| ridges[i as usize].strength >= high)
        .collect();
    seeds.sort_by(|&a, &b| {
        ridges[b as usize]
            .strength
            .partial_cmp(&ridges[a as usize].strength)
            .unwrap()
            .then(a.cmp(&b))
    });

    // The next point from `from`, travelling along `dir`, if there is one.
    let next = |from: usize, dir: (f32, f32), used: &[bool]| -> Option<usize> {
        let a = &ridges[from];
        let mut best: Option<(usize, f32)> = None;
        let reach = LINK_GAP_PX * (1u32 << a.level) as f32 * 2.0;
        for j in grid.near(a.x, a.y, reach) {
            let j = j as usize;
            if used[j] || ridges[j].strength < low {
                continue;
            }
            let b = &ridges[j];
            let (vx, vy) = (b.x - a.x, b.y - a.y);
            let dist = (vx * vx + vy * vy).sqrt();
            let limit = LINK_GAP_PX * (1u32 << a.level.max(b.level)) as f32;
            if dist < 0.05 || dist > limit {
                continue;
            }
            let cos = (vx * dir.0 + vy * dir.1) / dist;
            if cos < 0.64 || (a.nx * b.nx + a.ny * b.ny).abs() < 0.7 {
                continue;
            }
            let score = dist * (1.5 - cos);
            if best.is_none_or(|(_, s)| score < s) {
                best = Some((j, score));
            }
        }
        best.map(|(j, _)| j)
    };
    // Marks the points beside `at`, across the line, as taken: they are the same line seen twice.
    let suppress = |at: usize, used: &mut Vec<bool>| {
        let a = &ridges[at];
        let (tx, ty) = (-a.ny, a.nx);
        let across = 1.2 * a.sigma + 0.7;
        for j in grid.near(a.x, a.y, across + 2.0) {
            let j = j as usize;
            if used[j] {
                continue;
            }
            let (wx, wy) = (ridges[j].x - a.x, ridges[j].y - a.y);
            if (wx * a.nx + wy * a.ny).abs() <= across && (wx * tx + wy * ty).abs() <= 0.9 {
                used[j] = true;
            }
        }
    };

    let mut chains: Vec<Vec<u32>> = Vec::new();
    for seed in seeds {
        let seed = seed as usize;
        if used[seed] {
            continue;
        }
        used[seed] = true;
        suppress(seed, &mut used);
        let a = &ridges[seed];
        let tangent = (-a.ny, a.nx);
        let mut forward: Vec<u32> = Vec::new();
        let mut backward: Vec<u32> = Vec::new();
        for (list, start_dir) in [
            (&mut forward, tangent),
            (&mut backward, (-tangent.0, -tangent.1)),
        ] {
            let (mut cur, mut dir) = (seed, start_dir);
            while let Some(j) = next(cur, dir, &used) {
                let (vx, vy) = (ridges[j].x - ridges[cur].x, ridges[j].y - ridges[cur].y);
                let len = (vx * vx + vy * vy).sqrt().max(1e-6);
                let (ux, uy) = (0.6 * dir.0 + 0.4 * vx / len, 0.6 * dir.1 + 0.4 * vy / len);
                let n = (ux * ux + uy * uy).sqrt().max(1e-6);
                dir = (ux / n, uy / n);
                used[j] = true;
                suppress(j, &mut used);
                list.push(j as u32);
                cur = j;
            }
        }
        backward.reverse();
        let mut chain = backward;
        chain.push(seed as u32);
        chain.extend(forward);
        chains.push(chain);
    }
    chains
}

/// The colour of a line, read from the original pixels: along the line, the pixel at its centre or beside it that differs
/// most from the surroundings a little farther out, and the middle value of those over the line. So a line of one pixel
/// in a picture reduced for the search is not paled by the reduction.
pub(crate) fn line_color(image: &Image, ridges: &[Ridge], points: &[u32], f: usize) -> [f64; 3] {
    let (w, h) = (image.width as i64, image.height as i64);
    let at = |x: i64, y: i64| -> Option<[f64; 3]> {
        if x < 0 || y < 0 || x >= w || y >= h {
            return None;
        }
        let i = (y as usize * image.width + x as usize) * 4;
        (image.data[i + 3] >= 128).then(|| {
            [
                image.data[i] as f64,
                image.data[i + 1] as f64,
                image.data[i + 2] as f64,
            ]
        })
    };
    let mut samples: Vec<[f64; 3]> = Vec::new();
    for &p in points.iter().step_by((f / 2).max(1)) {
        let r = &ridges[p as usize];
        let (cx, cy) = (
            (r.x as f64 + 0.5) * f as f64 - 0.5,
            (r.y as f64 + 0.5) * f as f64 - 0.5,
        );
        let out = (r.sigma as f64 * 2.0 * f as f64 * 0.8 + 2.0).max(3.0);
        let around = [-1.0f64, 1.0].map(|side| {
            at(
                (cx + side * r.nx as f64 * out).round() as i64,
                (cy + side * r.ny as f64 * out).round() as i64,
            )
        });
        let background = match (around[0], around[1]) {
            (Some(a), Some(b)) => [
                (a[0] + b[0]) / 2.0,
                (a[1] + b[1]) / 2.0,
                (a[2] + b[2]) / 2.0,
            ],
            (Some(a), None) | (None, Some(a)) => a,
            _ => continue,
        };
        let mut best: Option<([f64; 3], f64)> = None;
        for step in [-1.0f64, 0.0, 1.0] {
            let (x, y) = (
                (cx + step * r.nx as f64).round() as i64,
                (cy + step * r.ny as f64).round() as i64,
            );
            if let Some(c) = at(x, y) {
                let d: f64 = (0..3).map(|k| (c[k] - background[k]).abs()).sum();
                if best.is_none_or(|(_, bd)| d > bd) {
                    best = Some((c, d));
                }
            }
        }
        if let Some((c, _)) = best {
            samples.push(c);
        }
    }
    if samples.is_empty() {
        return [0.0; 3];
    }
    [0, 1, 2].map(|k| {
        let mut v: Vec<f64> = samples.iter().map(|c| c[k]).collect();
        v.sort_by(|a, b| a.partial_cmp(b).unwrap());
        v[v.len() / 2]
    })
}

/// The ridges of `image`, a picture of stitches `stitch_px` pixels across, in a picture reduced only as far as a stitch of
/// 20 pixels and 3 million pixels call for (D272). Returns them with the factor of the reduction, since their coordinates
/// are those of the reduced picture. `max_sigma` caps the scale looked at, in pixels of the reduced picture.
pub(crate) fn image_ridges(
    image: &Image,
    stitch_px: f64,
    low: f32,
    max_sigma: Option<f64>,
) -> (Vec<Ridge>, usize) {
    let (w, h) = (image.width, image.height);
    let f = ((stitch_px / MAX_ANALYSIS_STITCH_PX).ceil())
        .max(((w * h) as f64 / MAX_ANALYSIS_PIXELS).sqrt().ceil())
        .max(1.0) as usize;
    let (c0, wa, ha) = channel_reduced(&image.data, w, h, 0, f);
    let channels = [
        c0,
        channel_reduced(&image.data, w, h, 1, f).0,
        channel_reduced(&image.data, w, h, 2, f).0,
    ];
    let ridges = find_ridges(&channels, wa, ha, stitch_px / f as f64, low, max_sigma);
    (ridges, f)
}

/// The few threads a set of colours group into: each colour joins the nearest group within `merge` (Oklab distance), or
/// starts one while fewer than `max_threads` exist, or else joins the nearest. Heavier colours (by `weights`) are placed
/// first. Returns the group of each colour and the mean colour of each group, weighted.
pub(crate) fn cluster_colors(
    colors: &[[f64; 3]],
    weights: &[f64],
    max_threads: usize,
    merge: f64,
) -> (Vec<usize>, Vec<Rgb>) {
    let mut order: Vec<usize> = (0..colors.len()).collect();
    order.sort_by(|&a, &b| weights[b].partial_cmp(&weights[a]).unwrap().then(a.cmp(&b)));
    // (colour sum weighted, weight, mean colour) per thread.
    let mut clusters: Vec<([f64; 3], f64, Rgb)> = Vec::new();
    let mut group = vec![0usize; colors.len()];
    for &i in &order {
        let rgb = colors[i].map(|v| v.round().clamp(0.0, 255.0) as u8);
        let lab = rgb_to_oklab(rgb);
        let nearest = clusters
            .iter()
            .enumerate()
            .map(|(k, c)| (k, oklab_distance_sq(&lab, &rgb_to_oklab(c.2))))
            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        let into = match nearest {
            Some((k, d)) if d <= merge * merge || clusters.len() >= max_threads => k,
            _ => {
                clusters.push(([0.0; 3], 0.0, rgb));
                clusters.len() - 1
            }
        };
        let c = &mut clusters[into];
        for k in 0..3 {
            c.0[k] += colors[i][k] * weights[i];
        }
        c.1 += weights[i];
        c.2 = [0, 1, 2].map(|k| (c.0[k] / c.1).round() as u8);
        group[i] = into;
    }
    (group, clusters.into_iter().map(|c| c.2).collect())
}
