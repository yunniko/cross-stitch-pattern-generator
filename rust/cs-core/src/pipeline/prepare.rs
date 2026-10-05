//! The first stages: the picture, the grid, and what the picture says about edges.

use super::{Clock, Run};
use crate::color;
use crate::crisp::evidence::{build_evidence_layer_masked, EdgeModel};
use crate::denoise::denoise_for_quantization_masked;
use crate::downsample::{
    downsample_to_grid_vivid, empty_cell_mask, grid_dimensions_for, VIVID_TOP_SHARE,
};
use crate::edge_map::{
    compute_cell_importance_masked, compute_edge_magnitude_masked, opaque_pixel_mask,
    source_luminance,
};
use crate::pair_evidence::compute_pair_edge_evidence_masked;
use crate::pattern::EdgeMode;
use crate::photo_adjust::adjust_image;
use rayon::prelude::*;

/// The sliders come first and apply to everything after (G-074 M3). Neutral leaves the photo untouched, byte for byte
/// (criterion 4). The size of the chart follows from the picture's.
pub(super) fn adjust(run: &mut Run, clock: &mut Clock) {
    let adjusted = adjust_image(run.image(), &run.options.photo_adjust);
    run.adjusted = adjusted;
    clock.lap("adjust");
    let image = run.image();
    let (gw, gh) = grid_dimensions_for(image.width, image.height, run.options.longer_side_stitches);
    run.gw = gw;
    run.gh = gh;
}

/// Each overlay the settings ask for, on the picture the ones before it left (`overlay.rs`). The lines of a drawing
/// are found first and painted out of the picture, so the stitches under a line take the colour beside it and the line
/// becomes backstitch (G-084, D266); texture strokes are found in the picture that is left, so none lies on a traced
/// line (G-085, D274). An overlay that finds nothing leaves the picture and everything after it as it was.
pub(super) fn overlays(run: &mut Run, clock: &mut Clock) {
    let options = run.options;
    for overlay in &options.overlays {
        if let Some(laid) = overlay.lay(run.image(), run.gw, run.gh) {
            run.laid.push(laid);
            clock.lap(overlay.name());
        }
    }
}

/// One colour a stitch. Transparency becomes absence: a cell the photo barely covers is an empty stitch, and the
/// stages below read neither colour nor structure from pixels that are not there (G-050, D196). Vivid changes what a
/// stitch is made of, before anything chooses colours (G-061, D211).
pub(super) fn downsample(run: &mut Run, clock: &mut Clock) {
    let (cells, coverage) = downsample_to_grid_vivid(
        run.image(),
        run.gw,
        run.gh,
        if run.options.vivid {
            VIVID_TOP_SHARE
        } else {
            0.0
        },
    );
    run.empty = empty_cell_mask(&coverage);
    run.cells = cells;
    clock.lap("downsample");
}

/// How much each stitch matters, from the edges of the picture.
pub(super) fn importance(run: &mut Run, clock: &mut Clock) {
    let image = run.image();
    let opaque = opaque_pixel_mask(image);
    let gray = source_luminance(image);
    let edge = compute_edge_magnitude_masked(image, &gray, opaque.as_deref());
    let importance =
        compute_cell_importance_masked(image, &edge, run.gw, run.gh, &gray, opaque.as_deref());
    drop(edge);
    drop(gray);
    run.importance = importance;
    run.opaque = opaque;
    clock.lap("importance");
}

/// Whether an edge of the picture runs between each pair of neighbouring stitches; read by Crisp and by the tidying
/// passes, and not computed for a chart that has neither.
pub(super) fn pair_evidence(run: &mut Run, clock: &mut Clock) {
    if run.crisp || run.options.optimize {
        run.pair_evidence =
            compute_pair_edge_evidence_masked(run.image(), run.gw, run.gh, run.opaque.as_deref());
    }
    clock.lap("pairEvidence");
}

/// Crisp's own reading of the picture's edges, frozen for the stages that follow.
pub(super) fn crisp_evidence(run: &mut Run, clock: &mut Clock) {
    if !run.crisp {
        return;
    }
    let model = if run.options.edge_mode == EdgeMode::CrispPlus {
        EdgeModel::BlurredStep
    } else {
        EdgeModel::Step
    };
    run.layer = Some(build_evidence_layer_masked(
        run.image(),
        run.gw,
        run.gh,
        model,
        run.empty.as_deref(),
    ));
    clock.lap("crispEvidence");
}

/// The stitches in Oklab, and steadied for choosing threads. Dithering reads the true cells: the medoid pre-filter
/// steadies cluster membership, and steadying is the opposite of what a dithered chart wants (D199).
pub(super) fn denoise(run: &mut Run, clock: &mut Clock) {
    let cells = std::mem::take(&mut run.cells);
    let table = color::srgb_to_linear_table();
    let mut cell_oklab = vec![0f64; cells.len()];
    cell_oklab
        .par_chunks_mut(3)
        .zip(cells.par_chunks_exact(3))
        .for_each(|(out, c)| {
            out.copy_from_slice(&color::oklab_from_bytes(table, c[0], c[1], c[2]));
        });
    run.cell_oklab = cell_oklab;
    run.denoised = if run.dithered {
        run.cell_oklab.clone()
    } else {
        denoise_for_quantization_masked(
            run.gw,
            run.gh,
            &run.cell_oklab,
            &run.importance,
            run.empty.as_deref(),
        )
    };
    clock.lap("denoise");
}
