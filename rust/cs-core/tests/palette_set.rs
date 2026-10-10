//! G-087: a chart made from a set of colours the user chose.

use cs_core::json::{parse_options, pattern_json};
use cs_core::pattern::{build_pattern, StageTimes, StitchPattern};
use cs_core::{Image, EMPTY_CELL};

/// 400 x 400 pixels in four bands: red, green, blue and near white.
fn banded() -> Image {
    let (w, h) = (400usize, 400usize);
    let mut data = Vec::with_capacity(w * h * 4);
    for _y in 0..h {
        for x in 0..w {
            let c = match x / 100 {
                0 => [200, 30, 30],
                1 => [30, 160, 40],
                2 => [30, 40, 200],
                _ => [245, 245, 240],
            };
            data.extend_from_slice(&[c[0], c[1], c[2], 255]);
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

const AUTO: &str = r#"{"longerSideStitches":40,"colorCount":8}"#;

#[test]
fn without_a_set_the_chart_is_the_one_it_always_was() {
    let a = build(&banded(), AUTO);
    let b = build(
        &banded(),
        r#"{"longerSideStitches":40,"colorCount":8,"paletteSet":null}"#,
    );
    assert_eq!(pattern_json(&a), pattern_json(&b));
}

#[test]
fn a_chart_from_a_set_has_only_the_colours_of_the_set_and_each_cell_takes_the_nearest() {
    let set = r#"{"longerSideStitches":40,"colorCount":99,"paletteSet":{"mode":"full","colors":[{"rgb":[200,30,30]},{"rgb":[30,40,200]},{"rgb":[250,250,250]}]}}"#;
    let p = build(&banded(), set);
    let allowed = [[200u8, 30, 30], [30, 40, 200], [250, 250, 250]];
    assert!(p.palette.len() <= 3, "{} colours", p.palette.len());
    for c in &p.palette {
        assert!(allowed.contains(&c.rgb), "{:?} is not in the set", c.rgb);
    }
    // Green has no colour of its own in the set: it takes the nearest, which is one of the three.
    let counts: usize = p.palette.iter().map(|c| c.count).sum();
    assert_eq!(
        counts,
        p.cell_palette.iter().filter(|&&c| c != EMPTY_CELL).count()
    );
    // The first band is red, the third blue, the fourth white, whatever the green took.
    let rgb_at = |x: usize, y: usize| p.palette[p.cell_palette[y * p.width + x] as usize].rgb;
    assert_eq!(rgb_at(2, 20), [200, 30, 30]);
    assert_eq!(rgb_at(20, 20), [30, 40, 200]);
    assert_eq!(rgb_at(38, 20), [250, 250, 250]);
}

#[test]
fn a_set_of_eight_gives_a_chart_of_at_most_eight_colours_however_many_were_asked_for() {
    let set = r#"{"longerSideStitches":40,"colorCount":50,"paletteSet":{"mode":"full","colors":[
        {"rgb":[0,0,0]},{"rgb":[255,255,255]},{"rgb":[200,30,30]},{"rgb":[30,160,40]},
        {"rgb":[30,40,200]},{"rgb":[240,200,30]},{"rgb":[150,90,40]},{"rgb":[120,120,120]}]}}"#;
    let p = build(&banded(), set);
    assert!(p.palette.len() <= 8);
    assert!(
        p.palette.len() >= 4,
        "the four bands have four colours in the set"
    );
}

#[test]
fn a_brand_set_gives_threads_of_that_brand_with_their_codes() {
    let set = r#"{"longerSideStitches":40,"colorCount":5,"paletteSet":{"mode":"dmc","colors":[{"code":"321"},{"code":"797"},{"code":"typo"}]}}"#;
    assert!(parse_options(set).is_err(), "an unknown code is refused");
    let good = r#"{"longerSideStitches":40,"colorCount":5,"paletteSet":{"mode":"dmc","colors":[{"code":"321"},{"code":"797"},{"code":"3801"},{"code":"B5200"}]}}"#;
    let p = build(&banded(), good);
    assert_eq!(p.thread_brand, Some("dmc"));
    for c in &p.palette {
        let source = c.source.as_ref().expect("a thread has its source");
        assert_eq!(source.brand, "dmc");
        assert!(
            c.name.starts_with(&source.code),
            "{} for {}",
            c.name,
            source.code
        );
    }
}

#[test]
fn a_chart_from_a_set_is_the_same_every_time_and_takes_the_dither_and_the_lines() {
    let set = r#"{"longerSideStitches":40,"colorCount":5,"ditherMode":"bayer-4","paletteSet":{"mode":"full","colors":[{"rgb":[200,30,30]},{"rgb":[30,40,200]}]}}"#;
    let (a, b) = (build(&banded(), set), build(&banded(), set));
    assert_eq!(pattern_json(&a), pattern_json(&b));
    // Crisp edges are not used with a set: asking for them is not an error and builds the chart the same way.
    let crisp = r#"{"longerSideStitches":40,"colorCount":5,"edgeMode":"crisp","paletteSet":{"mode":"full","colors":[{"rgb":[200,30,30]},{"rgb":[30,40,200]}]}}"#;
    let c = build(&banded(), crisp);
    assert!(c.palette.len() <= 2 && c.edge_mode.is_none());
}

#[test]
fn a_thread_of_a_system_not_loaded_is_kept_as_written() {
    // G-132: a colour's system need not be one loaded here; it comes back as written, with its number and its colour.
    let set = r#"{"longerSideStitches":40,"colorCount":5,"paletteSet":{"mode":"full","colors":[
        {"rgb":[200,30,30],"system":"Madeira","number":"0210"},{"rgb":[30,40,200]}]}}"#;
    let p = build(&banded(), set);
    let red = p
        .palette
        .iter()
        .find(|c| c.rgb == [200, 30, 30])
        .expect("the colour is used");
    assert_eq!(
        red.source
            .as_ref()
            .map(|s| (s.brand.as_str(), s.code.as_str())),
        Some(("Madeira", "0210"))
    );
    assert_eq!(red.name, "0210");
    for system in ["", "  ", "full"] {
        let bad = format!(
            r#"{{"longerSideStitches":40,"colorCount":5,"paletteSet":{{"mode":"full","colors":[{{"rgb":[1,2,3],"system":"{system}","number":"1"}}]}}}}"#
        );
        assert!(parse_options(&bad).is_err(), "system {system:?} is refused");
    }
}

#[test]
fn a_set_of_mixed_and_typed_threads_keeps_each_colours_thread_name_and_colour() {
    // G-131 (D397): each colour brings its own system and number, listed or typed, and its own name; nothing is looked up
    // over the colour given.
    let set = r#"{"longerSideStitches":40,"colorCount":5,"paletteSet":{"mode":"dmc","colors":[
        {"rgb":[200,30,30],"system":"dmc","number":"321"},
        {"rgb":[30,160,40],"system":"anchor","number":"X-77","name":"My green"},
        {"rgb":[30,40,200],"name":"Sky"},
        {"rgb":[245,245,240],"system":"cosmo","number":"100"}]}}"#;
    let p = build(&banded(), set);
    assert_eq!(p.thread_brand, Some("dmc"));
    let find = |rgb: [u8; 3]| {
        p.palette
            .iter()
            .find(|c| c.rgb == rgb)
            .expect("the colour is used")
    };
    let red = find([200, 30, 30]);
    assert_eq!(
        red.source
            .as_ref()
            .map(|s| (s.brand.as_str(), s.code.as_str())),
        Some(("dmc", "321"))
    );
    assert!(red.name.starts_with("321 - "), "{}", red.name);
    let green = find([30, 160, 40]);
    assert_eq!(
        green
            .source
            .as_ref()
            .map(|s| (s.brand.as_str(), s.code.as_str())),
        Some(("anchor", "X-77"))
    );
    assert_eq!(green.name, "My green");
    let blue = find([30, 40, 200]);
    assert!(blue.source.is_none());
    assert_eq!(blue.name, "Sky");
    assert_eq!(
        find([245, 245, 240])
            .source
            .as_ref()
            .map(|s| s.brand.as_str()),
        Some("cosmo")
    );
    let half = r#"{"longerSideStitches":40,"colorCount":5,"paletteSet":{"mode":"full","colors":[{"rgb":[1,2,3],"system":"dmc"}]}}"#;
    assert!(
        parse_options(half).is_err(),
        "a system without its number is refused"
    );
}
