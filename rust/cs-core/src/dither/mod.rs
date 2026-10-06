//! Dithering (G-052): a chart dithered to its palette, so neighbouring stitches take the two threads either side of a
//! colour instead of every stitch rounding to one.
//!
//! A pattern is one type behind `Pattern` and one line in `PATTERNS` (G-100, D326), as overlays are (`overlay.rs`). The
//! families there are: threshold matrices, which are data (`matrix.rs`, D198); error-diffusion kernels (`diffusion.rs`,
//! D200); and the drawn marks, which have settings of their own (`hand_drawn.rs`, D201).
//!
//! **To add one:** a type that implements `Pattern`, a `configure` that reads its own settings, and one line in
//! `PATTERNS` declaring its id, name, group and settings. Its id is recorded on every chart made with it, so an id never
//! changes. Then `npm run dither-patterns` writes the declarations out for the interface (`lib/pipeline/dither-patterns.ts`,
//! D328) and `npm run dither-previews` draws its pictures (D327); CI fails until both are committed.

pub mod diffusion;
pub mod hand_drawn;
pub mod matrix;
pub mod preview;

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
    /// Its own settings as the chart records them (`ditherTexture`); `None` when it has none or they are its default,
    /// so a chart made with the default is the file it always was.
    fn recorded(&self) -> Option<Value> {
        None
    }
}

/// Reads a pattern's own settings and returns it ready to run. It is given its own id, so one family can declare
/// several patterns. It takes every setting it knows whether or not it is the one chosen, so none of them is refused
/// as unknown.
pub type Configure = fn(&'static str, &mut Settings) -> Result<Chosen, String>;

/// A pattern with its own settings read, ready to run.
pub type Chosen = Arc<dyn Pattern>;

/// A group of the chooser, with the line it shows under each of its patterns' names (G-095). Three, as the measurement
/// separates them (`docs/reviews/2026-09-21-dithering-comparison.md`), and the drawn marks as a family of their own.
pub struct Group {
    pub id: &'static str,
    pub label: &'static str,
}

pub const SCREENS: Group = Group {
    id: "screens",
    label: "Screens — fewest single stitches",
};
pub const SCATTERED: Group = Group {
    id: "scattered",
    label: "Scattered — closer to the photo",
};
pub const DIFFUSION: Group = Group {
    id: "diffusion",
    label: "Error diffusion — closest, never worse",
};
pub const DRAWN: Group = Group {
    id: "drawn",
    label: "Drawn — marks, not a pattern",
};

/// How a pattern is offered: as a choice of its own, or as one variant of a choice it shares with others, chosen beneath
/// the chooser (the four line screens are one "Lines" with a direction, G-059).
pub enum Offered {
    Alone,
    Variant {
        choice: &'static Choice,
        /// The variant's button, and what it says on hover.
        label: &'static str,
        title: &'static str,
    },
}

/// A choice several patterns share. Its picture in the chooser is one of theirs.
pub struct Choice {
    pub id: &'static str,
    pub label: &'static str,
    pub pictured_by: &'static str,
}

pub const LINES: Choice = Choice {
    id: "lines",
    label: "Lines",
    pictured_by: "lines-diagonal",
};

/// A pattern's own settings, beyond its id: the request key that carries them, and the control the photo pane edits
/// them with. The control is named, not described: the drawn marks' texture is an editor of its own
/// (`app/components/texture-editor.tsx`), the one escape the interface knows by name (D328).
pub struct OwnSettings {
    pub key: &'static str,
    pub control: &'static str,
}

/// One pattern: everything the chart and the interface know about it.
pub struct Declared {
    pub id: &'static str,
    /// Its name in the chooser and the feature list.
    pub label: &'static str,
    pub group: &'static Group,
    pub offered: Offered,
    /// `None` for a pattern whose picture is always the same, so it is built once (D327).
    pub settings: Option<OwnSettings>,
    pub configure: Configure,
}

impl Declared {
    /// What the chooser offers it as, and the feature that switches it: its own id, or the choice it shares.
    pub fn choice_id(&self) -> &'static str {
        match self.offered {
            Offered::Alone => self.id,
            Offered::Variant { choice, .. } => choice.id,
        }
    }
}

const fn line(id: &'static str, label: &'static str, title: &'static str) -> Declared {
    Declared {
        id,
        label: LINES.label,
        group: &SCREENS,
        offered: Offered::Variant {
            choice: &LINES,
            label,
            title,
        },
        settings: None,
        configure: matrix::configure,
    }
}

const fn alone(
    id: &'static str,
    label: &'static str,
    group: &'static Group,
    configure: Configure,
) -> Declared {
    Declared {
        id,
        label,
        group,
        offered: Offered::Alone,
        settings: None,
        configure,
    }
}

/// Every pattern, in the order the chooser shows them.
#[rustfmt::skip]
pub const PATTERNS: &[Declared] = &[
    alone("clustered-8", "Clustered dots", &SCREENS, matrix::configure),
    alone("ring-8", "Rings", &SCREENS, matrix::configure),
    line("lines-horizontal", "—", "Horizontal lines"),
    line("lines-vertical", "|", "Vertical lines"),
    line("lines-diagonal", "/", "Diagonal lines, rising"),
    line("lines-anti-diagonal", "\\", "Diagonal lines, falling"),
    alone("bayer-4", "Bayer 4×4", &SCATTERED, matrix::configure),
    alone("bayer-8", "Bayer 8×8", &SCATTERED, matrix::configure),
    alone("blue-noise-16", "Blue noise", &SCATTERED, matrix::configure),
    alone("floyd-steinberg", "Floyd–Steinberg", &DIFFUSION, diffusion::configure),
    alone("atkinson", "Atkinson", &DIFFUSION, diffusion::configure),
    Declared {
        id: "hand-drawn",
        label: "Hand-drawn",
        group: &DRAWN,
        offered: Offered::Alone,
        settings: Some(OwnSettings { key: "ditherTexture", control: "texture" }),
        configure: hand_drawn::configure,
    },
];

/// A pattern's declaration by id; `None` for an id no pattern has.
pub fn declared(id: &str) -> Option<&'static Declared> {
    PATTERNS.iter().find(|declared| declared.id == id)
}

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
