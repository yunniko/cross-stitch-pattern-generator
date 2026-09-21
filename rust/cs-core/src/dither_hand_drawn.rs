//! Port of `lib/pipeline/dither-hand-drawn.ts` (G-054): the threshold field a person draws rather than one a screen
//! repeats. Marks are scattered evenly but on no lattice, and each mark's own cells are ranked so the mark grows
//! outward from its centre; spreading those ranks over 0..1 is what makes the field hold tone exactly.
//!
//! Integer arithmetic, comparisons and one `mulberry32` stream consumed in scan order — no transcendental function,
//! so this reproduces the TypeScript bit for bit (D183/D184).

use crate::prng::Mulberry32;

/// Stitches between neighbouring marks; sized in stitches, so a bigger chart carries more marks, not bigger ones.
pub const MARK_SPACING: f64 = 6.0;
const MIN_DISTANCE: f64 = 0.72 * MARK_SPACING;
const ATTEMPTS: usize = 6;
const SEED: u32 = 0x1d10_c0de;

/// Mark centres as interleaved `x, y` in stitch coordinates.
pub fn mark_centres(width: usize, height: usize) -> Vec<f64> {
    let mut rng = Mulberry32::new(SEED);
    let columns = ((width as f64 / MARK_SPACING).ceil() as usize).max(1);
    let rows = ((height as f64 / MARK_SPACING).ceil() as usize).max(1);
    let mut bucket = vec![-1i64; columns * rows];
    let mut centres: Vec<f64> = Vec::new();
    let min_distance_squared = MIN_DISTANCE * MIN_DISTANCE;

    for row in 0..rows {
        for column in 0..columns {
            for _ in 0..ATTEMPTS {
                // Two draws per attempt, always, so both languages consume the stream in step.
                let x = (column as f64 + rng.next_f64()) * MARK_SPACING;
                let y = (row as f64 + rng.next_f64()) * MARK_SPACING;
                if x >= width as f64 || y >= height as f64 {
                    continue;
                }
                let mut too_close = false;
                for dy in -1i64..=1 {
                    if too_close {
                        break;
                    }
                    for dx in -1i64..=1 {
                        let bx = column as i64 + dx;
                        let by = row as i64 + dy;
                        if bx < 0 || by < 0 || bx >= columns as i64 || by >= rows as i64 {
                            continue;
                        }
                        let index = bucket[by as usize * columns + bx as usize];
                        if index < 0 {
                            continue;
                        }
                        let ex = centres[index as usize * 2] - x;
                        let ey = centres[index as usize * 2 + 1] - y;
                        if ex * ex + ey * ey < min_distance_squared {
                            too_close = true;
                            break;
                        }
                    }
                }
                if too_close {
                    continue;
                }
                bucket[row * columns + column] = (centres.len() / 2) as i64;
                centres.push(x);
                centres.push(y);
                break;
            }
        }
    }
    centres
}

/// The centre nearest each cell, by index into `centres`.
fn nearest_centre(width: usize, height: usize, centres: &[f64]) -> Vec<i64> {
    let columns = ((width as f64 / MARK_SPACING).ceil() as usize).max(1);
    let rows = ((height as f64 / MARK_SPACING).ceil() as usize).max(1);
    let count = centres.len() / 2;
    let mut heads = vec![-1i64; columns * rows];
    let mut next = vec![-1i64; count];
    for m in 0..count {
        let bx = ((centres[m * 2] / MARK_SPACING).floor() as usize).min(columns - 1);
        let by = ((centres[m * 2 + 1] / MARK_SPACING).floor() as usize).min(rows - 1);
        let bucket = by * columns + bx;
        next[m] = heads[bucket];
        heads[bucket] = m as i64;
    }

    let mut owner = vec![-1i64; width * height];
    for y in 0..height {
        for x in 0..width {
            let cx = ((x as f64 / MARK_SPACING).floor() as usize).min(columns - 1) as i64;
            let cy = ((y as f64 / MARK_SPACING).floor() as usize).min(rows - 1) as i64;
            let mut best: i64 = -1;
            let mut best_distance = f64::INFINITY;
            let limit = columns.max(rows) as i64 + 1;
            let mut radius = 1i64;
            while radius < limit && best < 0 {
                for by in (cy - radius)..=(cy + radius) {
                    if by < 0 || by >= rows as i64 {
                        continue;
                    }
                    for bx in (cx - radius)..=(cx + radius) {
                        if bx < 0 || bx >= columns as i64 {
                            continue;
                        }
                        let mut m = heads[by as usize * columns + bx as usize];
                        while m >= 0 {
                            let ex = centres[m as usize * 2] - (x as f64 + 0.5);
                            let ey = centres[m as usize * 2 + 1] - (y as f64 + 0.5);
                            let distance = ex * ex + ey * ey;
                            // Ties go to the lower index, so the map never depends on the bucket walk order.
                            if distance < best_distance || (distance == best_distance && m < best) {
                                best_distance = distance;
                                best = m;
                            }
                            m = next[m as usize];
                        }
                    }
                }
                radius += 1;
            }
            owner[y * width + x] = best;
        }
    }
    owner
}

/// A threshold in 0..1 for every cell. `score_of` decides a mark's shape; a lower score is drawn first.
pub fn hand_drawn_thresholds(
    width: usize,
    height: usize,
    score_of: impl Fn(usize, f64, f64) -> f64,
) -> Vec<f64> {
    let centres = mark_centres(width, height);
    let mut thresholds = vec![0f64; width * height];
    if centres.is_empty() {
        return thresholds;
    }

    let owner = nearest_centre(width, height, &centres);
    let mark_count = centres.len() / 2;
    let mut starts = vec![0i64; mark_count + 1];
    for &m in &owner {
        starts[m as usize + 1] += 1;
    }
    for m in 0..mark_count {
        starts[m + 1] += starts[m];
    }
    let mut cursor: Vec<i64> = starts[..mark_count].to_vec();
    let mut cells = vec![0usize; owner.len()];
    let mut scores = vec![0f64; owner.len()];
    for y in 0..height {
        for x in 0..width {
            let i = y * width + x;
            let m = owner[i] as usize;
            let slot = cursor[m];
            cursor[m] += 1;
            cells[slot as usize] = i;
            scores[i] = score_of(
                m,
                x as f64 + 0.5 - centres[m * 2],
                y as f64 + 0.5 - centres[m * 2 + 1],
            );
        }
    }

    for m in 0..mark_count {
        let from = starts[m] as usize;
        let to = starts[m + 1] as usize;
        let size = to - from;
        if size == 0 {
            continue;
        }
        let slice = &mut cells[from..to];
        // Sorted on (score, cell index): a total order, so both languages rank a mark's cells the same way.
        slice.sort_by(|&a, &b| {
            scores[a]
                .partial_cmp(&scores[b])
                .expect("finite score")
                .then(a.cmp(&b))
        });
        for (rank, &cell) in slice.iter().enumerate() {
            thresholds[cell] = (rank as f64 + 0.5) / size as f64;
        }
    }
    thresholds
}

/// M1's mark: a dot that grows outward from its centre.
pub fn dot_score(_mark: usize, dx: f64, dy: f64) -> f64 {
    dx * dx + dy * dy
}
