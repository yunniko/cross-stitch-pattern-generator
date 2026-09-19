//! G-048 benchmark and parity CLI.
//!
//!   cs-bench generate <image.rgba> <width> <height> '<options json>' [repeat]
//!
//! Reads raw RGBA bytes, builds the pattern `repeat` times (default 1) and prints one JSON object: the pattern of the
//! last run (for the parity harness), every run's stage times in milliseconds, and the peak resident set where the
//! platform reports one (Linux `VmHWM`). Options: `longerSideStitches`, `colorCount`, `quantizer` ("latest" |
//! "original"), `optimize` (default true), `edgeMode`, `paletteMode` and `enhancementMode`: the same names, values and
//! defaults as `BuildPatternOptions`.

use cs_core::enhance::Mode;
use cs_core::pattern::{build_pattern, BuildOptions, EdgeMode, StageTimes};
use cs_core::quantize::Quantizer;
use cs_core::threads::Brand;
use cs_core::Image;
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Instant;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Options {
    longer_side_stitches: f64,
    color_count: usize,
    #[serde(default)]
    quantizer: Option<String>,
    #[serde(default)]
    optimize: Option<bool>,
    #[serde(default)]
    edge_mode: Option<String>,
    #[serde(default)]
    palette_mode: Option<String>,
    #[serde(default)]
    enhancement_mode: Option<String>,
}

fn peak_rss_mb() -> Option<f64> {
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    let line = status.lines().find(|l| l.starts_with("VmHWM:"))?;
    let kb: f64 = line.split_whitespace().nth(1)?.parse().ok()?;
    Some(kb / 1024.0)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
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
    let options: Options = serde_json::from_str(&args[5]).expect("options json");
    let repeat: usize = args.get(6).map(|r| r.parse().expect("repeat")).unwrap_or(1);

    let quantizer = match options.quantizer.as_deref() {
        None | Some("latest") => Quantizer::Latest,
        Some("original") => Quantizer::Original,
        Some(other) => panic!("unknown quantizer {other}"),
    };
    let build = BuildOptions {
        longer_side_stitches: options.longer_side_stitches,
        color_count: options.color_count,
        quantizer,
        optimize: options.optimize.unwrap_or(true),
        edge_mode: match options.edge_mode.as_deref() {
            None | Some("standard") => EdgeMode::Standard,
            Some("crisp") => EdgeMode::Crisp,
            Some("crisp-plus") => EdgeMode::CrispPlus,
            Some(other) => panic!("unknown edgeMode {other}"),
        },
        brand: match options.palette_mode.as_deref() {
            None | Some("full") => None,
            Some("dmc") => Some(Brand::Dmc),
            Some("cosmo") => Some(Brand::Cosmo),
            Some("anchor") => Some(Brand::Anchor),
            Some(other) => panic!("unknown paletteMode {other}"),
        },
        enhancement: match options.enhancement_mode.as_deref() {
            None | Some("off") => Mode::Off,
            Some("brighten") => Mode::Brighten,
            Some("auto") => Mode::Auto,
            Some("vivid") => Mode::Vivid,
            Some("portrait") => Mode::Portrait,
            Some(other) => panic!("unknown enhancementMode {other}"),
        },
    };
    let image = Image {
        width,
        height,
        data,
    };

    let mut runs = Vec::new();
    let mut pattern = None;
    for _ in 0..repeat.max(1) {
        let mut times: StageTimes = Vec::new();
        let start = Instant::now();
        let p = build_pattern(&image, &build, &mut times);
        let total = start.elapsed().as_secs_f64() * 1000.0;
        let stages: serde_json::Map<String, Value> = times
            .iter()
            .map(|(k, v)| (k.to_string(), json!(v)))
            .collect();
        runs.push(json!({ "totalMs": total, "stages": stages }));
        pattern = Some(p);
    }
    let p = pattern.unwrap();
    let palette: Vec<Value> = p
        .palette
        .iter()
        .map(|c| json!({ "index": c.index, "rgb": c.rgb, "symbol": c.symbol, "name": c.name, "count": c.count }))
        .collect();
    let out = json!({
        "pattern": {
            "width": p.width,
            "height": p.height,
            "cellPalette": p.cell_palette,
            "palette": palette,
            "isLandscape": p.is_landscape,
            "threadBrand": p.thread_brand,
            "edgeMode": p.edge_mode,
            "enhancementMode": p.enhancement_mode,
        },
        "runs": runs,
        "peakRssMb": peak_rss_mb(),
    });
    println!("{out}");
}
