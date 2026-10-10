//! Thread systems (G-132, D400) and `applyBrandPalette` (D56, D71, D92). A system is a maker's numbered threads as data,
//! handed in with each request (`threadSystems` in the options): nothing is compiled in, so a system the site adds, edits
//! or removes reaches generation without a build.

use crate::color::{luminance, oklab_distance_sq, rgb_to_oklab, Oklab, Rgb};
use crate::crisp::evidence::EvidenceLayer;
use crate::crisp::repair;
use crate::names::symbol_set;
use crate::optimize::{run_local_optimizer, Ctx, Weights};
use crate::pattern::{PaletteColor, StitchPattern};
use std::collections::HashMap;
use std::sync::Arc;

#[derive(Clone, Debug)]
pub struct Thread {
    pub code: String,
    pub name: String,
    pub rgb: Rgb,
    oklab: Oklab,
}

/// One system: the key a chart stores as a colour's system ("dmc"), and its threads in the order the list gives them.
#[derive(Debug)]
pub struct ThreadSystem {
    pub key: String,
    threads: Vec<Thread>,
}

/// A system as the options hold it: shared, since every colour of a run reads the same one.
pub type System = Arc<ThreadSystem>;

impl ThreadSystem {
    /// A system of these threads, `(code, name, rgb)` each. Refused when it has none: there would be nothing to match to.
    pub fn new(key: &str, threads: Vec<(String, String, Rgb)>) -> Result<Self, String> {
        if key.is_empty() || threads.is_empty() {
            return Err(format!(
                "thread system {key:?} needs a key and at least one thread"
            ));
        }
        Ok(ThreadSystem {
            key: key.to_string(),
            threads: threads
                .into_iter()
                .map(|(code, name, rgb)| Thread {
                    code,
                    name,
                    rgb,
                    oklab: rgb_to_oklab(rgb),
                })
                .collect(),
        })
    }

    /// The thread with this code: its name (empty when the list has none) and its colour.
    pub fn by_code(&self, code: &str) -> Option<&Thread> {
        self.threads.iter().find(|t| t.code == code)
    }

    /// `nearestColorInBrand`: the first thread at the smallest squared OKLab distance.
    pub fn nearest(&self, rgb: Rgb) -> &Thread {
        let target = rgb_to_oklab(rgb);
        let mut best = &self.threads[0];
        let mut best_distance = f64::INFINITY;
        for t in &self.threads {
            let d = oklab_distance_sq(&target, &t.oklab);
            if d < best_distance {
                best_distance = d;
                best = t;
            }
        }
        best
    }
}

/// `formatThreadName`.
pub(crate) fn thread_name(code: &str, name: &str) -> String {
    if name.is_empty() {
        code.to_string()
    } else {
        format!("{code} - {name}")
    }
}

/// The thread of `system` nearest to `rgb`: its code, its name (empty when the list has none) and its colour.
pub fn thread_for(system: &ThreadSystem, rgb: Rgb) -> (String, String, Rgb) {
    let t = system.nearest(rgb);
    (t.code.clone(), t.name.clone(), t.rgb)
}
/// `applyBrandPalette`. `reoptimize` re-runs ICM with `DEFAULT_LOCAL_OPTIMIZER_WEIGHTS` against the thread palette.
pub fn apply_brand_palette(
    pattern: StitchPattern,
    brand: &ThreadSystem,
    reoptimize: Option<&Ctx>,
    layer: Option<&EvidenceLayer>,
) -> StitchPattern {
    if pattern.palette.is_empty() {
        return pattern;
    }
    // (code, name, rgb) per old palette index.
    let threads: Vec<(String, String, Rgb)> = pattern
        .palette
        .iter()
        .map(|c| thread_for(brand, c.rgb))
        .collect();

    let mut index_by_code: HashMap<String, usize> = HashMap::new();
    let mut groups: Vec<((String, String, Rgb), usize)> = Vec::new();
    let mut old_to_merged = vec![0u8; pattern.palette.len()];
    for (old, color) in pattern.palette.iter().enumerate() {
        let thread = &threads[old];
        let merged = *index_by_code.entry(thread.0.clone()).or_insert_with(|| {
            groups.push((thread.clone(), 0));
            groups.len() - 1
        });
        groups[merged].1 += color.count;
        old_to_merged[old] = merged as u8;
    }
    let mut assignment: Vec<u8> = pattern
        .cell_palette
        .iter()
        .map(|&c| {
            // An empty stitch (G-050) has no colour to snap and keeps its sentinel all the way out.
            if c == crate::EMPTY_CELL {
                crate::EMPTY_CELL
            } else {
                old_to_merged[c as usize]
            }
        })
        .collect();

    if let Some(layer) = layer.filter(|l| !l.is_empty()) {
        let palette_oklab: Vec<Oklab> = groups.iter().map(|g| rgb_to_oklab(g.0 .2)).collect();
        assignment = repair(&assignment, layer, &palette_oklab);
    }

    if let Some(ctx) = reoptimize {
        let rgb: Vec<Rgb> = groups.iter().map(|g| g.0 .2).collect();
        let ctx = Ctx {
            evidence: layer,
            ..*ctx
        };
        let weights = Weights {
            color: 1.0,
            smoothness: 0.045,
            edge_loss: 0.0,
        };
        let reoptimized = run_local_optimizer(&ctx, &assignment, &rgb, weights);
        let mut counts = vec![0usize; groups.len()];
        for &g in &reoptimized {
            if g == crate::EMPTY_CELL {
                continue;
            }
            counts[g as usize] += 1;
        }
        let used: Vec<usize> = (0..groups.len()).filter(|&i| counts[i] > 0).collect();
        let mut remap = vec![0u8; groups.len()];
        for (new, &old) in used.iter().enumerate() {
            remap[old] = new as u8;
        }
        assignment = reoptimized
            .iter()
            .map(|&g| {
                if g == crate::EMPTY_CELL {
                    crate::EMPTY_CELL
                } else {
                    remap[g as usize]
                }
            })
            .collect();
        groups = used
            .iter()
            .map(|&old| (groups[old].0.clone(), counts[old]))
            .collect();
    }

    let mut order: Vec<usize> = (0..groups.len()).collect();
    order.sort_by(|&a, &b| {
        luminance(groups[a].0 .2)
            .partial_cmp(&luminance(groups[b].0 .2))
            .unwrap()
    });
    let mut final_of_merged = vec![0u8; groups.len()];
    for (f, &m) in order.iter().enumerate() {
        final_of_merged[m] = f as u8;
    }
    let symbols = symbol_set();
    let palette = order
        .iter()
        .enumerate()
        .map(|(f, &m)| {
            let ((code, name, rgb), count) = &groups[m];
            PaletteColor {
                index: f,
                rgb: *rgb,
                symbol: symbols[f].clone(),
                name: thread_name(code, name),
                count: *count,
                source: Some(crate::pattern::ThreadSource {
                    brand: brand.key.clone(),
                    code: code.clone(),
                }),
            }
        })
        .collect();
    let cell_palette = assignment
        .iter()
        .map(|&a| {
            if a == crate::EMPTY_CELL {
                crate::EMPTY_CELL
            } else {
                final_of_merged[a as usize]
            }
        })
        .collect();
    StitchPattern {
        cell_palette,
        palette,
        thread_brand: Some(brand.key.clone()),
        ..pattern
    }
}
