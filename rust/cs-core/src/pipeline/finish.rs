//! The last stages: the chart itself, its thread brand, and the overlays' lines on it.

use super::{Clock, Run};
use crate::color::{luminance, rgb_to_oklab, Rgb};
use crate::crisp::finalize;
use crate::dither::DitherMode;
use crate::dither_hand_drawn::default_dither_texture;
use crate::downsample::vivid_applies;
use crate::names::{name_colors, symbol_set};
use crate::pattern::{BackstitchLine, PaletteColor, StitchPattern, ThreadSource};
use crate::quantize::{mean_oklab_as_rgb, vivid_oklab_as_rgb};
use crate::stitch_fit::Segment;
use crate::threads::{apply_brand_palette, thread_for, thread_name, Brand};

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

/// The chart: only the threads in use, each at the colour of its stitches, darkest first, named and given a symbol.
pub(super) fn chart(run: &mut Run, clock: &mut Clock) {
    let options = run.options;
    let merged_index = std::mem::take(&mut run.labels);
    let merged_palette = std::mem::take(&mut run.palette);
    let cell_oklab = &run.cell_oklab;

    let (compacted, used) = compact(&merged_index, merged_palette.len());
    let (final_labels, compact_palette): (Vec<u8>, Vec<Rgb>) = match &run.layer {
        Some(layer) => {
            let pre: Vec<Rgb> = used.iter().map(|&i| merged_palette[i]).collect();
            let lab = run.finalize_oklab.as_deref().unwrap_or(cell_oklab);
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
                    if run.dithered || cells_by_index[n].is_empty() || options.palette_set.is_some()
                    {
                        merged_palette[old]
                    } else if options.vivid {
                        vivid_oklab_as_rgb(cell_oklab, &cells_by_index[n])
                    } else {
                        mean_oklab_as_rgb(cell_oklab, &cells_by_index[n])
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
            // From a set the thread is the user's: its own code and label, and the colour of the thread.
            let (name, source) = match &options.palette_set {
                Some(set) => {
                    let chosen = &set.colors[used[original]];
                    let source =
                        set.brand
                            .zip(chosen.code.as_ref())
                            .map(|(brand, code)| ThreadSource {
                                brand: brand.id(),
                                code: code.clone(),
                            });
                    (
                        if chosen.label.is_empty() {
                            name
                        } else {
                            chosen.label.clone()
                        },
                        source,
                    )
                }
                None => (name, None),
            };
            PaletteColor {
                source,
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
    clock.lap("finalize");

    let image = run.image();
    let pattern = StitchPattern {
        width: run.gw,
        height: run.gh,
        cell_palette,
        palette,
        is_landscape: image.width > image.height,
        thread_brand: options
            .palette_set
            .as_ref()
            .and_then(|s| s.brand)
            .map(|b| b.id()),
        edge_mode: run.crisp.then(|| options.edge_mode.id()),
        dither_mode: run.dithered.then(|| options.dither.id()),
        // Recorded only when it is not the default, so a chart drawn with the shipped texture stays the file it was.
        dither_texture: (options.dither == DitherMode::HandDrawn
            && options.dither_texture != default_dither_texture())
        .then(|| options.dither_texture.clone()),
        // Recorded when it acted, not when it was asked for: below the pixels-a-stitch floor there is no
        // sub-stitch colour to rescue and the cells are plain area means (D211).
        vivid: (options.vivid && vivid_applies(image.width, image.height, run.gw, run.gh))
            .then_some(true),
        // Centred sliders are recorded as nothing at all, so a chart made without them is the file it
        // was before they existed.
        photo_adjust: (!options.photo_adjust.is_neutral()).then_some(options.photo_adjust),
        backstitch: Vec::new(),
    };
    run.pattern = Some(pattern);
}

/// The thread brand the chart is matched to, when one is asked for. A chart made from a set has its threads already.
fn brand_of(run: &Run) -> Option<Brand> {
    match &run.options.palette_set {
        Some(set) => set.brand,
        None => run.options.brand,
    }
}

/// Every colour to the nearest thread of the brand.
pub(super) fn thread_brand(run: &mut Run, clock: &mut Clock) {
    if run.options.palette_set.is_some() {
        return;
    }
    let Some(brand) = run.options.brand else {
        return;
    };
    let pattern = run.pattern.take().expect("the chart stage ran");
    let result = {
        let ctx = run.ctx();
        apply_brand_palette(
            pattern,
            brand,
            // A dithered chart skips the fine ICM re-run like the other smoothing passes: it would smooth the dither
            // straight back out (G-052 M3).
            run.smooth.then_some(&ctx),
            run.layer.as_ref(),
        )
    };
    run.pattern = Some(result);
    clock.lap("brand");
}

/// How near, in squared Oklab distance, an existing thread must be to the colour of the lines to serve as their thread.
const SAME_THREAD_DISTANCE_SQUARED: f64 = 0.07 * 0.07;

/// The palette index of the thread a line colour is stitched in: an existing thread close enough to it (in a brand's
/// palette, the very thread the colour snaps to), else a new one at the end of the palette, used by backstitch only.
/// When the palette has no room left the nearest existing thread serves.
fn line_thread(pattern: &mut StitchPattern, rgb: Rgb, brand: Option<Brand>) -> usize {
    let symbols = symbol_set();
    let target = rgb_to_oklab(rgb);
    let nearest = |pattern: &StitchPattern| {
        pattern
            .palette
            .iter()
            .map(|c| {
                (
                    c.index,
                    crate::color::oklab_distance_sq(&target, &rgb_to_oklab(c.rgb)),
                )
            })
            .min_by(|a, b| a.1.partial_cmp(&b.1).unwrap())
    };
    let existing = match brand {
        Some(brand) => {
            let (code, _, _) = thread_for(brand, rgb);
            pattern
                .palette
                .iter()
                .position(|c| c.source.as_ref().is_some_and(|s| s.code == code))
        }
        None => nearest(pattern)
            .filter(|&(_, d)| d <= SAME_THREAD_DISTANCE_SQUARED)
            .map(|(i, _)| i),
    };
    if let Some(i) = existing {
        return i;
    }
    // No symbol or index left for another thread: the lines take the nearest one there is.
    if pattern.palette.len() >= symbols.len().min(crate::EMPTY_CELL as usize) {
        return nearest(pattern).map_or(0, |(i, _)| i);
    }
    let index = pattern.palette.len();
    let (rgb, name, source) = match brand {
        Some(brand) => {
            let (code, name, rgb) = thread_for(brand, rgb);
            let source = ThreadSource {
                brand: brand.id(),
                code: code.clone(),
            };
            (rgb, thread_name(&code, &name), Some(source))
        }
        None => {
            let mut all: Vec<Rgb> = pattern.palette.iter().map(|c| c.rgb).collect();
            all.push(rgb);
            let mut name = name_colors(&all).pop().unwrap_or_default();
            if pattern.palette.iter().any(|c| c.name == name) {
                name = format!("{name} (lines)");
            }
            (rgb, name, None)
        }
    };
    pattern.palette.push(PaletteColor {
        index,
        rgb,
        symbol: symbols[index].clone(),
        name,
        count: 0,
        source,
    });
    index
}

/// Puts the stitches of one overlay on the chart, each thread of it in an existing palette thread or a new one at the end
/// of the palette (G-084, D266, D269, D274).
fn attach_stitches(
    pattern: &mut StitchPattern,
    segments: &[Segment],
    colors: &[Rgb],
    brand: Option<Brand>,
) {
    let threads: Vec<usize> = colors
        .iter()
        .map(|&rgb| line_thread(pattern, rgb, brand))
        .collect();
    pattern
        .backstitch
        .extend(segments.iter().map(|s| BackstitchLine {
            x1: s.x1,
            y1: s.y1,
            x2: s.x2,
            y2: s.y2,
            palette_index: threads[s.thread],
        }));
}

/// Puts what each overlay found on the finished chart, in the order the overlays ran.
pub(super) fn lay_overlays(run: &mut Run, _clock: &mut Clock) {
    let brand = brand_of(run);
    let mut pattern = run.pattern.take().expect("the chart stage ran");
    for laid in &run.laid {
        attach_stitches(&mut pattern, &laid.segments, &laid.colors, brand);
    }
    run.pattern = Some(pattern);
}
