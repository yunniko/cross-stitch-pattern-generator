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

use crate::color::Rgb;
use crate::ridges::{cluster_colors, image_ridges, line_color, link_chains, reduce, Ridge};
use crate::stitch_fit::{approximate, rounded_corners, smooth_resample, stitches_between};
use crate::Image;
use std::collections::{BTreeSet, HashMap};

pub use crate::stitch_fit::Segment;

/// The most threads the lines of one picture are stitched in (D269).
const MAX_LINE_THREADS: usize = 3;
/// Two lines whose colours are nearer than this (Oklab distance) are one thread.
const SAME_LINE_COLOR_DISTANCE: f64 = 0.12;
/// Below this many source pixels per stitch there is no sub-stitch line to find.
const MIN_PIXELS_PER_STITCH: f64 = 3.0;

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

/// The default sensitivity, 0 to 1.
pub const DEFAULT_SENSITIVITY: f64 = 0.5;

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

    let (ridges, f) = image_ridges(image, stitch_px, profile.low, None);
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
    let weights: Vec<f64> = lines.iter().map(|l| l.length_cells).collect();
    let (thread_of, clusters) = cluster_colors(
        &colors,
        &weights,
        MAX_LINE_THREADS,
        SAME_LINE_COLOR_DISTANCE,
    );

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
    let thread_colors: Vec<Rgb> = used.iter().map(|&t| clusters[t]).collect();
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

/// The traced lines as an overlay (G-099, `overlay.rs`). Its settings: `backstitchLines` asks for it,
/// `backstitchSensitivity` is how faint a line it takes (0 to 1), `backstitchPhotos` lets it trace a photograph too.
#[derive(Debug)]
struct TracedLines {
    sensitivity: f64,
    photos: bool,
}

impl crate::overlay::Overlay for TracedLines {
    fn name(&self) -> &'static str {
        "lines"
    }

    fn lay(&self, image: &Image, gw: usize, gh: usize) -> Option<crate::overlay::Laid> {
        trace_lines(image, gw, gh, self.sensitivity, self.photos).map(|trace| {
            crate::overlay::Laid {
                segments: trace.segments,
                colors: trace.colors,
                picture: Some(trace.inpainted),
            }
        })
    }
}

pub fn configure(
    settings: &mut crate::settings::Settings,
) -> Result<Option<std::sync::Arc<dyn crate::overlay::Overlay>>, String> {
    let asked = settings.flag("backstitchLines")?.unwrap_or(false);
    let sensitivity = settings
        .number("backstitchSensitivity")?
        .filter(|v| v.is_finite())
        .map_or(DEFAULT_SENSITIVITY, |v| v.clamp(0.0, 1.0));
    let photos = settings.flag("backstitchPhotos")?.unwrap_or(false);
    Ok(asked.then(|| {
        std::sync::Arc::new(TracedLines {
            sensitivity,
            photos,
        }) as std::sync::Arc<dyn crate::overlay::Overlay>
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::stitch_fit::MAX_STITCH_CELLS;

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
