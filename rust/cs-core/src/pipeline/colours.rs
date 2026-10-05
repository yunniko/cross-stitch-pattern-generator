//! Which thread each stitch gets.

use super::{Clock, Run};
use crate::color::{rgb_to_oklab, Oklab, Rgb};
use crate::crisp::stage;
use crate::dither::dither_to_palette;
use crate::hue_reserve::reserve_hue_threads;
use crate::pattern::PaletteSet;
use crate::quantize::{quantize, Quantizer};

/// Each stitched cell to the nearest colour of `set` (in Oklab), and the set's colours as the palette. A cell that is not
/// stitched stays empty.
fn assign_to_set(
    cells_oklab: &[f64],
    set: &PaletteSet,
    empty: Option<&[u8]>,
) -> (Vec<u8>, Vec<Rgb>) {
    let palette: Vec<Rgb> = set.colors.iter().map(|c| c.rgb).collect();
    let lab: Vec<Oklab> = palette.iter().map(|&c| rgb_to_oklab(c)).collect();
    let labels = (0..cells_oklab.len() / 3)
        .map(|i| {
            if empty.is_some_and(|m| m[i] != 0) {
                return crate::EMPTY_CELL;
            }
            let p = [
                cells_oklab[i * 3],
                cells_oklab[i * 3 + 1],
                cells_oklab[i * 3 + 2],
            ];
            let mut best = (f64::INFINITY, 0usize);
            for (k, l) in lab.iter().enumerate() {
                let d = crate::color::oklab_distance_sq(&p, l);
                if d < best.0 {
                    best = (d, k);
                }
            }
            best.1 as u8
        })
        .collect();
    (labels, palette)
}

/// The threads and each stitch's thread, by one of three ways: the set the user chose (G-087), Crisp's own stage, or the
/// quantizer. Then Vivid's reserved hues, then the dither.
pub(super) fn choose_threads(run: &mut Run, clock: &mut Clock) {
    let options = run.options;
    let (gw, gh) = (run.gw, run.gh);
    let empty_ref = run.empty.as_deref();
    let denoised = std::mem::take(&mut run.denoised);
    let latest = options.quantizer == Quantizer::Latest;

    let (quantized, raw_palette) = if let Some(set) = &options.palette_set {
        assign_to_set(&denoised, set, empty_ref)
    } else {
        match (&run.layer, empty_ref) {
            (Some(layer), _) => stage::run_masked(
                &denoised,
                options.color_count,
                &run.importance,
                layer,
                latest,
                empty_ref,
            ),
            // The quantizer sees only the stitched cells: a cluster built from cells that are not there would spend a
            // colour on nothing.
            (None, Some(mask)) => {
                let kept: Vec<usize> = (0..gw * gh).filter(|&i| mask[i] == 0).collect();
                let mut kept_oklab = vec![0f64; kept.len() * 3];
                let mut kept_importance = vec![0f32; kept.len()];
                for (k, &cell) in kept.iter().enumerate() {
                    kept_oklab[k * 3..k * 3 + 3].copy_from_slice(&denoised[cell * 3..cell * 3 + 3]);
                    kept_importance[k] = run.importance[cell];
                }
                let (labels, palette) = if kept.is_empty() {
                    (Vec::new(), Vec::new())
                } else {
                    quantize(
                        options.quantizer,
                        &kept_oklab,
                        options.color_count,
                        &kept_importance,
                    )
                };
                let mut scattered = vec![crate::EMPTY_CELL; gw * gh];
                for (k, &cell) in kept.iter().enumerate() {
                    scattered[cell] = labels[k];
                }
                (scattered, palette)
            }
            (None, None) => quantize(
                options.quantizer,
                &denoised,
                options.color_count,
                &run.importance,
            ),
        }
    };
    // Vivid, part two: a hue the cells hold and the palette does not speak for takes a slot (G-062, D212). Before
    // dithering, which reads this palette, and before the smoothing. Crisp is left out: its palette comes from its
    // own evidence stage.
    let (quantized, raw_palette) = if options.vivid && !run.crisp && options.palette_set.is_none() {
        let reserved = reserve_hue_threads(&denoised, &quantized, &raw_palette, empty_ref);
        (reserved.cell_palette_index, reserved.palette)
    } else {
        (quantized, raw_palette)
    };
    drop(denoised);
    // The quantizer chose the threads; dithering decides which stitch gets which of the two nearest (G-052).
    let quantized = if run.dithered {
        let mut labels = dither_to_palette(
            &run.cell_oklab,
            gw,
            gh,
            &raw_palette,
            options.dither,
            &options.dither_texture,
            empty_ref,
        );
        if let Some(mask) = empty_ref {
            for (label, &empty) in labels.iter_mut().zip(mask.iter()) {
                if empty != 0 {
                    *label = crate::EMPTY_CELL;
                }
            }
        }
        labels
    } else {
        quantized
    };
    run.labels = quantized;
    run.palette = raw_palette;
    clock.lap("quantize");
}
