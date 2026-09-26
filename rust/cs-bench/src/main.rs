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
//! `optimize`, `edgeMode`, `paletteMode` and `photoAdjust` as in `BuildPatternOptions`, plus `threads`.

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

/// Prints the dash pattern and pieces the exporter would draw for each line (G-073 M5).
///
/// Only a way to look inside: `scripts/rust-backstitch-style.ts` compares this against the TypeScript the
/// editor draws with, so the two copies of the dash table cannot drift apart unnoticed.
fn backstitch_style(args: &[String]) {
    let text = std::fs::read_to_string(&args[2]).expect("read pattern");
    let pattern = cs_export::model::Pattern::from_editable_json(&text).expect("pattern");
    let threads = cs_export::backstitch::backstitch_threads(&pattern.backstitch);
    let out: Vec<_> = pattern
        .backstitch
        .iter()
        .map(|line| {
            let pattern_for = cs_export::backstitch::dash_pattern_for(line.palette_index, &threads);
            let segments: Vec<_> = cs_export::backstitch::dash_segments(line, pattern_for)
                .into_iter()
                .map(|s| {
                    vec![
                        round6(s.x1),
                        round6(s.y1),
                        round6(s.x2),
                        round6(s.y2),
                    ]
                })
                .collect();
            json!({
                "paletteIndex": line.palette_index,
                "pattern": pattern_for,
                "segments": segments,
            })
        })
        .collect();
    std::fs::write(&args[3], json!(out).to_string()).expect("write output");
}

/// Six decimals, which is where two languages' floating point stop agreeing about a diagonal.
fn round6(v: f64) -> f64 {
    (v * 1e6).round() / 1e6
}

/// Applies the four photo sliders to a raw RGBA file and writes the result (G-074 M1).
///
/// Only a way to look inside: `scripts/rust-photo-adjust.ts` compares this against the TypeScript the
/// browser previews with, so the two copies of the adjustment cannot drift apart unnoticed.
fn photo_adjust(args: &[String]) {
    let data = std::fs::read(&args[2]).expect("read image");
    let width: usize = args[3].parse().expect("width");
    let height: usize = args[4].parse().expect("height");
    let adjust: Vec<f64> = args[5]
        .split(',')
        .map(|v| v.parse().expect("adjust value"))
        .collect();
    let image = cs_core::Image {
        width,
        height,
        data,
    };
    let adjust = cs_core::photo_adjust::PhotoAdjust {
        brightness: adjust[0],
        contrast: adjust[1],
        saturation: adjust[2],
        temperature: adjust[3],
    };
    let out = cs_core::photo_adjust::adjust_image(&image, &adjust);
    // Neutral gives no image at all, which is the point: the photo passes through untouched.
    let bytes = out.map(|i| i.data).unwrap_or(image.data);
    std::fs::write(&args[6], &bytes).expect("write output");
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() >= 5 && args[1] == "export" {
        export(&args);
        return;
    }
    if args.len() >= 7 && args[1] == "photo-adjust" {
        photo_adjust(&args);
        return;
    }
    if args.len() >= 4 && args[1] == "backstitch-style" {
        backstitch_style(&args);
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
