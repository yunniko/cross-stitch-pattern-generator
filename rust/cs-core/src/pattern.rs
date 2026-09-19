//! Port of `buildPattern` (`lib/pipeline/pattern.ts`): every edge mode, both quantizers, thread brands and photo
//! enhancement. Contour refinement (experimental, off by default) and custom quantizers are not ported.

use crate::color::{luminance, rgb_to_oklab, Oklab, Rgb};
use crate::crisp::evidence::{build_evidence_layer, EdgeModel, EvidenceLayer};
use crate::crisp::{finalize, plus, repair, stage};
use crate::denoise::denoise_for_quantization;
use crate::downsample::{downsample_to_grid, grid_dimensions_for};
use crate::edge_map::{compute_cell_importance, compute_edge_magnitude, source_luminance};
use crate::enhance::{enhance, Mode as EnhancementMode};
use crate::names::{name_colors, symbol_set};
use crate::optimize::{
    fix_diagonal_connections, recolor_small_components, run_multi_scale_optimizer, Ctx,
};
use crate::pair_evidence::compute_pair_edge_evidence;
use crate::palette_merge::{merge_similar_colors, DEFAULT_MERGE_DISTANCE_SQUARED};
use crate::quantize::{mean_oklab_as_rgb, quantize, Quantizer};
use crate::threads::{apply_brand_palette, Brand};
use crate::{color, Image};
use std::time::Instant;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EdgeMode {
    Standard,
    Crisp,
    CrispPlus,
}

impl EdgeMode {
    pub fn id(self) -> &'static str {
        match self {
            EdgeMode::Standard => "standard",
            EdgeMode::Crisp => "crisp",
            EdgeMode::CrispPlus => "crisp-plus",
        }
    }
}

#[derive(Clone, Debug)]
pub struct BuildOptions {
    pub longer_side_stitches: f64,
    pub color_count: usize,
    pub quantizer: Quantizer,
    pub optimize: bool,
    pub edge_mode: EdgeMode,
    /// `None` is the full palette.
    pub brand: Option<Brand>,
    pub enhancement: EnhancementMode,
}

#[derive(Clone, Debug)]
pub struct PaletteColor {
    pub index: usize,
    pub rgb: Rgb,
    pub symbol: String,
    pub name: String,
    pub count: usize,
}

#[derive(Clone, Debug)]
pub struct StitchPattern {
    pub width: usize,
    pub height: usize,
    pub cell_palette: Vec<u8>,
    pub palette: Vec<PaletteColor>,
    pub is_landscape: bool,
    pub thread_brand: Option<&'static str>,
    pub edge_mode: Option<&'static str>,
    pub enhancement_mode: Option<&'static str>,
}

/// Wall time per stage, in milliseconds, in pipeline order.
pub type StageTimes = Vec<(&'static str, f64)>;

/// Drops palette entries no cell uses: (compacted labels, the kept original indices).
fn compact(labels: &[u8], palette_len: usize) -> (Vec<u8>, Vec<usize>) {
    let mut counts = vec![0usize; palette_len];
    for &c in labels {
        counts[c as usize] += 1;
    }
    let used: Vec<usize> = (0..palette_len).filter(|&i| counts[i] > 0).collect();
    let mut remap = vec![0u8; palette_len];
    for (new, &old) in used.iter().enumerate() {
        remap[old] = new as u8;
    }
    (labels.iter().map(|&c| remap[c as usize]).collect(), used)
}

pub fn build_pattern(
    image: &Image,
    options: &BuildOptions,
    times: &mut StageTimes,
) -> StitchPattern {
    let mut clock = Instant::now();
    let mut lap = |name: &'static str, times: &mut StageTimes| {
        let now = Instant::now();
        times.push((name, (now - clock).as_secs_f64() * 1000.0));
        clock = now;
    };
    let crisp = options.edge_mode != EdgeMode::Standard;

    // Colour stages read the enhanced photo; importance and pair evidence read the original (D112).
    let enhanced = enhance(image, options.enhancement);
    let color_source = enhanced.as_ref().unwrap_or(image);
    lap("enhance", times);

    let (gw, gh) = grid_dimensions_for(image.width, image.height, options.longer_side_stitches);
    let cells = downsample_to_grid(color_source, gw, gh);
    lap("downsample", times);

    let gray = source_luminance(image);
    let edge = compute_edge_magnitude(image, &gray);
    let importance = compute_cell_importance(image, &edge, gw, gh, &gray);
    drop(edge);
    drop(gray);
    lap("importance", times);

    let pair_evidence = if crisp || options.optimize {
        compute_pair_edge_evidence(image, gw, gh)
    } else {
        Vec::new()
    };
    lap("pairEvidence", times);

    let layer: Option<EvidenceLayer> = crisp.then(|| {
        let model = if options.edge_mode == EdgeMode::CrispPlus {
            EdgeModel::BlurredStep
        } else {
            EdgeModel::Step
        };
        build_evidence_layer(color_source, gw, gh, model)
    });
    if crisp {
        lap("crispEvidence", times);
    }

    let table = color::srgb_to_linear_table();
    let cell_oklab: Vec<f64> = cells
        .chunks_exact(3)
        .flat_map(|c| color::oklab_from_bytes(table, c[0], c[1], c[2]))
        .collect();
    let ctx = Ctx {
        width: gw,
        height: gh,
        cell_oklab: &cell_oklab,
        importance: &importance,
        pair_evidence: &pair_evidence,
        evidence: layer.as_ref(),
    };

    let denoised = denoise_for_quantization(gw, gh, &cell_oklab, &importance);
    lap("denoise", times);

    let latest = options.quantizer == Quantizer::Latest;
    let (quantized, raw_palette) = match &layer {
        Some(layer) => stage::run(&denoised, options.color_count, &importance, layer, latest),
        None => quantize(
            options.quantizer,
            &denoised,
            options.color_count,
            &importance,
        ),
    };
    drop(denoised);
    lap("quantize", times);

    let mut optimized = quantized;
    if options.optimize {
        optimized = run_multi_scale_optimizer(&ctx, &optimized, &raw_palette);
        lap("icm", times);
        optimized = recolor_small_components(&ctx, &optimized, &raw_palette);
        optimized = fix_diagonal_connections(&ctx, &optimized, &raw_palette);
        optimized = recolor_small_components(&ctx, &optimized, &raw_palette);
        lap("cleanup", times);
    }

    let (mut merged_index, mut merged_palette) = if options.optimize {
        merge_similar_colors(&optimized, &raw_palette, DEFAULT_MERGE_DISTANCE_SQUARED)
    } else {
        (optimized, raw_palette)
    };
    if let (Some(layer), true) = (&layer, options.optimize) {
        let merged_oklab: Vec<Oklab> = merged_palette.iter().map(|&c| rgb_to_oklab(c)).collect();
        merged_index = repair(&merged_index, layer, &merged_oklab);
    }

    // Crisp+ passes (D140–D142), with the moved cells counted at their new colour in the recompute.
    let mut finalize_oklab: Option<Vec<f64>> = None;
    if options.edge_mode == EdgeMode::CrispPlus && options.optimize {
        let before = merged_index.clone();
        let snap = plus::snap_transition_strips(&before, gw, gh, &merged_palette, color_source);
        let prune = plus::prune_blend_labels(&snap.labels, gw, gh, &merged_palette, color_source);
        let changed: Vec<u8> = (0..before.len())
            .map(|i| (prune.labels[i] != before[i]) as u8)
            .collect();
        let mut moved = changed.clone();
        for y in 0..gh {
            for x in 0..gw {
                let i = y * gw + x;
                let label = prune.labels[i];
                'outer: for dy in -1i64..=1 {
                    if moved[i] != 0 {
                        break;
                    }
                    for dx in -1i64..=1 {
                        let (xx, yy) = (x as i64 + dx, y as i64 + dy);
                        if xx < 0 || yy < 0 || xx >= gw as i64 || yy >= gh as i64 {
                            continue;
                        }
                        let n = yy as usize * gw + xx as usize;
                        if changed[n] != 0 || prune.labels[n] != label {
                            moved[i] = 1;
                            continue 'outer;
                        }
                    }
                }
            }
        }
        let distinct = |labels: &[u8]| {
            let mut seen = vec![false; merged_palette.len()];
            labels
                .iter()
                .filter(|&&l| {
                    (l as usize) < seen.len() && !std::mem::replace(&mut seen[l as usize], true)
                })
                .count()
        };
        let used_after = distinct(&prune.labels);
        let target = options
            .color_count
            .min(used_after + distinct(&before).saturating_sub(used_after));
        let (refilled, palette) =
            plus::refill_freed_slots(&prune.labels, &merged_palette, &cell_oklab, &moved, target);
        merged_index = refilled;
        merged_palette = palette;
        if snap.changes > 0 || prune.pruned > 0 {
            let mut lab = cell_oklab.clone();
            let label_oklab: Vec<Oklab> = merged_palette.iter().map(|&c| rgb_to_oklab(c)).collect();
            for i in 0..changed.len() {
                if changed[i] == 0 {
                    continue;
                }
                lab[i * 3..i * 3 + 3].copy_from_slice(&label_oklab[merged_index[i] as usize]);
            }
            finalize_oklab = Some(lab);
        }
        lap("crispPlus", times);
    }

    let (compacted, used) = compact(&merged_index, merged_palette.len());
    let (final_labels, compact_palette): (Vec<u8>, Vec<Rgb>) = match &layer {
        Some(layer) => {
            let pre: Vec<Rgb> = used.iter().map(|&i| merged_palette[i]).collect();
            let lab = finalize_oklab.as_deref().unwrap_or(&cell_oklab);
            let (labels, palette) = finalize::finalize(lab, &compacted, &pre, layer);
            let (recompacted, kept) = compact(&labels, palette.len());
            if kept.len() < palette.len() {
                (recompacted, kept.iter().map(|&i| palette[i]).collect())
            } else {
                (labels, palette)
            }
        }
        None => {
            let mut cells_by_index: Vec<Vec<usize>> = vec![Vec::new(); used.len()];
            for (i, &c) in compacted.iter().enumerate() {
                cells_by_index[c as usize].push(i);
            }
            let palette = used
                .iter()
                .enumerate()
                .map(|(n, &old)| {
                    if cells_by_index[n].is_empty() {
                        merged_palette[old]
                    } else {
                        mean_oklab_as_rgb(&cell_oklab, &cells_by_index[n])
                    }
                })
                .collect();
            (compacted, palette)
        }
    };

    let mut counts = vec![0usize; compact_palette.len()];
    for &c in &final_labels {
        counts[c as usize] += 1;
    }
    let mut order: Vec<usize> = (0..compact_palette.len()).collect();
    order.sort_by(|&a, &b| {
        luminance(compact_palette[a])
            .partial_cmp(&luminance(compact_palette[b]))
            .unwrap()
    });
    let symbols = symbol_set();
    assert!(
        compact_palette.len() <= symbols.len(),
        "more colours than symbols"
    );
    let ordered_rgb: Vec<Rgb> = order.iter().map(|&o| compact_palette[o]).collect();
    let names = name_colors(&ordered_rgb);
    let mut remap = vec![0u8; compact_palette.len()];
    let palette: Vec<PaletteColor> = order
        .iter()
        .enumerate()
        .zip(names)
        .map(|((new_index, &original), name)| {
            remap[original] = new_index as u8;
            PaletteColor {
                index: new_index,
                rgb: compact_palette[original],
                symbol: symbols[new_index].clone(),
                name,
                count: counts[original],
            }
        })
        .collect();
    let cell_palette = final_labels.iter().map(|&c| remap[c as usize]).collect();
    lap("finalize", times);

    let pattern = StitchPattern {
        width: gw,
        height: gh,
        cell_palette,
        palette,
        is_landscape: image.width > image.height,
        thread_brand: None,
        edge_mode: crisp.then(|| options.edge_mode.id()),
        // Recorded whenever requested, even when every stage abstained, as the TypeScript does.
        enhancement_mode: (options.enhancement != EnhancementMode::Off)
            .then(|| options.enhancement.id()),
    };
    let Some(brand) = options.brand else {
        return pattern;
    };
    let result = apply_brand_palette(
        pattern,
        brand,
        options.optimize.then_some(&ctx),
        layer.as_ref(),
    );
    lap("brand", times);
    result
}
