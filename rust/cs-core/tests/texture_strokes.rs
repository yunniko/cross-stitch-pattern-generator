//! G-085: texture strokes, through the whole generation.
//!
//! What matters to a person: nothing changes when the setting is off, strokes lie on a textured area and along the way
//! its texture runs, a smooth picture gets none, there is a ceiling, and they are ordinary backstitch.

use cs_core::json::{parse_options, pattern_json};
use cs_core::pattern::{build_pattern, StageTimes, StitchPattern};
use cs_core::Image;

/// A small deterministic pseudo-random source.
struct Lcg(u32);
impl Lcg {
    fn next(&mut self) -> f64 {
        self.0 = self.0.wrapping_mul(1_664_525).wrapping_add(1_013_904_223);
        (self.0 >> 8) as f64 / (1u32 << 24) as f64
    }
}

/// 40 x 40 stitches of 10 pixels: a mid-brown ground with `count` short light streaks, all running at about `degrees`.
fn furry(count: usize, degrees: f64, seed: u32) -> Image {
    let (w, h) = (400usize, 400usize);
    let mut data = Vec::with_capacity(w * h * 4);
    for _ in 0..w * h {
        data.extend_from_slice(&[120, 90, 70, 255]);
    }
    let mut rng = Lcg(seed);
    for _ in 0..count {
        let (cx, cy) = (rng.next() * w as f64, rng.next() * h as f64);
        let angle = (degrees + (rng.next() - 0.5) * 16.0).to_radians();
        let half = 7.0 + rng.next() * 6.0;
        for step in -(half as i32 * 2)..=(half as i32 * 2) {
            let t = step as f64 / 2.0;
            let (x, y) = (cx + t * angle.cos(), cy + t * angle.sin());
            for (dx, dy) in [(0.0, 0.0), (0.7, 0.0), (0.0, 0.7)] {
                let (px, py) = ((x + dx) as i64, (y + dy) as i64);
                if px >= 0 && py >= 0 && (px as usize) < w && (py as usize) < h {
                    let i = (py as usize * w + px as usize) * 4;
                    data[i..i + 3].copy_from_slice(&[225, 205, 170]);
                }
            }
        }
    }
    Image {
        width: w,
        height: h,
        data,
    }
}

/// A smooth picture: a gentle gradient, no texture.
fn smooth() -> Image {
    let (w, h) = (400usize, 400usize);
    let mut data = Vec::with_capacity(w * h * 4);
    for y in 0..h {
        for x in 0..w {
            data.extend_from_slice(&[
                (60 + x / 4) as u8,
                (80 + y / 5) as u8,
                (140 - x / 8) as u8,
                255,
            ]);
        }
    }
    Image {
        width: w,
        height: h,
        data,
    }
}

fn build(image: &Image, options: &str) -> StitchPattern {
    let (options, _) = parse_options(options).expect("options");
    let mut times: StageTimes = Vec::new();
    build_pattern(image, &options, &mut times, &|| 0.0)
}

const OFF: &str = r#"{"longerSideStitches":40,"colorCount":6}"#;
const ON: &str = r#"{"longerSideStitches":40,"colorCount":6,"textureStrokes":true}"#;

fn luminance(rgb: [u8; 3]) -> f64 {
    0.299 * rgb[0] as f64 + 0.587 * rgb[1] as f64 + 0.114 * rgb[2] as f64
}

#[test]
fn with_the_setting_off_the_chart_is_the_one_it_always_was() {
    let image = furry(300, 30.0, 7);
    let plain = build(&image, OFF);
    let explicit = build(
        &image,
        r#"{"longerSideStitches":40,"colorCount":6,"textureStrokes":false,"textureDensity":1}"#,
    );
    assert!(plain.backstitch.is_empty());
    assert_eq!(pattern_json(&plain), pattern_json(&explicit));
    assert!(pattern_json(&plain).get("backstitch").is_none());
}

#[test]
fn strokes_lie_on_a_textured_picture_along_the_way_its_texture_runs() {
    let pattern = build(&furry(500, 30.0, 11), ON);
    assert!(
        pattern.backstitch.len() >= 15,
        "{} strokes",
        pattern.backstitch.len()
    );
    // Direction of each stitch as a doubled angle: the mean vector is long when they all run one way.
    let (mut sx, mut sy, mut n) = (0.0f64, 0.0f64, 0.0f64);
    for l in &pattern.backstitch {
        let angle = ((l.y2 - l.y1) as f64).atan2((l.x2 - l.x1) as f64);
        sx += (2.0 * angle).cos();
        sy += (2.0 * angle).sin();
        n += 1.0;
    }
    assert!(
        sx.hypot(sy) / n > 0.55,
        "the strokes do not line up: {}",
        sx.hypot(sy) / n
    );
    let mean = sy.atan2(sx).to_degrees() / 2.0;
    assert!(
        (mean - 30.0).abs() < 18.0,
        "they run at {mean} degrees, the texture at 30"
    );
    // Light streaks on a dark ground: the strokes are light.
    let thread = pattern.palette[pattern.backstitch[0].palette_index].rgb;
    assert!(luminance(thread) > 130.0, "{thread:?}");
}

#[test]
fn a_smooth_picture_gets_none() {
    for density in ["0.3", "1"] {
        let pattern = build(
            &smooth(),
            &format!(
                r#"{{"longerSideStitches":40,"colorCount":6,"textureStrokes":true,"textureDensity":{density}}}"#
            ),
        );
        assert!(pattern.backstitch.is_empty(), "density {density}");
        assert!(
            pattern.palette.len() <= 6,
            "no thread was added at density {density}"
        );
    }
}

#[test]
fn density_moves_the_strokes_from_a_few_to_many_and_there_is_a_ceiling() {
    let image = furry(900, 30.0, 5);
    let count = |density: &str| {
        build(
            &image,
            &format!(r#"{{"longerSideStitches":40,"colorCount":6,"textureStrokes":true,"textureDensity":{density}}}"#),
        )
        .backstitch
        .len()
    };
    let (few, many) = (count("0.1"), count("1"));
    assert!(few < many, "{few} against {many}");
    assert!(many <= cs_core::texture::MAX_STROKES * 3, "{many}");
}

#[test]
fn strokes_are_ordinary_backstitch_in_at_most_four_new_threads() {
    let pattern = build(&furry(500, 30.0, 3), ON);
    assert!(pattern.palette.len() <= 6 + 4);
    for l in &pattern.backstitch {
        assert!(l.palette_index < pattern.palette.len());
        for (x, y) in [(l.x1, l.y1), (l.x2, l.y2)] {
            assert!(
                (0..=pattern.width as i32).contains(&x) && (0..=pattern.height as i32).contains(&y)
            );
        }
        assert!((l.x2 - l.x1).abs() <= 3 && (l.y2 - l.y1).abs() <= 3);
    }
    let json = pattern_json(&pattern);
    assert_eq!(
        json["backstitch"].as_array().unwrap().len(),
        pattern.backstitch.len()
    );
}

#[test]
fn the_same_picture_gives_the_same_strokes() {
    let image = furry(400, 30.0, 9);
    assert_eq!(build(&image, ON).backstitch, build(&image, ON).backstitch);
}

#[test]
fn a_thread_brand_gives_the_strokes_threads_of_that_brand() {
    let pattern = build(
        &furry(500, 30.0, 3),
        r#"{"longerSideStitches":40,"colorCount":6,"textureStrokes":true,"paletteMode":"dmc"}"#,
    );
    assert!(!pattern.backstitch.is_empty());
    assert_eq!(pattern.thread_brand, Some("dmc"));
    for l in &pattern.backstitch {
        assert_eq!(
            pattern.palette[l.palette_index]
                .source
                .as_ref()
                .map(|s| s.brand.as_str()),
            Some("dmc")
        );
    }
}

#[test]
fn lines_and_texture_strokes_can_be_asked_for_together() {
    let pattern = build(
        &furry(500, 30.0, 3),
        r#"{"longerSideStitches":40,"colorCount":6,"textureStrokes":true,"backstitchLines":true,"backstitchPhotos":true}"#,
    );
    assert!(!pattern.backstitch.is_empty());
    assert!(pattern.palette.len() <= 6 + 3 + 4);
}
