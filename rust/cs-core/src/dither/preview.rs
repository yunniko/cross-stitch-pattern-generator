//! A pattern's preview (G-057, G-059, G-100): what the pattern does to a dark-to-light ramp between two threads, drawn
//! by the same `Pattern::dither` that makes charts, so nothing about a pattern is written twice.
//!
//! A pattern without settings has its pictures drawn once, when the app is built (`cs-bench dither-previews`); one
//! with settings is drawn by the server when they change (`cs-job dither-preview`). See D327.

use super::{palette_to_oklab, two_nearest, Cells, Pattern};
use crate::color::{rgb_to_oklab, Rgb};

/// The two threads every preview is drawn in: the photo pane's ink and paper.
pub const DARK: Rgb = [29, 36, 48];
pub const LIGHT: Rgb = [242, 239, 230];
/// The side of a chooser picture, in stitches.
pub const TILE: usize = 24;
/// The side of the larger preview under the chooser, in stitches.
pub const WINDOW: usize = 56;

/// One label per stitch, row by row: 0 the dark thread, 1 the light one.
#[derive(Clone, Debug, PartialEq)]
pub struct Picture {
    pub width: usize,
    pub height: usize,
    pub labels: Vec<u8>,
}

/// The tone the ramp shows at a row: dark at the top, light at the bottom, never quite either.
pub fn ramp_tone(row: usize, height: usize) -> f64 {
    if height <= 1 {
        0.5
    } else {
        0.15 + (0.7 * row as f64) / (height - 1) as f64
    }
}

/// The top-left `window_width` × `window_height` of a chart of `chart_width` × `chart_height` whose first rows carry
/// the ramp, dithered by `pattern`; `None` is no dithering, each stitch its nearest thread.
///
/// The whole chart is built, not only the window: the drawn marks place their field across the full grid, so their
/// corner depends on the chart's size, and building it is what keeps the preview the chart's own stitches whatever
/// the family. Rows below the window carry its last tone.
pub fn ramp_window(
    pattern: Option<&dyn Pattern>,
    chart_width: usize,
    chart_height: usize,
    window_width: usize,
    window_height: usize,
) -> Picture {
    let (chart_width, chart_height) = (chart_width.max(1), chart_height.max(1));
    let width = chart_width.min(window_width);
    let height = chart_height.min(window_height);
    let palette = [DARK, LIGHT];
    let (from, to) = (rgb_to_oklab(DARK), rgb_to_oklab(LIGHT));

    let mut oklab = vec![0f64; chart_width * chart_height * 3];
    for y in 0..chart_height {
        let tone = ramp_tone(y.min(height - 1), height);
        let colour = [0, 1, 2].map(|c| from[c] + tone * (to[c] - from[c]));
        for x in 0..chart_width {
            let o = (y * chart_width + x) * 3;
            oklab[o..o + 3].copy_from_slice(&colour);
        }
    }

    let cells = Cells {
        oklab: &oklab,
        width: chart_width,
        height: chart_height,
        skip: None,
    };
    let chart = match pattern {
        Some(pattern) => pattern.dither(&cells, &palette),
        None => nearest(&cells, &palette),
    };

    let mut labels = Vec::with_capacity(width * height);
    for y in 0..height {
        labels.extend_from_slice(&chart[y * chart_width..y * chart_width + width]);
    }
    Picture {
        width,
        height,
        labels,
    }
}

/// Each cell's nearest thread: what a chart is without dithering.
fn nearest(cells: &Cells, palette: &[Rgb]) -> Vec<u8> {
    let palette_oklab = palette_to_oklab(palette);
    cells
        .oklab
        .chunks_exact(3)
        .map(|c| two_nearest(&palette_oklab, palette.len(), c[0], c[1], c[2]).0 as u8)
        .collect()
}
