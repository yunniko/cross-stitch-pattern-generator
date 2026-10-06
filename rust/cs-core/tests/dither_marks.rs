//! The drawn marks' field (G-055, G-056, G-058), held by its properties: any texture inside the editor's ranges holds
//! tone, a painted stamp draws what it says, and each switch reaches the marks it claims. These lived in TypeScript
//! (`dither-texture.spec.ts`, `dither-every-mark.spec.ts`) until G-100 M3 deleted the TypeScript patterns; they are
//! the same assertions, sampled from Rust's own generator.

use cs_core::dither::hand_drawn::{
    configure, default_dither_texture, hand_drawn_thresholds, mark_centres, DitherStamp,
    DitherTexture,
};
use cs_core::dither::preview::ramp_window;
use cs_core::prng::Mulberry32;
use cs_core::settings::{Setting, Settings};
use std::collections::HashSet;

/// The share of cells a tone lights: those whose threshold it passes.
fn share_lit(thresholds: &[f64], tone: f64) -> f64 {
    thresholds.iter().filter(|&&t| tone > t).count() as f64 / thresholds.len() as f64
}

fn assert_holds_tone(thresholds: &[f64], tones: &[f64], what: &str) {
    for &tone in tones {
        let share = share_lit(thresholds, tone);
        assert!(
            (share - tone).abs() < 0.02,
            "{what}, tone {tone}: lit {share:.3}"
        );
    }
}

/// A spread of textures from one seeded stream, so this samples the space the editor opens rather than one case.
fn textures(count: usize) -> Vec<DitherTexture> {
    let mut rng = Mulberry32::new(0x7e57_ab1e);
    let mut r = || rng.next_f64();
    (0..count)
        .map(|_| DitherTexture {
            spacing: (3.0 + r() * 13.0).round(),
            separation: 0.4 + r() * 0.55,
            shape_weights: [r(), r(), r(), r(), 0.0],
            radius_min: 0.1 + r() * 0.3,
            radius_span: r() * 0.3,
            gap_alignment: 0.3 + r() * 0.65,
            wobble: r(),
            sweep: r(),
            seed: (r() * 4294967295.0) as u32,
            ..default_dither_texture()
        })
        .collect()
}

#[test]
fn any_texture_lights_the_share_of_stitches_the_tone_asks_for() {
    for texture in textures(24) {
        let thresholds = hand_drawn_thresholds(160, 120, &texture);
        assert_holds_tone(
            &thresholds,
            &[0.15, 0.5, 0.85],
            &format!("spacing {}", texture.spacing),
        );
    }
}

#[test]
fn any_texture_gives_every_cell_a_threshold() {
    for texture in textures(8) {
        let thresholds = hand_drawn_thresholds(64, 48, &texture);
        assert_eq!(thresholds.len(), 64 * 48);
        assert!(thresholds.iter().all(|t| (0.0..1.0).contains(t)));
    }
}

fn stamped(stamp: DitherStamp, spacing: f64) -> DitherTexture {
    DitherTexture {
        spacing,
        shape_weights: [0.0, 0.0, 0.0, 0.0, 1.0],
        stamp: Some(stamp),
        ..default_dither_texture()
    }
}

#[test]
fn a_painted_stamp_fills_the_stitches_it_paints_first() {
    // A cross: the centre and its four neighbours in step 1, nothing else painted.
    let mut order = vec![0u32; 25];
    for i in [7, 11, 12, 13, 17] {
        order[i] = 1;
    }
    let texture = stamped(DitherStamp { size: 5, order }, 8.0);
    let (width, height) = (96usize, 96usize);
    let thresholds = hand_drawn_thresholds(width, height, &texture);
    let centres = mark_centres(width, height, &texture);
    let at = |x: f64, y: f64| thresholds[y.floor() as usize * width + x.floor() as usize];

    let mut checked = 0;
    for centre in centres.chunks_exact(2) {
        let (cx, cy) = (centre[0], centre[1]);
        if checked >= 20
            || cx < 8.0
            || cy < 8.0
            || cx > width as f64 - 8.0
            || cy > height as f64 - 8.0
        {
            continue;
        }
        let painted = [
            at(cx, cy),
            at(cx + 1.0, cy),
            at(cx - 1.0, cy),
            at(cx, cy + 1.0),
            at(cx, cy - 1.0),
        ];
        let unpainted = [
            at(cx + 2.0, cy + 2.0),
            at(cx - 2.0, cy - 2.0),
            at(cx + 2.0, cy - 2.0),
        ];
        let latest_painted = painted.iter().cloned().fold(f64::MIN, f64::max);
        let earliest_unpainted = unpainted.iter().cloned().fold(f64::MAX, f64::min);
        assert!(
            latest_painted < earliest_unpainted,
            "mark at {cx},{cy}: the cross is drawn first"
        );
        checked += 1;
    }
    assert!(checked > 10);
}

#[test]
fn a_painted_stamp_holds_tone_at_any_size_and_spacing() {
    let mut rng = Mulberry32::new(0x5a_3b1e);
    for size in [3usize, 5, 7, 9] {
        for spacing in [4.0, 8.0, 14.0] {
            let order = (0..size * size)
                .map(|_| {
                    if rng.next_f64() < 0.4 {
                        0
                    } else {
                        1 + (rng.next_f64() * 4.0) as u32
                    }
                })
                .collect();
            let thresholds =
                hand_drawn_thresholds(120, 90, &stamped(DitherStamp { size, order }, spacing));
            assert_holds_tone(
                &thresholds,
                &[0.2, 0.55, 0.9],
                &format!("{size}x{size} stamp at spacing {spacing}"),
            );
        }
    }
}

const WIDTH: usize = 120;
const HEIGHT: usize = 90;
const TONE: f64 = 0.3;

fn only(index: usize) -> [f64; 5] {
    let mut weights = [0.0; 5];
    weights[index] = 1.0;
    weights
}

/// The stitches lit at `TONE`, and the mean distance from each to its nearest mark's centre.
fn measure(texture: &DitherTexture) -> (HashSet<usize>, f64, f64) {
    let thresholds = hand_drawn_thresholds(WIDTH, HEIGHT, texture);
    let centres = mark_centres(WIDTH, HEIGHT, texture);
    let mut lit = HashSet::new();
    let mut sum = 0.0;
    for y in 0..HEIGHT {
        for x in 0..WIDTH {
            if !(TONE > thresholds[y * WIDTH + x]) {
                continue;
            }
            lit.insert(y * WIDTH + x);
            let best = centres
                .chunks_exact(2)
                .map(|c| (c[0] - (x as f64 + 0.5)).powi(2) + (c[1] - (y as f64 + 0.5)).powi(2))
                .fold(f64::INFINITY, f64::min);
            sum += best.sqrt();
        }
    }
    let share = lit.len() as f64 / (WIDTH * HEIGHT) as f64;
    let reach = sum / lit.len() as f64;
    (lit, share, reach)
}

/// The share of stitches two textures disagree about, of those either one lights.
fn disagreement(a: &DitherTexture, b: &DitherTexture) -> f64 {
    let (left, ..) = measure(a);
    let (right, ..) = measure(b);
    left.symmetric_difference(&right).count() as f64 / (left.len() + right.len()) as f64
}

#[test]
fn a_switch_written_off_is_the_same_as_none_written() {
    let picture = |texture: &str| {
        let mut settings = Settings::new();
        settings.insert("ditherTexture", Setting::Other(texture.to_string()));
        let pattern = configure("hand-drawn", &mut settings).expect("a texture");
        ramp_window(Some(&*pattern), WIDTH, HEIGHT, WIDTH, HEIGHT)
    };
    let absent = picture(r#"{"shapeWeights":[0,0,1,0,0]}"#);
    let explicit = picture(
        r#"{"shapeWeights":[0,0,1,0,0],"wobbleEveryMark":false,"sizeEveryMark":false,"sweepEveryMark":false}"#,
    );
    assert_eq!(absent, explicit);
}

#[test]
fn size_reaches_dots_only_with_its_switch_and_then_packs_them() {
    let narrow = DitherTexture {
        shape_weights: only(2),
        radius_min: 0.1,
        radius_span: 0.0,
        ..default_dither_texture()
    };
    let wide = DitherTexture {
        radius_min: 0.45,
        ..narrow.clone()
    };
    assert!(
        (measure(&wide).2 - measure(&narrow).2).abs() < 1e-10,
        "a dot ignores ring width while the switch is off"
    );

    let narrow_on = DitherTexture {
        size_every_mark: true,
        ..narrow
    };
    let wide_on = DitherTexture {
        size_every_mark: true,
        ..wide
    };
    // Tone fixes how many stitches a mark lights, so a wide core swallows them and the mark is a compact disc.
    let change = measure(&wide_on).2 / measure(&narrow_on).2;
    assert!(
        change < 0.8,
        "reach moved by {:.0}%",
        (change - 1.0) * 100.0
    );
    assert!((measure(&wide_on).1 - measure(&narrow_on).1).abs() < 0.005);
}

#[test]
fn wobble_roughens_a_ring_only_with_its_switch() {
    let plain = DitherTexture {
        shape_weights: only(0),
        wobble: 0.9,
        ..default_dither_texture()
    };
    assert_eq!(
        disagreement(
            &plain,
            &DitherTexture {
                wobble: 0.0,
                ..plain.clone()
            }
        ),
        0.0
    );
    assert!(
        disagreement(
            &plain,
            &DitherTexture {
                wobble_every_mark: true,
                ..plain.clone()
            }
        ) > 0.05
    );
}

#[test]
fn sweep_fills_a_dot_round_only_with_its_switch() {
    let plain = DitherTexture {
        shape_weights: only(2),
        sweep: 0.8,
        ..default_dither_texture()
    };
    assert_eq!(
        disagreement(
            &plain,
            &DitherTexture {
                sweep: 0.0,
                ..plain.clone()
            }
        ),
        0.0
    );
    assert!(
        disagreement(
            &plain,
            &DitherTexture {
                sweep_every_mark: true,
                ..plain.clone()
            }
        ) > 0.05
    );
}

#[test]
fn a_painted_shape_stays_as_painted_and_only_the_spill_wobbles() {
    let order = vec![
        0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1, 1, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0,
    ];
    let painted = DitherTexture {
        shape_weights: only(4),
        stamp: Some(DitherStamp { size: 5, order }),
        wobble: 0.9,
        spacing: 9.0,
        ..default_dither_texture()
    };
    let wobbling = DitherTexture {
        wobble_every_mark: true,
        ..painted.clone()
    };
    let lit_at = |field: &[f64], tone: f64| -> Vec<usize> {
        (0..field.len()).filter(|&i| tone > field[i]).collect()
    };
    // At a tone light enough that only painted stitches light (the cross is five of a mark's ~81), the two fields
    // light exactly the same ones.
    let painted_share = 5.0 / 81.0;
    let before = lit_at(
        &hand_drawn_thresholds(WIDTH, HEIGHT, &painted),
        painted_share,
    );
    assert!(before.len() > 200);
    assert_eq!(
        lit_at(
            &hand_drawn_thresholds(WIDTH, HEIGHT, &wobbling),
            painted_share
        ),
        before
    );
    assert!(
        disagreement(&painted, &wobbling) > 0.02,
        "the spill wobbles"
    );
}

#[test]
fn tone_holds_whatever_the_switches_say() {
    let mut rng = Mulberry32::new(0x51_7c4e);
    let mut r = || rng.next_f64();
    for case in 0..16 {
        let texture = DitherTexture {
            spacing: (4.0 + r() * 10.0).round(),
            radius_min: 0.1 + r() * 0.3,
            radius_span: r() * 0.2,
            wobble: r(),
            sweep: r(),
            shape_weights: [r(), r(), r(), r(), 0.0],
            wobble_every_mark: r() < 0.5,
            size_every_mark: r() < 0.5,
            sweep_every_mark: r() < 0.5,
            ..default_dither_texture()
        };
        let thresholds = hand_drawn_thresholds(WIDTH, HEIGHT, &texture);
        assert_holds_tone(&thresholds, &[0.2, 0.5, 0.8], &format!("case {case}"));
    }
}
