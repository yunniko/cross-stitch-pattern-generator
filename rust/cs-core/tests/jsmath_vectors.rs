//! Every `jsmath` function against V8's own results, bit for bit (D183). The vectors come from
//! `node scripts/rust-jsmath-vectors.mjs rust/target/jsmath-vectors.bin`; without the file the test says so and passes
//! only if `JSMATH_VECTORS_OPTIONAL` is set, so a missing file can never read as a proof.

use cs_core::jsmath;
use std::path::PathBuf;

const NAMES: [&str; 11] = [
    "", "cbrt", "pow", "exp", "round", "hypot", "atan2", "sin", "cos", "log", "hypot3",
];

#[test]
fn every_function_matches_v8_bit_for_bit() {
    let path = std::env::var("JSMATH_VECTORS")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../target/jsmath-vectors.bin")
        });
    let bytes = match std::fs::read(&path) {
        Ok(b) => b,
        Err(_) if std::env::var("JSMATH_VECTORS_OPTIONAL").is_ok() => {
            eprintln!("no vectors at {}: skipped", path.display());
            return;
        }
        Err(e) => panic!(
            "no vectors at {} ({e}); run scripts/rust-jsmath-vectors.mjs",
            path.display()
        ),
    };
    assert_eq!(bytes.len() % 25, 0);
    let mut checked = [0usize; NAMES.len()];
    let mut mismatches = [0usize; NAMES.len()];
    let mut failures = Vec::new();
    for record in bytes.chunks_exact(25) {
        let op = record[0] as usize;
        let x = f64::from_le_bytes(record[1..9].try_into().unwrap());
        let y = f64::from_le_bytes(record[9..17].try_into().unwrap());
        let expected = f64::from_le_bytes(record[17..25].try_into().unwrap());
        let got = match op {
            1 => jsmath::cbrt(x),
            2 => jsmath::pow(x, y),
            3 => jsmath::exp(x),
            4 => jsmath::round(x),
            5 => jsmath::hypot(x, y),
            6 => jsmath::atan2(x, y),
            7 => jsmath::sin(x),
            8 => jsmath::cos(x),
            9 => jsmath::log(x),
            10 => jsmath::hypot_n(&[x, y, x - y]),
            _ => panic!("unknown op {op}"),
        };
        checked[op] += 1;
        let same = got.to_bits() == expected.to_bits() || (got.is_nan() && expected.is_nan());
        if !same {
            mismatches[op] += 1;
            if mismatches[op] <= 4 {
                failures.push(format!(
                    "{} x {x:e} y {y:e}: v8 {expected:e} ({:#x}), rust {got:e} ({:#x})",
                    NAMES[op],
                    expected.to_bits(),
                    got.to_bits()
                ));
            }
        }
    }
    for op in 1..NAMES.len() {
        println!(
            "{:>6}: checked {:>8}, mismatched {}",
            NAMES[op], checked[op], mismatches[op]
        );
    }
    assert!(
        failures.is_empty(),
        "mismatches, first of each:\n{}",
        failures.join("\n")
    );
}
