//! G-087: the predicted colour count and colours, and how well a set of colours covers a picture.

use cs_core::color::Rgb;
use cs_core::photo_adjust::NEUTRAL_ADJUST;
use cs_core::predict::{coverage, predict, PredictOptions};
use cs_core::threads::System;
use cs_core::Image;

mod common;

fn options(brand: Option<System>) -> PredictOptions {
    PredictOptions {
        longer_side_stitches: 40.0,
        brand,
        photo_adjust: NEUTRAL_ADJUST,
    }
}

/// 400 x 400 pixels, `colors(x, y)` for each.
fn picture(colors: impl Fn(usize, usize) -> Rgb) -> Image {
    let (w, h) = (400usize, 400usize);
    let mut data = Vec::with_capacity(w * h * 4);
    for y in 0..h {
        for x in 0..w {
            let c = colors(x, y);
            data.extend_from_slice(&[c[0], c[1], c[2], 255]);
        }
    }
    Image {
        width: w,
        height: h,
        data,
    }
}

#[test]
fn a_picture_of_two_colours_needs_few_and_a_rich_one_more() {
    let two = picture(|x, _| {
        if x < 200 {
            [200, 30, 30]
        } else {
            [30, 30, 200]
        }
    });
    let few = predict(&two, &options(None));
    assert!(few.high <= 4, "{} to {}", few.low, few.high);

    // A smooth blend of many hues and lightnesses.
    let rich = picture(|x, y| {
        let (u, v) = (x as f64 / 400.0, y as f64 / 400.0);
        [
            (255.0 * u) as u8,
            (255.0 * (0.5 + 0.5 * (6.0 * v).sin())) as u8,
            (255.0 * (1.0 - u * v)) as u8,
        ]
    });
    let many = predict(&rich, &options(None));
    assert!(
        many.suggested > few.suggested + 4,
        "{} against {}",
        many.suggested,
        few.suggested
    );
}

#[test]
fn the_range_is_ordered_the_ceiling_is_above_the_best_count_and_the_colours_are_the_suggested_number(
) {
    let rich = picture(|x, y| {
        [
            (x * 255 / 400) as u8,
            (y * 255 / 400) as u8,
            ((x + y) * 255 / 800) as u8,
        ]
    });
    let p = predict(&rich, &options(None));
    assert!(2 <= p.low && p.low <= p.suggested && p.suggested <= p.high && p.high <= p.ceiling);
    assert!(
        p.ceiling > p.high,
        "the ceiling is optimistic: {} against {}",
        p.ceiling,
        p.high
    );
    assert_eq!(p.colors.len(), p.suggested);
    assert_eq!(p.colors.iter().map(|c| c.cells).sum::<usize>(), p.cells);
    // The error curve only ever falls as colours are added.
    assert!(
        p.curve.windows(2).all(|w| w[1].1 <= w[0].1 + 1e-9),
        "{:?}",
        p.curve
    );
}

#[test]
fn the_same_picture_gives_the_same_prediction() {
    let rich = picture(|x, y| [(x * 255 / 400) as u8, (y * 255 / 400) as u8, 90]);
    let (a, b) = (
        predict(&rich, &options(None)),
        predict(&rich, &options(None)),
    );
    assert_eq!(
        (a.suggested, a.low, a.high, a.ceiling),
        (b.suggested, b.low, b.high, b.ceiling)
    );
    assert_eq!(
        a.colors.iter().map(|c| c.rgb).collect::<Vec<_>>(),
        b.colors.iter().map(|c| c.rgb).collect::<Vec<_>>()
    );
}

#[test]
fn shadows_that_differ_by_little_do_not_ask_for_more_colours() {
    // A bright subject and a shadow of forty near-blacks a few levels apart: they are one colour to the eye.
    let shadowed = picture(|x, y| {
        if x < 200 {
            [220, 180, 90]
        } else {
            let shade = 4 + ((x / 5 + y / 5) % 40) as u8 / 13;
            [shade, shade, shade + 2]
        }
    });
    let p = predict(&shadowed, &options(None));
    assert!(p.high <= 5, "the shadow asked for {} colours", p.high);
}

#[test]
fn in_a_brand_the_colours_are_the_nearest_threads() {
    let two = picture(|x, _| {
        if x < 200 {
            [200, 30, 30]
        } else {
            [30, 30, 200]
        }
    });
    let p = predict(&two, &options(Some(common::system("dmc"))));
    assert!(p.colors.iter().all(|c| c.thread.is_some()));
}

#[test]
fn a_set_without_a_colour_the_picture_needs_is_told_what_is_missing() {
    let two = picture(|x, _| {
        if x < 200 {
            [200, 30, 30]
        } else {
            [30, 30, 200]
        }
    });
    let blue_only: Vec<Rgb> = vec![[30, 30, 200], [10, 10, 120]];
    let c = coverage(&two, &options(None), &blue_only);
    assert!((0.4..0.6).contains(&c.covered), "{}", c.covered);
    assert_eq!(c.missing.len(), 1);
    let m = &c.missing[0];
    assert!(m.rgb[0] > 150 && m.rgb[2] < 80, "{:?}", m.rgb);
    assert!(m.share > 0.4 && !m.name.is_empty());

    let both: Vec<Rgb> = vec![[200, 30, 30], [30, 30, 200]];
    let full = coverage(&two, &options(None), &both);
    assert!(full.covered > 0.99 && full.missing.is_empty());
}
