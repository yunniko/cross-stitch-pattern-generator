//! The passes that tidy the chart once every stitch has a thread, and Crisp's own repairs.

use super::{Clock, Run};
use crate::color::{rgb_to_oklab, Oklab};
use crate::crisp::{plus, repair};
use crate::optimize::{
    fix_diagonal_connections, recolor_small_components, run_multi_scale_optimizer,
};
use crate::palette_merge::{merge_similar_colors_with_empties, DEFAULT_MERGE_DISTANCE_SQUARED};
use crate::pattern::EdgeMode;

/// The optimizer, then the clean-up of specks and diagonal joins.
pub(super) fn tidy(run: &mut Run, clock: &mut Clock) {
    if !run.smooth {
        return;
    }
    let optimized = {
        let ctx = run.ctx();
        run_multi_scale_optimizer(&ctx, &run.labels, &run.palette)
    };
    run.labels = optimized;
    clock.lap("icm");
    let cleaned = {
        let ctx = run.ctx();
        let mut labels = recolor_small_components(&ctx, &run.labels, &run.palette);
        labels = fix_diagonal_connections(&ctx, &labels, &run.palette);
        recolor_small_components(&ctx, &labels, &run.palette)
    };
    run.labels = cleaned;
    clock.lap("cleanup");
}

/// Threads too alike to tell apart become one, and Crisp repairs what the tidying moved across an edge. A set's colours
/// are never merged: the user chose them one by one. Its time has always been counted with the stage after it.
pub(super) fn merge(run: &mut Run, _clock: &mut Clock) {
    if run.smooth && run.options.palette_set.is_none() {
        let (labels, palette) = merge_similar_colors_with_empties(
            &run.labels,
            &run.palette,
            DEFAULT_MERGE_DISTANCE_SQUARED,
        );
        run.labels = labels;
        run.palette = palette;
    }
    if let (Some(layer), true) = (&run.layer, run.smooth) {
        let merged_oklab: Vec<Oklab> = run.palette.iter().map(|&c| rgb_to_oklab(c)).collect();
        run.labels = repair(&run.labels, layer, &merged_oklab);
    }
}

/// Crisp+ passes (D140–D142), with the moved cells counted at their new colour in the recompute.
pub(super) fn crisp_plus(run: &mut Run, clock: &mut Clock) {
    if !(run.options.edge_mode == EdgeMode::CrispPlus && run.smooth) {
        return;
    }
    let (gw, gh) = (run.gw, run.gh);
    let before = run.labels.clone();
    let merged_palette = std::mem::take(&mut run.palette);
    let snap = plus::snap_transition_strips(&before, gw, gh, &merged_palette, run.image());
    let prune = plus::prune_blend_labels(&snap.labels, gw, gh, &merged_palette, run.image());
    let changed: Vec<u8> = (0..before.len())
        .map(|i| (prune.labels[i] != before[i]) as u8)
        .collect();
    let mut moved = changed.clone();
    for y in 0..gh {
        for x in 0..gw {
            let i = y * gw + x;
            let label = prune.labels[i];
            'outer: for dy in -1i64..=1 {
                if moved[i] != 0 {
                    break;
                }
                for dx in -1i64..=1 {
                    let (xx, yy) = (x as i64 + dx, y as i64 + dy);
                    if xx < 0 || yy < 0 || xx >= gw as i64 || yy >= gh as i64 {
                        continue;
                    }
                    let n = yy as usize * gw + xx as usize;
                    if changed[n] != 0 || prune.labels[n] != label {
                        moved[i] = 1;
                        continue 'outer;
                    }
                }
            }
        }
    }
    let distinct = |labels: &[u8]| {
        let mut seen = vec![false; merged_palette.len()];
        labels
            .iter()
            .filter(|&&l| {
                (l as usize) < seen.len() && !std::mem::replace(&mut seen[l as usize], true)
            })
            .count()
    };
    let used_after = distinct(&prune.labels);
    let target = run
        .options
        .color_count
        .min(used_after + distinct(&before).saturating_sub(used_after));
    let (refilled, palette) = plus::refill_freed_slots(
        &prune.labels,
        &merged_palette,
        &run.cell_oklab,
        &moved,
        target,
    );
    run.labels = refilled;
    run.palette = palette;
    if snap.changes > 0 || prune.pruned > 0 {
        let mut lab = run.cell_oklab.clone();
        let label_oklab: Vec<Oklab> = run.palette.iter().map(|&c| rgb_to_oklab(c)).collect();
        for i in 0..changed.len() {
            if changed[i] == 0 {
                continue;
            }
            lab[i * 3..i * 3 + 3].copy_from_slice(&label_oklab[run.labels[i] as usize]);
        }
        run.finalize_oklab = Some(lab);
    }
    clock.lap("crispPlus");
}
