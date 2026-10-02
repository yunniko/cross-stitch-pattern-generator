//! Fitting a line to stitches (D272): the corners near it joined by straight stitches of at most three cells that stay close
//! to it, with the fewest stitches and the fewest bends, found by dynamic programming.

use std::collections::{BTreeSet, HashMap};

/// The corners within this many cells of a line are the places its stitches may end (D272).
const NEAR_CORNER: f64 = 1.0;
/// A stitch stays within this many cells of the line it follows.
const MAX_DEVIATION: f64 = 0.7;
/// The longest a stitch is, in cells along either axis.
pub(crate) const MAX_STITCH_CELLS: i32 = 3;
/// What a stitch costs, against the squared distance it strays and the angle it turns through from the stitch before.
/// The turning is charged in proportion to the angle, so a long gentle curve costs what it must and a zigzag, which turns
/// back and forth along a line that is straight, costs more than the straight stitches it replaces (D272).
const STITCH_COST: f64 = 1.0;
const DEVIATION_COST: f64 = 4.0;
const BEND_COST_PER_RADIAN: f64 = 2.0;
/// A chain is sampled and smoothed at this spacing, in cells.
pub(crate) const SAMPLE_CELLS: f64 = 0.1;
/// Smoothing along a chain, in samples either side (a Gaussian of this standard deviation).
const SMOOTH_SAMPLES: f64 = 2.0;

/// A backstitch of a traced line or a texture stroke, between two grid corners.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct Segment {
    pub x1: i32,
    pub y1: i32,
    pub x2: i32,
    pub y2: i32,
    /// Which of the colours of its trace the stitch is in.
    pub thread: usize,
}

/// A polyline resampled at `SAMPLE_CELLS` and smoothed along itself, its two ends kept where they are.
pub(crate) fn smooth_resample(points: &[(f64, f64)]) -> Vec<(f64, f64)> {
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
pub(crate) fn approximate(
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
pub(crate) fn rounded_corners(curve: &[(f64, f64)]) -> Vec<(i32, i32)> {
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
pub(crate) fn stitches_between(corners: &[(i32, i32)], thread: usize, out: &mut BTreeSet<Segment>) {
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
