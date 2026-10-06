//! JSON in and out, shared by the benchmark CLI and the WASM build: options with `BuildPatternOptions`' names, values
//! and defaults, and the pattern in the editable-save field names the parity harness hashes.

use crate::pattern::{BuildOptions, EdgeMode, PaletteSet, SetColor, StageTimes, StitchPattern};
use crate::photo_adjust::{PhotoAdjust, NEUTRAL_ADJUST};
use crate::quantize::Quantizer;
use crate::settings::{Setting, Settings};
use crate::threads::Brand;
use serde::Deserialize;
use serde_json::{json, Map, Value};

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
        let brand = Brand::from_mode(Some(self.mode.as_str()), "paletteSet mode")?;
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

/// The request as named values (`settings.rs`). A value that is null is a setting that was not given.
fn settings_from(text: &str) -> Result<Settings, String> {
    let request: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let fields = request.as_object().ok_or("the options must be an object")?;
    let mut settings = Settings::new();
    for (name, value) in fields {
        settings.insert(
            name.clone(),
            match value {
                Value::Null => continue,
                Value::Bool(flag) => Setting::Flag(*flag),
                Value::Number(number) => Setting::Number(number.as_f64().unwrap_or(f64::NAN)),
                Value::String(text) => Setting::Text(text.clone()),
                other => Setting::Other(other.to_string()),
            },
        );
    }
    Ok(settings)
}

/// A list or an object of the request, read in the shape its family expects.
fn shaped<T: serde::de::DeserializeOwned>(
    settings: &mut Settings,
    name: &str,
) -> Result<Option<T>, String> {
    settings
        .other(name)?
        .map(|text| serde_json::from_str(&text).map_err(|e| format!("{name}: {e}")))
        .transpose()
}

/// Parsed options and the requested worker-thread count (default 1; any count gives the same pattern, D185).
///
/// Nothing here lists the settings of the algorithms: each family is asked for its own (G-099), and a setting none of
/// them took is refused by name. What is read here is what belongs to the run as a whole.
pub fn parse_options(text: &str) -> Result<(BuildOptions, usize), String> {
    let mut settings = settings_from(text)?;
    let longer_side_stitches = settings
        .number("longerSideStitches")?
        .ok_or("longerSideStitches is missing")?;
    let color_count = settings
        .count("colorCount")?
        .ok_or("colorCount is missing")?;
    let threads = settings.count("threads")?.unwrap_or(1).max(1);
    let options = BuildOptions {
        longer_side_stitches,
        color_count,
        quantizer: Quantizer::from_settings(&mut settings)?,
        optimize: settings.flag("optimize")?.unwrap_or(true),
        edge_mode: EdgeMode::from_settings(&mut settings)?,
        brand: Brand::from_mode(settings.text("paletteMode")?.as_deref(), "paletteMode")?,
        dither: crate::dither::from_settings(&mut settings)?,
        vivid: settings.flag("vivid")?.unwrap_or(false),
        photo_adjust: shaped::<AdjustOptions>(&mut settings, "photoAdjust")?
            .as_ref()
            .map(AdjustOptions::resolve)
            .unwrap_or(NEUTRAL_ADJUST),
        palette_set: shaped::<PaletteSetOptions>(&mut settings, "paletteSet")?
            .as_ref()
            .map(PaletteSetOptions::resolve)
            .transpose()?,
        overlays: crate::overlay::configure(&mut settings)?,
    };
    settings.finish()?;
    Ok((options, threads))
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
        "ditherTexture": p.dither_settings,
        "vivid": p.vivid,
        "photoAdjust": p.photo_adjust.map(|a| json!({
            "brightness": a.brightness,
            "contrast": a.contrast,
            "saturation": a.saturation,
            "temperature": a.temperature,
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

/// The longest side a preview's chart may have: the longest a chart may have (`MAX_STITCHES` in `lib/types.ts`).
const PREVIEW_CHART_MAX: usize = 1500;

/// A dither preview request (G-100): `ditherMode` with the pattern's own settings, as a generation names them, and
/// the size of the chart whose corner is shown (`chartWidth`, `chartHeight`). `None` is no dithering.
pub fn parse_dither_preview(
    text: &str,
) -> Result<(Option<crate::dither::Chosen>, usize, usize), String> {
    let mut settings = settings_from(text)?;
    let pattern = crate::dither::from_settings(&mut settings)?;
    let mut side = |name: &str| -> Result<usize, String> {
        match settings.count(name)? {
            Some(n) if (1..=PREVIEW_CHART_MAX).contains(&n) => Ok(n),
            Some(_) => Err(format!("{name} must be between 1 and {PREVIEW_CHART_MAX}")),
            None => Err(format!("{name} is missing")),
        }
    };
    let (width, height) = (side("chartWidth")?, side("chartHeight")?);
    settings.finish()?;
    Ok((pattern, width, height))
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
    let brand = Brand::from_mode(o.palette_mode.as_deref(), "paletteMode")?;
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
