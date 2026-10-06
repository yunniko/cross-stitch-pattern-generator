//! The error-diffusion patterns (G-052, G-059): each stitch takes its nearest thread and passes what it missed on to
//! the stitches not yet decided, row by row, serpentine, which keeps the worm artifacts away. A kernel is a list of
//! taps; a new one is a list here and a line in `PATTERNS`.

use super::{palette_to_oklab, two_nearest, Cells, Pattern};
use crate::color::Rgb;
use crate::settings::Settings;
use std::sync::Arc;

/// `(dx, dy, weight)` taps, mirrored in `dx` on a right-to-left row. Floyd-Steinberg passes all of the error on;
/// Atkinson passes six eighths and drops the rest, which keeps near-black and near-white areas flat and makes the
/// stitches it does place clump (D200).
type Kernel = &'static [(i64, i64, f64)];

const FLOYD_STEINBERG: Kernel = &[
    (1, 0, 7.0 / 16.0),
    (-1, 1, 3.0 / 16.0),
    (0, 1, 5.0 / 16.0),
    (1, 1, 1.0 / 16.0),
];
const ATKINSON: Kernel = &[
    (1, 0, 1.0 / 8.0),
    (2, 0, 1.0 / 8.0),
    (-1, 1, 1.0 / 8.0),
    (0, 1, 1.0 / 8.0),
    (1, 1, 1.0 / 8.0),
    (0, 2, 1.0 / 8.0),
];

const KERNELS: &[(&str, Kernel)] = &[("floyd-steinberg", FLOYD_STEINBERG), ("atkinson", ATKINSON)];

#[derive(Debug)]
pub struct Diffusion {
    id: &'static str,
    kernel: Kernel,
}

/// A kernel has no settings of its own; its id names it.
pub fn configure(id: &'static str, _settings: &mut Settings) -> Result<Arc<dyn Pattern>, String> {
    let (_, kernel) = KERNELS
        .iter()
        .find(|(name, _)| *name == id)
        .ok_or_else(|| format!("no diffusion kernel {id}"))?;
    Ok(Arc::new(Diffusion { id, kernel }))
}

impl Pattern for Diffusion {
    fn id(&self) -> &'static str {
        self.id
    }

    /// Cells in `skip` (empty stitches) are neither decided nor given error: their stand-in colour is white, no thread
    /// matches it, and the error would pile up across the background and pour into the subject's edge (D258).
    fn dither(&self, cells: &Cells, palette: &[Rgb]) -> Vec<u8> {
        let (width, height, skip) = (cells.width, cells.height, cells.skip);
        let palette_oklab = palette_to_oklab(palette);
        let mut labels = vec![0u8; width * height];
        let mut working = cells.oklab.to_vec();

        for y in 0..height {
            let left_to_right = y % 2 == 0;
            for step in 0..width {
                let x = if left_to_right {
                    step
                } else {
                    width - 1 - step
                };
                let i = y * width + x;
                if skip.is_some_and(|m| m[i] != 0) {
                    continue;
                }
                let o = i * 3;
                let (best, _) = two_nearest(
                    &palette_oklab,
                    palette.len(),
                    working[o],
                    working[o + 1],
                    working[o + 2],
                );
                labels[i] = best as u8;
                let po = best * 3;
                let el = working[o] - palette_oklab[po];
                let ea = working[o + 1] - palette_oklab[po + 1];
                let eb = working[o + 2] - palette_oklab[po + 2];

                let ahead: i64 = if left_to_right { 1 } else { -1 };
                let mut spread = |nx: i64, ny: i64, weight: f64| {
                    if nx < 0 || nx >= width as i64 || ny < 0 || ny >= height as i64 {
                        return;
                    }
                    if skip.is_some_and(|m| m[ny as usize * width + nx as usize] != 0) {
                        return;
                    }
                    let no = (ny as usize * width + nx as usize) * 3;
                    working[no] += el * weight;
                    working[no + 1] += ea * weight;
                    working[no + 2] += eb * weight;
                };
                let (xi, yi) = (x as i64, y as i64);
                for &(dx, dy, weight) in self.kernel {
                    spread(xi + ahead * dx, yi + dy, weight);
                }
            }
        }
        labels
    }
}
