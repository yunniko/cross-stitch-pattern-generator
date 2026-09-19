//! Ports of `lib/pipeline/energy.ts`, `local-optimizer.ts` (ICM), `regions.ts` (`labelRegions`, the fields generation
//! reads) and `contour-cleanup.ts`. With an evidence layer, confident cells use their admissible-label costs (D63, D68).

use crate::color::{rgb_to_oklab, Oklab, Rgb};
use crate::crisp::evidence::EvidenceLayer;
use crate::crisp::{
    admissible_cost, build_cost_map, crisp_aware_cost, AdmissibleSet, DEFAULT_BETA,
};
use crate::jsmath;
use crate::pair_evidence::{get_pair_edge_evidence, SLOTS};

#[derive(Clone, Copy, Debug)]
pub struct Weights {
    pub color: f64,
    pub smoothness: f64,
    pub edge_loss: f64,
}

pub const COARSE: Weights = Weights {
    color: 1.0,
    smoothness: 0.09,
    edge_loss: 0.015,
};
pub const FINE: Weights = Weights {
    color: 1.0,
    smoothness: 0.045,
    edge_loss: 0.05,
};

/// `boundaryPairEnergy(weights, edge, true)`.
#[inline]
fn mismatch_energy(smoothness: f64, edge_loss: f64, edge: f64) -> f64 {
    jsmath::max(0.0, smoothness * (1.0 - edge) - edge_loss * edge)
}

/// `WEIGHTED_NEIGHBOR_OFFSETS`, in the same order: (dx, dy, weight).
pub fn neighbor_offsets() -> [(i32, i32, f64); 8] {
    let geometric = 1.0 / (1.0 + std::f64::consts::SQRT_2);
    let diagonal = geometric * (1.0 / std::f64::consts::SQRT_2);
    [
        (1, 0, geometric),
        (-1, 0, geometric),
        (0, 1, geometric),
        (0, -1, geometric),
        (1, 1, diagonal),
        (1, -1, diagonal),
        (-1, 1, diagonal),
        (-1, -1, diagonal),
    ]
}

#[derive(Clone, Copy)]
pub struct Ctx<'a> {
    pub width: usize,
    pub height: usize,
    pub cell_oklab: &'a [f64],
    pub importance: &'a [f32],
    pub pair_evidence: &'a [f32],
    /// Crisp mode's frozen layer; `None` in Standard mode.
    pub evidence: Option<&'a EvidenceLayer>,
}

const MAX_PASSES: usize = 8;

/// `runLocalOptimizer`.
pub fn run_local_optimizer(
    ctx: &Ctx,
    initial: &[u8],
    palette: &[Rgb],
    weights: Weights,
) -> Vec<u8> {
    let (width, height) = (ctx.width, ctx.height);
    let k = palette.len();
    let mut pal = vec![0f64; k * 3];
    for (c, &rgb) in palette.iter().enumerate() {
        pal[c * 3..c * 3 + 3].copy_from_slice(&rgb_to_oklab(rgb));
    }
    let palette_oklab: Vec<Oklab> = palette.iter().map(|&c| rgb_to_oklab(c)).collect();
    let crisp_costs: Option<Vec<AdmissibleSet>> = ctx
        .evidence
        .map(|layer| build_cost_map(layer, &palette_oklab, weights.color, DEFAULT_BETA));
    let mut assignment = initial.to_vec();
    let cell_count = width * height;
    let offsets = neighbor_offsets();

    // Canonical slot per stencil offset, and whether the cost lives on the neighbour.
    const CANONICAL: [(i32, i32); 4] = [(1, 0), (0, 1), (1, 1), (-1, 1)];
    let mut canonical_weight = [0f64; 4];
    for &(dx, dy, w) in &offsets {
        for (slot, &(cx, cy)) in CANONICAL.iter().enumerate() {
            if dx == cx && dy == cy {
                canonical_weight[slot] = w;
            }
        }
    }
    let mut slot_cost = vec![0f64; cell_count * SLOTS];
    for y in 0..height {
        for x in 0..width {
            let i = y * width + x;
            for (slot, &(dx, dy)) in CANONICAL.iter().enumerate() {
                let nx = x as i64 + dx as i64;
                let ny = y as i64 + dy as i64;
                if nx < 0 || nx >= width as i64 || ny >= height as i64 {
                    continue;
                }
                let edge = ctx.pair_evidence[i * SLOTS + slot] as f64;
                slot_cost[i * SLOTS + slot] = canonical_weight[slot]
                    * mismatch_energy(weights.smoothness, weights.edge_loss, edge);
            }
        }
    }
    let mut offset_slot = [0usize; 8];
    let mut offset_on_neighbor = [false; 8];
    for (o, &(dx, dy, _)) in offsets.iter().enumerate() {
        for (slot, &(cx, cy)) in CANONICAL.iter().enumerate() {
            if dx == cx && dy == cy {
                offset_slot[o] = slot;
            } else if dx == -cx && dy == -cy {
                offset_slot[o] = slot;
                offset_on_neighbor[o] = true;
            }
        }
    }

    let mut dirty = vec![true; cell_count];
    let mut pair_cost = [0f64; 8];
    let mut neighbor_label = [0usize; 8];
    let mut exact_boundary = vec![0f64; k];
    let mut stamp = vec![u32::MAX; k];
    let mut visit: u32 = 0;

    for _ in 0..MAX_PASSES {
        let mut changed = false;
        for y in 0..height {
            for x in 0..width {
                let i = y * width + x;
                if !dirty[i] {
                    continue;
                }
                dirty[i] = false;
                visit = visit.wrapping_add(1);

                let mut count = 0;
                let mut total = 0.0;
                for (o, &(dx, dy, _)) in offsets.iter().enumerate() {
                    let nx = x as i64 + dx as i64;
                    let ny = y as i64 + dy as i64;
                    if nx < 0 || nx >= width as i64 || ny < 0 || ny >= height as i64 {
                        continue;
                    }
                    let n = ny as usize * width + nx as usize;
                    let cost = slot_cost
                        [(if offset_on_neighbor[o] { n } else { i }) * SLOTS + offset_slot[o]];
                    pair_cost[count] = cost;
                    neighbor_label[count] = assignment[n] as usize;
                    total += cost;
                    count += 1;
                }
                for j in 0..count {
                    let c = neighbor_label[j];
                    if stamp[c] == visit {
                        continue;
                    }
                    stamp[c] = visit;
                    let mut sum = 0.0;
                    for m in 0..count {
                        if neighbor_label[m] != c {
                            sum += pair_cost[m];
                        }
                    }
                    exact_boundary[c] = sum;
                }

                let mut best = assignment[i] as usize;
                let admissible = match (&crisp_costs, ctx.evidence) {
                    (Some(sets), Some(layer)) => layer.slot(i).map(|slot| &sets[slot]),
                    _ => None,
                };
                if let Some(set) = admissible {
                    // The current label first, so it wins an exact tie (D67); then the rest in insertion order.
                    let current = best;
                    let mut best_energy = f64::INFINITY;
                    let ordered = std::iter::once(current)
                        .chain(set.iter().map(|a| a.label).filter(|&c| c != current));
                    for c in ordered {
                        let Some(entry) = admissible_cost(set, c) else {
                            continue;
                        };
                        let energy = entry.cost
                            + if stamp[c] == visit {
                                exact_boundary[c]
                            } else {
                                total
                            };
                        if energy < best_energy {
                            best_energy = energy;
                            best = c;
                        }
                    }
                } else {
                    let ci = i * 3;
                    let (cl, ca, cb) = (
                        ctx.cell_oklab[ci],
                        ctx.cell_oklab[ci + 1],
                        ctx.cell_oklab[ci + 2],
                    );
                    let mut neighbor_best: i64 = -1;
                    let mut neighbor_best_energy = f64::INFINITY;
                    if weights.color >= 0.0 {
                        for j in 0..count {
                            let c = neighbor_label[j];
                            let pi = c * 3;
                            let dl = cl - pal[pi];
                            let da = ca - pal[pi + 1];
                            let db = cb - pal[pi + 2];
                            let energy =
                                weights.color * (dl * dl + da * da + db * db) + exact_boundary[c];
                            if energy < neighbor_best_energy
                                || (energy == neighbor_best_energy && (c as i64) < neighbor_best)
                            {
                                neighbor_best_energy = energy;
                                neighbor_best = c as i64;
                            }
                        }
                    }
                    if neighbor_best_energy < total {
                        best = neighbor_best as usize;
                    } else {
                        let mut best_energy = f64::INFINITY;
                        for c in 0..k {
                            let pi = c * 3;
                            let dl = cl - pal[pi];
                            let da = ca - pal[pi + 1];
                            let db = cb - pal[pi + 2];
                            let color_term = dl * dl + da * da + db * db;
                            let energy = weights.color * color_term
                                + if stamp[c] == visit {
                                    exact_boundary[c]
                                } else {
                                    total
                                };
                            if energy < best_energy {
                                best_energy = energy;
                                best = c;
                            }
                        }
                    }
                }

                if best != assignment[i] as usize {
                    assignment[i] = best as u8;
                    changed = true;
                    for &(dx, dy, _) in &offsets {
                        let nx = x as i64 + dx as i64;
                        let ny = y as i64 + dy as i64;
                        if nx >= 0 && nx < width as i64 && ny >= 0 && ny < height as i64 {
                            dirty[ny as usize * width + nx as usize] = true;
                        }
                    }
                }
            }
        }
        if !changed {
            break;
        }
    }
    assignment
}

/// `runMultiScaleOptimizer` with the default weights.
pub fn run_multi_scale_optimizer(ctx: &Ctx, initial: &[u8], palette: &[Rgb]) -> Vec<u8> {
    let coarse = run_local_optimizer(ctx, initial, palette, COARSE);
    run_local_optimizer(ctx, &coarse, palette, FINE)
}

pub struct Component {
    pub palette_index: u8,
    pub area: usize,
}

/// `labelRegions`: 4-connected components, ids in first-cell order.
pub fn label_regions(cells: &[u8], width: usize, height: usize) -> (Vec<i32>, Vec<Component>) {
    let mut labels = vec![-1i32; cells.len()];
    let mut components = Vec::new();
    let mut stack = Vec::new();
    for start in 0..cells.len() {
        if labels[start] != -1 {
            continue;
        }
        let pi = cells[start];
        let id = components.len() as i32;
        let mut area = 0;
        labels[start] = id;
        stack.push(start);
        while let Some(cell) = stack.pop() {
            let x = cell % width;
            let y = cell / width;
            area += 1;
            if x > 0 && cells[cell - 1] == pi && labels[cell - 1] == -1 {
                labels[cell - 1] = id;
                stack.push(cell - 1);
            }
            if x < width - 1 && cells[cell + 1] == pi && labels[cell + 1] == -1 {
                labels[cell + 1] = id;
                stack.push(cell + 1);
            }
            if y > 0 && cells[cell - width] == pi && labels[cell - width] == -1 {
                labels[cell - width] = id;
                stack.push(cell - width);
            }
            if y < height - 1 && cells[cell + width] == pi && labels[cell + width] == -1 {
                labels[cell + width] = id;
                stack.push(cell + width);
            }
        }
        components.push(Component {
            palette_index: pi,
            area,
        });
    }
    (labels, components)
}

/// `recolorSmallComponents` with `defaultComponentRecolorOptions`.
pub fn recolor_small_components(ctx: &Ctx, assignment: &[u8], palette: &[Rgb]) -> Vec<u8> {
    let (width, height) = (ctx.width, ctx.height);
    let max_size = if width * height < 2500 { 2 } else { 6 };
    let (smoothness, edge_loss, protect) = (0.045, 0.05, 0.5);
    let palette_oklab: Vec<Oklab> = palette.iter().map(|&c| rgb_to_oklab(c)).collect();
    let crisp_costs: Option<Vec<AdmissibleSet>> = ctx
        .evidence
        .map(|layer| build_cost_map(layer, &palette_oklab, 1.0, DEFAULT_BETA));
    let costs = ctx.evidence.zip(crisp_costs.as_deref());
    let offsets = neighbor_offsets();

    let mut result = assignment.to_vec();
    let (labels, components) = label_regions(&result, width, height);
    let mut members: Vec<Vec<usize>> = components.iter().map(|_| Vec::new()).collect();
    for (i, &l) in labels.iter().enumerate() {
        members[l as usize].push(i);
    }

    let mut boundary: Vec<(usize, usize, f64, i32, i32)> = Vec::new();
    let mut neighbor_colors: Vec<u8> = Vec::new();
    for (id, component) in components.iter().enumerate() {
        if component.area > max_size {
            continue;
        }
        let cells = &members[id];
        let mut importance_sum = 0.0;
        for &i in cells {
            importance_sum += ctx.importance[i] as f64;
        }
        if importance_sum / cells.len() as f64 > protect {
            continue;
        }

        boundary.clear();
        neighbor_colors.clear();
        for &i in cells {
            let x = (i % width) as i64;
            let y = (i / width) as i64;
            for &(dx, dy, w) in &offsets {
                let nx = x + dx as i64;
                let ny = y + dy as i64;
                if nx < 0 || nx >= width as i64 || ny < 0 || ny >= height as i64 {
                    continue;
                }
                let n = ny as usize * width + nx as usize;
                if labels[n] != id as i32 {
                    boundary.push((i, n, w, dx, dy));
                    if !neighbor_colors.contains(&result[n]) {
                        neighbor_colors.push(result[n]);
                    }
                }
            }
        }
        if neighbor_colors.is_empty() {
            continue;
        }

        let total_energy = |candidate: u8, result: &[u8]| -> f64 {
            let mut color_error = 0.0;
            for &i in cells {
                color_error +=
                    crisp_aware_cost(costs, ctx.cell_oklab, &palette_oklab, i, candidate as usize);
            }
            let mut boundary_energy = 0.0;
            for &(member, neighbor, w, dx, dy) in &boundary {
                let edge = get_pair_edge_evidence(ctx.pair_evidence, member, dx, dy, width) as f64;
                let e = if result[neighbor] != candidate {
                    mismatch_energy(smoothness, edge_loss, edge)
                } else {
                    0.0
                };
                boundary_energy += w * e;
            }
            color_error + boundary_energy
        };

        let mut best_color = component.palette_index;
        let mut best_energy = total_energy(component.palette_index, &result);
        for &candidate in &neighbor_colors {
            let energy = total_energy(candidate, &result);
            if energy < best_energy {
                best_energy = energy;
                best_color = candidate;
            }
        }
        if best_color != component.palette_index {
            for &i in cells {
                result[i] = best_color;
            }
        }
    }
    result
}

/// `fixDiagonalConnections` with the default options.
pub fn fix_diagonal_connections(ctx: &Ctx, assignment: &[u8], palette: &[Rgb]) -> Vec<u8> {
    let (width, height) = (ctx.width, ctx.height);
    let (protect, ceiling, max_passes) = (0.5, 0.02, 4);
    let palette_oklab: Vec<Oklab> = palette.iter().map(|&c| rgb_to_oklab(c)).collect();
    let crisp_costs: Option<Vec<AdmissibleSet>> = ctx
        .evidence
        .map(|layer| build_cost_map(layer, &palette_oklab, 1.0, DEFAULT_BETA));
    let costs = ctx.evidence.zip(crisp_costs.as_deref());
    let mut result = assignment.to_vec();
    if width < 2 || height < 2 {
        return result;
    }
    for _ in 0..max_passes {
        let mut changed = false;
        for y in 0..height - 1 {
            for x in 0..width - 1 {
                let tl = y * width + x;
                let tr = tl + 1;
                let bl = tl + width;
                let br = bl + 1;
                let a = result[tl];
                let b = result[tr];
                if !(a != b && result[bl] == b && result[br] == a) {
                    continue;
                }
                let imp = &ctx.importance;
                let block =
                    (imp[tl] as f64 + imp[tr] as f64 + imp[bl] as f64 + imp[br] as f64) / 4.0;
                if block > protect {
                    continue;
                }
                let candidates = [(tl, b), (tr, a), (bl, a), (br, b)];
                let mut best_cost = f64::INFINITY;
                let mut best = candidates[0];
                for &(cell, new_color) in &candidates {
                    let current = result[cell];
                    let cost = crisp_aware_cost(
                        costs,
                        ctx.cell_oklab,
                        &palette_oklab,
                        cell,
                        new_color as usize,
                    ) - crisp_aware_cost(
                        costs,
                        ctx.cell_oklab,
                        &palette_oklab,
                        cell,
                        current as usize,
                    );
                    if cost < best_cost {
                        best_cost = cost;
                        best = (cell, new_color);
                    }
                }
                if best_cost > ceiling {
                    continue;
                }
                result[best.0] = best.1;
                changed = true;
            }
        }
        if !changed {
            break;
        }
    }
    result
}
