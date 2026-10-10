//! JSON in and out, shared by the benchmark CLI and the WASM build: options with `BuildPatternOptions`' names, values
//! and defaults, and the pattern in the editable-save field names the parity harness hashes.

use crate::pattern::{BuildOptions, EdgeMode, PaletteSet, SetColor, StageTimes, StitchPattern};
use crate::photo_adjust::{PhotoAdjust, NEUTRAL_ADJUST};
use crate::quantize::Quantizer;
use crate::settings::{Setting, Settings};
use crate::threads::{System, ThreadSystem};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::collections::HashMap;

/// A set of colours the chart is made from (G-087): the palette mode, and a colour each, by its RGB with its name and its
/// thread of any system, typed or listed (G-131, D397), or by a listed thread's code in the set's brand.
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
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    system: Option<String>,
    #[serde(default)]
    number: Option<String>,
}

/// A thread system as the request carries it (G-132, D400): its key and its threads, `[code, name, "rrggbb"]` each.
#[derive(Deserialize)]
struct SystemOptions {
    key: String,
    threads: Vec<(String, String, String)>,
}

/// The systems a request was given, by key. The app reads them from its table and puts them in; Rust lists none itself.
type Systems = HashMap<String, System>;

fn systems_from(list: Option<Vec<SystemOptions>>) -> Result<Systems, String> {
    let mut systems = Systems::new();
    for s in list.unwrap_or_default() {
        let threads = s
            .threads
            .into_iter()
            .map(|(code, name, hex)| {
                let n = (hex.len() == 6)
                    .then(|| u32::from_str_radix(&hex, 16).ok())
                    .flatten()
                    .ok_or_else(|| {
                        format!("thread {code} of {}: {hex:?} is not a colour", s.key)
                    })?;
                Ok((code, name, [(n >> 16) as u8, (n >> 8) as u8, n as u8]))
            })
            .collect::<Result<Vec<_>, String>>()?;
        let system = ThreadSystem::new(&s.key, threads)?;
        systems.insert(s.key, System::new(system));
    }
    Ok(systems)
}

/// The system a palette mode names: `None` for the full range of colours. `what` names the setting in a refusal.
fn system_of(systems: &Systems, mode: Option<&str>, what: &str) -> Result<Option<System>, String> {
    match mode {
        None | Some("full") => Ok(None),
        Some(key) => systems
            .get(key)
            .cloned()
            .map(Some)
            .ok_or_else(|| format!("unknown {what} {key}")),
    }
}

impl PaletteSetOptions {
    fn resolve(&self, systems: &Systems) -> Result<PaletteSet, String> {
        let brand = system_of(systems, Some(self.mode.as_str()), "paletteSet mode")?;
        if self.colors.is_empty() || self.colors.len() > crate::names::symbol_set().len() {
            return Err("a palette set holds between 1 and the number of symbols colours".into());
        }
        let mut colors = Vec::new();
        for c in &self.colors {
            let name = c.name.clone().filter(|n| !n.trim().is_empty());
            colors.push(match (&c.system, &c.number, c.rgb) {
                // A thread of any system with its own colour: a typed number never changes the colour (D397).
                // The system may be one not loaded here (G-132): kept as written, its number listed nowhere.
                (Some(system), Some(number), Some(rgb)) => {
                    let system = system.trim();
                    if system.is_empty()
                        || system.eq_ignore_ascii_case("full")
                        || system.chars().count() > 40
                        || system.chars().any(char::is_control)
                    {
                        return Err("a thread's system is a name of up to 40 characters".into());
                    }
                    let number = number.trim();
                    if number.is_empty() {
                        return Err("a thread needs its number".into());
                    }
                    let listed = systems
                        .get(system)
                        .and_then(|s| s.by_code(number))
                        .map(|t| t.name.clone());
                    SetColor {
                        rgb,
                        source: Some((system.to_string(), number.to_string())),
                        label: name.unwrap_or_else(|| match listed {
                            Some(listed_name) => crate::threads::thread_name(number, &listed_name),
                            None => number.to_string(),
                        }),
                    }
                }
                (Some(_), _, _) | (_, Some(_), _) => {
                    return Err("a thread needs its system, its number and its rgb".into())
                }
                (None, None, rgb) => match (&brand, &c.code, rgb) {
                    (Some(brand), Some(code), _) => {
                        let thread = brand
                            .by_code(code)
                            .ok_or_else(|| format!("unknown {} thread {code}", self.mode))?;
                        SetColor {
                            rgb: thread.rgb,
                            source: Some((brand.key.clone(), code.clone())),
                            label: name
                                .unwrap_or_else(|| crate::threads::thread_name(code, &thread.name)),
                        }
                    }
                    (_, _, Some(rgb)) => SetColor {
                        rgb,
                        source: None,
                        label: name.unwrap_or_default(),
                    },
                    (Some(_), None, None) => {
                        return Err("a thread of a brand needs its code".into())
                    }
                    (None, _, None) => return Err("a custom colour needs its rgb".into()),
                },
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
    let systems = systems_from(shaped::<Vec<SystemOptions>>(
        &mut settings,
        "threadSystems",
    )?)?;
    let options = BuildOptions {
        longer_side_stitches,
        color_count,
        quantizer: Quantizer::from_settings(&mut settings)?,
        optimize: settings.flag("optimize")?.unwrap_or(true),
        edge_mode: EdgeMode::from_settings(&mut settings)?,
        brand: system_of(
            &systems,
            settings.text("paletteMode")?.as_deref(),
            "paletteMode",
        )?,
        dither: crate::dither::from_settings(&mut settings)?,
        vivid: settings.flag("vivid")?.unwrap_or(false),
        photo_adjust: shaped::<AdjustOptions>(&mut settings, "photoAdjust")?
            .as_ref()
            .map(AdjustOptions::resolve)
            .unwrap_or(NEUTRAL_ADJUST),
        palette_set: shaped::<PaletteSetOptions>(&mut settings, "paletteSet")?
            .as_ref()
            .map(|set| set.resolve(&systems))
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
        thread_systems: Option<Vec<SystemOptions>>,
        #[serde(default)]
        photo_adjust: Option<AdjustOptions>,
        /// The colours of a set to say how well it covers the picture (G-087): `[r, g, b]` each.
        #[serde(default)]
        palette_set: Option<Vec<[u8; 3]>>,
    }
    let o: PredictRequest = serde_json::from_str(text).map_err(|e| e.to_string())?;
    let systems = systems_from(o.thread_systems)?;
    let brand = system_of(&systems, o.palette_mode.as_deref(), "paletteMode")?;
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
