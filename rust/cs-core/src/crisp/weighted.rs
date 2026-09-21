//! Port of `lib/crisp/weighted-quantize.ts`: weighted k-means over a sample pool, the weighted "Original" and
//! "Latest" (D60, D176).

use crate::color::{oklab_distance_sq, oklab_to_rgb, rgb_to_oklab, Oklab, Rgb};
use crate::jsmath;
use crate::palette_merge::merge_similar_colors_weighted;
use crate::prng::Mulberry32;
use crate::quantize::CHUNK;
use crate::quantize::{REINVEST_MERGE_THRESHOLD, WORST_FIT_IMPORTANCE_BOOST};
use rayon::prelude::*;

const MAX_ITERATIONS: usize = 30;
const CONVERGENCE_THRESHOLD_SQ: f64 = 0.0001;

/// Parallel columns: sample `i` is `(l[i], a[i], b[i])` at weight `w[i]` from grid cell `cell[i]`.
#[derive(Default)]
pub struct Pool {
    pub l: Vec<f64>,
    pub a: Vec<f64>,
    pub b: Vec<f64>,
    pub w: Vec<f64>,
    /// 4-byte cell indices, as the TypeScript `Int32Array`: a 1500-stitch Crisp pool holds 1.5 M or more.
    pub cell: Vec<u32>,
}

impl Pool {
    pub fn with_capacity(n: usize) -> Self {
        Pool {
            l: Vec::with_capacity(n),
            a: Vec::with_capacity(n),
            b: Vec::with_capacity(n),
            w: Vec::with_capacity(n),
            cell: Vec::with_capacity(n),
        }
    }

    #[inline]
    pub fn push(&mut self, lab: Oklab, w: f64, cell: usize) {
        self.l.push(lab[0]);
        self.a.push(lab[1]);
        self.b.push(lab[2]);
        self.w.push(w);
        self.cell.push(cell as u32);
    }

    #[inline]
    pub fn len(&self) -> usize {
        self.l.len()
    }

    pub fn is_empty(&self) -> bool {
        self.l.is_empty()
    }

    #[inline]
    fn at(&self, i: usize) -> Oklab {
        [self.l[i], self.a[i], self.b[i]]
    }
}

/// Dense group per sample, groups in order of first appearance, and each group's cell.
struct Groups {
    of_sample: Vec<u32>,
    cells: Vec<usize>,
}

fn group_cells(pool: &Pool) -> Groups {
    let max_cell = pool
        .cell
        .iter()
        .copied()
        .max()
        .map_or(0, |m| m as usize + 1);
    let mut of_cell = vec![u32::MAX; max_cell];
    let mut of_sample = Vec::with_capacity(pool.len());
    let mut cells = Vec::new();
    for &c in &pool.cell {
        let c = c as usize;
        if of_cell[c] == u32::MAX {
            of_cell[c] = cells.len() as u32;
            cells.push(c);
        }
        of_sample.push(of_cell[c]);
    }
    Groups { of_sample, cells }
}

fn seeds(pool: &Pool, k: usize, rng: &mut Mulberry32) -> Vec<Oklab> {
    let n = pool.len();
    let mut total_weight = 0.0;
    for i in 0..n {
        total_weight += pool.w[i];
    }
    let mut threshold = rng.next_f64() * total_weight;
    let mut first = n - 1;
    for i in 0..n {
        threshold -= pool.w[i];
        if threshold <= 0.0 {
            first = i;
            break;
        }
    }
    let mut out = vec![pool.at(first)];
    let mut dist = vec![f64::INFINITY; n];
    while out.len() < k {
        let [sl, sa, sb] = *out.last().unwrap();
        dist.par_chunks_mut(CHUNK)
            .enumerate()
            .for_each(|(c, dist)| {
                for (j, dd) in dist.iter_mut().enumerate() {
                    let i = c * CHUNK + j;
                    let (dl, da, db) = (pool.l[i] - sl, pool.a[i] - sa, pool.b[i] - sb);
                    let d = dl * dl + da * da + db * db;
                    if d < *dd {
                        *dd = d;
                    }
                }
            });
        let mut total = 0.0;
        for i in 0..n {
            total += dist[i] * pool.w[i];
        }
        if total == 0.0 {
            out.push(pool.at((rng.next_f64() * n as f64).floor() as usize));
            continue;
        }
        let mut threshold = rng.next_f64() * total;
        let mut chosen = n - 1;
        for i in 0..n {
            threshold -= dist[i] * pool.w[i];
            if threshold <= 0.0 {
                chosen = i;
                break;
            }
        }
        out.push(pool.at(chosen));
    }
    out
}

fn assign(pool: &Pool, centroids: &[Oklab], out: &mut [u8]) {
    let k = centroids.len();
    out.par_chunks_mut(CHUNK)
        .enumerate()
        .for_each(|(chunk, out)| {
            for (j, slot) in out.iter_mut().enumerate() {
                let i = chunk * CHUNK + j;
                let (pl, pa, pb) = (pool.l[i], pool.a[i], pool.b[i]);
                let mut best = 0;
                let mut best_dist = f64::INFINITY;
                for c in 0..k {
                    let (dl, da, db) = (
                        pl - centroids[c][0],
                        pa - centroids[c][1],
                        pb - centroids[c][2],
                    );
                    let d = dl * dl + da * da + db * db;
                    if d < best_dist {
                        best_dist = d;
                        best = c;
                    }
                }
                *slot = best as u8;
            }
        });
}

/// `runWeightedLloydPool`.
fn lloyd(pool: &Pool, initial: Vec<Oklab>) -> (Vec<Oklab>, Vec<u8>) {
    let n = pool.len();
    let mut centroids = initial;
    let k = centroids.len();
    let mut assignments = vec![0u8; n];
    let mut sums = vec![0f64; k * 3];
    let mut weights = vec![0f64; k];
    for _ in 0..MAX_ITERATIONS {
        assign(pool, &centroids, &mut assignments);
        sums.fill(0.0);
        weights.fill(0.0);
        for i in 0..n {
            let c = assignments[i] as usize;
            sums[c * 3] += pool.l[i] * pool.w[i];
            sums[c * 3 + 1] += pool.a[i] * pool.w[i];
            sums[c * 3 + 2] += pool.b[i] * pool.w[i];
            weights[c] += pool.w[i];
        }
        let mut max_shift = 0.0;
        for c in 0..k {
            if weights[c] == 0.0 {
                continue;
            }
            let next = [
                sums[c * 3] / weights[c],
                sums[c * 3 + 1] / weights[c],
                sums[c * 3 + 2] / weights[c],
            ];
            max_shift = jsmath::max(max_shift, oklab_distance_sq(&centroids[c], &next));
            centroids[c] = next;
        }
        if max_shift < CONVERGENCE_THRESHOLD_SQ {
            break;
        }
    }
    assign(pool, &centroids, &mut assignments);
    (centroids, assignments)
}

fn build_palette(centroids: &[Oklab], assignments: &[u8], pool: &Pool) -> (Vec<Rgb>, Vec<u8>) {
    let mut weights = vec![0f64; centroids.len()];
    for (i, &c) in assignments.iter().enumerate() {
        weights[c as usize] += pool.w[i];
    }
    // A cluster with no weight has no colour to contribute, so it is dropped; its samples are the zero-coverage modes
    // of confident cells, whose labels nothing reads (a crisp cell takes its label from the admissible costs, and every
    // non-crisp cell has a weight-1 sample that can never be dropped). They keep label 0, which is what the TypeScript
    // reaches too — there by an undefined lookup until G-051 said it out loud.
    const DROPPED_CLUSTER_LABEL: u8 = 0;
    let mut remap = vec![DROPPED_CLUSTER_LABEL; centroids.len()];
    let mut palette = Vec::new();
    for (c, centroid) in centroids.iter().enumerate() {
        if weights[c] <= 0.0 {
            continue;
        }
        remap[c] = palette.len() as u8;
        palette.push(oklab_to_rgb(*centroid));
    }
    (
        palette,
        assignments.iter().map(|&c| remap[c as usize]).collect(),
    )
}

/// `weightedQuantizePool` (the weighted "Original").
fn plain(pool: &Pool, color_count: usize, distinct_cells: usize) -> (Vec<Rgb>, Vec<u8>) {
    let k = color_count.min(pool.len()).max(1);
    let seed = (0xc0ffee_u32 as i32 ^ distinct_cells as i32 ^ k as i32) as u32;
    let mut rng = Mulberry32::new(seed);
    let s = seeds(pool, k, &mut rng);
    let (centroids, assignments) = lloyd(pool, s);
    build_palette(&centroids, &assignments, pool)
}

fn inject(
    pool: &Pool,
    assignment: &[u8],
    centroids: &[Oklab],
    slots: usize,
    importance: &[f32],
    groups: &Groups,
) -> Vec<Oklab> {
    let n = pool.len();
    let mut next_assignment = assignment.to_vec();
    let mut next_centroids = centroids.to_vec();
    let group_count = groups.cells.len();
    let mut start = vec![0u32; group_count + 1];
    for &g in &groups.of_sample {
        start[g as usize + 1] += 1;
    }
    for g in 0..group_count {
        start[g + 1] += start[g];
    }
    let mut members = vec![0u32; n];
    let mut fill = start[..group_count].to_vec();
    for (i, &g) in groups.of_sample.iter().enumerate() {
        members[fill[g as usize] as usize] = i as u32;
        fill[g as usize] += 1;
    }
    let factor: Vec<f64> = groups
        .cells
        .iter()
        .map(|&c| 1.0 + WORST_FIT_IMPORTANCE_BOOST * importance[c] as f64)
        .collect();
    let mut assigned = vec![0f64; n];
    for i in 0..n {
        let c = next_centroids[next_assignment[i] as usize];
        let (dl, da, db) = (pool.l[i] - c[0], pool.a[i] - c[1], pool.b[i] - c[2]);
        assigned[i] = dl * dl + da * da + db * db;
    }
    for _ in 0..slots {
        // Per group: its score and worst sample; the first group with the largest score wins, as sequentially.
        let (worst_score, worst_group, worst_sample) = (0..group_count)
            .into_par_iter()
            .with_min_len(1024)
            .map(|g| {
                let (s, e) = (start[g] as usize, start[g + 1] as usize);
                let mut total = 0.0;
                let mut best_sample = members[s] as usize;
                let mut best_score = -1.0;
                for &i in &members[s..e] {
                    let i = i as usize;
                    let err = assigned[i] * pool.w[i];
                    total += err;
                    if err > best_score {
                        best_score = err;
                        best_sample = i;
                    }
                }
                (total * factor[g], g, best_sample)
            })
            .reduce(
                || (-1.0, usize::MAX, 0),
                |a, b| {
                    if b.0 > a.0 || (b.0 == a.0 && b.1 < a.1) {
                        b
                    } else {
                        a
                    }
                },
            );
        if worst_group == usize::MAX || !(worst_score > -1.0) {
            break;
        }
        let nc = pool.at(worst_sample);
        let new_index = next_centroids.len();
        next_centroids.push(nc);
        let [cl, ca, cb] = nc;
        next_assignment
            .par_chunks_mut(CHUNK)
            .zip(assigned.par_chunks_mut(CHUNK))
            .enumerate()
            .for_each(|(chunk, (next_assignment, assigned))| {
                for j in 0..assigned.len() {
                    let i = chunk * CHUNK + j;
                    let (dl, da, db) = (pool.l[i] - cl, pool.a[i] - ca, pool.b[i] - cb);
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

/// The weighted quantizer for the chosen built-in: `(palette, label per sample)`.
pub fn quantize_pool(
    pool: &Pool,
    color_count: usize,
    importance: &[f32],
    latest: bool,
) -> (Vec<Rgb>, Vec<u8>) {
    let groups = group_cells(pool);
    let distinct = groups.cells.len();
    let initial = plain(pool, color_count, distinct);
    if !latest {
        return initial;
    }
    let target = color_count.min(distinct);
    if target < 3 {
        return initial;
    }
    let (merged_index, merged_palette) = merge_similar_colors_weighted(
        &initial.1,
        &initial.0,
        REINVEST_MERGE_THRESHOLD,
        Some(&pool.w),
    );
    let freed = target.saturating_sub(merged_palette.len());
    if freed == 0 {
        return (merged_palette, merged_index);
    }
    let merged_oklab: Vec<Oklab> = merged_palette.iter().map(|&c| rgb_to_oklab(c)).collect();
    let centroids = inject(
        pool,
        &merged_index,
        &merged_oklab,
        freed,
        importance,
        &groups,
    );
    let (centroids, assignments) = lloyd(pool, centroids);
    build_palette(&centroids, &assignments, pool)
}
