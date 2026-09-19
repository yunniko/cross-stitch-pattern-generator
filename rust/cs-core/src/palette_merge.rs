//! Port of `lib/pipeline/palette-optimizer.ts` (`mergeSimilarColors`, unweighted).

use crate::color::{oklab_distance_sq, rgb_to_oklab, Rgb};

pub const DEFAULT_MERGE_DISTANCE_SQUARED: f64 = 0.0004;

fn find(parent: &mut [usize], mut i: usize) -> usize {
    while parent[i] != i {
        parent[i] = parent[parent[i]];
        i = parent[i];
    }
    i
}

/// Repeatedly merges the closest pair within `threshold`, less-used into more-used.
pub fn merge_similar_colors(
    cell_palette_index: &[u8],
    palette: &[Rgb],
    threshold: f64,
) -> (Vec<u8>, Vec<Rgb>) {
    let oklab: Vec<_> = palette.iter().map(|&c| rgb_to_oklab(c)).collect();
    let n = palette.len();
    let mut counts = vec![0u64; n];
    for &c in cell_palette_index {
        counts[c as usize] += 1;
    }
    let mut parent: Vec<usize> = (0..n).collect();
    let mut alive = vec![true; n];

    loop {
        let mut best: Option<(usize, usize)> = None;
        let mut best_dist = f64::INFINITY;
        for i in 0..n {
            if !alive[i] {
                continue;
            }
            for j in i + 1..n {
                if !alive[j] {
                    continue;
                }
                let d = oklab_distance_sq(&oklab[i], &oklab[j]);
                if d < best_dist {
                    best_dist = d;
                    best = Some((i, j));
                }
            }
        }
        let Some((bi, bj)) = best else { break };
        if best_dist >= threshold {
            break;
        }
        let (loser, winner) = if counts[bi] <= counts[bj] {
            (bi, bj)
        } else {
            (bj, bi)
        };
        parent[loser] = winner;
        alive[loser] = false;
        counts[winner] += counts[loser];
    }

    let mut new_index_of = vec![0u8; n];
    let mut new_palette = Vec::new();
    for i in 0..n {
        if alive[i] {
            new_index_of[i] = new_palette.len() as u8;
            new_palette.push(palette[i]);
        }
    }
    let out = cell_palette_index
        .iter()
        .map(|&c| {
            let root = find(&mut parent, c as usize);
            new_index_of[root]
        })
        .collect();
    (out, new_palette)
}
