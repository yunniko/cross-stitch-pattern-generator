//! Port of `lib/crisp/crisp-palette-finalization.ts` (D70): recompute each colour with crisp cells counted at their
//! supporting mode, repair, at most three rounds.

use super::evidence::EvidenceLayer;
use super::{admissible_cost, build_cost_map, repair, DEFAULT_BETA};
use crate::color::{oklab_to_rgb, rgb_to_oklab, Oklab, Rgb};

const MAX_FINALIZATION_ITERATIONS: usize = 3;

pub fn finalize(
    cell_oklab: &[f64],
    labels: &[u8],
    initial: &[Rgb],
    layer: &EvidenceLayer,
) -> (Vec<u8>, Vec<Rgb>) {
    let mut assignment = labels.to_vec();
    let mut palette = initial.to_vec();
    for _ in 0..MAX_FINALIZATION_ITERATIONS {
        let palette_oklab: Vec<Oklab> = palette.iter().map(|&c| rgb_to_oklab(c)).collect();
        let costs = build_cost_map(layer, &palette_oklab, 1.0, DEFAULT_BETA);
        let repaired = repair(&assignment, layer, &palette_oklab);
        let repaired_any = repaired != assignment;
        assignment = repaired;

        let mut sums = vec![[0f64; 3]; palette.len()];
        let mut counts = vec![0usize; palette.len()];
        for (i, &label) in assignment.iter().enumerate() {
            let label = label as usize;
            let supporting = layer.slot(i).and_then(|slot| {
                admissible_cost(&costs[slot], label).map(|a| (slot, a.supporting_mode))
            });
            let o = i * 3;
            let lab = match supporting {
                Some((slot, mode)) => layer.cells[slot].1.modes[mode],
                None => [cell_oklab[o], cell_oklab[o + 1], cell_oklab[o + 2]],
            };
            sums[label][0] += lab[0];
            sums[label][1] += lab[1];
            sums[label][2] += lab[2];
            counts[label] += 1;
        }
        palette = (0..palette.len())
            .map(|k| {
                if counts[k] > 0 {
                    let n = counts[k] as f64;
                    oklab_to_rgb([sums[k][0] / n, sums[k][1] / n, sums[k][2] / n])
                } else {
                    palette[k]
                }
            })
            .collect();
        if !repaired_any {
            break;
        }
    }
    (assignment, palette)
}
