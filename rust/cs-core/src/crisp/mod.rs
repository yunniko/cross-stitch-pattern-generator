//! Crisp and Crisp+ (G-024, G-038): ports of `lib/crisp/`. The admissible-label costs here port
//! `crisp-unary-cost.ts` and the cost helpers of `crisp-evidence-layer.ts`.

pub mod evidence;
pub mod finalize;
pub mod plus;
pub mod stage;
pub mod weighted;

use crate::color::{oklab_distance_sq, Oklab};
use evidence::{Evidence, EvidenceLayer};

pub const DEFAULT_BETA: f64 = 0.15;

/// One admissible label: the TypeScript `Map<label, {cost, supportingMode}>` as a list in insertion order.
#[derive(Clone, Copy, Debug)]
pub struct Admissible {
    pub label: usize,
    pub cost: f64,
    pub supporting_mode: usize,
}

pub type AdmissibleSet = Vec<Admissible>;

#[inline]
pub fn admissible_cost(set: &AdmissibleSet, label: usize) -> Option<&Admissible> {
    set.iter().find(|a| a.label == label)
}

/// `buildAdmissibleLabelCosts`: each mode with positive coverage maps to its nearest palette label, at the cheapest
/// `alpha·‖palette − mode‖² + beta·(1 − coverage)` over the modes mapping there.
pub fn build_admissible(
    evidence: &Evidence,
    palette: &[Oklab],
    alpha: f64,
    beta: f64,
) -> AdmissibleSet {
    let mut out: AdmissibleSet = Vec::with_capacity(2);
    for m in 0..2 {
        if evidence.coverage[m] <= 0.0 {
            continue;
        }
        let mut best = 0;
        let mut best_dist = f64::INFINITY;
        for (k, p) in palette.iter().enumerate() {
            let d = oklab_distance_sq(&evidence.modes[m], p);
            if d < best_dist {
                best_dist = d;
                best = k;
            }
        }
        let cost = alpha * oklab_distance_sq(&palette[best], &evidence.modes[m])
            + beta * (1.0 - evidence.coverage[m]);
        match out.iter_mut().find(|a| a.label == best) {
            Some(existing) => {
                if cost < existing.cost {
                    existing.cost = cost;
                    existing.supporting_mode = m;
                }
            }
            None => out.push(Admissible {
                label: best,
                cost,
                supporting_mode: m,
            }),
        }
    }
    out
}

/// `pickBestAdmissibleLabel`: the cheapest, first in insertion order on a tie; `None` for an empty set.
pub fn pick_best(set: &AdmissibleSet) -> Option<usize> {
    let mut best = None;
    let mut best_cost = f64::INFINITY;
    for a in set {
        if a.cost < best_cost {
            best_cost = a.cost;
            best = Some(a.label);
        }
    }
    best
}

/// `buildCrispAdmissibleCostMap`: one set per confident cell, parallel to `layer.cells`.
pub fn build_cost_map(
    layer: &EvidenceLayer,
    palette: &[Oklab],
    alpha: f64,
    beta: f64,
) -> Vec<AdmissibleSet> {
    layer
        .cells
        .iter()
        .map(|(_, e)| build_admissible(e, palette, alpha, beta))
        .collect()
}

/// `repairCrispAssignments` with the default weights.
pub fn repair(assignment: &[u8], layer: &EvidenceLayer, palette: &[Oklab]) -> Vec<u8> {
    let mut out = assignment.to_vec();
    for (cell, e) in &layer.cells {
        let set = build_admissible(e, palette, 1.0, DEFAULT_BETA);
        if admissible_cost(&set, out[*cell] as usize).is_some() {
            continue;
        }
        if let Some(best) = pick_best(&set) {
            out[*cell] = best as u8;
        }
    }
    out
}

/// `crispAwareCost`: a confident cell's admissible cost (infinite when inadmissible), else the squared distance.
#[inline]
pub fn crisp_aware_cost(
    costs: Option<(&EvidenceLayer, &[AdmissibleSet])>,
    cell_oklab: &[f64],
    palette: &[Oklab],
    cell: usize,
    label: usize,
) -> f64 {
    if let Some((layer, sets)) = costs {
        if let Some(slot) = layer.slot(cell) {
            return admissible_cost(&sets[slot], label).map_or(f64::INFINITY, |a| a.cost);
        }
    }
    let o = cell * 3;
    let p = palette[label];
    let dl = cell_oklab[o] - p[0];
    let da = cell_oklab[o + 1] - p[1];
    let db = cell_oklab[o + 2] - p[2];
    dl * dl + da * da + db * db
}
