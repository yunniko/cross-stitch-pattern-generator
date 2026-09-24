//! What must be true of *every* chart, whatever the photo and the settings (G-068 M4).
//!
//! The golden hashes (D107) are the regression floor, and after G-068 M3 they are nearly all of it — but they pin
//! thirty-eight fixed inputs. They say nothing about the thirty-ninth: an image one pixel wide, a fully transparent
//! one, a photo with fewer distinct colours than the palette asked for. A chart that comes back with a cell index
//! past the end of its palette, two colours sharing a symbol, or counts that do not add up is broken in a way no
//! recorded hash would notice, and `withColorRemoved`'s crash (D217) is what that class of bug looks like when it
//! reaches a user.
//!
//! So these assert properties over a spread of inputs rather than bytes for particular ones, and they are Rust's
//! own: `cargo test --release` runs them with no Node, no fixtures and no recorded values to keep in step.

use cs_core::json::parse_options;
use cs_core::pattern::{build_pattern, StageTimes, StitchPattern};
use cs_core::{Image, EMPTY_CELL};
use std::collections::HashSet;

/// A deterministic pixel source: an LCG, so a failure is reproducible from the case name alone.
fn noisy(width: usize, height: usize, seed: u32, palette: &[[u8; 3]]) -> Image {
    let mut state = seed.wrapping_mul(2_654_435_761).wrapping_add(1);
    let mut data = Vec::with_capacity(width * height * 4);
    for y in 0..height {
        for x in 0..width {
            state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
            let base = palette[(x * 3 + y * 5) % palette.len()];
            let jitter = ((state >> 16) & 0x1f) as i32 - 16;
            for c in 0..3 {
                data.push((base[c] as i32 + jitter).clamp(0, 255) as u8);
            }
            data.push(255);
        }
    }
    Image {
        width,
        height,
        data,
    }
}

/// A flat image with a chosen alpha, for the transparency and degenerate-histogram cases.
fn flat(width: usize, height: usize, rgb: [u8; 3], alpha: u8) -> Image {
    let mut data = Vec::with_capacity(width * height * 4);
    for _ in 0..width * height {
        data.extend_from_slice(&[rgb[0], rgb[1], rgb[2], alpha]);
    }
    Image {
        width,
        height,
        data,
    }
}

fn build(image: &Image, options_json: &str) -> StitchPattern {
    let (options, _threads) = parse_options(options_json).expect("options");
    let mut times: StageTimes = Vec::new();
    build_pattern(image, &options, &mut times, &|| 0.0)
}

/// Everything that has to hold of a finished chart, whatever produced it.
fn check_invariants(
    case: &str,
    image: &Image,
    pattern: &StitchPattern,
    color_count: usize,
    longer_side: f64,
) {
    let where_ = |what: &str| format!("{case}: {what}");

    assert!(
        pattern.width >= 1 && pattern.height >= 1,
        "{}",
        where_("a chart with no cells")
    );
    assert_eq!(
        pattern.cell_palette.len(),
        pattern.width * pattern.height,
        "{}",
        where_("cell count does not match the dimensions")
    );

    // The longer side is what the user asked for, never more, and never larger than the photo itself.
    let longer = pattern.width.max(pattern.height);
    assert!(
        longer as f64 <= longer_side.ceil().max(1.0),
        "{}",
        where_(&format!(
            "longer side {longer} exceeds the requested {longer_side}"
        ))
    );

    assert_eq!(
        pattern.is_landscape,
        image.width > image.height,
        "{}",
        where_("isLandscape disagrees with the photo")
    );

    // A palette no bigger than asked for, indexed 0..n-1 in order: the editor addresses colours by position.
    assert!(
        pattern.palette.len() <= color_count,
        "{}",
        where_(&format!(
            "{} colours for a request of {color_count}",
            pattern.palette.len()
        ))
    );
    for (i, color) in pattern.palette.iter().enumerate() {
        assert_eq!(
            color.index,
            i,
            "{}",
            where_("palette index is not its position")
        );
        assert!(
            !color.name.is_empty(),
            "{}",
            where_("a colour with no name")
        );
        assert!(
            !color.symbol.is_empty(),
            "{}",
            where_("a colour with no symbol")
        );
    }

    // Two colours sharing a symbol makes a chart that cannot be stitched from.
    let symbols: HashSet<&str> = pattern.palette.iter().map(|c| c.symbol.as_str()).collect();
    assert_eq!(
        symbols.len(),
        pattern.palette.len(),
        "{}",
        where_("two colours share a symbol")
    );

    // Every cell is a colour that exists, or the "no stitch here" sentinel — never an index past the palette.
    // This is the invariant D217 broke on the editor's side, and it is cheaper to assert than to debug.
    let mut used = vec![0usize; pattern.palette.len()];
    let mut stitched = 0usize;
    for &cell in &pattern.cell_palette {
        if cell == EMPTY_CELL {
            continue;
        }
        let index = cell as usize;
        assert!(
            index < pattern.palette.len(),
            "{}",
            where_(&format!(
                "cell names colour {index} of {}",
                pattern.palette.len()
            ))
        );
        used[index] += 1;
        stitched += 1;
    }

    // The counts the chart reports are the counts it has: they drive the thread shopping list.
    for (i, color) in pattern.palette.iter().enumerate() {
        assert_eq!(
            color.count,
            used[i],
            "{}",
            where_(&format!(
                "colour {i} counts {} cells, uses {}",
                color.count, used[i]
            ))
        );
    }
    let total: usize = pattern.palette.iter().map(|c| c.count).sum();
    assert_eq!(
        total,
        stitched,
        "{}",
        where_("palette counts do not add up to the stitched cells")
    );

    // A palette entry no cell uses is a colour in the user's shopping list they never stitch.
    for (i, count) in used.iter().enumerate() {
        assert!(
            *count > 0,
            "{}",
            where_(&format!("colour {i} is in the palette but unused"))
        );
    }
}

/// The option sets, named. Every one is something the app can ask for.
fn option_cases() -> Vec<(&'static str, String, usize, f64)> {
    let mut cases = Vec::new();
    for (name, extra) in [
        ("standard", ""),
        ("crisp", r#","edgeMode":"crisp""#),
        ("crisp-plus", r#","edgeMode":"crisp-plus""#),
        ("original-quantizer", r#","quantizer":"original""#),
        ("no-optimize", r#","optimize":false"#),
        ("dmc", r#","paletteMode":"dmc""#),
        ("cosmo", r#","paletteMode":"cosmo""#),
        ("anchor", r#","paletteMode":"anchor""#),
        ("auto", r#","enhancementMode":"auto""#),
        ("portrait", r#","enhancementMode":"portrait""#),
        ("vivid-mode", r#","enhancementMode":"vivid""#),
        ("vivid-sampling", r#","vivid":true"#),
        ("bayer-8", r#","ditherMode":"bayer-8""#),
        ("floyd-steinberg", r#","ditherMode":"floyd-steinberg""#),
        ("hand-drawn", r#","ditherMode":"hand-drawn""#),
    ] {
        for &(colors, stitches) in &[(2usize, 8.0f64), (8, 24.0), (32, 40.0)] {
            cases.push((
                name,
                format!(r#"{{"longerSideStitches":{stitches},"colorCount":{colors},"threads":1{extra}}}"#),
                colors,
                stitches,
            ));
        }
    }
    cases
}

#[test]
fn every_option_combination_produces_a_well_formed_chart() {
    let image = noisy(
        96,
        64,
        7,
        &[[210, 160, 90], [60, 110, 80], [180, 60, 70], [40, 50, 120]],
    );
    for (name, json, colors, stitches) in option_cases() {
        let case = format!("{name}/{colors}@{stitches}");
        let pattern = build(&image, &json);
        check_invariants(&case, &image, &pattern, colors, stitches);
    }
}

#[test]
fn degenerate_photos_produce_a_well_formed_chart() {
    // Shapes and contents that no golden case has: the sizes and histograms a division or an index is likeliest
    // to go wrong on.
    let images: Vec<(&str, Image)> = vec![
        ("one-pixel", noisy(1, 1, 1, &[[128, 64, 32]])),
        (
            "one-column",
            noisy(1, 50, 2, &[[200, 30, 30], [30, 30, 200]]),
        ),
        ("one-row", noisy(50, 1, 3, &[[200, 30, 30], [30, 30, 200]])),
        (
            "very-wide",
            noisy(200, 3, 4, &[[10, 200, 10], [200, 10, 200]]),
        ),
        (
            "very-tall",
            noisy(3, 200, 5, &[[10, 200, 10], [200, 10, 200]]),
        ),
        ("single-colour", flat(40, 40, [120, 120, 120], 255)),
        ("fully-transparent", flat(40, 40, [120, 120, 120], 0)),
        ("half-transparent", {
            let mut image = flat(40, 40, [200, 80, 60], 255);
            for y in 0..40 {
                for x in 0..20 {
                    image.data[(y * 40 + x) * 4 + 3] = 0;
                }
            }
            image
        }),
        (
            "two-colours",
            noisy(32, 32, 6, &[[0, 0, 0], [255, 255, 255]]),
        ),
    ];
    // Asking for far more colours than the photo holds is the ordinary case for a flat image, not an error.
    for (name, image) in &images {
        for &(colors, stitches) in &[(1usize, 4.0f64), (16, 20.0), (64, 30.0)] {
            let json =
                format!(r#"{{"longerSideStitches":{stitches},"colorCount":{colors},"threads":1}}"#);
            let pattern = build(image, &json);
            check_invariants(
                &format!("{name}/{colors}@{stitches}"),
                image,
                &pattern,
                colors,
                stitches,
            );
        }
    }
}

#[test]
fn a_fully_transparent_photo_stitches_nothing() {
    let image = flat(40, 40, [120, 120, 120], 0);
    let pattern = build(
        &image,
        r#"{"longerSideStitches":20,"colorCount":8,"threads":1}"#,
    );
    assert!(
        pattern.cell_palette.iter().all(|&c| c == EMPTY_CELL),
        "a photo with no opaque pixel produced stitches"
    );
    assert!(
        pattern.palette.is_empty(),
        "a chart with no stitches still listed threads"
    );
}

#[test]
fn generation_is_deterministic() {
    // Nothing in the pipeline may depend on time, address or iteration order: the byte-identity the golden hashes
    // assert for eighteen recorded cases has to hold for the next one too.
    let image = noisy(80, 56, 11, &[[210, 160, 90], [60, 110, 80], [180, 60, 70]]);
    for (name, json, _, _) in option_cases() {
        let first = build(&image, &json);
        let second = build(&image, &json);
        assert_eq!(
            first.cell_palette, second.cell_palette,
            "{name}: cells differ between two identical runs"
        );
        assert_eq!(
            first.palette.len(),
            second.palette.len(),
            "{name}: palette size differs between two identical runs"
        );
        for (a, b) in first.palette.iter().zip(second.palette.iter()) {
            assert_eq!(
                a.rgb, b.rgb,
                "{name}: colour differs between two identical runs"
            );
            assert_eq!(
                a.symbol, b.symbol,
                "{name}: symbol differs between two identical runs"
            );
            assert_eq!(
                a.count, b.count,
                "{name}: count differs between two identical runs"
            );
        }
    }
}

#[test]
fn a_brand_chart_uses_only_that_brands_threads() {
    // The point of a brand palette is that every colour can be bought; a colour with no thread behind it cannot.
    let image = noisy(
        96,
        64,
        13,
        &[[210, 160, 90], [60, 110, 80], [180, 60, 70], [40, 50, 120]],
    );
    for (brand, expected) in [("dmc", "dmc"), ("cosmo", "cosmo"), ("anchor", "anchor")] {
        let json = format!(
            r#"{{"longerSideStitches":32,"colorCount":12,"paletteMode":"{brand}","threads":1}}"#
        );
        let pattern = build(&image, &json);
        assert_eq!(
            pattern.thread_brand,
            Some(expected),
            "{brand}: chart does not record its brand"
        );
        for color in &pattern.palette {
            let source = color.source.as_ref().unwrap_or_else(|| {
                panic!("{brand}: colour {} has no thread behind it", color.index)
            });
            assert_eq!(
                source.brand, expected,
                "{brand}: colour {} came from {}",
                color.index, source.brand
            );
            assert!(
                !source.code.is_empty(),
                "{brand}: colour {} has no thread code",
                color.index
            );
        }
    }
}
