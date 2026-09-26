//! Port of `buildPattern` (`lib/pipeline/pattern.ts`): every edge mode, both quantizers, thread brands and photo
//! enhancement. Contour refinement (experimental, off by default) and custom quantizers are not ported.

use crate::color::{luminance, rgb_to_oklab, Oklab, Rgb};
use crate::crisp::evidence::{build_evidence_layer_masked, EdgeModel, EvidenceLayer};
use crate::crisp::{finalize, plus, repair, stage};
use crate::denoise::denoise_for_quantization_masked;
use crate::dither::{dither_to_palette, DitherMode};
use crate::dither_hand_drawn::{default_dither_texture, DitherTexture};
use crate::downsample::{downsample_to_grid_vivid, empty_cell_mask, grid_dimensions_for, vivid_applies, VIVID_TOP_SHARE};
use crate::edge_map::{
    compute_cell_importance_masked, compute_edge_magnitude_masked, opaque_pixel_mask,
    source_luminance,
};
use crate::enhance::{enhance, Mode as EnhancementMode};
use crate::photo_adjust::{adjust_image, PhotoAdjust};
use crate::names::{name_colors, symbol_set};
use crate::optimize::{
    fix_diagonal_connections, recolor_small_components, run_multi_scale_optimizer, Ctx,
};
use crate::pair_evidence::compute_pair_edge_evidence_masked;
use crate::palette_merge::{merge_similar_colors_with_empties, DEFAULT_MERGE_DISTANCE_SQUARED};
use crate::hue_reserve::reserve_hue_threads;
use crate::quantize::{mean_oklab_as_rgb, quantize, vivid_oklab_as_rgb, Quantizer};
use crate::threads::{apply_brand_palette, Brand};
use crate::{color, Image};
use rayon::prelude::*;

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
    /// Dithering (G-052); `Off` is the pipeline as it was. Refused with Crisp, whose purpose is the opposite (D199).
    pub dither: DitherMode,
    /// What a drawn pattern is made of (G-055); ignored by every other pattern.
    pub dither_texture: DitherTexture,
    /// Vivid (G-061): a stitch keeps its area-mean lightness and the chroma of its most colourful part.
    pub vivid: bool,
    /// The four photo sliders (G-074). Neutral leaves the photo exactly as it was decoded.
    pub photo_adjust: PhotoAdjust,
}

#[derive(Clone, Debug)]
pub struct PaletteColor {
    pub index: usize,
    pub rgb: Rgb,
    pub symbol: String,
    pub name: String,
    pub count: usize,
    /// `ThreadSwatchRef`: the thread this colour was snapped to, absent for a custom colour. The editor reopens a
    /// colour on this swatch (D122), so it has to survive the trip out of generation.
    pub source: Option<ThreadSource>,
}

/// `ThreadSwatchRef`: a brand and that brand's own code.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ThreadSource {
    pub brand: &'static str,
    pub code: String,
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
    /// The dither pattern the chart was generated with (G-052); `None` means none.
    pub dither_mode: Option<&'static str>,
    /// What the drawn marks were made of (G-055); `None` for every other pattern and for the default texture.
    pub dither_texture: Option<DitherTexture>,
    /// Generated with Vivid (G-061); `None` means the stitches are plain area means.
    pub vivid: Option<bool>,
    pub enhancement_mode: Option<&'static str>,
    /// The sliders the chart was generated with (G-074); `None` when they were all centred.
    pub photo_adjust: Option<PhotoAdjust>,
}

/// Wall time per stage, in milliseconds, in pipeline order.
pub type StageTimes = Vec<(&'static str, f64)>;

/// Drops palette entries no cell uses: (compacted labels, the kept original indices).
fn compact(labels: &[u8], palette_len: usize) -> (Vec<u8>, Vec<usize>) {
    let mut counts = vec![0usize; palette_len];
    for &c in labels {
        // An empty stitch (G-050) is not a palette index and takes no part in the compaction.
        if c == crate::EMPTY_CELL {
            continue;
        }
        counts[c as usize] += 1;
    }
    let used: Vec<usize> = (0..palette_len).filter(|&i| counts[i] > 0).collect();
    let mut remap = vec![0u8; palette_len];
    for (new, &old) in used.iter().enumerate() {
        remap[old] = new as u8;
    }
    (
        labels
            .iter()
            .map(|&c| {
                if c == crate::EMPTY_CELL {
                    crate::EMPTY_CELL
                } else {
                    remap[c as usize]
                }
            })
            .collect(),
        used,
    )
}

/// `now` returns milliseconds from any fixed origin; it times the stages into `times` (WASM has no `Instant`).
pub fn build_pattern(
    image: &Image,
    options: &BuildOptions,
    times: &mut StageTimes,
    now: &dyn Fn() -> f64,
) -> StitchPattern {
    build_pattern_reporting(image, options, times, now, &|_| {})
}

/// `build_pattern` with `buildPattern`'s `onProgress`: the same four fractions at the same four points, for a caller
/// that shows progress (the processor's sidecar).
pub fn build_pattern_reporting(
    image: &Image,
    options: &BuildOptions,
    times: &mut StageTimes,
    now: &dyn Fn() -> f64,
    on_progress: &dyn Fn(f64),
) -> StitchPattern {
    let mut clock = now();
    let mut lap = |name: &'static str, times: &mut StageTimes| {
        let t = now();
        times.push((name, t - clock));
        clock = t;
    };
    let crisp = options.edge_mode != EdgeMode::Standard;
    let dithered = options.dither.is_dithered();
    assert!(
        !(dithered && crisp),
        "Crisp preserves hard boundaries, which dithering deliberately blends: choose one (D199)"
    );

    // The sliders come first and apply to everything after (G-074 M3): an adjusted photo *is* the photo,
    // so structure is read from it too, exactly as if the reader had uploaded it that way. Neutral
    // returns `None` and the photo travels on untouched, byte for byte (criterion 4).
    let adjusted = adjust_image(image, &options.photo_adjust);
    let image = adjusted.as_ref().unwrap_or(image);
    lap("adjust", times);

    // Colour stages read the enhanced photo; importance and pair evidence read the original (D112).
    let enhanced = enhance(image, options.enhancement);
    let color_source = enhanced.as_ref().unwrap_or(image);
    lap("enhance", times);

    let (gw, gh) = grid_dimensions_for(image.width, image.height, options.longer_side_stitches);
    on_progress(0.1);
    // Transparency becomes absence: a cell the photo barely covers is an empty stitch, and the stages below read
    // neither colour nor structure from pixels that are not there (G-050, D196). Both masks are `None` for an opaque
    // photo, which keeps it on exactly the path it had before.
    // Vivid changes what a stitch is made of, before anything chooses colours (G-061, D211).
    let (cells, coverage) = downsample_to_grid_vivid(
        color_source,
        gw,
        gh,
        if options.vivid { VIVID_TOP_SHARE } else { 0.0 },
    );
    let empty = empty_cell_mask(&coverage);
    let empty_ref = empty.as_deref();
    lap("downsample", times);

    let opaque = opaque_pixel_mask(image);
    let gray = source_luminance(image);
    let edge = compute_edge_magnitude_masked(image, &gray, opaque.as_deref());
    let importance = compute_cell_importance_masked(image, &edge, gw, gh, &gray, opaque.as_deref());
    drop(edge);
    drop(gray);
    lap("importance", times);

    let pair_evidence = if crisp || options.optimize {
        compute_pair_edge_evidence_masked(image, gw, gh, opaque.as_deref())
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
        build_evidence_layer_masked(color_source, gw, gh, model, empty_ref)
    });
    if crisp {
        lap("crispEvidence", times);
    }

    let table = color::srgb_to_linear_table();
    let mut cell_oklab = vec![0f64; cells.len()];
    cell_oklab
        .par_chunks_mut(3)
        .zip(cells.par_chunks_exact(3))
        .for_each(|(out, c)| {
            out.copy_from_slice(&color::oklab_from_bytes(table, c[0], c[1], c[2]));
        });
    let ctx = Ctx {
        width: gw,
        height: gh,
        cell_oklab: &cell_oklab,
        importance: &importance,
        pair_evidence: &pair_evidence,
        evidence: layer.as_ref(),
        empty: empty_ref,
    };

    // Dithering reads the true cells: the medoid pre-filter steadies cluster membership, and steadying is the
    // opposite of what a dithered chart wants (D199).
    let denoised = if dithered {
        cell_oklab.clone()
    } else {
        denoise_for_quantization_masked(gw, gh, &cell_oklab, &importance, empty_ref)
    };
    lap("denoise", times);

    let latest = options.quantizer == Quantizer::Latest;
    let (quantized, raw_palette) = match (&layer, empty_ref) {
        (Some(layer), _) => stage::run_masked(
            &denoised,
            options.color_count,
            &importance,
            layer,
            latest,
            empty_ref,
        ),
        // The quantizer sees only the stitched cells: a cluster built from cells that are not there would spend a
        // colour on nothing.
        (None, Some(mask)) => {
            let kept: Vec<usize> = (0..gw * gh).filter(|&i| mask[i] == 0).collect();
            let mut kept_oklab = vec![0f64; kept.len() * 3];
            let mut kept_importance = vec![0f32; kept.len()];
            for (k, &cell) in kept.iter().enumerate() {
                kept_oklab[k * 3..k * 3 + 3].copy_from_slice(&denoised[cell * 3..cell * 3 + 3]);
                kept_importance[k] = importance[cell];
            }
            let (labels, palette) = if kept.is_empty() {
                (Vec::new(), Vec::new())
            } else {
                quantize(
                    options.quantizer,
                    &kept_oklab,
                    options.color_count,
                    &kept_importance,
                )
            };
            let mut scattered = vec![crate::EMPTY_CELL; gw * gh];
            for (k, &cell) in kept.iter().enumerate() {
                scattered[cell] = labels[k];
            }
            (scattered, palette)
        }
        (None, None) => quantize(
            options.quantizer,
            &denoised,
            options.color_count,
            &importance,
        ),
    };
    // Vivid, part two: a hue the cells hold and the palette does not speak for takes a slot (G-062, D212). Before
    // dithering, which reads this palette, and before the smoothing. Crisp is left out: its palette comes from its
    // own evidence stage.
    let (quantized, raw_palette) = if options.vivid && !crisp {
        let reserved = reserve_hue_threads(&denoised, &quantized, &raw_palette, empty_ref);
        (reserved.cell_palette_index, reserved.palette)
    } else {
        (quantized, raw_palette)
    };
    drop(denoised);
    // The quantizer chose the threads; dithering decides which stitch gets which of the two nearest (G-052).
    let quantized = if dithered {
        let mut labels = dither_to_palette(
            &cell_oklab,
            gw,
            gh,
            &raw_palette,
            options.dither,
            &options.dither_texture,
        );
        if let Some(mask) = empty_ref {
            for (label, &empty) in labels.iter_mut().zip(mask.iter()) {
                if empty != 0 {
                    *label = crate::EMPTY_CELL;
                }
            }
        }
        labels
    } else {
        quantized
    };
    lap("quantize", times);
    on_progress(0.4);

    // Every pass below removes what dithering just created, so a dithered chart skips them (D199).
    let smooth = options.optimize && !dithered;
    let mut optimized = quantized;
    if smooth {
        optimized = run_multi_scale_optimizer(&ctx, &optimized, &raw_palette);
        lap("icm", times);
        optimized = recolor_small_components(&ctx, &optimized, &raw_palette);
        optimized = fix_diagonal_connections(&ctx, &optimized, &raw_palette);
        optimized = recolor_small_components(&ctx, &optimized, &raw_palette);
        lap("cleanup", times);
    }

    on_progress(0.8);
    let (mut merged_index, mut merged_palette) = if smooth {
        merge_similar_colors_with_empties(&optimized, &raw_palette, DEFAULT_MERGE_DISTANCE_SQUARED)
    } else {
        (optimized, raw_palette)
    };
    if let (Some(layer), true) = (&layer, smooth) {
        let merged_oklab: Vec<Oklab> = merged_palette.iter().map(|&c| rgb_to_oklab(c)).collect();
        merged_index = repair(&merged_index, layer, &merged_oklab);
    }

    // Crisp+ passes (D140–D142), with the moved cells counted at their new colour in the recompute.
    let mut finalize_oklab: Option<Vec<f64>> = None;
    if options.edge_mode == EdgeMode::CrispPlus && smooth {
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
                if c == crate::EMPTY_CELL {
                    continue;
                }
                cells_by_index[c as usize].push(i);
            }
            let palette = used
                .iter()
                .enumerate()
                .map(|(n, &old)| {
                    // A dithered thread keeps the colour the quantizer chose: its cells are deliberately the ones it
                    // does not match (D199).
                    if dithered || cells_by_index[n].is_empty() {
                        merged_palette[old]
                    } else if options.vivid {
                        vivid_oklab_as_rgb(&cell_oklab, &cells_by_index[n])
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
        if c == crate::EMPTY_CELL {
            continue;
        }
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
                source: None,
                index: new_index,
                rgb: compact_palette[original],
                symbol: symbols[new_index].clone(),
                name,
                count: counts[original],
            }
        })
        .collect();
    let cell_palette = final_labels
        .iter()
        .map(|&c| {
            // The empty sentinel is not a palette index and does not travel through the legend's order (G-050).
            if c == crate::EMPTY_CELL {
                crate::EMPTY_CELL
            } else {
                remap[c as usize]
            }
        })
        .collect();
    lap("finalize", times);

    let pattern = StitchPattern {
        width: gw,
        height: gh,
        cell_palette,
        palette,
        is_landscape: image.width > image.height,
        thread_brand: None,
        edge_mode: crisp.then(|| options.edge_mode.id()),
        dither_mode: dithered.then(|| options.dither.id()),
        // Recorded only when it is not the default, so a chart drawn with the shipped texture stays the file it was.
        dither_texture: (options.dither == DitherMode::HandDrawn
            && options.dither_texture != default_dither_texture())
            .then(|| options.dither_texture.clone()),
        // Recorded when it acted, not when it was asked for: below the pixels-a-stitch floor there is no
        // sub-stitch colour to rescue and the cells are plain area means (D211).
        vivid: (options.vivid && vivid_applies(color_source.width, color_source.height, gw, gh)).then_some(true),
        // Recorded whenever requested, even when every stage abstained, as the TypeScript does.
        enhancement_mode: (options.enhancement != EnhancementMode::Off)
            .then(|| options.enhancement.id()),
        // Centred sliders are recorded as nothing at all, so a chart made without them is the file it
        // was before they existed.
        photo_adjust: (!options.photo_adjust.is_neutral()).then_some(options.photo_adjust),
    };
    let Some(brand) = options.brand else {
        on_progress(1.0);
        return pattern;
    };
    let result = apply_brand_palette(
        pattern,
        brand,
        // A dithered chart skips the fine ICM re-run like the other smoothing passes: it would smooth the dither
        // straight back out (G-052 M3).
        smooth.then_some(&ctx),
        layer.as_ref(),
    );
    lap("brand", times);
    on_progress(1.0);
    result
}
