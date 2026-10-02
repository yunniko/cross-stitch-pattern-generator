//! G-084: backstitch traced from the lines of a picture.
//!
//! A drawing's outline is thinner than a stitch, so downsampled it becomes a row of grey stitches that are neither the
//! line nor the colour beside it. This stage finds the thin lines in the source picture, turns them into backstitch
//! between grid corners, and hands back the picture with the lines painted over by their surroundings, so the cross
//! stitches under a line take the surrounding colour (Owner, 2026-10-02).
//!
//! The method (D272), in four steps:
//!
//! 1. **Ridges.** A thin line is a ridge of the picture: in each colour channel the second derivative across it is
//!    large and the first derivative along its normal vanishes. The Gaussian derivatives at a few scales give, for each
//!    pixel, the direction across the line, how strongly the pixel is a ridge, and where inside the pixel the ridge
//!    passes (to a fraction of a pixel). This is Steger's curvilinear-line detector. It finds dark, light and coloured
//!    lines alike, at any width up to about a stitch, and leaves edges and areas alone.
//! 2. **Chains.** The ridge points are linked, strongest first, along the line's own direction into ordered chains.
//!    A chain is kept when it holds a strong point and is long enough.
//! 3. **Stitches.** A chain is smoothed and then approximated by stitches between grid corners: among the corners near
//!    the line, the sequence of straight stitches (at most three cells each, any slope) that stays within a fraction of a
//!    cell of it, with the fewest stitches and the fewest bends, found by dynamic programming. Chains that meet share
//!    the corner they meet at.
//! 4. **Colour and painting out.** The colour of a line is read from the original pixels along it, not from the
//!    reduced picture the ridges were found in, so it is not paled; the pixels of the line are then painted over.

use crate::color::{oklab_distance_sq, rgb_to_oklab, Rgb};
use crate::Image;
use std::collections::{BTreeSet, HashMap};

/// The most threads the lines of one picture are stitched in (D269).
const MAX_LINE_THREADS: usize = 3;
/// Two lines whose colours are nearer than this (Oklab distance) are one thread.
const SAME_LINE_COLOR_DISTANCE: f64 = 0.12;
/// Below this many source pixels per stitch there is no sub-stitch line to find.
const MIN_PIXELS_PER_STITCH: f64 = 3.0;
/// The picture the ridges are found in is reduced until a stitch is no more than this many pixels across.
const MAX_ANALYSIS_STITCH_PX: f64 = 20.0;
/// ... and until it has no more pixels than this, so the derivative maps stay small.
const MAX_ANALYSIS_PIXELS: f64 = 3.0e6;
/// The largest Gaussian scale looked at, as a share of a stitch: a line wider than about a stitch is an area.
const MAX_SCALE_OF_STITCH: f64 = 0.22;
/// The flanks of a line are about equally steep; of two flanks the gentler is at least this share of the steeper.
const EDGE_FLANK_SYMMETRY: f32 = 0.3;
/// Ridge points this many pixels apart (times two for each halving of the picture) along a line are still one line.
const LINK_GAP_PX: f32 = 3.2;
/// A ridge point is a line and not a dot when its weaker curvature is at most this share of its stronger.
const MAX_ANISOTROPY: f32 = 0.6;

/// The picture the flatness is measured on is reduced to at most this many pixels on its longer side.
const FLATNESS_SCALE_PX: usize = 512;
/// A block is flat below this standard deviation of luminance (0 to 255).
const FLAT_SD: f64 = 6.0;
/// A picture is a drawing, and worth tracing, when at least this share of it is flat (D267).
const MIN_FLAT_SHARE: f64 = 0.55;
/// More line than this per row of stitches is not a drawing's lines, whatever the picture is.
const MAX_LINE_CELLS_PER_ROW: f64 = 25.0;
/// In a photograph (D270) only the strongest long lines are kept, at most this many cells of line per row of stitches.
const PHOTO_LINE_CELLS_PER_ROW: f64 = 4.0;

/// The corners within this many cells of a line are the places its stitches may end (D272).
const NEAR_CORNER: f64 = 1.0;
/// A stitch stays within this many cells of the line it follows.
const MAX_DEVIATION: f64 = 0.7;
/// The longest a stitch is, in cells along either axis.
const MAX_STITCH_CELLS: i32 = 3;
/// What a stitch costs, against the squared distance it strays and the angle it turns through from the stitch before.
/// The turning is charged in proportion to the angle, so a long gentle curve costs what it must and a zigzag, which turns
/// back and forth along a line that is straight, costs more than the straight stitches it replaces (D272).
const STITCH_COST: f64 = 1.0;
const DEVIATION_COST: f64 = 4.0;
const BEND_COST_PER_RADIAN: f64 = 2.0;
/// A chain is sampled and smoothed at this spacing, in cells.
const SAMPLE_CELLS: f64 = 0.1;
/// Smoothing along a chain, in samples either side (a Gaussian of this standard deviation).
const SMOOTH_SAMPLES: f64 = 2.0;

/// The default sensitivity, 0 to 1.
pub const DEFAULT_SENSITIVITY: f64 = 0.5;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Segment {
    pub x1: i32,
    pub y1: i32,
    pub x2: i32,
    pub y2: i32,
    /// Which of `LineTrace::colors` the stitch is in.
    pub thread: usize,
}

pub struct LineTrace {
    pub segments: Vec<Segment>,
    /// The colour of each thread the lines are stitched in, at most `MAX_LINE_THREADS`.
    pub colors: Vec<Rgb>,
    /// The picture with every traced line painted over by its surroundings.
    pub inpainted: Image,
}

fn gray_of(px: &[u8]) -> f32 {
    if px[3] < 128 {
        // Transparent is absence, never a line (G-050).
        return 255.0;
    }
    0.299 * px[0] as f32 + 0.587 * px[1] as f32 + 0.114 * px[2] as f32
}

/// A box-averaged reduction by an integer factor.
fn reduce(gray: &[f32], w: usize, h: usize, f: usize) -> (Vec<f32>, usize, usize) {
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
fn channel_reduced(
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

/// The share of 8 x 8 blocks of the picture, reduced to at most 512 pixels on its longer side, that are flat: a standard
/// deviation of luminance under 6. A drawing is mostly flat paper and flat fills with lines on them; a photograph is
/// textured nearly everywhere. Measured at a fixed scale, so it does not depend on how many stitches are asked for.
fn flat_share(gray: &[f32], w: usize, h: usize) -> f64 {
    let f = w.max(h).div_ceil(FLATNESS_SCALE_PX).max(1);
    let (g, gw, gh) = reduce(gray, w, h, f);
    let (bw, bh) = (gw / 8, gh / 8);
    if bw == 0 || bh == 0 {
        return 0.0;
    }
    let mut flat = 0usize;
    for by in 0..bh {
        for bx in 0..bw {
            let (mut sum, mut sq) = (0f64, 0f64);
            for y in by * 8..by * 8 + 8 {
                for x in bx * 8..bx * 8 + 8 {
                    let v = g[y * gw + x] as f64;
                    sum += v;
                    sq += v * v;
                }
            }
            let sd = (sq / 64.0 - (sum / 64.0).powi(2)).max(0.0).sqrt();
            flat += (sd < FLAT_SD) as usize;
        }
    }
    flat as f64 / (bw * bh) as f64
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
struct Ridge {
    x: f32,
    y: f32,
    /// The strength: the scale-normalised curvature across the line, in levels of 0 to 255.
    strength: f32,
    /// The unit direction across the line.
    nx: f32,
    ny: f32,
    /// The Gaussian scale it was found at, in analysis pixels.
    sigma: f32,
    /// A dark line (a valley) as against a light one (a ridge).
    dark: bool,
    /// How many times the picture was halved for it.
    level: u8,
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

/// How thresholds follow the sensitivity.
#[derive(Clone, Copy)]
struct Profile {
    /// A chain needs one point at least this strong, and every point at least `low`.
    high: f32,
    low: f32,
    /// The shortest chain kept, in cells.
    min_cells: f64,
}

fn profile(drawing: bool, sensitivity: f64) -> Profile {
    let s = sensitivity;
    if drawing {
        let high = (60.0 - 45.0 * s) as f32;
        Profile {
            high,
            low: 0.45 * high,
            min_cells: (2.5 - s).max(1.2),
        }
    } else {
        // A photograph is full of faint thin structure; only the strong and long survives (D270).
        let high = (80.0 - 55.0 * s) as f32;
        Profile {
            high,
            low: 0.5 * high,
            min_cells: 8.0 - 3.0 * s,
        }
    }
}

/// The ridge points of the picture: for every level of reduction, the best of the three channels and the scales of that
/// level at each pixel, kept where it is at least `low`.
fn find_ridges(
    channels: &[Vec<f32>; 3],
    wa: usize,
    ha: usize,
    stitch_a: f64,
    low: f32,
) -> Vec<Ridge> {
    let sigma_max = (MAX_SCALE_OF_STITCH * stitch_a).max(1.0);
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
fn link_chains(ridges: &[Ridge], high: f32, low: f32) -> Vec<Vec<u32>> {
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

// ---------------------------------------------------------------------------------------------------------------------
// Stitches

/// A polyline resampled at `SAMPLE_CELLS` and smoothed along itself, its two ends kept where they are.
fn smooth_resample(points: &[(f64, f64)]) -> Vec<(f64, f64)> {
    let mut length = vec![0f64];
    for pair in points.windows(2) {
        let d = ((pair[1].0 - pair[0].0).powi(2) + (pair[1].1 - pair[0].1).powi(2)).sqrt();
        length.push(length.last().unwrap() + d);
    }
    let total = *length.last().unwrap();
    let n = (total / SAMPLE_CELLS).round().max(1.0) as usize;
    let mut sampled: Vec<(f64, f64)> = Vec::with_capacity(n + 1);
    let mut k = 0usize;
    for i in 0..=n {
        let at = total * i as f64 / n as f64;
        while k + 2 < length.len() && length[k + 1] < at {
            k += 1;
        }
        let span = (length[k + 1] - length[k]).max(1e-12);
        let t = ((at - length[k]) / span).clamp(0.0, 1.0);
        sampled.push((
            points[k].0 + (points[k + 1].0 - points[k].0) * t,
            points[k].1 + (points[k + 1].1 - points[k].1) * t,
        ));
    }
    let reach = (3.0 * SMOOTH_SAMPLES).ceil() as i64;
    let weights: Vec<f64> = (-reach..=reach)
        .map(|i| (-(i * i) as f64 / (2.0 * SMOOTH_SAMPLES * SMOOTH_SAMPLES)).exp())
        .collect();
    let last = sampled.len() as i64 - 1;
    (0..=last)
        .map(|i| {
            if i == 0 || i == last {
                return sampled[i as usize];
            }
            // Only as far either side as the line goes, so the ends are not pulled in.
            let r = reach.min(i).min(last - i);
            let (mut sx, mut sy, mut sw) = (0.0, 0.0, 0.0);
            for d in -r..=r {
                let w = weights[(d + reach) as usize];
                let p = sampled[(i + d) as usize];
                sx += w * p.0;
                sy += w * p.1;
                sw += w;
            }
            (sx / sw, sy / sw)
        })
        .collect()
}

fn distance_to_segment(p: (f64, f64), a: (i32, i32), b: (i32, i32)) -> f64 {
    let (ax, ay, bx, by) = (a.0 as f64, a.1 as f64, b.0 as f64, b.1 as f64);
    let (dx, dy) = (bx - ax, by - ay);
    let len2 = dx * dx + dy * dy;
    let t = if len2 == 0.0 {
        0.0
    } else {
        (((p.0 - ax) * dx + (p.1 - ay) * dy) / len2).clamp(0.0, 1.0)
    };
    ((p.0 - ax - t * dx).powi(2) + (p.1 - ay - t * dy).powi(2)).sqrt()
}

/// The stitches that follow `curve` best: the corners near it joined by straight stitches that keep within
/// `MAX_DEVIATION` of it, found by dynamic programming over the corners and the stitches between them, so that the
/// fewest, straightest stitches that stay close are the ones chosen. `start` and `end` fix the corners it begins and ends
/// on, where other chains meet this one. Returns the corners in order, or `None` when no such sequence exists.
fn approximate(
    curve: &[(f64, f64)],
    start: Option<(i32, i32)>,
    end: Option<(i32, i32)>,
    bounds: (i32, i32),
) -> Option<Vec<(i32, i32)>> {
    // The corners within reach of the line, each with where along it it is nearest.
    let mut near: HashMap<(i32, i32), (usize, f64)> = HashMap::new();
    for (j, p) in curve.iter().enumerate() {
        for cx in p.0.floor() as i32..=p.0.floor() as i32 + 1 {
            for cy in p.1.floor() as i32..=p.1.floor() as i32 + 1 {
                if cx < 0 || cy < 0 || cx > bounds.0 || cy > bounds.1 {
                    continue;
                }
                let d = ((p.0 - cx as f64).powi(2) + (p.1 - cy as f64).powi(2)).sqrt();
                if d <= NEAR_CORNER {
                    let e = near.entry((cx, cy)).or_insert((j, d));
                    if d < e.1 {
                        *e = (j, d);
                    }
                }
            }
        }
    }
    let last = curve.len() - 1;
    // The corners at the ends of the line, where it may begin and end when they are not fixed.
    let ends_window = (0.7 / SAMPLE_CELLS) as usize;
    let mut corners: Vec<((i32, i32), usize)> = near.iter().map(|(&c, &(j, _))| (c, j)).collect();
    for (fixed, j) in [(start, 0usize), (end, last)] {
        if let Some(c) = fixed {
            if !near.contains_key(&c) {
                corners.push((c, j));
            }
        }
    }
    corners.sort_by_key(|&(c, j)| (j, c));
    let position = |c: (i32, i32)| corners.iter().position(|&(k, _)| k == c);
    let starts: Vec<usize> = match start {
        Some(c) => position(c).into_iter().collect(),
        None => (0..corners.len())
            .filter(|&i| corners[i].1 <= ends_window)
            .collect(),
    };
    let ends: Vec<usize> = match end {
        Some(c) => position(c).into_iter().collect(),
        None => (0..corners.len())
            .filter(|&i| corners[i].1 + ends_window >= last)
            .collect(),
    };
    if starts.is_empty() || ends.is_empty() {
        return None;
    }

    // The stitches: from corner a to a later corner b, within three cells either way, staying close to the line.
    struct Edge {
        from: usize,
        to: usize,
        cost: f64,
        dir: (f64, f64),
    }
    let max_span = (MAX_STITCH_CELLS as f64 * 1.5 / SAMPLE_CELLS) as usize + 2;
    let mut edges: Vec<Edge> = Vec::new();
    let mut out_of: Vec<Vec<usize>> = vec![Vec::new(); corners.len()];
    let mut into: Vec<Vec<usize>> = vec![Vec::new(); corners.len()];
    for a in 0..corners.len() {
        let (ca, ja) = corners[a];
        for b in a + 1..corners.len() {
            let (cb, jb) = corners[b];
            if jb > ja + max_span {
                break;
            }
            let (dx, dy) = (cb.0 - ca.0, cb.1 - ca.1);
            if (dx == 0 && dy == 0) || dx.abs() > MAX_STITCH_CELLS || dy.abs() > MAX_STITCH_CELLS {
                continue;
            }
            let (mut worst, mut sum) = (0f64, 0f64);
            for p in &curve[ja.min(jb)..=ja.max(jb)] {
                let d = distance_to_segment(*p, ca, cb);
                worst = worst.max(d);
                sum += d * d;
            }
            if worst > MAX_DEVIATION {
                continue;
            }
            let len = ((dx * dx + dy * dy) as f64).sqrt();
            edges.push(Edge {
                from: a,
                to: b,
                cost: STITCH_COST + DEVIATION_COST * sum * SAMPLE_CELLS,
                dir: (dx as f64 / len, dy as f64 / len),
            });
            out_of[a].push(edges.len() - 1);
            into[b].push(edges.len() - 1);
        }
    }

    // The best way to arrive along each edge, and the edge before it.
    let mut best = vec![f64::INFINITY; edges.len()];
    let mut before: Vec<Option<usize>> = vec![None; edges.len()];
    for a in 0..corners.len() {
        let is_start = starts.contains(&a);
        for &e in &out_of[a] {
            let mut cost = if is_start {
                edges[e].cost
            } else {
                f64::INFINITY
            };
            let mut from = None;
            for &p in &into[a] {
                if best[p].is_finite() {
                    let dot = (edges[p].dir.0 * edges[e].dir.0 + edges[p].dir.1 * edges[e].dir.1)
                        .clamp(-1.0, 1.0);
                    let c = best[p] + edges[e].cost + BEND_COST_PER_RADIAN * dot.acos();
                    if c < cost {
                        cost = c;
                        from = Some(p);
                    }
                }
            }
            best[e] = cost;
            before[e] = from;
        }
    }
    let finish = (0..edges.len())
        .filter(|&e| ends.contains(&edges[e].to) && best[e].is_finite())
        .min_by(|&x, &y| best[x].partial_cmp(&best[y]).unwrap())?;
    let mut path = vec![corners[edges[finish].to].0];
    let mut e = finish;
    loop {
        path.push(corners[edges[e].from].0);
        match before[e] {
            Some(p) => e = p,
            None => break,
        }
    }
    path.reverse();
    Some(path)
}

/// The corners a line passes when no sequence of stitches stays close enough: the line itself, rounded, a corner each
/// cell or so, joined by stitches of at most three cells.
fn rounded_corners(curve: &[(f64, f64)]) -> Vec<(i32, i32)> {
    let mut out: Vec<(i32, i32)> = Vec::new();
    let step = (1.0 / SAMPLE_CELLS) as usize;
    for (i, p) in curve.iter().enumerate() {
        if i % step == 0 || i + 1 == curve.len() {
            let c = (p.0.round() as i32, p.1.round() as i32);
            if out.last() != Some(&c) {
                out.push(c);
            }
        }
    }
    out
}

/// The stitches between consecutive corners, cut so none is longer than `MAX_STITCH_CELLS` either way.
fn stitches_between(corners: &[(i32, i32)], thread: usize, out: &mut BTreeSet<Segment>) {
    for pair in corners.windows(2) {
        let (a, b) = (pair[0], pair[1]);
        let parts =
            ((b.0 - a.0).abs().max((b.1 - a.1).abs()) + MAX_STITCH_CELLS - 1) / MAX_STITCH_CELLS;
        let parts = parts.max(1);
        let mut prev = a;
        for i in 1..=parts {
            let t = i as f64 / parts as f64;
            let cur = (
                (a.0 as f64 + (b.0 - a.0) as f64 * t).round() as i32,
                (a.1 as f64 + (b.1 - a.1) as f64 * t).round() as i32,
            );
            if cur != prev {
                let (p, q) = if prev <= cur {
                    (prev, cur)
                } else {
                    (cur, prev)
                };
                out.insert(Segment {
                    x1: p.0,
                    y1: p.1,
                    x2: q.0,
                    y2: q.1,
                    thread,
                });
            }
            prev = cur;
        }
    }
}

// ---------------------------------------------------------------------------------------------------------------------

/// A chain in the picture's own pixels and in cells.
struct Line {
    /// Ridge indices in order.
    points: Vec<u32>,
    /// The line in cell coordinates, whole numbers being corners.
    cells: Vec<(f64, f64)>,
    length_cells: f64,
    mean_strength: f32,
    closed: bool,
}

fn find(group: &mut Vec<usize>, i: usize) -> usize {
    if group[i] != i {
        let root = find(group, group[i]);
        group[i] = root;
    }
    group[i]
}

/// Finds the lines of `image`, a picture to be a chart of `gw` by `gh` stitches. `sensitivity` runs 0 (only strong,
/// clear lines) to 1 (faint ones too). A picture that is not mostly flat is a photograph: it is traced only when `photos`
/// is set, and then only for its strongest long lines (D270). `None` when it finds nothing worth tracing.
pub fn trace_lines(
    image: &Image,
    gw: usize,
    gh: usize,
    sensitivity: f64,
    photos: bool,
) -> Option<LineTrace> {
    let (w, h) = (image.width, image.height);
    let stitch_px = (w as f64 / gw as f64).min(h as f64 / gh as f64);
    if stitch_px < MIN_PIXELS_PER_STITCH || w == 0 || h == 0 {
        return None;
    }
    let s = sensitivity.clamp(0.0, 1.0);
    let gray: Vec<f32> = image.data.chunks_exact(4).map(gray_of).collect();
    let flat = flat_share(&gray, w, h);
    drop(gray);
    let drawing = flat >= MIN_FLAT_SHARE;
    if !drawing && !photos {
        return None;
    }
    let profile = profile(drawing, s);

    // The picture the ridges are found in: reduced only as far as a stitch of this many pixels and this many pixels in
    // all call for (D272).
    let f = ((stitch_px / MAX_ANALYSIS_STITCH_PX).ceil())
        .max(((w * h) as f64 / MAX_ANALYSIS_PIXELS).sqrt().ceil())
        .max(1.0) as usize;
    let (c0, wa, ha) = channel_reduced(&image.data, w, h, 0, f);
    let channels = [
        c0,
        channel_reduced(&image.data, w, h, 1, f).0,
        channel_reduced(&image.data, w, h, 2, f).0,
    ];
    let stitch_a = stitch_px / f as f64;
    let ridges = find_ridges(&channels, wa, ha, stitch_a, profile.low);
    drop(channels);
    if ridges.iter().all(|r| r.strength < profile.high) {
        return None;
    }

    // The cell a point of the analysis picture is in: a whole number is a pixel's centre, and the picture spans the chart.
    let to_cell = |x: f32, y: f32| {
        (
            (x as f64 + 0.5) * f as f64 * gw as f64 / w as f64,
            (y as f64 + 0.5) * f as f64 * gh as f64 / h as f64,
        )
    };
    let cell_len =
        |a: (f64, f64), b: (f64, f64)| ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt();

    let mut lines: Vec<Line> = Vec::new();
    for chain in link_chains(&ridges, profile.high, profile.low) {
        let cells: Vec<(f64, f64)> = chain
            .iter()
            .map(|&i| to_cell(ridges[i as usize].x, ridges[i as usize].y))
            .collect();
        let length_cells: f64 = cells.windows(2).map(|p| cell_len(p[0], p[1])).sum();
        if length_cells < profile.min_cells {
            continue;
        }
        let mean_strength = chain
            .iter()
            .map(|&i| ridges[i as usize].strength)
            .sum::<f32>()
            / chain.len() as f32;
        let closed = length_cells > 6.0 && cell_len(cells[0], *cells.last().unwrap()) < 1.2;
        lines.push(Line {
            points: chain,
            cells,
            length_cells,
            mean_strength,
            closed,
        });
    }
    if !drawing {
        // Longest and strongest first, until the budget of line for this many rows is spent.
        lines.sort_by(|a, b| {
            (b.length_cells * b.mean_strength as f64)
                .partial_cmp(&(a.length_cells * a.mean_strength as f64))
                .unwrap()
        });
        let budget = PHOTO_LINE_CELLS_PER_ROW * gh as f64;
        let mut spent = 0.0;
        lines.retain(|l| {
            if spent + l.length_cells > budget {
                return false;
            }
            spent += l.length_cells;
            true
        });
    }
    if lines.is_empty() {
        return None;
    }

    // Where chains meet, one corner: the ends within a cell of each other share the corner they are round.
    let ends: Vec<(usize, bool, (f64, f64))> = lines
        .iter()
        .enumerate()
        .filter(|(_, l)| !l.closed)
        .flat_map(|(i, l)| [(i, true, l.cells[0]), (i, false, *l.cells.last().unwrap())])
        .collect();
    let mut group: Vec<usize> = (0..ends.len()).collect();
    for a in 0..ends.len() {
        for b in a + 1..ends.len() {
            if ends[a].0 != ends[b].0 && cell_len(ends[a].2, ends[b].2) <= 1.0 {
                let (ra, rb) = (find(&mut group, a), find(&mut group, b));
                group[ra] = rb;
            }
        }
    }
    let mut forced: HashMap<(usize, bool), (i32, i32)> = HashMap::new();
    let mut members: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..ends.len() {
        let root = find(&mut group, i);
        members.entry(root).or_default().push(i);
    }
    for list in members.values().filter(|l| l.len() >= 2) {
        let n = list.len() as f64;
        let cx = list.iter().map(|&i| ends[i].2 .0).sum::<f64>() / n;
        let cy = list.iter().map(|&i| ends[i].2 .1).sum::<f64>() / n;
        let corner = (
            (cx.round() as i32).clamp(0, gw as i32),
            (cy.round() as i32).clamp(0, gh as i32),
        );
        for &i in list {
            forced.insert((ends[i].0, ends[i].1), corner);
        }
    }

    // The colour of each line, from the original pixels along it, and the few threads those colours group into.
    let colors: Vec<[f64; 3]> = lines
        .iter()
        .map(|l| line_color(image, &ridges, &l.points, f))
        .collect();
    let mut order: Vec<usize> = (0..lines.len()).collect();
    order.sort_by(|&a, &b| {
        lines[b]
            .length_cells
            .partial_cmp(&lines[a].length_cells)
            .unwrap()
    });
    // (colour sum weighted by length, weight, mean colour) per thread.
    let mut clusters: Vec<([f64; 3], f64, Rgb)> = Vec::new();
    let mut thread_of = vec![0usize; lines.len()];
    for &i in &order {
        let rgb = colors[i].map(|v| v.round().clamp(0.0, 255.0) as u8);
        let lab = rgb_to_oklab(rgb);
        let nearest = clusters
            .iter()
            .enumerate()
            .map(|(k, c)| (k, oklab_distance_sq(&lab, &rgb_to_oklab(c.2))))
            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap());
        let into = match nearest {
            Some((k, d))
                if d <= SAME_LINE_COLOR_DISTANCE.powi(2) || clusters.len() >= MAX_LINE_THREADS =>
            {
                k
            }
            _ => {
                clusters.push(([0.0; 3], 0.0, rgb));
                clusters.len() - 1
            }
        };
        let weight = lines[i].length_cells;
        let c = &mut clusters[into];
        for k in 0..3 {
            c.0[k] += colors[i][k] * weight;
        }
        c.1 += weight;
        c.2 = [0, 1, 2].map(|k| (c.0[k] / c.1).round() as u8);
        thread_of[i] = into;
    }

    // The stitches of each line, the longest first. An end that meets no other end but comes within a cell and a half of a
    // corner an earlier line has used (a stem against a bar) ends on that corner.
    let bounds = (gw as i32, gh as i32);
    let mut steps: BTreeSet<Segment> = BTreeSet::new();
    let mut used_corners: Vec<(i32, i32)> = Vec::new();
    for &i in &order {
        let l = &lines[i];
        let curve = smooth_resample(&l.cells);
        let meeting = |which: bool, at: (f64, f64)| -> Option<(i32, i32)> {
            forced.get(&(i, which)).copied().or_else(|| {
                used_corners
                    .iter()
                    .map(|&c| (c, cell_len(at, (c.0 as f64, c.1 as f64))))
                    .filter(|&(_, d)| d <= 1.5)
                    .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
                    .map(|(c, _)| c)
            })
        };
        let corners = if l.closed {
            // A closed line begins and ends on the same corner, the best of those beside its start.
            let mut best: Option<Vec<(i32, i32)>> = None;
            for cx in curve[0].0.floor() as i32..=curve[0].0.floor() as i32 + 1 {
                for cy in curve[0].1.floor() as i32..=curve[0].1.floor() as i32 + 1 {
                    if let Some(path) = approximate(&curve, Some((cx, cy)), Some((cx, cy)), bounds)
                    {
                        if best.as_ref().is_none_or(|b| path.len() < b.len()) {
                            best = Some(path);
                        }
                    }
                }
            }
            best
        } else {
            approximate(
                &curve,
                meeting(true, l.cells[0]),
                meeting(false, *l.cells.last().unwrap()),
                bounds,
            )
        };
        let corners = corners.unwrap_or_else(|| rounded_corners(&curve));
        used_corners.extend(corners.iter().copied());
        stitches_between(&corners, thread_of[i], &mut steps);
    }
    let mut segments: Vec<Segment> = steps.into_iter().collect();
    // Only the threads that ended up with a stitch, numbered from zero.
    let mut used: Vec<usize> = segments.iter().map(|s| s.thread).collect();
    used.sort_unstable();
    used.dedup();
    for s in &mut segments {
        s.thread = used.iter().position(|&t| t == s.thread).unwrap();
    }
    let thread_colors: Vec<Rgb> = used.iter().map(|&t| clusters[t].2).collect();
    let total_cells: f64 = segments
        .iter()
        .map(|s| (((s.x2 - s.x1).pow(2) + (s.y2 - s.y1).pow(2)) as f64).sqrt())
        .sum();
    if segments.is_empty() || total_cells > MAX_LINE_CELLS_PER_ROW * gh as f64 {
        return None;
    }

    let point_lists: Vec<&[u32]> = lines.iter().map(|l| &l.points[..]).collect();
    Some(LineTrace {
        segments,
        colors: thread_colors,
        inpainted: paint_out(image, &ridges, &point_lists, f),
    })
}

/// The colour of a line, read from the original pixels: along the line, the pixel at its centre or beside it that differs
/// most from the surroundings a little farther out, and the middle value of those over the line. So a line of one pixel
/// in a picture reduced for the search is not paled by the reduction.
fn line_color(image: &Image, ridges: &[Ridge], points: &[u32], f: usize) -> [f64; 3] {
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

/// `image` with every pixel of the lines painted over by their surroundings: a disc along each line, as wide as the line
/// is at that point and a little more, then filled in from the pixels beside it.
fn paint_out(image: &Image, ridges: &[Ridge], lines: &[&[u32]], f: usize) -> Image {
    let (w, h) = (image.width, image.height);
    let mut painted = vec![false; w * h];
    for points in lines {
        for pair in points.windows(2) {
            let (a, b) = (&ridges[pair[0] as usize], &ridges[pair[1] as usize]);
            let (ax, ay) = (
                (a.x as f64 + 0.5) * f as f64 - 0.5,
                (a.y as f64 + 0.5) * f as f64 - 0.5,
            );
            let (bx, by) = (
                (b.x as f64 + 0.5) * f as f64 - 0.5,
                (b.y as f64 + 0.5) * f as f64 - 0.5,
            );
            let steps = (bx - ax).hypot(by - ay).ceil().max(1.0) as usize;
            for k in 0..=steps {
                let t = k as f64 / steps as f64;
                let (x, y) = (ax + (bx - ax) * t, ay + (by - ay) * t);
                let sigma = a.sigma as f64 * (1.0 - t) + b.sigma as f64 * t;
                let radius = 1.6 * sigma * f as f64 + 1.0;
                let reach = radius.ceil() as i64;
                for dy in -reach..=reach {
                    for dx in -reach..=reach {
                        let (px, py) = (
                            (x + dx as f64).round() as i64,
                            (y + dy as f64).round() as i64,
                        );
                        if px >= 0
                            && py >= 0
                            && (px as usize) < w
                            && (py as usize) < h
                            && ((px as f64 - x).powi(2) + (py as f64 - y).powi(2))
                                <= radius * radius
                        {
                            painted[py as usize * w + px as usize] = true;
                        }
                    }
                }
            }
        }
    }
    let mut data = image.data.clone();
    let mut pending: Vec<usize> = (0..w * h).filter(|&i| painted[i]).collect();
    let mut known: Vec<bool> = painted.iter().map(|&p| !p).collect();
    let mut round = 0;
    while !pending.is_empty() && round < 64 {
        round += 1;
        let mut filled: Vec<(usize, [u8; 3])> = Vec::new();
        let mut rest: Vec<usize> = Vec::new();
        for &i in &pending {
            let (x, y) = ((i % w) as i64, (i / w) as i64);
            let (mut sum, mut n) = ([0u32; 3], 0u32);
            for dy in -1i64..=1 {
                for dx in -1i64..=1 {
                    let (nx, ny) = (x + dx, y + dy);
                    if (dx != 0 || dy != 0)
                        && nx >= 0
                        && ny >= 0
                        && (nx as usize) < w
                        && (ny as usize) < h
                    {
                        let j = ny as usize * w + nx as usize;
                        if known[j] && image.data[j * 4 + 3] >= 128 {
                            for k in 0..3 {
                                sum[k] += data[j * 4 + k] as u32;
                            }
                            n += 1;
                        }
                    }
                }
            }
            if n > 0 {
                filled.push((i, [0, 1, 2].map(|k| (sum[k] / n) as u8)));
            } else {
                rest.push(i);
            }
        }
        for (i, c) in filled {
            data[i * 4..i * 4 + 3].copy_from_slice(&c);
            known[i] = true;
        }
        pending = rest;
    }
    Image {
        width: w,
        height: h,
        data,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A white picture of `gw` x `gh` stitches at `px` pixels each, with `draw` marking black pixels.
    fn picture(gw: usize, gh: usize, px: usize, draw: impl Fn(usize, usize) -> bool) -> Image {
        let (w, h) = (gw * px, gh * px);
        let mut data = vec![255u8; w * h * 4];
        for y in 0..h {
            for x in 0..w {
                if draw(x, y) {
                    data[(y * w + x) * 4..(y * w + x) * 4 + 3].fill(0);
                }
            }
        }
        Image {
            width: w,
            height: h,
            data,
        }
    }

    /// A picture of `gw` x `gh` stitches at `px` pixels each on `ground`, with `ink` giving the colour of a line pixel.
    fn inked(
        gw: usize,
        gh: usize,
        px: usize,
        ground: [u8; 3],
        ink: impl Fn(usize, usize) -> Option<[u8; 3]>,
    ) -> Image {
        let (w, h) = (gw * px, gh * px);
        let mut data = vec![255u8; w * h * 4];
        for y in 0..h {
            for x in 0..w {
                let c = ink(x, y).unwrap_or(ground);
                data[(y * w + x) * 4..(y * w + x) * 4 + 3].copy_from_slice(&c);
            }
        }
        Image {
            width: w,
            height: h,
            data,
        }
    }

    fn row_line(y: usize, x: std::ops::Range<usize>) -> impl Fn(usize, usize) -> bool {
        move |px, py| (y - 1..y + 1).contains(&py) && x.contains(&px)
    }

    fn length(segments: &[Segment]) -> f64 {
        segments
            .iter()
            .map(|s| (((s.x2 - s.x1).pow(2) + (s.y2 - s.y1).pow(2)) as f64).sqrt())
            .sum()
    }

    #[test]
    fn a_thin_horizontal_line_becomes_stitches_along_it_and_is_painted_out() {
        // 30 x 30 stitches of 10 px; a 2 px line along y = 150 (corner row 15) from x = 50 to 250.
        let img = picture(30, 30, 10, |x, y| {
            (149..151).contains(&y) && (50..250).contains(&x)
        });
        let trace = trace_lines(&img, 30, 30, DEFAULT_SENSITIVITY, false).expect("a line");
        assert!(!trace.segments.is_empty());
        for s in &trace.segments {
            assert_eq!((s.y1, s.y2), (15, 15), "{s:?}");
            assert!(s.x1 >= 4 && s.x2 <= 26, "{s:?}");
        }
        let total = length(&trace.segments);
        assert!((18.0..=21.0).contains(&total), "length {total}");
        assert!(trace.colors[0].iter().all(|&c| c < 40));
        // Nothing dark is left in the picture.
        assert!(trace.inpainted.data.chunks_exact(4).all(|p| p[0] > 200));
    }

    #[test]
    fn a_diagonal_line_is_traced_by_diagonal_steps() {
        let img = picture(30, 30, 10, |x, y| {
            (x as i32 - y as i32).abs() <= 1 && x > 40 && x < 260
        });
        let trace = trace_lines(&img, 30, 30, DEFAULT_SENSITIVITY, false).expect("a line");
        assert!(
            trace.segments.iter().all(|s| s.x2 - s.x1 == s.y2 - s.y1),
            "{:?}",
            trace.segments
        );
        assert!(trace
            .segments
            .iter()
            .all(|s| s.x2 - s.x1 <= MAX_STITCH_CELLS));
    }

    #[test]
    fn a_straight_slanted_line_is_a_few_straight_stitches_and_follows_the_line_closely() {
        let img = picture(40, 40, 10, |x, y| {
            ((y as f64 - 200.0) - (x as f64 - 50.0) * 0.5774).abs() < 1.2 && (50..350).contains(&x)
        });
        let trace = trace_lines(&img, 40, 40, DEFAULT_SENSITIVITY, false).expect("a line");
        let mut degree = std::collections::HashMap::new();
        for s in &trace.segments {
            *degree.entry((s.x1, s.y1)).or_insert(0) += 1;
            *degree.entry((s.x2, s.y2)).or_insert(0) += 1;
        }
        assert!(
            degree.values().all(|&d| d <= 2),
            "a corner with three stitches: {:?}",
            trace.segments
        );
        // The line is 30 stitches across and 17.3 down, 34.6 long, and the stitches are about as long.
        let total = length(&trace.segments);
        assert!((33.0..38.0).contains(&total), "length {total}");
        // Every end is within the tolerance of the true line: y = 20 + (x - 5) * 0.5774 in cells.
        for s in &trace.segments {
            for (x, y) in [(s.x1, s.y1), (s.x2, s.y2)] {
                let off = (y as f64 - (20.0 + (x as f64 - 5.0) * 0.5774)).abs()
                    / (1.0f64 + 0.5774f64.powi(2)).sqrt();
                assert!(off <= 0.75, "corner ({x}, {y}) is {off} from the line");
            }
        }
        // Few stitches, not a staircase of unit steps.
        assert!(
            trace.segments.len() <= 16,
            "{} stitches",
            trace.segments.len()
        );
    }

    #[test]
    fn a_filled_area_is_not_a_line() {
        let img = picture(30, 30, 10, |x, y| {
            (60..200).contains(&x) && (60..200).contains(&y)
        });
        assert!(trace_lines(&img, 30, 30, DEFAULT_SENSITIVITY, false).is_none());
    }

    #[test]
    fn an_empty_or_tiny_picture_has_no_lines() {
        let blank = picture(30, 30, 10, |_, _| false);
        assert!(trace_lines(&blank, 30, 30, 1.0, false).is_none());
        let one_px_per_stitch = picture(30, 30, 1, |x, _| x == 5);
        assert!(trace_lines(&one_px_per_stitch, 30, 30, 1.0, false).is_none());
    }

    #[test]
    fn a_circle_is_traced_closed_and_round() {
        let img = picture(30, 30, 10, |x, y| {
            ((x as i32 - 150).pow(2) + (y as i32 - 150).pow(2) - 100 * 100).abs() < 400
        });
        let a = trace_lines(&img, 30, 30, 0.6, false).expect("a circle");
        let b = trace_lines(&img, 30, 30, 0.6, false).expect("a circle");
        assert_eq!(a.segments, b.segments, "the same picture, the same lines");
        // Radius 10 stitches: every corner within 0.9 of the circle, and the whole way round.
        for s in &a.segments {
            for (x, y) in [(s.x1, s.y1), (s.x2, s.y2)] {
                let r = ((x as f64 - 15.0).powi(2) + (y as f64 - 15.0).powi(2)).sqrt();
                assert!((r - 10.0).abs() < 0.9, "corner ({x}, {y}) at radius {r}");
            }
        }
        assert!(
            (50.0..70.0).contains(&length(&a.segments)),
            "{}",
            length(&a.segments)
        );
    }

    #[test]
    fn a_light_line_on_a_dark_ground_is_traced_and_painted_out() {
        let line = row_line(150, 50..250);
        let img = inked(30, 30, 10, [20, 30, 90], |x, y| {
            line(x, y).then_some([245, 245, 235])
        });
        let trace = trace_lines(&img, 30, 30, DEFAULT_SENSITIVITY, false).expect("a light line");
        assert_eq!(trace.colors.len(), 1);
        assert!(
            trace.colors[0].iter().all(|&c| c > 200),
            "{:?}",
            trace.colors
        );
        assert!(trace.segments.iter().all(|s| s.y1 == 15 && s.y2 == 15));
        assert!(trace.inpainted.data.chunks_exact(4).all(|p| p[0] < 60));
    }

    #[test]
    fn a_coloured_line_as_bright_as_its_ground_is_traced_in_its_own_colour() {
        // Red on green of the same luminance: brightness alone cannot tell them apart.
        let line = row_line(150, 50..250);
        let img = inked(30, 30, 10, [0, 150, 0], |x, y| {
            line(x, y).then_some([255, 0, 0])
        });
        let luma = |c: [u8; 3]| 0.299 * c[0] as f64 + 0.587 * c[1] as f64 + 0.114 * c[2] as f64;
        assert!((luma([0, 150, 0]) - luma([255, 0, 0])).abs() < 15.0);
        let trace = trace_lines(&img, 30, 30, DEFAULT_SENSITIVITY, false).expect("a red line");
        assert!(
            trace.colors[0][0] > 230 && trace.colors[0][1] < 30,
            "{:?}",
            trace.colors
        );
        assert!(trace.segments.iter().all(|s| s.y1 == 15 && s.y2 == 15));
    }

    #[test]
    fn a_thin_line_in_a_large_picture_keeps_its_colour() {
        // 20 x 20 stitches of 40 px, so the picture is reduced to look for the line, and a 2 px black line on white
        // must still read black and not grey.
        let line = row_line(400, 100..700);
        let img = picture(20, 20, 40, |x, y| line(x, y));
        let trace = trace_lines(&img, 20, 20, DEFAULT_SENSITIVITY, false).expect("a line");
        assert!(
            trace.colors[0].iter().all(|&c| c < 25),
            "{:?}",
            trace.colors
        );
        assert!(
            trace.segments.iter().all(|s| s.y1 == 10 && s.y2 == 10),
            "{:?}",
            trace.segments
        );
    }

    #[test]
    fn lines_of_two_colours_are_two_threads_and_of_one_colour_one() {
        let black = row_line(100, 40..260);
        let white = row_line(200, 40..260);
        let img = inked(30, 30, 10, [230, 140, 50], |x, y| {
            if black(x, y) {
                Some([10, 10, 10])
            } else if white(x, y) {
                Some([250, 250, 250])
            } else {
                None
            }
        });
        let trace = trace_lines(&img, 30, 30, DEFAULT_SENSITIVITY, false).expect("two lines");
        assert_eq!(trace.colors.len(), 2, "{:?}", trace.colors);
        let on_row = |row: i32| {
            trace
                .segments
                .iter()
                .filter(|s| s.y1 == row)
                .map(|s| s.thread)
                .collect::<std::collections::BTreeSet<_>>()
        };
        assert_eq!(on_row(10).len(), 1);
        assert_eq!(on_row(20).len(), 1);
        assert_ne!(on_row(10), on_row(20));

        let two_blacks = row_line(100, 40..260);
        let also_black = row_line(200, 40..260);
        let img = inked(30, 30, 10, [230, 140, 50], |x, y| {
            (two_blacks(x, y) || also_black(x, y)).then_some([10, 10, 10])
        });
        assert_eq!(
            trace_lines(&img, 30, 30, DEFAULT_SENSITIVITY, false)
                .unwrap()
                .colors
                .len(),
            1
        );
    }

    #[test]
    fn lines_that_meet_share_a_corner() {
        // A T: a bar across and a stem down to it.
        let img = picture(30, 30, 10, |x, y| {
            ((149..151).contains(&y) && (50..250).contains(&x))
                || ((149..151).contains(&x) && (150..260).contains(&y))
        });
        let trace = trace_lines(&img, 30, 30, DEFAULT_SENSITIVITY, false).expect("a T");
        let mut degree = std::collections::HashMap::new();
        for s in &trace.segments {
            *degree.entry((s.x1, s.y1)).or_insert(0) += 1;
            *degree.entry((s.x2, s.y2)).or_insert(0) += 1;
        }
        let junction = degree.iter().filter(|(_, &d)| d >= 3).count();
        assert!(
            junction >= 1,
            "no corner where the lines meet: {:?}",
            trace.segments
        );
    }
}
