//! JSON in and out, shared by the benchmark CLI and the WASM build: options with `BuildPatternOptions`' names, values
//! and defaults, and the pattern in the editable-save field names the parity harness hashes.

use crate::dither::DitherMode;
use crate::dither_hand_drawn::{default_dither_texture, DitherStamp, DitherTexture};
use crate::pattern::{BuildOptions, EdgeMode, PaletteSet, SetColor, StageTimes, StitchPattern};
use crate::photo_adjust::{PhotoAdjust, NEUTRAL_ADJUST};
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
    dither_mode: Option<String>,
    #[serde(default)]
    dither_texture: Option<TextureOptions>,
    #[serde(default)]
    vivid: Option<bool>,
    #[serde(default)]
    photo_adjust: Option<AdjustOptions>,
    #[serde(default)]
    backstitch_lines: Option<bool>,
    #[serde(default)]
    backstitch_sensitivity: Option<f64>,
    #[serde(default)]
    backstitch_photos: Option<bool>,
    #[serde(default)]
    texture_strokes: Option<bool>,
    #[serde(default)]
    texture_density: Option<f64>,
    #[serde(default)]
    palette_set: Option<PaletteSetOptions>,
    #[serde(default)]
    threads: Option<usize>,
}

/// A set of colours the chart is made from (G-087): the palette mode, and a colour each, by thread code in a brand or by RGB.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaletteSetOptions {
    mode: String,
    colors: Vec<SetColorOptions>,
}

#[derive(Deserialize)]
struct SetColorOptions {
    #[serde(default)]
    code: Option<String>,
    #[serde(default)]
    rgb: Option<[u8; 3]>,
}

impl PaletteSetOptions {
    fn resolve(&self) -> Result<PaletteSet, String> {
        let brand = match self.mode.as_str() {
            "full" => None,
            "dmc" => Some(Brand::Dmc),
            "cosmo" => Some(Brand::Cosmo),
            "anchor" => Some(Brand::Anchor),
            other => return Err(format!("unknown paletteSet mode {other}")),
        };
        if self.colors.is_empty() || self.colors.len() > crate::names::symbol_set().len() {
            return Err("a palette set holds between 1 and the number of symbols colours".into());
        }
        let mut colors = Vec::new();
        for c in &self.colors {
            colors.push(match (brand, &c.code, c.rgb) {
                (Some(brand), Some(code), _) => {
                    let (name, rgb) = crate::threads::thread_by_code(brand, code)
                        .ok_or_else(|| format!("unknown {} thread {code}", self.mode))?;
                    SetColor {
                        rgb,
                        code: Some(code.clone()),
                        label: crate::threads::thread_name(code, &name),
                    }
                }
                (Some(_), None, _) => return Err("a thread of a brand needs its code".into()),
                (None, _, Some(rgb)) => SetColor {
                    rgb,
                    code: None,
                    label: String::new(),
                },
                (None, _, None) => return Err("a custom colour needs its rgb".into()),
            });
        }
        Ok(PaletteSet { brand, colors })
    }
}

/// The four photo sliders (G-074). Absent, or absent field by field, means neutral.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AdjustOptions {
    #[serde(default)]
    brightness: Option<f64>,
    #[serde(default)]
    contrast: Option<f64>,
    #[serde(default)]
    saturation: Option<f64>,
    #[serde(default)]
    temperature: Option<f64>,
}

impl AdjustOptions {
    /// Mirrors `clampAdjust`: a value out of range or not a number cannot reach a photo.
    fn resolve(&self) -> PhotoAdjust {
        fn slider(v: Option<f64>) -> f64 {
            match v {
                Some(v) if v.is_finite() => v.clamp(-100.0, 100.0),
                _ => 0.0,
            }
        }
        PhotoAdjust {
            brightness: slider(self.brightness),
            contrast: slider(self.contrast),
            saturation: slider(self.saturation),
            temperature: slider(self.temperature),
        }
    }
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
    shape_weights: Option<[f64; 5]>,
    #[serde(default)]
    stamp: Option<StampOptions>,
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
    #[serde(default)]
    wobble_every_mark: Option<bool>,
    #[serde(default)]
    size_every_mark: Option<bool>,
    #[serde(default)]
    sweep_every_mark: Option<bool>,
}

/// A painted mark as the request carries it (G-056).
#[derive(Deserialize)]
struct StampOptions {
    size: usize,
    order: Vec<u32>,
}

impl TextureOptions {
    fn resolve(&self) -> DitherTexture {
        let d = default_dither_texture();
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
            stamp: self.stamp.as_ref().map(|s| DitherStamp {
                size: s.size,
                order: s.order.clone(),
            }),
            wobble_every_mark: self.wobble_every_mark.unwrap_or(d.wobble_every_mark),
            size_every_mark: self.size_every_mark.unwrap_or(d.size_every_mark),
            sweep_every_mark: self.sweep_every_mark.unwrap_or(d.sweep_every_mark),
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
    let dither = match o.dither_mode.as_deref() {
        None | Some("off") => DitherMode::Off,
        Some("bayer-4") => DitherMode::Bayer4,
        Some("bayer-8") => DitherMode::Bayer8,
        Some("clustered-8") => DitherMode::Clustered8,
        Some("ring-8") => DitherMode::Ring8,
        Some("lines-horizontal") => DitherMode::LinesHorizontal,
        Some("lines-vertical") => DitherMode::LinesVertical,
        Some("lines-diagonal") => DitherMode::LinesDiagonal,
        Some("lines-anti-diagonal") => DitherMode::LinesAntiDiagonal,
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
        dither,
        dither_texture: o
            .dither_texture
            .as_ref()
            .map(TextureOptions::resolve)
            .unwrap_or_else(default_dither_texture),
        vivid: o.vivid.unwrap_or(false),
        photo_adjust: o
            .photo_adjust
            .as_ref()
            .map(AdjustOptions::resolve)
            .unwrap_or(NEUTRAL_ADJUST),
        backstitch_photos: o.backstitch_photos.unwrap_or(false),
        palette_set: o
            .palette_set
            .as_ref()
            .map(PaletteSetOptions::resolve)
            .transpose()?,
        texture_strokes: o.texture_strokes.unwrap_or(false).then(|| {
            o.texture_density
                .filter(|v| v.is_finite())
                .map_or(crate::texture::DEFAULT_DENSITY, |v| v.clamp(0.0, 1.0))
        }),
        backstitch_lines: o.backstitch_lines.unwrap_or(false).then(|| {
            o.backstitch_sensitivity
                .filter(|v| v.is_finite())
                .map_or(crate::lines::DEFAULT_SENSITIVITY, |v| v.clamp(0.0, 1.0))
        }),
    };
    Ok((options, o.threads.unwrap_or(1).max(1)))
}

pub fn pattern_json(p: &StitchPattern) -> Value {
    let mut out = pattern_json_base(p);
    // Written only when there is some, so a chart made without it is the object it was.
    if !p.backstitch.is_empty() {
        out["backstitch"] = Value::Array(
            p.backstitch
                .iter()
                .map(|l| json!({ "x1": l.x1, "y1": l.y1, "x2": l.x2, "y2": l.y2, "paletteIndex": l.palette_index }))
                .collect(),
        );
    }
    out
}

fn pattern_json_base(p: &StitchPattern) -> Value {
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
        "ditherMode": p.dither_mode,
        "ditherTexture": p.dither_texture.as_ref().map(texture_json),
        "vivid": p.vivid,
        "photoAdjust": p.photo_adjust.map(|a| json!({
            "brightness": a.brightness,
            "contrast": a.contrast,
            "saturation": a.saturation,
            "temperature": a.temperature,
        })),
    })
}

/// A texture as the editable save format writes it. A texture with no stamp leaves the key out rather than writing
/// `null`, so the object is the one `pattern-serialize.ts` produces, field for field (G-056).
fn texture_json(t: &DitherTexture) -> Value {
    let mut out = Map::new();
    out.insert("spacing".into(), json!(t.spacing));
    out.insert("separation".into(), json!(t.separation));
    out.insert("shapeWeights".into(), json!(t.shape_weights));
    out.insert("radiusMin".into(), json!(t.radius_min));
    out.insert("radiusSpan".into(), json!(t.radius_span));
    out.insert("gapAlignment".into(), json!(t.gap_alignment));
    out.insert("wobble".into(), json!(t.wobble));
    out.insert("sweep".into(), json!(t.sweep));
    out.insert("seed".into(), json!(t.seed));
    // Written only when on, so a texture that never touched a switch is the object TypeScript writes (G-056's lesson).
    if t.wobble_every_mark {
        out.insert("wobbleEveryMark".into(), json!(true));
    }
    if t.size_every_mark {
        out.insert("sizeEveryMark".into(), json!(true));
    }
    if t.sweep_every_mark {
        out.insert("sweepEveryMark".into(), json!(true));
    }
    if let Some(stamp) = t.stamp.as_ref() {
        out.insert(
            "stamp".into(),
            json!({ "size": stamp.size, "order": stamp.order }),
        );
    }
    Value::Object(out)
}

pub fn run_json(total_ms: f64, times: &StageTimes) -> Value {
    let stages: Map<String, Value> = times
        .iter()
        .map(|(k, v)| (k.to_string(), json!(v)))
        .collect();
    json!({ "totalMs": total_ms, "stages": stages })
}

/// Options of a prediction (G-087): the size, the palette mode and the photo sliders; the rest of generation does not matter to it.
pub fn parse_predict_options(
    text: &str,
) -> Result<(crate::predict::PredictOptions, Option<Vec<[u8; 3]>>), String> {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct PredictRequest {
        longer_side_stitches: f64,
        #[serde(default)]
        palette_mode: Option<String>,
        #[serde(default)]
        photo_adjust: Option<AdjustOptions>,
        /// The colours of a set to say how well it covers the picture (G-087): `[r, g, b]` each.
        #[serde(default)]
        palette_set: Option<Vec<[u8; 3]>>,
    }
    let o: PredictRequest = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let brand = match o.palette_mode.as_deref() {
        None | Some("full") => None,
        Some("dmc") => Some(Brand::Dmc),
        Some("cosmo") => Some(Brand::Cosmo),
        Some("anchor") => Some(Brand::Anchor),
        Some(other) => return Err(format!("unknown paletteMode {other}")),
    };
    Ok((
        crate::predict::PredictOptions {
            longer_side_stitches: o.longer_side_stitches,
            brand,
            photo_adjust: o
                .photo_adjust
                .as_ref()
                .map(AdjustOptions::resolve)
                .unwrap_or(NEUTRAL_ADJUST),
        },
        o.palette_set,
    ))
}

/// How well a set covers the picture, as JSON for the app.
pub fn coverage_json(c: &crate::predict::Coverage) -> Value {
    json!({
        "covered": c.covered,
        "missing": c.missing.iter().map(|m| json!({ "rgb": m.rgb, "name": m.name, "share": m.share })).collect::<Vec<_>>(),
    })
}

/// A prediction as JSON for the app.
pub fn prediction_json(p: &crate::predict::Prediction) -> Value {
    json!({
        "suggested": p.suggested,
        "low": p.low,
        "high": p.high,
        "ceiling": p.ceiling,
        "cells": p.cells,
        "colors": p.colors.iter().map(|c| {
            let mut entry = json!({ "rgb": c.rgb, "cells": c.cells });
            if let Some((code, name)) = &c.thread {
                entry["thread"] = json!({ "code": code, "name": name });
            }
            entry
        }).collect::<Vec<_>>(),
        "curve": p.curve.iter().map(|(k, e)| json!([k, e])).collect::<Vec<_>>(),
    })
}
