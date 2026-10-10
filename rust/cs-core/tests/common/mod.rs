//! The thread systems the tests generate in (G-132, D400): the site's seeded lists, kept as fixtures in
//! `tests/fixtures/thread-systems/` at the repository's root, since nothing is compiled in.
#![allow(dead_code)]

use cs_core::threads::{System, ThreadSystem};
use serde_json::Value;
use std::sync::Arc;

fn fixture(key: &str) -> Value {
    let path = format!(
        "{}/../../tests/fixtures/thread-systems/{key}.json",
        env!("CARGO_MANIFEST_DIR")
    );
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("{path}: {e}"));
    serde_json::from_str(&text).expect("a thread-system fixture")
}

/// A system as the request carries it: `{key, threads}`.
fn request_system(key: &str) -> Value {
    let f = fixture(key);
    serde_json::json!({ "key": key, "threads": f["threads"] })
}

/// The seeded system `key`, built as the options build it.
pub fn system(key: &str) -> System {
    let threads = fixture(key)["threads"]
        .as_array()
        .expect("threads")
        .iter()
        .map(|t| {
            let n = u32::from_str_radix(t[2].as_str().expect("hex"), 16).expect("hex");
            (
                t[0].as_str().expect("code").to_string(),
                t[1].as_str().expect("name").to_string(),
                [(n >> 16) as u8, (n >> 8) as u8, n as u8],
            )
        })
        .collect();
    Arc::new(ThreadSystem::new(key, threads).expect("a system"))
}

/// `options` with the three seeded systems added as `threadSystems`, as the server adds them to a request.
pub fn with_systems(options: &str) -> String {
    let mut o: Value = serde_json::from_str(options).expect("options JSON");
    o["threadSystems"] = Value::Array(
        ["dmc", "cosmo", "anchor"]
            .iter()
            .map(|k| request_system(k))
            .collect(),
    );
    o.to_string()
}
