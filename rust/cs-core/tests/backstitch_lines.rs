//! G-084: backstitch traced from the lines of a drawing, through the whole generation.
//!
//! The properties that matter to a person: nothing changes when the setting is off, a drawn line becomes backstitch in a
//! thread of its colour while the stitches under it take the colour beside it, and a photograph gets none.

mod common;

use cs_core::json::{parse_options, pattern_json};
use cs_core::pattern::{build_pattern, StageTimes, StitchPattern};
use cs_core::{Image, EMPTY_CELL};

/// 40 x 40 stitches of 10 pixels: a cream page with an orange block and a 2 pixel black line across it and beyond.
fn drawing() -> Image {
    let (w, h) = (400usize, 400usize);
    let mut data = vec![0u8; w * h * 4];
    for y in 0..h {
        for x in 0..w {
            let orange = (80..320).contains(&x) && (80..320).contains(&y);
            let line = (y as i32 - 200 - (x as i32 - 200) / 4).abs() <= 1 && (40..360).contains(&x);
            let rgb = if line {
                [10, 10, 10]
            } else if orange {
                [230, 140, 50]
            } else {
                [253, 246, 227]
            };
            data[(y * w + x) * 4..(y * w + x) * 4 + 3].copy_from_slice(&rgb);
            data[(y * w + x) * 4 + 3] = 255;
        }
    }
    Image {
        width: w,
        height: h,
        data,
    }
}

/// Texture everywhere, as a photograph has it.
fn texture() -> Image {
    let (w, h) = (400usize, 400usize);
    let mut state = 12345u32;
    let mut data = Vec::with_capacity(w * h * 4);
    for _ in 0..w * h {
        state = state.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        let v = 60 + ((state >> 16) & 0x7f) as u8;
        data.extend_from_slice(&[v, v / 2 + 40, 90, 255]);
    }
    Image {
        width: w,
        height: h,
        data,
    }
}

fn build(image: &Image, options: &str) -> StitchPattern {
    let (options, _) = parse_options(&common::with_systems(options)).expect("options");
    let mut times: StageTimes = Vec::new();
    build_pattern(image, &options, &mut times, &|| 0.0)
}

const OFF: &str = r#"{"longerSideStitches":40,"colorCount":6}"#;
const ON: &str = r#"{"longerSideStitches":40,"colorCount":6,"backstitchLines":true}"#;

fn luminance(rgb: [u8; 3]) -> f64 {
    0.299 * rgb[0] as f64 + 0.587 * rgb[1] as f64 + 0.114 * rgb[2] as f64
}

#[test]
fn with_the_setting_off_the_chart_is_the_one_it_always_was() {
    let image = drawing();
    let plain = build(&image, OFF);
    let explicit = build(
        &image,
        r#"{"longerSideStitches":40,"colorCount":6,"backstitchLines":false,"backstitchSensitivity":1}"#,
    );
    assert!(plain.backstitch.is_empty());
    assert_eq!(pattern_json(&plain), pattern_json(&explicit));
    assert!(pattern_json(&plain).get("backstitch").is_none());
}

#[test]
fn a_drawn_line_becomes_backstitch_in_its_own_thread_and_the_stitches_under_it_take_the_colour_beside_it(
) {
    let pattern = build(&drawing(), ON);
    let length: f64 = pattern
        .backstitch
        .iter()
        .map(|l| (((l.x2 - l.x1).pow(2) + (l.y2 - l.y1).pow(2)) as f64).sqrt())
        .sum();
    assert!(
        (28.0..40.0).contains(&length),
        "{} lines, {length} cells long",
        pattern.backstitch.len()
    );
    let thread = pattern.backstitch[0].palette_index;
    assert!(pattern.backstitch.iter().all(|l| l.palette_index == thread));
    assert!(thread < pattern.palette.len());
    assert!(
        luminance(pattern.palette[thread].rgb) < 60.0,
        "the line's thread is dark"
    );
    // The line is not a stitch: its thread has no cross stitches, and no stitched cell is dark.
    assert_eq!(pattern.palette[thread].count, 0);
    for &c in &pattern.cell_palette {
        if c != EMPTY_CELL {
            assert!(
                luminance(pattern.palette[c as usize].rgb) > 100.0,
                "a stitch under the line kept the line's colour"
            );
        }
    }
    // One thread more than the request at most, and every end is a corner of the grid.
    assert!(pattern.palette.len() <= 6 + 1);
    for l in &pattern.backstitch {
        for (x, y) in [(l.x1, l.y1), (l.x2, l.y2)] {
            assert!(
                (0..=pattern.width as i32).contains(&x) && (0..=pattern.height as i32).contains(&y)
            );
        }
        assert!((l.x2 - l.x1).abs() <= 3 && (l.y2 - l.y1).abs() <= 3);
    }
    // The line runs across the middle of the chart, left to right.
    let xs: Vec<i32> = pattern
        .backstitch
        .iter()
        .flat_map(|l| [l.x1, l.x2])
        .collect();
    assert!(*xs.iter().min().unwrap() <= 6 && *xs.iter().max().unwrap() >= 34);
}

#[test]
fn the_same_picture_gives_the_same_lines() {
    let image = drawing();
    assert_eq!(build(&image, ON).backstitch, build(&image, ON).backstitch);
}

#[test]
fn a_thread_brand_gives_the_lines_a_thread_of_that_brand() {
    let pattern = build(
        &drawing(),
        r#"{"longerSideStitches":40,"colorCount":6,"backstitchLines":true,"paletteMode":"dmc"}"#,
    );
    assert!(!pattern.backstitch.is_empty());
    assert_eq!(pattern.thread_brand.as_deref(), Some("dmc"));
    let thread = &pattern.palette[pattern.backstitch[0].palette_index];
    assert_eq!(
        thread.source.as_ref().map(|s| s.brand.as_str()),
        Some("dmc")
    );
    assert!(luminance(thread.rgb) < 80.0);
}

#[test]
fn a_photograph_gets_no_backstitch_however_sensitive() {
    let image = texture();
    for s in ["0", "0.5", "1"] {
        let pattern = build(
            &image,
            &format!(
                r#"{{"longerSideStitches":40,"colorCount":6,"backstitchLines":true,"backstitchSensitivity":{s}}}"#
            ),
        );
        assert!(pattern.backstitch.is_empty(), "sensitivity {s}");
        assert!(pattern.palette.len() <= 6, "no thread was added at {s}");
    }
}

#[test]
fn the_json_carries_the_lines_for_the_editor() {
    let pattern = build(&drawing(), ON);
    let json = pattern_json(&pattern);
    let lines = json["backstitch"].as_array().expect("backstitch array");
    assert_eq!(lines.len(), pattern.backstitch.len());
    let first = &lines[0];
    for key in ["x1", "y1", "x2", "y2", "paletteIndex"] {
        assert!(first.get(key).is_some(), "{key}");
    }
}

/// 40 x 40 stitches: an orange block with a black line and a white line across it.
fn two_pens() -> Image {
    let (w, h) = (400usize, 400usize);
    let mut data = vec![0u8; w * h * 4];
    for y in 0..h {
        for x in 0..w {
            let black = (119..121).contains(&y) && (40..360).contains(&x);
            let white = (239..241).contains(&y) && (40..360).contains(&x);
            let rgb = if black {
                [10, 10, 10]
            } else if white {
                [250, 250, 250]
            } else if (60..340).contains(&x) && (60..340).contains(&y) {
                [230, 140, 50]
            } else {
                [30, 50, 120]
            };
            data[(y * w + x) * 4..(y * w + x) * 4 + 3].copy_from_slice(&rgb);
            data[(y * w + x) * 4 + 3] = 255;
        }
    }
    Image {
        width: w,
        height: h,
        data,
    }
}

#[test]
fn a_black_line_and_a_white_line_are_two_threads_and_neither_is_left_in_the_stitches() {
    let pattern = build(&two_pens(), ON);
    let threads: std::collections::BTreeSet<usize> =
        pattern.backstitch.iter().map(|l| l.palette_index).collect();
    assert_eq!(threads.len(), 2, "{threads:?}");
    let lumas: Vec<f64> = threads
        .iter()
        .map(|&t| luminance(pattern.palette[t].rgb))
        .collect();
    assert!(
        lumas.iter().any(|&l| l < 60.0) && lumas.iter().any(|&l| l > 200.0),
        "{lumas:?}"
    );
    // Each line runs along its own row, left to right.
    for &t in &threads {
        let rows: std::collections::BTreeSet<i32> = pattern
            .backstitch
            .iter()
            .filter(|l| l.palette_index == t)
            .map(|l| l.y1)
            .collect();
        assert_eq!(rows.len(), 1, "thread {t} on rows {rows:?}");
    }
    // One thread or two more than the six asked for, at most.
    assert!(pattern.palette.len() <= 6 + 2);
}

/// A textured photograph with one strong, thin, dark line right across it, like a wire in front of foliage.
fn photo_with_a_wire() -> Image {
    // Texture on a scale larger than a stitch (blocks of 12 pixels), as a photograph's is, so only the wire is thinner.
    let (w, h) = (400usize, 400usize);
    let mut data = Vec::with_capacity(w * h * 4);
    for y in 0..h {
        for x in 0..w {
            let block = (x / 12 * 7919 + y / 12 * 104_729) as u32;
            let jitter = ((x * 31 + y * 17 + x * y) % 31) as i32 - 15;
            let v = (125 + (block.wrapping_mul(2_654_435_761) >> 24) as i32 / 2 + jitter)
                .clamp(0, 255) as u8;
            data.extend_from_slice(&[v, v / 2 + 40, 90, 255]);
        }
    }
    let mut image = Image {
        width: w,
        height: h,
        data,
    };
    for y in 0..h {
        for x in 30..w - 30 {
            if (y as i32 - 100 - (x as i32) / 5).abs() <= 1 {
                image.data[(y * w + x) * 4..(y * w + x) * 4 + 3].fill(5);
            }
        }
    }
    image
}

#[test]
fn a_photograph_is_traced_only_when_asked_and_then_only_for_its_strongest_long_lines() {
    let image = photo_with_a_wire();
    let off = build(&image, ON);
    assert!(
        off.backstitch.is_empty(),
        "photographs are left alone by default"
    );
    let on = build(
        &image,
        r#"{"longerSideStitches":40,"colorCount":6,"backstitchLines":true,"backstitchPhotos":true}"#,
    );
    assert!(!on.backstitch.is_empty(), "the wire is a strong long line");
    let length: f64 = on
        .backstitch
        .iter()
        .map(|l| (((l.x2 - l.x1).pow(2) + (l.y2 - l.y1).pow(2)) as f64).sqrt())
        .sum();
    // The wire, and not the texture: no more than the photograph's budget of four cells a row.
    assert!(
        length <= 4.0 * on.height as f64 + 1.0,
        "{length} cells of line"
    );
    assert!(length >= 20.0, "the wire is about 35 cells long: {length}");
    // The thread is the darkest the chart has, an existing one or a new one.
    let darkest = on
        .palette
        .iter()
        .map(|c| luminance(c.rgb))
        .fold(f64::MAX, f64::min);
    assert!(luminance(on.palette[on.backstitch[0].palette_index].rgb) <= darkest + 1.0);
}
