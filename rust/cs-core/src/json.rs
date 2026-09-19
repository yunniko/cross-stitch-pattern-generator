//! JSON in and out, shared by the benchmark CLI and the WASM build: options with `BuildPatternOptions`' names, values
//! and defaults, and the pattern in the editable-save field names the parity harness hashes.

use crate::enhance::Mode;
use crate::pattern::{BuildOptions, EdgeMode, StageTimes, StitchPattern};
use crate::quantize::Quantizer;
use crate::threads::Brand;
use serde::Deserialize;
use serde_json::{json, Map, Value};

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
    #[serde(default)]
    threads: Option<usize>,
}

/// Parsed options and the requested worker-thread count (default 1; any count gives the same pattern, D185).
pub fn parse_options(text: &str) -> Result<(BuildOptions, usize), String> {
    let o: Options = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let quantizer = match o.quantizer.as_deref() {
        None | Some("latest") => Quantizer::Latest,
        Some("original") => Quantizer::Original,
        Some(other) => return Err(format!("unknown quantizer {other}")),
    };
    let edge_mode = match o.edge_mode.as_deref() {
        None | Some("standard") => EdgeMode::Standard,
        Some("crisp") => EdgeMode::Crisp,
        Some("crisp-plus") => EdgeMode::CrispPlus,
        Some(other) => return Err(format!("unknown edgeMode {other}")),
    };
    let brand = match o.palette_mode.as_deref() {
        None | Some("full") => None,
        Some("dmc") => Some(Brand::Dmc),
        Some("cosmo") => Some(Brand::Cosmo),
        Some("anchor") => Some(Brand::Anchor),
        Some(other) => return Err(format!("unknown paletteMode {other}")),
    };
    let enhancement = match o.enhancement_mode.as_deref() {
        None | Some("off") => Mode::Off,
        Some("brighten") => Mode::Brighten,
        Some("auto") => Mode::Auto,
        Some("vivid") => Mode::Vivid,
        Some("portrait") => Mode::Portrait,
        Some(other) => return Err(format!("unknown enhancementMode {other}")),
    };
    let options = BuildOptions {
        longer_side_stitches: o.longer_side_stitches,
        color_count: o.color_count,
        quantizer,
        optimize: o.optimize.unwrap_or(true),
        edge_mode,
        brand,
        enhancement,
    };
    Ok((options, o.threads.unwrap_or(1).max(1)))
}

pub fn pattern_json(p: &StitchPattern) -> Value {
    let palette: Vec<Value> = p
        .palette
        .iter()
        .map(|c| json!({ "index": c.index, "rgb": c.rgb, "symbol": c.symbol, "name": c.name, "count": c.count }))
        .collect();
    json!({
        "width": p.width,
        "height": p.height,
        "cellPalette": p.cell_palette,
        "palette": palette,
        "isLandscape": p.is_landscape,
        "threadBrand": p.thread_brand,
        "edgeMode": p.edge_mode,
        "enhancementMode": p.enhancement_mode,
    })
}

pub fn run_json(total_ms: f64, times: &StageTimes) -> Value {
    let stages: Map<String, Value> = times
        .iter()
        .map(|(k, v)| (k.to_string(), json!(v)))
        .collect();
    json!({ "totalMs": total_ms, "stages": stages })
}
