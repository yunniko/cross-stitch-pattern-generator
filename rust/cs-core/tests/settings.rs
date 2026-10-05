//! G-099: the settings of a generation are read by the families that use them, and a setting nobody reads is refused.

use cs_core::json::parse_options;
use cs_core::settings::{Setting, Settings};

const BASE: &str = r#""longerSideStitches":40,"colorCount":8"#;

fn options(extra: &str) -> Result<(cs_core::pattern::BuildOptions, usize), String> {
    parse_options(&format!("{{{BASE}{extra}}}"))
}

#[test]
fn a_value_is_taken_once_and_what_is_left_is_refused_by_name() {
    let mut settings = Settings::new();
    settings.insert("vivid", Setting::Flag(true));
    settings.insert("somethingNew", Setting::Number(3.0));
    assert_eq!(settings.flag("vivid"), Ok(Some(true)));
    assert_eq!(settings.flag("vivid"), Ok(None));
    assert_eq!(
        settings.finish(),
        Err("unknown setting somethingNew: nothing in the pipeline reads it".to_string())
    );
}

#[test]
fn a_value_of_the_wrong_kind_is_refused_by_name() {
    let mut settings = Settings::new();
    settings.insert("vivid", Setting::Text("yes".into()));
    settings.insert("colorCount", Setting::Number(12.5));
    settings.insert("edgeMode", Setting::Flag(true));
    assert_eq!(
        settings.flag("vivid"),
        Err("vivid must be true or false".to_string())
    );
    assert_eq!(
        settings.count("colorCount"),
        Err("colorCount must be a whole number, not negative".to_string())
    );
    assert_eq!(
        settings.text("edgeMode"),
        Err("edgeMode must be text".to_string())
    );
}

#[test]
fn the_two_required_settings_alone_are_a_whole_request() {
    let (options, threads) = options("").expect("options");
    assert_eq!(options.color_count, 8);
    assert_eq!(threads, 1);
    assert!(options.overlays.is_empty());
    assert!(options.optimize);
}

#[test]
fn a_setting_nothing_reads_is_refused_and_a_null_one_is_as_if_absent() {
    assert_eq!(
        options(r#","sparkle":true"#).err(),
        Some("unknown setting sparkle: nothing in the pipeline reads it".to_string())
    );
    assert!(options(r#","sparkle":null,"edgeMode":null"#).is_ok());
    assert!(parse_options(r#"{"colorCount":8}"#).is_err());
}

#[test]
fn an_unknown_mode_is_refused_by_the_family_that_reads_it() {
    for (extra, refusal) in [
        (r#","edgeMode":"soft""#, "unknown edgeMode soft"),
        (r#","quantizer":"newest""#, "unknown quantizer newest"),
        (r#","paletteMode":"wool""#, "unknown paletteMode wool"),
        (r#","ditherMode":"sparkle""#, "unknown ditherMode sparkle"),
    ] {
        assert_eq!(options(extra).err().as_deref(), Some(refusal));
    }
}

#[test]
fn every_dither_pattern_is_found_by_its_own_id() {
    for mode in cs_core::dither::DitherMode::ALL {
        let (options, _) = options(&format!(r#","ditherMode":"{}""#, mode.id())).expect("options");
        assert_eq!(options.dither, mode);
    }
}

#[test]
fn the_overlays_asked_for_come_in_the_order_they_run_and_their_settings_are_theirs() {
    let names = |extra: &str| -> Vec<&'static str> {
        options(extra)
            .expect("options")
            .0
            .overlays
            .iter()
            .map(|overlay| overlay.name())
            .collect()
    };
    assert_eq!(
        names(r#","textureStrokes":true,"backstitchLines":true"#),
        ["lines", "texture"]
    );
    assert_eq!(names(r#","textureStrokes":true"#), ["texture"]);
    // Settings of an overlay that is not asked for are still its own: they are read, and not refused as unknown.
    assert!(names(
        r#","backstitchLines":false,"backstitchSensitivity":0.9,"backstitchPhotos":true,"textureDensity":0.4"#
    )
    .is_empty());
    assert_eq!(
        options(r#","textureDensity":"lots""#).err().as_deref(),
        Some("textureDensity must be a number")
    );
}
