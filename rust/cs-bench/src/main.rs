//! G-048 benchmark and parity CLI.
//!
//!   cs-bench generate <image.rgba> <width> <height> '<options json>' [repeat]
//!   [RUST_EXPORT_THREADS=n] cs-bench export <pattern.json> '<request json>' <out file> [repeat]
//!
//! `export` reads an editable save and an export request (`kind`, `baseName`, `aidaCount`, `sizeUnit`, `authorName`,
//! `overlapCells`), writes the file `runExportJob` would, and prints its name, size, each run's time and the peak RSS.
//!
//! Reads raw RGBA bytes, builds the pattern `repeat` times (default 1) and prints one JSON object: the pattern of the
//! last run (for the parity harness), every run's stage times in milliseconds, and the peak resident set where the
//! platform reports one (Linux `VmHWM`). Options (`cs_core::json`): `longerSideStitches`, `colorCount`, `quantizer`,
//! `optimize`, `edgeMode`, `paletteMode` and `enhancementMode` as in `BuildPatternOptions`, plus `threads`.

use cs_core::json::{parse_options, pattern_json, run_json};
use cs_core::pattern::{build_pattern, StageTimes};
use cs_core::Image;
use serde_json::json;
use std::time::Instant;

#[cfg(feature = "mimalloc")]
#[global_allocator]
static GLOBAL: mimalloc::MiMalloc = mimalloc::MiMalloc;

fn peak_rss_mb() -> Option<f64> {
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    let line = status.lines().find(|l| l.starts_with("VmHWM:"))?;
    let kb: f64 = line.split_whitespace().nth(1)?.parse().ok()?;
    Some(kb / 1024.0)
}

fn export(args: &[String]) {
    let text = std::fs::read_to_string(&args[2]).expect("read pattern");
    let pattern = cs_export::model::Pattern::from_editable_json(&text).expect("pattern");
    let request = cs_export::model::Request::from_json(&args[3]).expect("request");
    let repeat: usize = args.get(5).map(|r| r.parse().expect("repeat")).unwrap_or(1);
    // RUST_EXPORT_THREADS sizes the pool A4 pages render on; one thread by default, the exact tier's timing.
    let threads: usize = std::env::var("RUST_EXPORT_THREADS")
        .map(|t| t.parse().expect("RUST_EXPORT_THREADS"))
        .unwrap_or(1);
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(threads)
        .build()
        .expect("thread pool");
    let origin = Instant::now();
    let mut runs = Vec::new();
    let mut file = None;
    for _ in 0..repeat.max(1) {
        let start = origin.elapsed().as_secs_f64() * 1000.0;
        let f = pool
            .install(|| cs_export::export(&pattern, &request))
            .expect("export");
        runs.push(origin.elapsed().as_secs_f64() * 1000.0 - start);
        file = Some(f);
    }
    let file = file.unwrap();
    std::fs::write(&args[4], &file.bytes).expect("write output");
    let out = json!({ "filename": file.filename, "bytes": file.bytes.len(), "runsMs": runs, "peakRssMb": peak_rss_mb(), "threads": threads });
    println!("{out}");
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 5 && args[1] == "export" {
        export(&args);
        return;
    }
    if args.len() < 6 || args[1] != "generate" {
        eprintln!(
            "usage: cs-bench generate <image.rgba> <width> <height> '<options json>' [repeat]"
        );
        std::process::exit(2);
    }
    let data = std::fs::read(&args[2]).expect("read image");
    let width: usize = args[3].parse().expect("width");
    let height: usize = args[4].parse().expect("height");
    assert_eq!(
        data.len(),
        width * height * 4,
        "image is not width x height RGBA"
    );
    let (build, threads) = parse_options(&args[5]).expect("options");
    let repeat: usize = args.get(6).map(|r| r.parse().expect("repeat")).unwrap_or(1);
    let image = Image {
        width,
        height,
        data,
    };

    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(threads)
        .build()
        .expect("thread pool");
    let origin = Instant::now();
    let now = || origin.elapsed().as_secs_f64() * 1000.0;
    let mut runs = Vec::new();
    let mut pattern = None;
    for _ in 0..repeat.max(1) {
        let mut times: StageTimes = Vec::new();
        let start = now();
        let p = pool.install(|| build_pattern(&image, &build, &mut times, &now));
        runs.push(run_json(now() - start, &times));
        pattern = Some(p);
    }
    let out = json!({ "pattern": pattern_json(&pattern.unwrap()), "runs": runs, "peakRssMb": peak_rss_mb(), "threads": threads });
    println!("{out}");
}
