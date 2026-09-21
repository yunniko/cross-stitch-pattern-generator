//! JSON in and out, shared by the benchmark CLI and the WASM build: options with `BuildPatternOptions`' names, values
//! and defaults, and the pattern in the editable-save field names the parity harness hashes.

use crate::dither::DitherMode;
use crate::dither_hand_drawn::{DitherTexture, DEFAULT_DITHER_TEXTURE};
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
    dither_mode: Option<String>,
    #[serde(default)]
    dither_texture: Option<TextureOptions>,
    #[serde(default)]
    threads: Option<usize>,
}

/// What a drawn pattern is made of (G-055). Absent fields take the default texture's value, so a request naming one
/// knob changes only that knob.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextureOptions {
    #[serde(default)]
    spacing: Option<f64>,
    #[serde(default)]
    separation: Option<f64>,
    #[serde(default)]
    shape_weights: Option<[f64; 4]>,
    #[serde(default)]
    radius_min: Option<f64>,
    #[serde(default)]
    radius_span: Option<f64>,
    #[serde(default)]
    gap_alignment: Option<f64>,
    #[serde(default)]
    wobble: Option<f64>,
    #[serde(default)]
    sweep: Option<f64>,
    #[serde(default)]
    seed: Option<u32>,
}

impl TextureOptions {
    fn resolve(&self) -> DitherTexture {
        let d = DEFAULT_DITHER_TEXTURE;
        DitherTexture {
            spacing: self.spacing.unwrap_or(d.spacing),
            separation: self.separation.unwrap_or(d.separation),
            shape_weights: self.shape_weights.unwrap_or(d.shape_weights),
            radius_min: self.radius_min.unwrap_or(d.radius_min),
            radius_span: self.radius_span.unwrap_or(d.radius_span),
            gap_alignment: self.gap_alignment.unwrap_or(d.gap_alignment),
            wobble: self.wobble.unwrap_or(d.wobble),
            sweep: self.sweep.unwrap_or(d.sweep),
            seed: self.seed.unwrap_or(d.seed),
        }
    }
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
    let dither = match o.dither_mode.as_deref() {
        None | Some("off") => DitherMode::Off,
        Some("bayer-4") => DitherMode::Bayer4,
        Some("bayer-8") => DitherMode::Bayer8,
        Some("clustered-8") => DitherMode::Clustered8,
        Some("ring-8") => DitherMode::Ring8,
        Some("lines-horizontal") => DitherMode::LinesHorizontal,
        Some("lines-diagonal") => DitherMode::LinesDiagonal,
        Some("blue-noise-16") => DitherMode::BlueNoise16,
        Some("floyd-steinberg") => DitherMode::FloydSteinberg,
        Some("atkinson") => DitherMode::Atkinson,
        Some("hand-drawn") => DitherMode::HandDrawn,
        Some(other) => return Err(format!("unknown ditherMode {other}")),
    };
    let options = BuildOptions {
        longer_side_stitches: o.longer_side_stitches,
        color_count: o.color_count,
        quantizer,
        optimize: o.optimize.unwrap_or(true),
        edge_mode,
        brand,
        enhancement,
        dither,
        dither_texture: o
            .dither_texture
            .as_ref()
            .map(TextureOptions::resolve)
            .unwrap_or(DEFAULT_DITHER_TEXTURE),
    };
    Ok((options, o.threads.unwrap_or(1).max(1)))
}

pub fn pattern_json(p: &StitchPattern) -> Value {
    let palette: Vec<Value> = p
        .palette
        .iter()
        .map(|c| {
            let mut entry = json!({ "index": c.index, "rgb": c.rgb, "symbol": c.symbol, "name": c.name, "count": c.count });
            if let Some(source) = &c.source {
                entry["source"] = json!({ "brand": source.brand, "code": source.code });
            }
            entry
        })
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
        "ditherMode": p.dither_mode,
        "ditherTexture": p.dither_texture.map(|t| json!({
            "spacing": t.spacing,
            "separation": t.separation,
            "shapeWeights": t.shape_weights,
            "radiusMin": t.radius_min,
            "radiusSpan": t.radius_span,
            "gapAlignment": t.gap_alignment,
            "wobble": t.wobble,
            "sweep": t.sweep,
            "seed": t.seed,
        })),
    })
}

pub fn run_json(total_ms: f64, times: &StageTimes) -> Value {
    let stages: Map<String, Value> = times
        .iter()
        .map(|(k, v)| (k.to_string(), json!(v)))
        .collect();
    json!({ "totalMs": total_ms, "stages": stages })
}
