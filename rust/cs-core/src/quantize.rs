//! Port of `lib/pipeline/quantize.ts`: k-means++ seeding, Lloyd with Hamerly bounds (D177), "Original" and "Latest"
//! (merge, reinvest the freed slots in the worst-served cells, re-converge; D20, D39).

use crate::color::{oklab_distance_sq, oklab_to_rgb, rgb_to_oklab, Oklab, Rgb};
use crate::jsmath;
use crate::palette_merge::merge_similar_colors;
use crate::prng::Mulberry32;
use rayon::prelude::*;

/// Points per parallel task.
pub(crate) const CHUNK: usize = 8192;

const MAX_ITERATIONS: usize = 30;
const CONVERGENCE_THRESHOLD_SQ: f64 = 0.0001;
const BOUND_MARGIN: f64 = 1e-9;
pub const REINVEST_MERGE_THRESHOLD: f64 = 0.012;
pub const WORST_FIT_IMPORTANCE_BOOST: f64 = 1.0;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Quantizer {
    Original,
    Latest,
}

#[inline]
fn point_at(points: &[f64], i: usize) -> Oklab {
    [points[i * 3], points[i * 3 + 1], points[i * 3 + 2]]
}

/// `meanOklabAsRgb`.
/// A thread's colour under Vivid (G-062, D212): mean lightness with the chroma of its most colourful quarter,
/// gamut-mapped. Port of `vividOklabAsRgb`.
pub fn vivid_oklab_as_rgb(cell_oklab: &[f64], indices: &[usize]) -> Rgb {
    let mut sum_l = 0.0;
    for &i in indices {
        sum_l += cell_oklab[i * 3];
    }
    // Ordered by chroma, ties by cell index, so both languages take the same quarter.
    let mut by_chroma: Vec<(f64, usize)> = indices
        .iter()
        .map(|&i| {
            let a = cell_oklab[i * 3 + 1];
            let b = cell_oklab[i * 3 + 2];
            (a * a + b * b, i)
        })
        .collect();
    by_chroma.sort_by(|x, y| x.0.partial_cmp(&y.0).unwrap().then(x.1.cmp(&y.1)));
    let from = ((by_chroma.len() as f64) * (1.0 - crate::downsample::VIVID_TOP_SHARE)).floor() as usize;
    let mut sum_a = 0.0;
    let mut sum_b = 0.0;
    for &(_, i) in &by_chroma[from..] {
        sum_a += cell_oklab[i * 3 + 1];
        sum_b += cell_oklab[i * 3 + 2];
    }
    let top = (by_chroma.len() - from) as f64;
    let lin = crate::color::gamut_map_oklab_to_linear(
        sum_l / indices.len() as f64,
        sum_a / top,
        sum_b / top,
    );
    [
        crate::color::linear_to_srgb(lin[0]),
        crate::color::linear_to_srgb(lin[1]),
        crate::color::linear_to_srgb(lin[2]),
    ]
}

pub fn mean_oklab_as_rgb(cell_oklab: &[f64], indices: &[usize]) -> Rgb {
    let (mut l, mut a, mut b) = (0.0, 0.0, 0.0);
    for &i in indices {
        l += cell_oklab[i * 3];
        a += cell_oklab[i * 3 + 1];
        b += cell_oklab[i * 3 + 2];
    }
    let n = if indices.is_empty() {
        1.0
    } else {
        indices.len() as f64
    };
    oklab_to_rgb([l / n, a / n, b / n])
}

fn kmeans_plus_plus_seeds(points: &[f64], k: usize, rng: &mut Mulberry32) -> Vec<Oklab> {
    let n = points.len() / 3;
    let nf = n as f64;
    let mut seeds = vec![point_at(points, (rng.next_f64() * nf).floor() as usize)];
    let mut dist_sq = vec![f64::INFINITY; n];
    while seeds.len() < k {
        let [sl, sa, sb] = *seeds.last().unwrap();
        dist_sq
            .par_chunks_mut(CHUNK)
            .enumerate()
            .for_each(|(c, dist)| {
                for (j, dd) in dist.iter_mut().enumerate() {
                    let i = c * CHUNK + j;
                    let dl = points[i * 3] - sl;
                    let da = points[i * 3 + 1] - sa;
                    let db = points[i * 3 + 2] - sb;
                    let d = dl * dl + da * da + db * db;
                    if d < *dd {
                        *dd = d;
                    }
                }
            });
        // Summed in point order, as the TypeScript does.
        let mut total = 0.0;
        for &d in &dist_sq {
            total += d;
        }
        if total == 0.0 {
            seeds.push(point_at(points, (rng.next_f64() * nf).floor() as usize));
            continue;
        }
        let mut threshold = rng.next_f64() * total;
        let mut chosen = 0;
        for i in 0..n {
            threshold -= dist_sq[i];
            if threshold <= 0.0 {
                chosen = i;
                break;
            }
        }
        seeds.push(point_at(points, chosen));
    }
    seeds
}

struct Scan {
    best: usize,
    best_dist: f64,
    second_dist: f64,
}

#[inline]
fn scan_point(points: &[f64], i: usize, flat: &[f64], k: usize) -> Scan {
    let o = i * 3;
    let (pl, pa, pb) = (points[o], points[o + 1], points[o + 2]);
    let mut s = Scan {
        best: 0,
        best_dist: f64::INFINITY,
        second_dist: f64::INFINITY,
    };
    for c in 0..k {
        let dl = pl - flat[c * 3];
        let da = pa - flat[c * 3 + 1];
        let db = pb - flat[c * 3 + 2];
        let d = dl * dl + da * da + db * db;
        if d < s.best_dist {
            s.second_dist = s.best_dist;
            s.best_dist = d;
            s.best = c;
        } else if d < s.second_dist {
            s.second_dist = d;
        }
    }
    s
}

/// `runLloydOnPoints`: assignments identical to a full scan every iteration; the bounds only skip provably
/// unnecessary scans.
fn run_lloyd(points: &[f64], initial: Vec<Oklab>) -> (Vec<Oklab>, Vec<u8>) {
    let n = points.len() / 3;
    let mut centroids = initial;
    let k = centroids.len();
    let mut assignments = vec![0u8; n];
    let mut flat = vec![0f64; k * 3];
    let mut sums = vec![0f64; k * 3];
    let mut counts = vec![0u32; k];
    let mut upper = vec![0f64; n];
    let mut lower = vec![0f64; n];
    let mut moved = vec![0f64; k];
    let mut half_gap = vec![0f64; k];

    let assign = |first: bool,
                  centroids: &[Oklab],
                  flat: &mut [f64],
                  half_gap: &mut [f64],
                  assignments: &mut [u8],
                  upper: &mut [f64],
                  lower: &mut [f64]| {
        for c in 0..k {
            flat[c * 3..c * 3 + 3].copy_from_slice(&centroids[c]);
        }
        for c in 0..k {
            let mut nearest = f64::INFINITY;
            for o in 0..k {
                if o == c {
                    continue;
                }
                let dl = flat[c * 3] - flat[o * 3];
                let da = flat[c * 3 + 1] - flat[o * 3 + 1];
                let db = flat[c * 3 + 2] - flat[o * 3 + 2];
                let d = dl * dl + da * da + db * db;
                if d < nearest {
                    nearest = d;
                }
            }
            half_gap[c] = nearest.sqrt() / 2.0;
        }
        let flat: &[f64] = flat;
        let half_gap: &[f64] = half_gap;
        assignments
            .par_chunks_mut(CHUNK)
            .zip(upper.par_chunks_mut(CHUNK))
            .zip(lower.par_chunks_mut(CHUNK))
            .enumerate()
            .for_each(|(chunk, ((assignments, upper), lower))| {
                for j in 0..assignments.len() {
                    let i = chunk * CHUNK + j;
                    if !first {
                        let a = assignments[j] as usize;
                        let bound = jsmath::max(lower[j], half_gap[a]);
                        if upper[j] * (1.0 + BOUND_MARGIN) < bound * (1.0 - BOUND_MARGIN) {
                            continue;
                        }
                        let s = a * 3;
                        let dl = points[i * 3] - flat[s];
                        let da = points[i * 3 + 1] - flat[s + 1];
                        let db = points[i * 3 + 2] - flat[s + 2];
                        upper[j] = (dl * dl + da * da + db * db).sqrt();
                        if upper[j] * (1.0 + BOUND_MARGIN) < bound * (1.0 - BOUND_MARGIN) {
                            continue;
                        }
                    }
                    let s = scan_point(points, i, flat, k);
                    assignments[j] = s.best as u8;
                    upper[j] = s.best_dist.sqrt();
                    lower[j] = s.second_dist.sqrt();
                }
            });
    };

    for iter in 0..MAX_ITERATIONS {
        assign(
            iter == 0,
            &centroids,
            &mut flat,
            &mut half_gap,
            &mut assignments,
            &mut upper,
            &mut lower,
        );

        sums.fill(0.0);
        counts.fill(0);
        for i in 0..n {
            let c = assignments[i] as usize;
            sums[c * 3] += points[i * 3];
            sums[c * 3 + 1] += points[i * 3 + 1];
            sums[c * 3 + 2] += points[i * 3 + 2];
            counts[c] += 1;
        }

        let mut max_shift_sq = 0.0;
        let previous = centroids.clone();
        for c in 0..k {
            if counts[c] == 0 {
                continue;
            }
            let cnt = counts[c] as f64;
            let next = [
                sums[c * 3] / cnt,
                sums[c * 3 + 1] / cnt,
                sums[c * 3 + 2] / cnt,
            ];
            max_shift_sq = jsmath::max(max_shift_sq, oklab_distance_sq(&centroids[c], &next));
            centroids[c] = next;
        }

        // moveBounds
        let mut farthest = 0.0;
        let mut farthest_centroid = usize::MAX;
        let mut second_farthest = 0.0;
        for c in 0..k {
            moved[c] = oklab_distance_sq(&previous[c], &centroids[c]).sqrt();
            if moved[c] > farthest {
                second_farthest = farthest;
                farthest = moved[c];
                farthest_centroid = c;
            } else if moved[c] > second_farthest {
                second_farthest = moved[c];
            }
        }
        let moved_now: &[f64] = &moved;
        assignments
            .par_chunks(CHUNK)
            .zip(upper.par_chunks_mut(CHUNK))
            .zip(lower.par_chunks_mut(CHUNK))
            .for_each(|((assignments, upper), lower)| {
                for j in 0..assignments.len() {
                    let a = assignments[j] as usize;
                    upper[j] += moved_now[a];
                    lower[j] -= if a == farthest_centroid {
                        second_farthest
                    } else {
                        farthest
                    };
                }
            });
        if max_shift_sq < CONVERGENCE_THRESHOLD_SQ {
            break;
        }
    }

    assign(
        false,
        &centroids,
        &mut flat,
        &mut half_gap,
        &mut assignments,
        &mut upper,
        &mut lower,
    );
    (centroids, assignments)
}

/// `buildPaletteFromAssignment`: empty clusters dropped.
fn build_palette(centroids: &[Oklab], assignments: &[u8]) -> (Vec<u8>, Vec<Rgb>) {
    let mut counts = vec![0usize; centroids.len()];
    for &c in assignments {
        counts[c as usize] += 1;
    }
    let mut remap = vec![0u8; centroids.len()];
    let mut palette = Vec::new();
    for (c, centroid) in centroids.iter().enumerate() {
        if counts[c] == 0 {
            continue;
        }
        remap[c] = palette.len() as u8;
        palette.push(oklab_to_rgb(*centroid));
    }
    (
        assignments.iter().map(|&c| remap[c as usize]).collect(),
        palette,
    )
}

fn inject_worst_fit(
    points: &[f64],
    assignment: &[u8],
    centroids: &[Oklab],
    slots: usize,
    importance: &[f32],
) -> Vec<Oklab> {
    let mut next_assignment = assignment.to_vec();
    let mut next_centroids = centroids.to_vec();
    let n = points.len() / 3;
    let mut assigned = vec![0f64; n];
    for i in 0..n {
        let c = next_centroids[next_assignment[i] as usize];
        let dl = points[i * 3] - c[0];
        let da = points[i * 3 + 1] - c[1];
        let db = points[i * 3 + 2] - c[2];
        assigned[i] = dl * dl + da * da + db * db;
    }
    for _ in 0..slots {
        // The first point with the largest score, as the sequential scan finds it.
        let (worst_score, worst) = (0..n)
            .into_par_iter()
            .with_min_len(CHUNK)
            .map(|i| {
                (
                    assigned[i] * (1.0 + WORST_FIT_IMPORTANCE_BOOST * importance[i] as f64),
                    i,
                )
            })
            .reduce(
                || (-1.0, usize::MAX),
                |a, b| {
                    if b.0 > a.0 || (b.0 == a.0 && b.1 < a.1) {
                        b
                    } else {
                        a
                    }
                },
            );
        let worst = if worst_score > -1.0 { worst } else { 0 };
        let new_centroid = point_at(points, worst);
        let new_index = next_centroids.len();
        next_centroids.push(new_centroid);
        let [cl, ca, cb] = new_centroid;
        next_assignment
            .par_chunks_mut(CHUNK)
            .zip(assigned.par_chunks_mut(CHUNK))
            .enumerate()
            .for_each(|(chunk, (next_assignment, assigned))| {
                for j in 0..assigned.len() {
                    let o = (chunk * CHUNK + j) * 3;
                    let dl = points[o] - cl;
                    let da = points[o + 1] - ca;
                    let db = points[o + 2] - cb;
                    let d = dl * dl + da * da + db * db;
                    if d < assigned[j] {
                        next_assignment[j] = new_index as u8;
                        assigned[j] = d;
                    }
                }
            });
    }
    next_centroids
}

fn plain_kmeans(points: &[f64], color_count: usize) -> (Vec<u8>, Vec<Rgb>) {
    let cell_count = points.len() / 3;
    let k = color_count.min(cell_count).max(1);
    let seed = (0xc0ffee_u32 as i32 ^ cell_count as i32 ^ k as i32) as u32;
    let mut rng = Mulberry32::new(seed);
    let seeds = kmeans_plus_plus_seeds(points, k, &mut rng);
    let (centroids, assignments) = run_lloyd(points, seeds);
    build_palette(&centroids, &assignments)
}

/// `quantizer.quantize(cells, colorCount, importance, cellOklab)` for the two built-in quantizers.
pub fn quantize(
    quantizer: Quantizer,
    points: &[f64],
    color_count: usize,
    importance: &[f32],
) -> (Vec<u8>, Vec<Rgb>) {
    let initial = plain_kmeans(points, color_count);
    if quantizer == Quantizer::Original {
        return initial;
    }
    let cell_count = points.len() / 3;
    let target_k = color_count.min(cell_count);
    if target_k < 3 {
        return initial;
    }
    let (merged_index, merged_palette) =
        merge_similar_colors(&initial.0, &initial.1, REINVEST_MERGE_THRESHOLD);
    let freed = target_k.saturating_sub(merged_palette.len());
    if freed == 0 {
        return initial;
    }
    let merged_oklab: Vec<Oklab> = merged_palette.iter().map(|&c| rgb_to_oklab(c)).collect();
    let centroids = inject_worst_fit(points, &merged_index, &merged_oklab, freed, importance);
    let (centroids, assignments) = run_lloyd(points, centroids);
    build_palette(&centroids, &assignments)
}
