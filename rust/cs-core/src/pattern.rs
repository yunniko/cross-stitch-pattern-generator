//! Port of `buildPattern` (`lib/pipeline/pattern.ts`) for Standard mode, full palette, no enhancement: the exact tier
//! of G-048 M1. Crisp, Crisp+, enhancement and thread brands follow in M2.

use crate::color::{luminance, Rgb};
use crate::denoise::denoise_for_quantization;
use crate::downsample::{downsample_to_grid, grid_dimensions_for};
use crate::edge_map::{compute_cell_importance, compute_edge_magnitude, source_luminance};
use crate::names::{name_colors, symbol_set};
use crate::optimize::{
    fix_diagonal_connections, recolor_small_components, run_multi_scale_optimizer, Ctx,
};
use crate::pair_evidence::compute_pair_edge_evidence;
use crate::palette_merge::{merge_similar_colors, DEFAULT_MERGE_DISTANCE_SQUARED};
use crate::quantize::{mean_oklab_as_rgb, quantize, Quantizer};
use crate::{color, Image};
use std::time::Instant;

#[derive(Clone, Debug)]
pub struct BuildOptions {
    pub longer_side_stitches: f64,
    pub color_count: usize,
    pub quantizer: Quantizer,
    pub optimize: bool,
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
}

/// Wall time per stage, in milliseconds, in pipeline order.
pub type StageTimes = Vec<(&'static str, f64)>;

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

    let (gw, gh) = grid_dimensions_for(image.width, image.height, options.longer_side_stitches);
    let cells = downsample_to_grid(image, gw, gh);
    lap("downsample", times);

    let gray = source_luminance(image);
    let edge = compute_edge_magnitude(image, &gray);
    let importance = compute_cell_importance(image, &edge, gw, gh, &gray);
    drop(edge);
    drop(gray);
    lap("importance", times);

    let pair_evidence = if options.optimize {
        compute_pair_edge_evidence(image, gw, gh)
    } else {
        Vec::new()
    };
    lap("pairEvidence", times);

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
    };

    let denoised = denoise_for_quantization(gw, gh, &cell_oklab, &importance);
    lap("denoise", times);

    let (quantized, raw_palette) = quantize(
        options.quantizer,
        &denoised,
        options.color_count,
        &importance,
    );
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

    let (merged_index, merged_palette) = if options.optimize {
        merge_similar_colors(&optimized, &raw_palette, DEFAULT_MERGE_DISTANCE_SQUARED)
    } else {
        (optimized, raw_palette)
    };

    // Drop emptied entries, then recompute each colour as the OKLab mean of its final cells.
    let mut raw_counts = vec![0usize; merged_palette.len()];
    for &c in &merged_index {
        raw_counts[c as usize] += 1;
    }
    let used: Vec<usize> = (0..merged_palette.len())
        .filter(|&i| raw_counts[i] > 0)
        .collect();
    let mut compact_remap = vec![0u8; merged_palette.len()];
    for (new_index, &old) in used.iter().enumerate() {
        compact_remap[old] = new_index as u8;
    }
    let compact: Vec<u8> = merged_index
        .iter()
        .map(|&c| compact_remap[c as usize])
        .collect();
    let mut cells_by_index: Vec<Vec<usize>> = vec![Vec::new(); used.len()];
    for (i, &c) in compact.iter().enumerate() {
        cells_by_index[c as usize].push(i);
    }
    let compact_palette: Vec<Rgb> = used
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

    let mut counts = vec![0usize; compact_palette.len()];
    for &c in &compact {
        counts[c as usize] += 1;
    }
    // Dark to light, stable on equal luminance.
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
    let cell_palette = compact.iter().map(|&c| remap[c as usize]).collect();
    lap("finalize", times);

    StitchPattern {
        width: gw,
        height: gh,
        cell_palette,
        palette,
        is_landscape: image.width > image.height,
    }
}
