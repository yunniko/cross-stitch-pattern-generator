//! G-084: backstitch traced from the lines of a picture.
//!
//! A drawing's outline is thinner than a stitch, so downsampled it becomes a row of grey stitches that are neither the
//! line nor the colour beside it. This stage finds those thin dark lines in the source picture, turns them into
//! backstitch segments between grid corners, and hands back the picture with the lines painted over by their
//! surroundings, so the cross stitches under a line take the surrounding colour (Owner, 2026-10-02).
//!
//! A line is a dark feature narrower than about one stitch: the black top-hat of the luminance (its closing minus
//! itself) with a window of one stitch. Wider dark areas are left to the stitches. The mask is thinned to a skeleton on
//! a grid four times finer than the stitches, walked into paths, simplified, snapped to the corner grid by king moves
//! and merged into short straight stitches.

use crate::color::Rgb;
use crate::Image;
use std::collections::{BTreeMap, BTreeSet};

/// Sub-cells per stitch along each axis, the resolution the skeleton is made at.
const SUBCELLS: usize = 4;
/// The longest straight run merged into one backstitch, in cells. A backstitch is a short stitch (D267).
const MAX_RUN: i32 = 3;
/// Below this many source pixels per stitch there is no sub-stitch line to find.
const MIN_PIXELS_PER_STITCH: f64 = 3.0;
/// The analysis picture is reduced until a stitch is no more than this many pixels across.
const MAX_ANALYSIS_STITCH_PX: f64 = 10.0;
/// A path simplifies to within this many cells of itself.
const SIMPLIFY_CELLS: f64 = 0.8;
/// A path is averaged over this many points either side before it is simplified, to take the pixel stair out of it.
const SMOOTH_POINTS: usize = 3;

/// The picture the flatness is measured on is reduced to at most this many pixels on its longer side.
const FLATNESS_SCALE_PX: usize = 512;
/// A block is flat below this standard deviation of luminance (0 to 255).
const FLAT_SD: f64 = 6.0;
/// A picture is a drawing, and worth tracing, when at least this share of it is flat.
const MIN_FLAT_SHARE: f64 = 0.55;
/// More line than this per row of stitches is not a drawing's lines, whatever the picture is.
const MAX_LINE_CELLS_PER_ROW: f64 = 25.0;

/// The default sensitivity, 0 to 1.
pub const DEFAULT_SENSITIVITY: f64 = 0.5;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Segment {
    pub x1: i32,
    pub y1: i32,
    pub x2: i32,
    pub y2: i32,
}

pub struct LineTrace {
    pub segments: Vec<Segment>,
    /// The colour of the lines, the mean of the darker half of their pixels.
    pub color: Rgb,
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

/// The maximum (or minimum) over a square window of radius `r`, separably.
fn window_extreme(src: &[f32], w: usize, h: usize, r: usize, max: bool) -> Vec<f32> {
    let pick = |a: f32, b: f32| if max { a.max(b) } else { a.min(b) };
    let start = if max { f32::MIN } else { f32::MAX };
    let mut tmp = vec![0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let mut v = start;
            for xx in x.saturating_sub(r)..=(x + r).min(w - 1) {
                v = pick(v, src[y * w + xx]);
            }
            tmp[y * w + x] = v;
        }
    }
    let mut out = vec![0f32; w * h];
    for y in 0..h {
        for x in 0..w {
            let mut v = start;
            for yy in y.saturating_sub(r)..=(y + r).min(h - 1) {
                v = pick(v, tmp[yy * w + x]);
            }
            out[y * w + x] = v;
        }
    }
    out
}

const NEIGHBOURS: [(i32, i32); 8] = [
    (1, 0),
    (0, 1),
    (-1, 0),
    (0, -1),
    (1, 1),
    (-1, 1),
    (-1, -1),
    (1, -1),
];

fn at(mask: &[bool], w: usize, h: usize, x: i32, y: i32) -> bool {
    x >= 0 && y >= 0 && (x as usize) < w && (y as usize) < h && mask[y as usize * w + x as usize]
}

/// Zhang and Suen's thinning to a one-pixel skeleton.
fn thin(mask: &mut [bool], w: usize, h: usize) {
    let mut remove: Vec<usize> = Vec::new();
    loop {
        let mut changed = false;
        for pass in 0..2 {
            remove.clear();
            for y in 0..h as i32 {
                for x in 0..w as i32 {
                    if !at(mask, w, h, x, y) {
                        continue;
                    }
                    // P2..P9 clockwise from the pixel above.
                    let p = [
                        at(mask, w, h, x, y - 1),
                        at(mask, w, h, x + 1, y - 1),
                        at(mask, w, h, x + 1, y),
                        at(mask, w, h, x + 1, y + 1),
                        at(mask, w, h, x, y + 1),
                        at(mask, w, h, x - 1, y + 1),
                        at(mask, w, h, x - 1, y),
                        at(mask, w, h, x - 1, y - 1),
                    ];
                    let b = p.iter().filter(|&&v| v).count();
                    if !(2..=6).contains(&b) {
                        continue;
                    }
                    let a = (0..8).filter(|&i| !p[i] && p[(i + 1) % 8]).count();
                    if a != 1 {
                        continue;
                    }
                    let (c1, c2) = if pass == 0 {
                        (p[0] && p[2] && p[4], p[2] && p[4] && p[6])
                    } else {
                        (p[0] && p[2] && p[6], p[0] && p[4] && p[6])
                    };
                    if c1 || c2 {
                        continue;
                    }
                    remove.push(y as usize * w + x as usize);
                }
            }
            for &i in &remove {
                mask[i] = false;
            }
            changed |= !remove.is_empty();
        }
        if !changed {
            break;
        }
    }
}

/// 8-connected components: a label per pixel (0 for none) and the pixel count of each label.
fn components(mask: &[bool], w: usize, h: usize) -> (Vec<u32>, Vec<usize>) {
    let mut label = vec![0u32; w * h];
    let mut sizes = vec![0usize];
    let mut stack: Vec<usize> = Vec::new();
    for start in 0..w * h {
        if !mask[start] || label[start] != 0 {
            continue;
        }
        let id = sizes.len() as u32;
        sizes.push(0);
        label[start] = id;
        stack.push(start);
        while let Some(i) = stack.pop() {
            sizes[id as usize] += 1;
            let (x, y) = ((i % w) as i32, (i / w) as i32);
            for (dx, dy) in NEIGHBOURS {
                let (nx, ny) = (x + dx, y + dy);
                if at(mask, w, h, nx, ny) {
                    let n = ny as usize * w + nx as usize;
                    if label[n] == 0 {
                        label[n] = id;
                        stack.push(n);
                    }
                }
            }
        }
    }
    (label, sizes)
}

/// Removes the pixel at the inside of every corner of a one-pixel line, so each stretch is a single chain of pixels
/// that a walk follows once instead of leaving fragments beside it.
fn straighten_corners(skeleton: &mut [bool], w: usize, h: usize) {
    loop {
        let mut changed = false;
        for y in 0..h as i32 {
            for x in 0..w as i32 {
                if !at(skeleton, w, h, x, y) {
                    continue;
                }
                let around: Vec<(i32, i32)> = NEIGHBOURS
                    .iter()
                    .map(|(dx, dy)| (x + dx, y + dy))
                    .filter(|&(nx, ny)| at(skeleton, w, h, nx, ny))
                    .collect();
                if around.len() == 2
                    && (around[0].0 - around[1].0).abs() <= 1
                    && (around[0].1 - around[1].1).abs() <= 1
                {
                    skeleton[y as usize * w + x as usize] = false;
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
}

/// Walks a skeleton into paths of pixel coordinates; every skeleton pixel is on one.
fn walk_paths(skeleton: &[bool], w: usize, h: usize) -> Vec<Vec<(i32, i32)>> {
    let degree = |x: i32, y: i32| {
        NEIGHBOURS
            .iter()
            .filter(|(dx, dy)| at(skeleton, w, h, x + dx, y + dy))
            .count()
    };
    let mut visited = vec![false; w * h];
    let mut paths = Vec::new();
    let mut starts: Vec<(i32, i32)> = Vec::new();
    for pass in 0..2 {
        starts.clear();
        for y in 0..h as i32 {
            for x in 0..w as i32 {
                if at(skeleton, w, h, x, y) && (pass == 1 || degree(x, y) == 1) {
                    starts.push((x, y));
                }
            }
        }
        for &(sx, sy) in &starts {
            if visited[sy as usize * w + sx as usize] {
                continue;
            }
            visited[sy as usize * w + sx as usize] = true;
            let extend = |from: (i32, i32), visited: &mut Vec<bool>| {
                let mut path = Vec::new();
                let mut cur = from;
                let mut heading: Option<(i32, i32)> = None;
                loop {
                    let mut best: Option<((i32, i32), i32)> = None;
                    for (dx, dy) in NEIGHBOURS {
                        let (nx, ny) = (cur.0 + dx, cur.1 + dy);
                        if !at(skeleton, w, h, nx, ny) || visited[ny as usize * w + nx as usize] {
                            continue;
                        }
                        // Keep going the way the path was heading; 4-neighbours before diagonals.
                        let turn = match heading {
                            Some((hx, hy)) => (hx - dx).abs() + (hy - dy).abs(),
                            None => 0,
                        };
                        let cost = turn * 2 + (dx != 0 && dy != 0) as i32;
                        if best.is_none_or(|(_, c)| cost < c) {
                            best = Some(((nx, ny), cost));
                        }
                    }
                    let Some(((nx, ny), _)) = best else { break };
                    visited[ny as usize * w + nx as usize] = true;
                    heading = Some((nx - cur.0, ny - cur.1));
                    cur = (nx, ny);
                    path.push(cur);
                }
                path
            };
            let forward = extend((sx, sy), &mut visited);
            let mut backward = extend((sx, sy), &mut visited);
            backward.reverse();
            let mut path = backward;
            path.push((sx, sy));
            path.extend(forward);
            // A branch ends on the pixel of the path it leaves, so the two meet.
            for end in [0, path.len() - 1] {
                let (ex, ey) = path[end];
                let joined = NEIGHBOURS.iter().find_map(|(dx, dy)| {
                    let (nx, ny) = (ex + dx, ey + dy);
                    (at(skeleton, w, h, nx, ny) && !path.contains(&(nx, ny))).then_some((nx, ny))
                });
                if let Some(p) = joined {
                    if end == 0 {
                        path.insert(0, p);
                    } else {
                        path.push(p);
                    }
                }
            }
            if path.len() >= 3 {
                paths.push(path);
            }
        }
    }
    paths
}

/// Douglas and Peucker.
fn simplify(points: &[(f64, f64)], eps: f64) -> Vec<(f64, f64)> {
    if points.len() < 3 {
        return points.to_vec();
    }
    let (a, b) = (points[0], points[points.len() - 1]);
    let (dx, dy) = (b.0 - a.0, b.1 - a.1);
    let len = (dx * dx + dy * dy).sqrt();
    let (mut far, mut far_d) = (0usize, 0f64);
    for (i, p) in points.iter().enumerate().take(points.len() - 1).skip(1) {
        let d = if len == 0.0 {
            ((p.0 - a.0).powi(2) + (p.1 - a.1).powi(2)).sqrt()
        } else {
            ((p.0 - a.0) * dy - (p.1 - a.1) * dx).abs() / len
        };
        if d > far_d {
            far = i;
            far_d = d;
        }
    }
    if far_d <= eps {
        return vec![a, b];
    }
    let mut left = simplify(&points[..=far], eps);
    let right = simplify(&points[far..], eps);
    left.pop();
    left.extend(right);
    left
}

/// The corner steps between two corners, kept within half a cell of the straight line between them.
fn king_walk(a: (i32, i32), b: (i32, i32), steps: &mut BTreeSet<Segment>) {
    let n = (b.0 - a.0).abs().max((b.1 - a.1).abs());
    let mut prev = a;
    for i in 1..=n {
        let t = i as f64 / n as f64;
        let x = (a.0 as f64 + (b.0 - a.0) as f64 * t).round() as i32;
        let y = (a.1 as f64 + (b.1 - a.1) as f64 * t).round() as i32;
        let cur = (x, y);
        if cur != prev {
            let (p, q) = if (prev.0, prev.1) < (cur.0, cur.1) {
                (prev, cur)
            } else {
                (cur, prev)
            };
            steps.insert(Segment {
                x1: p.0,
                y1: p.1,
                x2: q.0,
                y2: q.1,
            });
        }
        prev = cur;
    }
}

/// Unit steps merged into straight stitches of at most `MAX_RUN` cells.
fn merge_runs(steps: &BTreeSet<Segment>) -> Vec<Segment> {
    // Direction class, the line a step lies on, and its position along that line.
    let mut lines: BTreeMap<(u8, i32), Vec<Segment>> = BTreeMap::new();
    for s in steps {
        let (dx, dy) = (s.x2 - s.x1, s.y2 - s.y1);
        let key = match (dx, dy) {
            (1, 0) => (0, s.y1),
            (0, 1) => (1, s.x1),
            (1, 1) => (2, s.x1 - s.y1),
            _ => (3, s.x1 + s.y1),
        };
        lines.entry(key).or_default().push(*s);
    }
    let mut out = Vec::new();
    for (_, mut list) in lines {
        list.sort_by_key(|s| (s.x1, s.y1));
        let mut run: Option<(Segment, i32)> = None;
        for s in list {
            run = match run {
                Some((r, n)) if r.x2 == s.x1 && r.y2 == s.y1 && n < MAX_RUN => Some((
                    Segment {
                        x2: s.x2,
                        y2: s.y2,
                        ..r
                    },
                    n + 1,
                )),
                Some((r, _)) => {
                    out.push(r);
                    Some((s, 1))
                }
                None => Some((s, 1)),
            };
        }
        if let Some((r, _)) = run {
            out.push(r);
        }
    }
    out
}

/// Finds the lines of `image`, a picture to be a chart of `gw` by `gh` stitches. `sensitivity` runs 0 (only strong,
/// clear lines) to 1 (faint ones too). `None` when it finds nothing worth tracing.
pub fn trace_lines(image: &Image, gw: usize, gh: usize, sensitivity: f64) -> Option<LineTrace> {
    let (w, h) = (image.width, image.height);
    let stitch_px = (w as f64 / gw as f64).min(h as f64 / gh as f64);
    if stitch_px < MIN_PIXELS_PER_STITCH || w == 0 || h == 0 {
        return None;
    }
    let s = sensitivity.clamp(0.0, 1.0);
    let gray: Vec<f32> = image.data.chunks_exact(4).map(gray_of).collect();
    let flat = flat_share(&gray, w, h);
    if flat < MIN_FLAT_SHARE {
        return None;
    }
    let f = (stitch_px / MAX_ANALYSIS_STITCH_PX).ceil().max(1.0) as usize;
    let (small, wa, ha) = reduce(&gray, w, h, f);
    drop(gray);
    let r = ((stitch_px / f as f64) * 0.5).round().clamp(1.0, 6.0) as usize;
    let closed = window_extreme(&window_extreme(&small, wa, ha, r, true), wa, ha, r, false);
    let threshold = (100.0 - 80.0 * s) as f32;
    let on: Vec<bool> = closed
        .iter()
        .zip(&small)
        .map(|(c, g)| c - g > threshold)
        .collect();
    if !on.iter().any(|&v| v) {
        return None;
    }

    // The mask on the sub-stitch grid.
    let (sw, sh) = (gw * SUBCELLS, gh * SUBCELLS);
    let mut sub = vec![false; sw * sh];
    for y in 0..ha {
        for x in 0..wa {
            if on[y * wa + x] {
                let (sx, sy) = ((x * sw / wa).min(sw - 1), (y * sh / ha).min(sh - 1));
                sub[sy * sw + sx] = true;
            }
        }
    }
    let (label, sizes) = components(&sub, sw, sh);
    let mut skeleton = sub.clone();
    thin(&mut skeleton, sw, sh);
    let mut skeleton_len = vec![0usize; sizes.len()];
    for i in 0..sw * sh {
        if skeleton[i] {
            skeleton_len[label[i] as usize] += 1;
        }
    }
    // A component is a line when its skeleton is long enough and it is thin all along: a short speck is noise and a
    // thick blob is a filled area, which the stitches already show.
    let min_len = (2.5 - s) * SUBCELLS as f64;
    let kept: Vec<bool> = (0..sizes.len())
        .map(|id| {
            id != 0
                && skeleton_len[id] as f64 >= min_len
                && (sizes[id] as f64 / skeleton_len[id] as f64) <= SUBCELLS as f64 * 1.6
        })
        .collect();
    if !kept.iter().any(|&k| k) {
        return None;
    }
    for i in 0..sw * sh {
        if skeleton[i] && !kept[label[i] as usize] {
            skeleton[i] = false;
        }
    }

    let mut steps: BTreeSet<Segment> = BTreeSet::new();
    straighten_corners(&mut skeleton, sw, sh);
    let paths = walk_paths(&skeleton, sw, sh);
    // A thick stroke leaves short crumbs of skeleton beside its main path; a path under two stitches long is kept only
    // when it is the longest its component has, as a short dash is.
    let component_of =
        |path: &Vec<(i32, i32)>| label[path[0].1 as usize * sw + path[0].0 as usize] as usize;
    let mut longest = vec![0usize; sizes.len()];
    for path in &paths {
        let c = component_of(path);
        longest[c] = longest[c].max(path.len());
    }
    for path in paths
        .iter()
        .filter(|p| p.len() >= 2 * SUBCELLS || p.len() == longest[component_of(p)])
    {
        let points: Vec<(f64, f64)> = path
            .iter()
            .map(|&(x, y)| {
                (
                    (x as f64 + 0.5) / SUBCELLS as f64,
                    (y as f64 + 0.5) / SUBCELLS as f64,
                )
            })
            .collect();
        let smooth: Vec<(f64, f64)> = (0..points.len())
            .map(|i| {
                if i == 0 || i + 1 == points.len() {
                    return points[i];
                }
                let reach = SMOOTH_POINTS.min(i).min(points.len() - 1 - i);
                let window = &points[i - reach..=i + reach];
                let n = window.len() as f64;
                (
                    window.iter().map(|p| p.0).sum::<f64>() / n,
                    window.iter().map(|p| p.1).sum::<f64>() / n,
                )
            })
            .collect();
        let corners: Vec<(i32, i32)> = simplify(&smooth, SIMPLIFY_CELLS)
            .iter()
            .map(|&(x, y)| {
                (
                    (x.round() as i32).clamp(0, gw as i32),
                    (y.round() as i32).clamp(0, gh as i32),
                )
            })
            .collect();
        for pair in corners.windows(2) {
            king_walk(pair[0], pair[1], &mut steps);
        }
    }
    let segments = merge_runs(&steps);
    let total_cells: f64 = segments
        .iter()
        .map(|s| (((s.x2 - s.x1).pow(2) + (s.y2 - s.y1).pow(2)) as f64).sqrt())
        .sum();
    if segments.is_empty() || total_cells > MAX_LINE_CELLS_PER_ROW * gh as f64 {
        return None;
    }

    // The painted-over picture and the line colour, from the full-resolution pixels of the kept lines.
    let mut line_pixel = vec![false; w * h];
    for y in 0..h {
        for x in 0..w {
            let (ax, ay) = ((x / f).min(wa - 1), (y / f).min(ha - 1));
            if on[ay * wa + ax] {
                let (sx, sy) = ((ax * sw / wa).min(sw - 1), (ay * sh / ha).min(sh - 1));
                line_pixel[y * w + x] = kept[label[sy * sw + sx] as usize];
            }
        }
    }
    // Anti-aliased edges stay darker than the paper without a margin.
    let mut painted = line_pixel.clone();
    for y in 0..h as i32 {
        for x in 0..w as i32 {
            if !line_pixel[y as usize * w + x as usize]
                && NEIGHBOURS
                    .iter()
                    .any(|(dx, dy)| at(&line_pixel, w, h, x + dx, y + dy))
            {
                painted[y as usize * w + x as usize] = true;
            }
        }
    }
    let mut darkest: Vec<(f32, [u8; 3])> = (0..w * h)
        .filter(|&i| line_pixel[i])
        .map(|i| {
            let px = &image.data[i * 4..i * 4 + 4];
            (gray_of(px), [px[0], px[1], px[2]])
        })
        .collect();
    darkest.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
    let half = &darkest[..darkest.len().div_ceil(2).max(1)];
    let mut sum = [0u64; 3];
    for (_, c) in half {
        for k in 0..3 {
            sum[k] += c[k] as u64;
        }
    }
    let color = [0, 1, 2].map(|k| (sum[k] / half.len() as u64) as u8);

    let mut data = image.data.clone();
    let mut pending: Vec<usize> = (0..w * h).filter(|&i| painted[i]).collect();
    let mut known: Vec<bool> = painted.iter().map(|&p| !p).collect();
    for _ in 0..(2 * r * f + 6) {
        if pending.is_empty() {
            break;
        }
        let mut filled: Vec<(usize, [u8; 3])> = Vec::new();
        let mut rest: Vec<usize> = Vec::new();
        for &i in &pending {
            let (x, y) = ((i % w) as i32, (i / w) as i32);
            let (mut sum, mut n) = ([0u32; 3], 0u32);
            for (dx, dy) in NEIGHBOURS {
                let (nx, ny) = (x + dx, y + dy);
                if nx >= 0 && ny >= 0 && (nx as usize) < w && (ny as usize) < h {
                    let j = ny as usize * w + nx as usize;
                    if known[j] && image.data[j * 4 + 3] >= 128 {
                        for k in 0..3 {
                            sum[k] += data[j * 4 + k] as u32;
                        }
                        n += 1;
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
    Some(LineTrace {
        segments,
        color,
        inpainted: Image {
            width: w,
            height: h,
            data,
        },
    })
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

    #[test]
    fn a_thin_horizontal_line_becomes_stitches_along_it_and_is_painted_out() {
        // 30 x 30 stitches of 10 px; a 2 px line along y = 150 (corner row 15) from x = 50 to 250.
        let img = picture(30, 30, 10, |x, y| {
            (149..151).contains(&y) && (50..250).contains(&x)
        });
        let trace = trace_lines(&img, 30, 30, DEFAULT_SENSITIVITY).expect("a line");
        assert!(!trace.segments.is_empty());
        for s in &trace.segments {
            assert_eq!((s.y1, s.y2), (15, 15), "{s:?}");
            assert!(s.x1 >= 4 && s.x2 <= 26, "{s:?}");
        }
        let length: i32 = trace.segments.iter().map(|s| s.x2 - s.x1).sum();
        assert!((18..=21).contains(&length), "length {length}");
        assert!(trace.color.iter().all(|&c| c < 40));
        // Nothing dark is left in the picture.
        assert!(trace.inpainted.data.chunks_exact(4).all(|p| p[0] > 200));
    }

    #[test]
    fn a_diagonal_line_is_traced_by_diagonal_steps() {
        let img = picture(30, 30, 10, |x, y| {
            (x as i32 - y as i32).abs() <= 1 && x > 40 && x < 260
        });
        let trace = trace_lines(&img, 30, 30, DEFAULT_SENSITIVITY).expect("a line");
        assert!(
            trace.segments.iter().all(|s| s.x2 - s.x1 == s.y2 - s.y1),
            "{:?}",
            trace.segments
        );
        assert!(trace.segments.iter().all(|s| s.x2 - s.x1 <= MAX_RUN));
    }

    #[test]
    fn a_straight_slanted_line_is_one_clean_staircase_not_a_ladder() {
        let img = picture(40, 40, 10, |x, y| {
            ((y as f64 - 200.0) - (x as f64 - 50.0) * 0.5774).abs() < 1.2 && (50..350).contains(&x)
        });
        let trace = trace_lines(&img, 40, 40, DEFAULT_SENSITIVITY).expect("a line");
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
        let length: f64 = trace
            .segments
            .iter()
            .map(|s| (((s.x2 - s.x1).pow(2) + (s.y2 - s.y1).pow(2)) as f64).sqrt())
            .sum();
        // The line is 30 stitches across and 17 down, 34.6 long; a staircase of unit and diagonal steps is a little longer.
        assert!((33.0..42.0).contains(&length), "length {length}");
    }

    #[test]
    fn a_filled_area_is_not_a_line() {
        let img = picture(30, 30, 10, |x, y| {
            (60..200).contains(&x) && (60..200).contains(&y)
        });
        assert!(trace_lines(&img, 30, 30, DEFAULT_SENSITIVITY).is_none());
    }

    #[test]
    fn an_empty_or_tiny_picture_has_no_lines() {
        let blank = picture(30, 30, 10, |_, _| false);
        assert!(trace_lines(&blank, 30, 30, 1.0).is_none());
        let one_px_per_stitch = picture(30, 30, 1, |x, _| x == 5);
        assert!(trace_lines(&one_px_per_stitch, 30, 30, 1.0).is_none());
    }

    #[test]
    fn tracing_is_deterministic() {
        let img = picture(30, 30, 10, |x, y| {
            ((x as i32 - 150).pow(2) + (y as i32 - 150).pow(2) - 100 * 100).abs() < 400
        });
        let a = trace_lines(&img, 30, 30, 0.6).expect("a circle");
        let b = trace_lines(&img, 30, 30, 0.6).expect("a circle");
        assert_eq!(a.segments, b.segments);
        assert!(a.segments.len() > 20);
    }
}
