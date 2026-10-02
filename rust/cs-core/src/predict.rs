//! G-087: how many colours a picture reasonably needs, and which, before it is generated.
//!
//! The palette of a chart comes from clustering the picture's cells (their area-mean colours), before the smoothing steps,
//! so a quick clustering of the same cells says a good deal of what generation will find. The picture is reduced to the
//! chart's cells exactly as generation does it, clustered into more colours than anyone would use (`START_COLORS`), and the
//! clusters are then merged two at a time, always the pair whose merging adds least squared error (Ward's rule), down to
//! two. That gives the error of every count from two up in one pass: how far, in Oklab, the cells are on average from the
//! colour that stands for them. A colour is worth adding while it takes the error down by more than the eye would see
//! (D276); past that it only spends threads, typically on shadows, where many cells lie close together.

use crate::color::{oklab_to_rgb, Rgb};
use crate::downsample::{downsample_to_grid_vivid, empty_cell_mask, grid_dimensions_for};
use crate::photo_adjust::{adjust_image, PhotoAdjust};
use crate::quantize::{quantize, Quantizer};
use crate::threads::{thread_for, Brand};
use crate::Image;

/// Colours the picture is first clustered into, before merging them down.
const START_COLORS: usize = 48;
/// The most colours a prediction ever allows (the app's own maximum is higher).
pub const MAX_PREDICTED: usize = 48;

pub struct PredictOptions {
    pub longer_side_stitches: f64,
    /// The thread brand the chart will be made in, if any: the colours are then given as the nearest threads.
    pub brand: Option<Brand>,
    pub photo_adjust: PhotoAdjust,
}

/// A colour the picture is expected to need.
pub struct Guess {
    pub rgb: Rgb,
    /// The cells it would stand for.
    pub cells: usize,
    /// In a brand, the thread nearest it: code and name.
    pub thread: Option<(String, String)>,
}

pub struct Prediction {
    /// The count to suggest, the range of counts that give the best results, and the ceiling the colour count may be set
    /// to, which is above the best count on purpose (Owner, 2026-10-02: be optimistic).
    pub suggested: usize,
    pub low: usize,
    pub high: usize,
    pub ceiling: usize,
    /// The colours at the suggested count, largest first.
    pub colors: Vec<Guess>,
    /// The error at each count from 2 up: (count, mean distance of a cell from its colour, in Oklab).
    pub curve: Vec<(usize, f64)>,
    /// Cells that carry a stitch.
    pub cells: usize,
}

#[derive(Clone)]
struct Cluster {
    n: f64,
    mean: [f64; 3],
}

/// The error of merging two clusters: the rise in the sum of squared distances to their colours.
fn merge_cost(a: &Cluster, b: &Cluster) -> f64 {
    let d2: f64 = (0..3).map(|k| (a.mean[k] - b.mean[k]).powi(2)).sum();
    a.n * b.n / (a.n + b.n) * d2
}

/// Where the error curve is read for the three counts. A colour is worth its thread while adding it lowers the mean error
/// of a cell by more than these amounts, in Oklab (a just noticeable difference is about 0.02).
const GAIN_FOR_LOW: f64 = 0.0040;
const GAIN_FOR_SUGGESTED: f64 = 0.0018;
const GAIN_FOR_HIGH: f64 = 0.0008;
/// The ceiling is the high count with this much room above it, and at least this many colours.
const CEILING_ROOM: f64 = 1.35;
const CEILING_EXTRA: usize = 3;

pub fn predict(image: &Image, options: &PredictOptions) -> Prediction {
    let adjusted = adjust_image(image, &options.photo_adjust);
    let image = adjusted.as_ref().unwrap_or(image);
    let (gw, gh) = grid_dimensions_for(image.width, image.height, options.longer_side_stitches);
    let (cells, coverage) = downsample_to_grid_vivid(image, gw, gh, 0.0);
    let empty = empty_cell_mask(&coverage);
    let table = crate::color::srgb_to_linear_table();
    let mut points: Vec<f64> = Vec::new();
    for i in 0..gw * gh {
        if empty.as_ref().is_some_and(|m| m[i] != 0) {
            continue;
        }
        points.extend_from_slice(&crate::color::oklab_from_bytes(
            table,
            cells[i * 3],
            cells[i * 3 + 1],
            cells[i * 3 + 2],
        ));
    }
    let n = points.len() / 3;
    if n < 2 {
        return Prediction {
            suggested: 2,
            low: 2,
            high: 2,
            ceiling: 2,
            colors: Vec::new(),
            curve: Vec::new(),
            cells: n,
        };
    }

    // Cluster, then merge down.
    let start = START_COLORS.min(n);
    let importance = vec![1f32; n];
    let (labels, _) = quantize(Quantizer::Original, &points, start, &importance);
    let used = labels.iter().map(|&l| l as usize).max().unwrap_or(0) + 1;
    let mut clusters: Vec<Cluster> = vec![
        Cluster {
            n: 0.0,
            mean: [0.0; 3]
        };
        used
    ];
    for (i, &l) in labels.iter().enumerate() {
        let c = &mut clusters[l as usize];
        c.n += 1.0;
        for k in 0..3 {
            c.mean[k] += points[i * 3 + k];
        }
    }
    for c in &mut clusters {
        if c.n > 0.0 {
            for k in 0..3 {
                c.mean[k] /= c.n;
            }
        }
    }
    // The error inside the starting clusters.
    let mut sse: f64 = 0.0;
    for (i, &l) in labels.iter().enumerate() {
        let mean = clusters[l as usize].mean;
        for k in 0..3 {
            sse += (points[i * 3 + k] - mean[k]).powi(2);
        }
    }
    clusters.retain(|c| c.n > 0.0);

    // Ward's merging, remembering the error and the clusters at every count.
    let mut curve: Vec<(usize, f64)> = Vec::new();
    let mut states: Vec<(usize, Vec<Cluster>)> = Vec::new();
    loop {
        let k = clusters.len();
        curve.push((k, (sse / n as f64).sqrt()));
        states.push((k, clusters.clone()));
        if k <= 2 {
            break;
        }
        let mut best = (f64::INFINITY, 0usize, 1usize);
        for a in 0..k {
            for b in a + 1..k {
                let cost = merge_cost(&clusters[a], &clusters[b]);
                if cost < best.0 {
                    best = (cost, a, b);
                }
            }
        }
        let (cost, a, b) = best;
        sse += cost;
        let (ca, cb) = (clusters[a].clone(), clusters[b].clone());
        let total = ca.n + cb.n;
        clusters[a] = Cluster {
            n: total,
            mean: [0, 1, 2].map(|k| (ca.mean[k] * ca.n + cb.mean[k] * cb.n) / total),
        };
        clusters.remove(b);
    }
    curve.reverse();
    states.reverse();

    // Read the counts off the curve: the least count from which every further colour gains less than the threshold.
    let error_at = |count: usize| {
        curve
            .iter()
            .find(|(k, _)| *k == count)
            .map_or(0.0, |(_, e)| *e)
    };
    let top = curve.last().map_or(2, |(k, _)| *k);
    let read = |threshold: f64| {
        let mut chosen = top;
        for k in (2..top).rev() {
            if error_at(k) - error_at(k + 1) >= threshold {
                break;
            }
            chosen = k;
        }
        chosen.max(2)
    };
    let (low, suggested, high) = (
        read(GAIN_FOR_LOW),
        read(GAIN_FOR_SUGGESTED),
        read(GAIN_FOR_HIGH),
    );
    let (low, suggested) = (low.min(suggested), suggested.min(high));
    let ceiling = ((high as f64 * CEILING_ROOM).round() as usize)
        .max(high + CEILING_EXTRA)
        .min(MAX_PREDICTED)
        .max(high);

    let chosen = states
        .iter()
        .find(|(k, _)| *k == suggested)
        .map(|(_, c)| c.clone())
        .unwrap_or_default();
    let mut colors: Vec<Guess> = chosen
        .iter()
        .map(|c| {
            let rgb = oklab_to_rgb(c.mean);
            Guess {
                rgb,
                cells: c.n as usize,
                thread: options.brand.map(|b| {
                    let (code, name, _) = thread_for(b, rgb);
                    (code, name)
                }),
            }
        })
        .collect();
    colors.sort_by(|a, b| b.cells.cmp(&a.cells));
    Prediction {
        suggested,
        low,
        high,
        ceiling,
        colors,
        curve,
        cells: n,
    }
}

/// A kind of colour a set of threads lacks, as the picture asks for it.
pub struct Missing {
    pub rgb: Rgb,
    pub name: String,
    /// The share of the picture's stitched cells that lie far from every colour of the set and are of this kind.
    pub share: f64,
}

pub struct Coverage {
    /// The share of the picture's stitched cells that have a colour of the set within `FAR_COLOR` of them.
    pub covered: f64,
    /// Up to three kinds of colour that are missing, the largest first; empty when nothing is missing dramatically.
    pub missing: Vec<Missing>,
}

/// A cell is far from the set when its nearest colour is this far, in Oklab: several times the just noticeable difference.
const FAR_COLOR: f64 = 0.10;
/// A kind of colour is reported when it is at least this share of the picture.
const MISSING_SHARE: f64 = 0.03;

/// How well `set` covers the picture: the cells that have no colour of it near, grouped into kinds and named (G-087).
pub fn coverage(image: &Image, options: &PredictOptions, set: &[Rgb]) -> Coverage {
    let adjusted = adjust_image(image, &options.photo_adjust);
    let image = adjusted.as_ref().unwrap_or(image);
    let (gw, gh) = grid_dimensions_for(image.width, image.height, options.longer_side_stitches);
    let (cells, coverage) = downsample_to_grid_vivid(image, gw, gh, 0.0);
    let empty = empty_cell_mask(&coverage);
    let table = crate::color::srgb_to_linear_table();
    let lab_set: Vec<[f64; 3]> = set.iter().map(|&c| crate::color::rgb_to_oklab(c)).collect();
    let mut stitched = 0usize;
    let mut far: Vec<f64> = Vec::new();
    for i in 0..gw * gh {
        if empty.as_ref().is_some_and(|m| m[i] != 0) {
            continue;
        }
        stitched += 1;
        let lab =
            crate::color::oklab_from_bytes(table, cells[i * 3], cells[i * 3 + 1], cells[i * 3 + 2]);
        let nearest = lab_set
            .iter()
            .map(|s| crate::color::oklab_distance_sq(&lab, s).sqrt())
            .fold(f64::INFINITY, f64::min);
        if nearest > FAR_COLOR {
            far.extend_from_slice(&lab);
        }
    }
    if stitched == 0 {
        return Coverage {
            covered: 1.0,
            missing: Vec::new(),
        };
    }
    let n_far = far.len() / 3;
    let covered = 1.0 - n_far as f64 / stitched as f64;
    if n_far == 0 {
        return Coverage {
            covered,
            missing: Vec::new(),
        };
    }
    // The far cells into at most three kinds of colour.
    let k = 3.min(n_far);
    let importance = vec![1f32; n_far];
    let (labels, palette) = quantize(Quantizer::Original, &far, k, &importance);
    let mut counts = vec![0usize; palette.len()];
    for &l in &labels {
        counts[l as usize] += 1;
    }
    let mut kinds: Vec<(Rgb, usize)> = palette
        .iter()
        .zip(counts)
        .filter(|&(_, c)| c > 0)
        .map(|(&rgb, c)| (rgb, c))
        .collect();
    kinds.sort_by(|a, b| b.1.cmp(&a.1));
    let rgbs: Vec<Rgb> = kinds.iter().map(|k| k.0).collect();
    let names = crate::names::name_colors(&rgbs);
    let missing = kinds
        .iter()
        .zip(names)
        .map(|(&(rgb, c), name)| Missing {
            rgb,
            name,
            share: c as f64 / stitched as f64,
        })
        .filter(|m| m.share >= MISSING_SHARE)
        .collect();
    Coverage { covered, missing }
}
