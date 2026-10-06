//! The patterns' declarations (G-100, D328) hold together: what the interface is told about a pattern is true of the
//! pattern, so the chooser, the feature list and the built pictures drawn from them cannot disagree with the chart.

use cs_core::dither::{declared, Offered, PATTERNS};
use cs_core::settings::{Setting, Settings};
use std::collections::HashSet;

#[test]
fn every_id_is_declared_once_and_none_is_off() {
    let ids: HashSet<&str> = PATTERNS.iter().map(|d| d.id).collect();
    assert_eq!(ids.len(), PATTERNS.len());
    assert!(!ids.contains(cs_core::dither::OFF));
    for d in PATTERNS {
        assert!(!d.label.is_empty(), "{} has a name", d.id);
        assert!(std::ptr::eq(declared(d.id).unwrap(), d));
    }
}

#[test]
fn a_shared_choice_is_pictured_by_one_of_its_own_variants_and_they_sit_together() {
    let mut seen_choices: Vec<&str> = Vec::new();
    let mut last_choice: Option<&str> = None;
    for d in PATTERNS {
        if let Offered::Variant { choice, label, .. } = &d.offered {
            assert!(!label.is_empty());
            assert_eq!(
                d.label, choice.label,
                "a variant is called by its choice's name"
            );
            let pictured = declared(choice.pictured_by).expect("the picture is a pattern's");
            assert!(
                matches!(&pictured.offered, Offered::Variant { choice: c, .. } if c.id == choice.id),
                "{} is pictured by one of its own variants",
                choice.id
            );
            if last_choice != Some(choice.id) {
                assert!(
                    !seen_choices.contains(&choice.id),
                    "{}'s variants sit together",
                    choice.id
                );
                seen_choices.push(choice.id);
            }
            last_choice = Some(choice.id);
        } else {
            last_choice = None;
        }
    }
}

#[test]
fn a_pattern_declared_without_settings_records_none_whatever_it_is_given() {
    for d in PATTERNS {
        let mut settings = Settings::new();
        settings.insert(
            "ditherTexture",
            Setting::Other(r#"{"spacing":11}"#.to_string()),
        );
        let pattern = (d.configure)(d.id, &mut settings).expect("configure");
        match &d.settings {
            None => assert!(
                pattern.recorded().is_none(),
                "{} has no settings to record",
                d.id
            ),
            Some(own) => {
                assert_eq!(own.key, "ditherTexture");
                assert!(
                    pattern.recorded().is_some(),
                    "{} records the settings it was given",
                    d.id
                );
            }
        }
    }
}
