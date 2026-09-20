//! Port of `lib/threads/brand-match.ts` (`applyBrandPalette`, D56, D71, D92). The thread tables are compiled in from
//! `data/`, which `scripts/rust-tables.mjs` writes from `lib/threads/`.

use crate::color::{luminance, oklab_distance_sq, rgb_to_oklab, Oklab, Rgb};
use crate::crisp::evidence::EvidenceLayer;
use crate::crisp::repair;
use crate::names::symbol_set;
use crate::optimize::{run_local_optimizer, Ctx, Weights};
use crate::pattern::{PaletteColor, StitchPattern};
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Brand {
    Dmc,
    Cosmo,
    Anchor,
}

impl Brand {
    pub fn id(self) -> &'static str {
        match self {
            Brand::Dmc => "dmc",
            Brand::Cosmo => "cosmo",
            Brand::Anchor => "anchor",
        }
    }
}

#[derive(Clone, Debug)]
pub struct Thread {
    pub code: String,
    pub name: String,
    pub rgb: Rgb,
    oklab: Oklab,
}

fn parse_threads(tsv: &'static str) -> Vec<Thread> {
    tsv.lines()
        .filter(|l| !l.is_empty())
        .map(|line| {
            let mut parts = line.split('\t');
            let code = parts.next().expect("code").to_string();
            let name = parts.next().expect("name").to_string();
            let n = u32::from_str_radix(parts.next().expect("rgb"), 16).expect("hex");
            let rgb = [(n >> 16) as u8, (n >> 8) as u8, n as u8];
            Thread {
                code,
                name,
                rgb,
                oklab: rgb_to_oklab(rgb),
            }
        })
        .collect()
}

fn dmc() -> &'static [Thread] {
    static T: OnceLock<Vec<Thread>> = OnceLock::new();
    T.get_or_init(|| parse_threads(include_str!("../data/threads-dmc.tsv")))
}

fn cosmo() -> &'static [Thread] {
    static T: OnceLock<Vec<Thread>> = OnceLock::new();
    T.get_or_init(|| parse_threads(include_str!("../data/threads-cosmo.tsv")))
}

fn dmc_to_anchor() -> &'static HashMap<&'static str, &'static str> {
    static T: OnceLock<HashMap<&'static str, &'static str>> = OnceLock::new();
    T.get_or_init(|| {
        include_str!("../data/dmc-to-anchor.tsv")
            .lines()
            .filter(|l| !l.is_empty())
            .map(|l| l.split_once('\t').expect("dmc<TAB>anchor"))
            .collect()
    })
}

/// `nearestColorInBrand`: the first thread at the smallest squared OKLab distance.
fn nearest(rgb: Rgb, threads: &'static [Thread]) -> &'static Thread {
    let target = rgb_to_oklab(rgb);
    let mut best = &threads[0];
    let mut best_distance = f64::INFINITY;
    for t in threads {
        let d = oklab_distance_sq(&target, &t.oklab);
        if d < best_distance {
            best_distance = d;
            best = t;
        }
    }
    best
}

/// `formatThreadName`.
fn thread_name(code: &str, name: &str) -> String {
    if name.is_empty() {
        code.to_string()
    } else {
        format!("{code} - {name}")
    }
}

/// `applyBrandPalette`. `reoptimize` re-runs ICM with `DEFAULT_LOCAL_OPTIMIZER_WEIGHTS` against the thread palette.
pub fn apply_brand_palette(
    pattern: StitchPattern,
    brand: Brand,
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
        .map(|c| match brand {
            Brand::Dmc | Brand::Cosmo => {
                let t = nearest(c.rgb, if brand == Brand::Dmc { dmc() } else { cosmo() });
                (t.code.clone(), t.name.clone(), t.rgb)
            }
            Brand::Anchor => {
                let d = nearest(c.rgb, dmc());
                let code = dmc_to_anchor()
                    .get(d.code.as_str())
                    .expect("every DMC code has an Anchor equivalent");
                (code.to_string(), String::new(), d.rgb)
            }
        })
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
        .map(|&c| old_to_merged[c as usize])
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
            counts[g as usize] += 1;
        }
        let used: Vec<usize> = (0..groups.len()).filter(|&i| counts[i] > 0).collect();
        let mut remap = vec![0u8; groups.len()];
        for (new, &old) in used.iter().enumerate() {
            remap[old] = new as u8;
        }
        assignment = reoptimized.iter().map(|&g| remap[g as usize]).collect();
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
                    brand: brand.id(),
                    code: code.clone(),
                }),
            }
        })
        .collect();
    let cell_palette = assignment
        .iter()
        .map(|&a| final_of_merged[a as usize])
        .collect();
    StitchPattern {
        cell_palette,
        palette,
        thread_brand: Some(brand.id()),
        ..pattern
    }
}
