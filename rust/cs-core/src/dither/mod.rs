//! Dithering (G-052): a chart dithered to its palette, so neighbouring stitches take the two threads either side of a
//! colour instead of every stitch rounding to one.
//!
//! A pattern is one type behind `Pattern` and one line in `PATTERNS` (G-100, D326), as overlays are (`overlay.rs`). The
//! families there are: threshold matrices, which are data (`matrix.rs`, D198); error-diffusion kernels (`diffusion.rs`,
//! D200); and the drawn marks, which have settings of their own (`hand_drawn.rs`, D201).
//!
//! **To add one:** a type that implements `Pattern`, a `configure` that reads its own settings, and one line in
//! `PATTERNS`. Its id is recorded on every chart made with it, so an id never changes.

pub mod diffusion;
pub mod hand_drawn;
pub mod matrix;

use crate::color::{rgb_to_oklab, Oklab, Rgb};
use crate::settings::Settings;
use serde_json::Value;
use std::fmt::Debug;
use std::sync::Arc;

/// The cells a pattern decides, in Oklab, row by row.
pub struct Cells<'a> {
    pub oklab: &'a [f64],
    pub width: usize,
    pub height: usize,
    /// Empty stitches, which a pattern leaves undecided where that matters to it (D258); `None` when there are none.
    pub skip: Option<&'a [u8]>,
}

pub trait Pattern: Debug + Send + Sync {
    /// Its id: the value of `ditherMode`, recorded on the chart.
    fn id(&self) -> &'static str;
    /// One palette entry per cell. The palette is the quantizer's, never empty.
    fn dither(&self, cells: &Cells, palette: &[Rgb]) -> Vec<u8>;
    /// Whether it has settings of its own, beyond its id.
    fn has_settings(&self) -> bool {
        false
    }
    /// Its own settings as the chart records them (`ditherTexture`); `None` when it has none or they are its default,
    /// so a chart made with the default is the file it always was.
    fn recorded(&self) -> Option<Value> {
        None
    }
}

/// Reads a pattern's own settings and returns it ready to run. It is given its own id, so one family can declare
/// several patterns. It takes every setting it knows whether or not it is the one chosen, so none of them is refused
/// as unknown.
pub type Configure = fn(&'static str, &mut Settings) -> Result<Arc<dyn Pattern>, String>;

pub struct Declared {
    pub id: &'static str,
    pub configure: Configure,
}

/// Every pattern, in the order the chooser shows them.
#[rustfmt::skip]
pub const PATTERNS: &[Declared] = &[
    Declared { id: "bayer-4", configure: matrix::configure },
    Declared { id: "bayer-8", configure: matrix::configure },
    Declared { id: "clustered-8", configure: matrix::configure },
    Declared { id: "ring-8", configure: matrix::configure },
    Declared { id: "lines-horizontal", configure: matrix::configure },
    Declared { id: "lines-vertical", configure: matrix::configure },
    Declared { id: "lines-diagonal", configure: matrix::configure },
    Declared { id: "lines-anti-diagonal", configure: matrix::configure },
    Declared { id: "blue-noise-16", configure: matrix::configure },
    Declared { id: "floyd-steinberg", configure: diffusion::configure },
    Declared { id: "atkinson", configure: diffusion::configure },
    Declared { id: "hand-drawn", configure: hand_drawn::configure },
];

/// What `ditherMode` says when nothing is dithered.
pub const OFF: &str = "off";

/// The pattern the settings ask for (`ditherMode`), by its id, with its own settings read; `None` when they ask for
/// none.
pub fn from_settings(settings: &mut Settings) -> Result<Option<Arc<dyn Pattern>>, String> {
    let asked = settings.text("ditherMode")?;
    let mut chosen = None;
    for declared in PATTERNS {
        let pattern = (declared.configure)(declared.id, settings)?;
        if asked.as_deref() == Some(declared.id) {
            chosen = Some(pattern);
        }
    }
    match asked.as_deref() {
        None | Some(OFF) => Ok(None),
        Some(id) => chosen
            .map(Some)
            .ok_or_else(|| format!("unknown ditherMode {id}")),
    }
}

/// `twoNearest`: the two nearest palette entries, nearest first, with the TypeScript's tie handling.
fn two_nearest(palette: &[f64], count: usize, l: f64, a: f64, b: f64) -> (usize, usize) {
    let mut best = 0usize;
    let mut best_dist = f64::INFINITY;
    let mut second = 0usize;
    let mut second_dist = f64::INFINITY;
    for c in 0..count {
        let o = c * 3;
        let dl = l - palette[o];
        let da = a - palette[o + 1];
        let db = b - palette[o + 2];
        let d = dl * dl + da * da + db * db;
        if d < best_dist {
            second_dist = best_dist;
            second = best;
            best_dist = d;
            best = c;
        } else if d < second_dist {
            second_dist = d;
            second = c;
        }
    }
    (
        best,
        if second_dist.is_infinite() {
            best
        } else {
            second
        },
    )
}

fn palette_to_oklab(palette: &[Rgb]) -> Vec<f64> {
    let mut out = vec![0f64; palette.len() * 3];
    for (i, &rgb) in palette.iter().enumerate() {
        let lab: Oklab = rgb_to_oklab(rgb);
        out[i * 3..i * 3 + 3].copy_from_slice(&lab);
    }
    out
}

/// `positionBetween`: where a colour sits between two palette entries, 0 at the first and 1 at the second.
fn position_between(palette: &[f64], first: usize, second: usize, l: f64, a: f64, b: f64) -> f64 {
    let (fo, so) = (first * 3, second * 3);
    let vl = palette[so] - palette[fo];
    let va = palette[so + 1] - palette[fo + 1];
    let vb = palette[so + 2] - palette[fo + 2];
    let length_squared = vl * vl + va * va + vb * vb;
    if length_squared == 0.0 {
        return 0.0;
    }
    let t = ((l - palette[fo]) * vl + (a - palette[fo + 1]) * va + (b - palette[fo + 2]) * vb)
        / length_squared;
    if t <= 0.0 {
        0.0
    } else if t >= 1.0 {
        1.0
    } else {
        t
    }
}

/// The ordered decision, shared by every pattern that is a threshold field: a cell takes the farther of its two
/// nearest threads where it sits past its threshold, `threshold(x, y)` in 0..1.
fn by_thresholds(
    cells: &Cells,
    palette: &[Rgb],
    threshold: impl Fn(usize, usize) -> f64,
) -> Vec<u8> {
    let palette_oklab = palette_to_oklab(palette);
    let mut labels = vec![0u8; cells.width * cells.height];
    for y in 0..cells.height {
        for x in 0..cells.width {
            let i = y * cells.width + x;
            let o = i * 3;
            let (l, a, b) = (cells.oklab[o], cells.oklab[o + 1], cells.oklab[o + 2]);
            let (first, second) = two_nearest(&palette_oklab, palette.len(), l, a, b);
            let t = position_between(&palette_oklab, first, second, l, a, b);
            labels[i] = if t > threshold(x, y) {
                second as u8
            } else {
                first as u8
            };
        }
    }
    labels
}
