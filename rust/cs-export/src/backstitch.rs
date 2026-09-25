//! How a backstitch thread is told apart on a printed chart (G-073 M5).
//!
//! **Mirrors `lib/editor/backstitch-style.ts`**, because the screen draws in TypeScript and every export draws
//! here. `scripts/rust-backstitch-style.ts` compares the two, so changing one alone fails rather than quietly
//! printing a different chart from the one on screen.
//!
//! At the A4 cell of 2.75 mm a line is 0.55 mm wide, too thin for a glyph inside the stroke — it would land
//! under 1 pt against a legibility floor of 6 px (D7). A dash is the presence or absence of ink, so it costs
//! nothing at that width. See `docs/reviews/2026-09-25-backstitch-research.md`.

use crate::model::Backstitch;

/// On/off lengths in cells. An empty pattern is solid.
pub const DASH_PATTERNS: [&[f64]; 5] = [
    &[],                      // solid
    &[0.6, 0.3],              // dashed
    &[0.15, 0.25],            // dotted
    &[0.6, 0.25, 0.15, 0.25], // dash-dot
    &[1.2, 0.4],              // long dash
];

/// A line shorter than this carries no bead; its colour and dash do the work.
pub const BEAD_MIN_LINE_CELLS: f64 = 5.0;
/// Roughly how often a bead falls on a long line, in cells.
pub const BEAD_SPACING_CELLS: f64 = 8.0;

/// A line's length in cells. The diagonal of a cell is √2, not 1.
pub fn line_length_cells(line: &Backstitch) -> f64 {
    let dx = line.x2 as f64 - line.x1 as f64;
    let dy = line.y2 as f64 - line.y1 as f64;
    dx.hypot(dy)
}

/// Which threads carry backstitch, by palette index, ascending.
///
/// A thread's dash is its **place in this list**, not its palette index: with five patterns and an index taken
/// modulo five, two threads five apart would share a pattern while three went unused.
pub fn backstitch_threads(lines: &[Backstitch]) -> Vec<usize> {
    let mut threads: Vec<usize> = lines.iter().map(|l| l.palette_index).collect();
    threads.sort_unstable();
    threads.dedup();
    threads
}

/// The dash pattern for a palette index, given the threads that carry backstitch.
pub fn dash_pattern_for(palette_index: usize, threads: &[usize]) -> &'static [f64] {
    match threads.iter().position(|&t| t == palette_index) {
        Some(rank) => DASH_PATTERNS[rank % DASH_PATTERNS.len()],
        None => DASH_PATTERNS[0],
    }
}

/// One drawn piece of a dashed line, in chart corner coordinates.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct DashSegment {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
}

/// A line cut into the pieces its dash pattern draws.
///
/// Cut here rather than asked of the backend, because the raster canvas and the PDF adapter dash by different
/// mechanisms and would not agree on where a dash falls. A short line keeps at least a stub, so a one-cell line
/// of a dotted thread is still visible.
pub fn dash_segments(line: &Backstitch, pattern: &[f64]) -> Vec<DashSegment> {
    let length = line_length_cells(line);
    let whole = DashSegment {
        x1: line.x1 as f64,
        y1: line.y1 as f64,
        x2: line.x2 as f64,
        y2: line.y2 as f64,
    };
    if pattern.is_empty() || length <= 0.0 {
        return vec![whole];
    }
    let ux = (line.x2 as f64 - line.x1 as f64) / length;
    let uy = (line.y2 as f64 - line.y1 as f64) / length;
    let at = |d: f64| (line.x1 as f64 + ux * d, line.y1 as f64 + uy * d);

    let mut out = Vec::new();
    let mut travelled = 0.0;
    let mut step = 0usize;
    while travelled < length {
        let run = pattern[step % pattern.len()];
        let end = (travelled + run).min(length);
        if step.is_multiple_of(2) && end > travelled {
            let (ax, ay) = at(travelled);
            let (bx, by) = at(end);
            out.push(DashSegment {
                x1: ax,
                y1: ay,
                x2: bx,
                y2: by,
            });
        }
        travelled = end;
        step += 1;
    }
    if out.is_empty() {
        let (bx, by) = at(pattern[0].min(length));
        out.push(DashSegment {
            x1: line.x1 as f64,
            y1: line.y1 as f64,
            x2: bx,
            y2: by,
        });
    }
    out
}

/// Total backstitch length per palette entry, in cells. A thread with no lines gets 0.
pub fn length_by_color(lines: &[Backstitch], palette_len: usize) -> Vec<f64> {
    let mut totals = vec![0.0; palette_len];
    for line in lines {
        if line.palette_index < palette_len {
            totals[line.palette_index] += line_length_cells(line);
        }
    }
    totals
}

/// A backstitch length in cells as a stitcher's measurement at this fabric count.
///
/// Metres once it is long enough to buy by, centimetres below that: “340 cm” is a number nobody holds
/// in their head, and “0.06 m” is not a length anybody measures.
pub fn format_length(cells: f64, aida: f64) -> String {
    if cells <= 0.0 || aida <= 0.0 {
        return "0 cm".to_string();
    }
    let cm = cells * 2.54 / aida;
    if cm >= 100.0 {
        format!("{:.1} m", cm / 100.0)
    } else if cm < 10.0 {
        format!("{:.1} cm", cm)
    } else {
        format!("{} cm", cm.round() as i64)
    }
}

/// Where a thread's beads sit on a line, in cells from its start.
///
/// A bead is the line swelling to a lozenge carrying the thread's symbol, for where dashes alone are not
/// enough. Spaced so a short line gets none and a long one gets them regularly, never on an end, where two
/// lines of a run would collide.
pub fn bead_positions(line: &Backstitch) -> Vec<f64> {
    let length = line_length_cells(line);
    if length < BEAD_MIN_LINE_CELLS {
        return Vec::new();
    }
    let count = ((length / BEAD_SPACING_CELLS).floor() as usize).max(1);
    (0..count)
        .map(|i| length * (i as f64 + 1.0) / (count as f64 + 1.0))
        .collect()
}
