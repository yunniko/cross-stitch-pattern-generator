//! Port of `lib/crisp/crisp-quantization-stage.ts` (D66): the weighted sample pool from the evidence layer, the
//! weighted quantizer, then initial labels (a crisp cell takes its cheapest admissible label).

use super::evidence::EvidenceLayer;
use super::weighted::{quantize_pool, Pool};
use super::{build_admissible, pick_best, DEFAULT_BETA};
use crate::color::{oklab_distance_sq, rgb_to_oklab, Oklab, Rgb};

pub fn run(
    cell_oklab: &[f64],
    color_count: usize,
    importance: &[f32],
    layer: &EvidenceLayer,
    latest: bool,
) -> (Vec<u8>, Vec<Rgb>) {
    let cell_count = cell_oklab.len() / 3;
    let mut pool = Pool::with_capacity(cell_count + layer.len());
    let mut non_crisp_sample = vec![usize::MAX; cell_count];
    for cell in 0..cell_count {
        match layer.get(cell) {
            Some(e) => {
                pool.push(e.modes[0], e.coverage[0], cell);
                pool.push(e.modes[1], e.coverage[1], cell);
            }
            None => {
                non_crisp_sample[cell] = pool.len();
                let o = cell * 3;
                pool.push(
                    [cell_oklab[o], cell_oklab[o + 1], cell_oklab[o + 2]],
                    1.0,
                    cell,
                );
            }
        }
    }
    let (palette, sample_labels) = quantize_pool(&pool, color_count, importance, latest);
    let palette_oklab: Vec<Oklab> = palette.iter().map(|&c| rgb_to_oklab(c)).collect();

    let mut labels = vec![0u8; cell_count];
    for cell in 0..cell_count {
        let Some(e) = layer.get(cell) else {
            labels[cell] = sample_labels[non_crisp_sample[cell]];
            continue;
        };
        let set = build_admissible(e, &palette_oklab, 1.0, DEFAULT_BETA);
        let best = pick_best(&set).unwrap_or_else(|| {
            // Defensive, as in the TypeScript: the nearest colour to the cell's own average.
            let o = cell * 3;
            let own = [cell_oklab[o], cell_oklab[o + 1], cell_oklab[o + 2]];
            let mut best = 0;
            let mut best_dist = f64::INFINITY;
            for (k, p) in palette_oklab.iter().enumerate() {
                let d = oklab_distance_sq(&own, p);
                if d < best_dist {
                    best_dist = d;
                    best = k;
                }
            }
            best
        });
        labels[cell] = best as u8;
    }
    (labels, palette)
}
