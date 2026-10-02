//! G-085: texture strokes, short backstitch laid over the stitches where a picture has fine texture.
//!
//! A hand-stitched owl gets its feathers from backstitch strokes along them; a furry animal its coat; hair, bark and grass
//! the same. They are not lines of the picture (that is G-084) but the streaks inside textured areas that a stitch, a
//! whole cell of one colour, cannot show. The streaks are found as the thin short ridges of the picture (`ridges.rs`), of
//! either kind, light or dark, at the finest scales; a smooth area has none, so it stays free. Of those, the strongest are
//! kept up to a budget the density sets, spread over the chart by blocks and kept apart from each other, each fitted to
//! stitches of at most three cells (`stitch_fit.rs`) and given the colour of the streak it follows, in at most four
//! threads. The stitches under a stroke are left as they are (Owner, 2026-10-02; D274).

use crate::color::Rgb;
use crate::ridges::{cluster_colors, image_ridges, line_color, link_chains};
use crate::stitch_fit::{approximate, rounded_corners, smooth_resample, stitches_between, Segment};
use crate::Image;
use std::collections::{BTreeSet, HashMap};

/// The most threads the strokes of one picture are stitched in (D274).
const MAX_TEXTURE_THREADS: usize = 4;
/// Two strokes whose colours are nearer than this (Oklab distance) are one thread.
const SAME_STROKE_COLOR_DISTANCE: f64 = 0.1;
/// Below this many source pixels per stitch there is no texture finer than a stitch.
const MIN_PIXELS_PER_STITCH: f64 = 6.0;
/// The finest scales only: a streak of a feather is a pixel or two across at the size a stitch is looked at.
const MAX_SIGMA_PX: f64 = 2.2;
/// A streak counts at this strength (the scale-normalised curvature across it, in levels of 0 to 255), and a stroke starts
/// from one at least `HIGH` strong.
const LOW: f32 = 9.0;
const HIGH: f32 = 18.0;
/// The shortest and the longest streak, in cells, that is a stroke; a longer one is a line (G-084) or an edge.
const MIN_CELLS: f64 = 0.6;
const MAX_CELLS: f64 = 6.0;
/// The chart is divided into blocks of this many cells a side, and each holds at most `quota` strokes, so the strokes
/// are spread over the picture and not heaped where it is most contrasty.
const BLOCK_CELLS: usize = 8;
/// The strokes a block holds at full density.
const STROKES_PER_BLOCK_AT_FULL_DENSITY: f64 = 8.0;
/// The most strokes of one chart, whatever the density (D274).
pub const MAX_STROKES: usize = 4000;

/// The default density, 0 to 1: a few accent strokes.
pub const DEFAULT_DENSITY: f64 = 0.3;

pub struct TextureStrokes {
    pub segments: Vec<Segment>,
    /// The colour of each thread the strokes are stitched in, at most `MAX_TEXTURE_THREADS`.
    pub colors: Vec<Rgb>,
}

struct Stroke {
    points: Vec<u32>,
    cells: Vec<(f64, f64)>,
    length_cells: f64,
    score: f64,
}

/// How far, in cells, other streaks count towards how well a streak lines up with its neighbours.
const FLOW_RADIUS_CELLS: f64 = 3.5;

/// The direction a streak runs, as the doubled angle (cos 2a, sin 2a), so that opposite ends of a line are one direction.
fn direction(cells: &[(f64, f64)]) -> (f64, f64) {
    let (a, b) = (cells[0], cells[cells.len() - 1]);
    let angle = (b.1 - a.1).atan2(b.0 - a.0);
    ((2.0 * angle).cos(), (2.0 * angle).sin())
}

/// Weights each streak by how well it lines up with the streaks round it: fur, feathers, hair and grass run one way over
/// an area, and the speckle of a splashed background does not (D274). A streak with few neighbours counts for little, since
/// one neighbour always lines up.
fn weight_by_flow(strokes: &mut [Stroke]) {
    let cell = FLOW_RADIUS_CELLS;
    let mut grid: HashMap<(i64, i64), Vec<usize>> = HashMap::new();
    let mids: Vec<(f64, f64)> = strokes.iter().map(|s| s.cells[s.cells.len() / 2]).collect();
    for (i, m) in mids.iter().enumerate() {
        grid.entry(((m.0 / cell).floor() as i64, (m.1 / cell).floor() as i64))
            .or_default()
            .push(i);
    }
    let dirs: Vec<(f64, f64)> = strokes.iter().map(|s| direction(&s.cells)).collect();
    let factors: Vec<f64> = (0..strokes.len())
        .map(|i| {
            let (gx, gy) = (
                (mids[i].0 / cell).floor() as i64,
                (mids[i].1 / cell).floor() as i64,
            );
            let (mut sx, mut sy, mut sw, mut n) = (0.0, 0.0, 0.0, 0usize);
            for x in gx - 1..=gx + 1 {
                for y in gy - 1..=gy + 1 {
                    for &j in grid.get(&(x, y)).into_iter().flatten() {
                        let d = ((mids[i].0 - mids[j].0).powi(2) + (mids[i].1 - mids[j].1).powi(2))
                            .sqrt();
                        if d <= cell {
                            let w = strokes[j].length_cells;
                            sx += w * dirs[j].0;
                            sy += w * dirs[j].1;
                            sw += w;
                            n += 1;
                        }
                    }
                }
            }
            let coherence = if sw > 0.0 { sx.hypot(sy) / sw } else { 0.0 };
            coherence * coherence * (n as f64 / (n as f64 + 3.0))
        })
        .collect();
    for (s, f) in strokes.iter_mut().zip(factors) {
        s.score *= f;
    }
}

/// The texture strokes of `image`, a picture to be a chart of `gw` by `gh` stitches. `density` runs 0 (none) to 1 (a full
/// coat); `DEFAULT_DENSITY` is a few accents. `None` when the picture has no texture to stroke.
pub fn texture_strokes(
    image: &Image,
    gw: usize,
    gh: usize,
    density: f64,
) -> Option<TextureStrokes> {
    let (w, h) = (image.width, image.height);
    let stitch_px = (w as f64 / gw as f64).min(h as f64 / gh as f64);
    let d = density.clamp(0.0, 1.0);
    if d <= 0.0 || stitch_px < MIN_PIXELS_PER_STITCH || w == 0 || h == 0 {
        return None;
    }
    let (ridges, f) = image_ridges(image, stitch_px, LOW, Some(MAX_SIGMA_PX));
    if ridges.iter().all(|r| r.strength < HIGH) {
        return None;
    }
    let to_cell = |x: f32, y: f32| {
        (
            (x as f64 + 0.5) * f as f64 * gw as f64 / w as f64,
            (y as f64 + 0.5) * f as f64 * gh as f64 / h as f64,
        )
    };
    let cell_len =
        |a: (f64, f64), b: (f64, f64)| ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt();

    let mut strokes: Vec<Stroke> = Vec::new();
    for chain in link_chains(&ridges, HIGH, LOW) {
        let cells: Vec<(f64, f64)> = chain
            .iter()
            .map(|&i| to_cell(ridges[i as usize].x, ridges[i as usize].y))
            .collect();
        let length_cells: f64 = cells.windows(2).map(|p| cell_len(p[0], p[1])).sum();
        if !(MIN_CELLS..=MAX_CELLS).contains(&length_cells) {
            continue;
        }
        let mean = chain
            .iter()
            .map(|&i| ridges[i as usize].strength)
            .sum::<f32>() as f64
            / chain.len() as f64;
        strokes.push(Stroke {
            points: chain,
            cells,
            length_cells,
            score: mean * length_cells.sqrt(),
        });
    }
    weight_by_flow(&mut strokes);
    // Strongest first; ties by position, so the same picture gives the same strokes.
    strokes.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap()
            .then(a.cells[0].0.partial_cmp(&b.cells[0].0).unwrap())
            .then(a.cells[0].1.partial_cmp(&b.cells[0].1).unwrap())
    });

    // Spread over the chart, and apart from each other.
    let quota = ((d * STROKES_PER_BLOCK_AT_FULL_DENSITY).ceil() as usize).max(1);
    let mut in_block: HashMap<(usize, usize), usize> = HashMap::new();
    let mut taken = vec![false; gw * gh];
    let mut chosen: Vec<Stroke> = Vec::new();
    for s in strokes {
        if chosen.len() >= MAX_STROKES {
            break;
        }
        let mid = s.cells[s.cells.len() / 2];
        let block = (
            (mid.0.max(0.0) as usize / BLOCK_CELLS).min(gw / BLOCK_CELLS),
            (mid.1.max(0.0) as usize / BLOCK_CELLS).min(gh / BLOCK_CELLS),
        );
        if in_block.get(&block).copied().unwrap_or(0) >= quota {
            continue;
        }
        // The cells it passes through.
        let mut covered: BTreeSet<usize> = BTreeSet::new();
        for p in &s.cells {
            let (cx, cy) = (
                (p.0.floor() as i64).clamp(0, gw as i64 - 1) as usize,
                (p.1.floor() as i64).clamp(0, gh as i64 - 1) as usize,
            );
            covered.insert(cy * gw + cx);
        }
        if covered.iter().any(|&c| taken[c]) {
            continue;
        }
        for &c in &covered {
            taken[c] = true;
        }
        *in_block.entry(block).or_insert(0) += 1;
        chosen.push(s);
    }
    if chosen.is_empty() {
        return None;
    }

    // Colours, from the original pixels along each streak, grouped into a few threads.
    let colors: Vec<[f64; 3]> = chosen
        .iter()
        .map(|s| line_color(image, &ridges, &s.points, f))
        .collect();
    let weights: Vec<f64> = chosen.iter().map(|s| s.length_cells).collect();
    let (thread_of, clusters) = cluster_colors(
        &colors,
        &weights,
        MAX_TEXTURE_THREADS,
        SAME_STROKE_COLOR_DISTANCE,
    );

    let bounds = (gw as i32, gh as i32);
    let mut steps: BTreeSet<Segment> = BTreeSet::new();
    for (i, s) in chosen.iter().enumerate() {
        let curve = smooth_resample(&s.cells);
        let corners =
            approximate(&curve, None, None, bounds).unwrap_or_else(|| rounded_corners(&curve));
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
    if segments.is_empty() {
        return None;
    }
    Some(TextureStrokes {
        segments,
        colors: used.iter().map(|&t| clusters[t]).collect(),
    })
}
