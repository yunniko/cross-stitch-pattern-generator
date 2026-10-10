//! The pattern and request an export works from. The pattern is read from the editable save format
//! (`lib/editor/pattern-serialize.ts`, version 7), which is also what the processor receives; counts and indices are
//! recomputed from the cells, as `deserializePattern` does.

use serde_json::{Map, Value};

pub const EMPTY_CELL: u8 = 255;
/// The A4 export's cell size limits and default, in millimetres (`lib/export/export-cell-size.ts`).
pub const MIN_CELL_MM: f64 = 2.0;
pub const MAX_CELL_MM: f64 = 12.0;
pub const DEFAULT_CELL_MM: f64 = 5.5;
pub const SYMMETRY_AXES: [&str; 4] = ["vertical", "horizontal", "diagonal", "antidiagonal"];

#[derive(Clone, Debug)]
pub struct ThreadRef {
    pub brand: String,
    pub code: String,
}

#[derive(Clone, Debug)]
pub struct Color {
    pub index: usize,
    pub rgb: [u8; 3],
    pub symbol: String,
    pub name: String,
    pub count: usize,
    pub source: Option<ThreadRef>,
}

impl Color {
    /// `printedThread`: what this colour's row prints under System, Number and Color name (G-131, D396).
    ///
    /// The system and number come only from the colour's thread, never from its name, so a colour that is no thread prints
    /// both blank and its whole name. A name that begins with the thread's number ("321 - Red") prints without it, since
    /// the Number column already says it.
    pub fn printed_thread(&self) -> (String, String, String) {
        match &self.source {
            None => (String::new(), String::new(), self.name.clone()),
            Some(s) => {
                let (code, rest) = crate::format::split_thread_code_name(&self.name);
                let name = if code == s.code {
                    rest
                } else {
                    self.name.clone()
                };
                (
                    crate::threads::brand_label(&s.brand).to_string(),
                    s.code.clone(),
                    name,
                )
            }
        }
    }

    /// `printedThreadLabel`: the same three on one line, for the legends that have no columns ("DMC 321 - Red").
    pub fn thread_label(&self) -> String {
        let (system, code, name) = self.printed_thread();
        let thread = format!("{system} {code}").trim().to_string();
        match (thread.is_empty(), name.is_empty()) {
            (true, _) => name,
            (false, true) => thread,
            (false, false) => format!("{thread} - {name}"),
        }
    }
}

#[derive(Clone, Debug)]
pub struct Pattern {
    pub width: usize,
    pub height: usize,
    pub is_landscape: bool,
    pub cells: Vec<u8>,
    /// Half stitches (G-082): per cell 0 whole, 1 "/", 2 "\\", the length of `cells`; **empty while every stitch is
    /// whole**, which is every chart that has no half stitch. An empty cell is always 0.
    pub kinds: Vec<u8>,
    pub palette: Vec<Color>,
    pub name: Option<String>,
    /// Kept as parsed, in its own key order, and written back verbatim.
    pub source_image: Option<Map<String, Value>>,
    pub thread_brand: Option<String>,
    pub edge_mode: Option<String>,
    pub enhancement_mode: Option<String>,
    /// The axes that are on, in `SYMMETRY_AXES` order.
    pub symmetry: Vec<&'static str>,
    /// Backstitch lines, corner to corner (G-073); empty for a chart with none.
    pub backstitch: Vec<Backstitch>,
    /// How the chart was generated (`KEPT_FIELDS`): read by no export, kept as parsed and written back by the editable
    /// save where `serializePattern` writes them (G-094). Until then they were dropped, and the editable file in "Export
    /// all" opened as a chart that had forgotten its photo sliders, its dither and its chosen palette.
    pub kept: Vec<(&'static str, Value)>,
    /// The chart's fabric, count and unit (G-094); kept as parsed. The exports take both from the request, which the app
    /// fills from this.
    pub fabric: Option<Value>,
}

/// The fields `Pattern::kept` holds, in the order `serializePattern` writes them, between `enhancementMode` and `symmetry`.
pub const KEPT_FIELDS: [&str; 5] = [
    "photoAdjust",
    "ditherMode",
    "ditherTexture",
    "vivid",
    "generationPalette",
];

/// One backstitch line. Coordinates are grid corners, `0..=width` and `0..=height`.
#[derive(Clone, Debug)]
pub struct Backstitch {
    pub x1: usize,
    pub y1: usize,
    pub x2: usize,
    pub y2: usize,
    pub palette_index: usize,
}

fn str_field(o: &Map<String, Value>, key: &str) -> Option<String> {
    o.get(key).and_then(Value::as_str).map(str::to_string)
}

impl Pattern {
    /// The systems this chart's threads are of, by label, in catalogue order (DMC, Cosmo, Anchor), then any system not
    /// loaded as the chart stores it (G-132): what the details' Thread row says. The system the chart was generated in is not
    /// one of them unless a colour is its thread (G-131, D396).
    pub fn thread_systems(&self) -> Vec<String> {
        const LOADED: [&str; 3] = ["dmc", "cosmo", "anchor"];
        let mut used: Vec<&str> = Vec::new();
        for s in self.palette.iter().filter_map(|c| c.source.as_ref()) {
            if !used.contains(&s.brand.as_str()) {
                used.push(&s.brand);
            }
        }
        let loaded = LOADED.into_iter().filter(|brand| used.contains(brand));
        let other = used.iter().copied().filter(|brand| !LOADED.contains(brand));
        loaded
            .chain(other)
            .map(|brand| crate::threads::brand_label(brand).to_string())
            .collect()
    }

    /// Parses an editable save. Validation is the TypeScript's job; this trusts its input.
    pub fn from_editable_json(text: &str) -> Result<Pattern, String> {
        let v: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
        let o = v.as_object().ok_or("not an object")?;
        let width = o.get("width").and_then(Value::as_u64).ok_or("width")? as usize;
        let height = o.get("height").and_then(Value::as_u64).ok_or("height")? as usize;
        let cells: Vec<u8> = o
            .get("cellPalette")
            .and_then(Value::as_array)
            .ok_or("cellPalette")?
            .iter()
            .map(|c| c.as_u64().unwrap_or(0) as u8)
            .collect();
        let mut palette = Vec::new();
        for (index, entry) in o
            .get("palette")
            .and_then(Value::as_array)
            .ok_or("palette")?
            .iter()
            .enumerate()
        {
            let e = entry.as_object().ok_or("palette entry")?;
            let rgb = e.get("rgb").and_then(Value::as_array).ok_or("rgb")?;
            let source = e
                .get("source")
                .and_then(Value::as_object)
                .map(|s| ThreadRef {
                    brand: str_field(s, "brand").unwrap_or_default(),
                    code: str_field(s, "code").unwrap_or_default(),
                });
            palette.push(Color {
                index,
                rgb: [0, 1, 2].map(|k| rgb[k].as_u64().unwrap_or(0) as u8),
                symbol: str_field(e, "symbol").unwrap_or_default(),
                name: str_field(e, "name").unwrap_or_default(),
                count: 0,
                source,
            });
        }
        for &c in &cells {
            if c != EMPTY_CELL {
                palette[c as usize].count += 1;
            }
        }
        let kinds = tidy_kinds(
            &cells,
            o.get("cellKind").and_then(Value::as_array).map(|a| {
                a.iter()
                    .map(|k| k.as_u64().unwrap_or(0).min(2) as u8)
                    .collect::<Vec<u8>>()
            }),
        );
        let symmetry_value = o.get("symmetry").and_then(Value::as_object);
        let mut symmetry: Vec<&'static str> = SYMMETRY_AXES
            .iter()
            .copied()
            .filter(|axis| symmetry_value.and_then(|s| s.get(*axis)) == Some(&Value::Bool(true)))
            .collect();
        if width != height {
            symmetry.retain(|a| *a != "diagonal" && *a != "antidiagonal");
        }
        Ok(Pattern {
            width,
            height,
            is_landscape: o
                .get("isLandscape")
                .and_then(Value::as_bool)
                .unwrap_or(false),
            cells,
            kinds,
            palette,
            name: str_field(o, "name"),
            source_image: o.get("sourceImage").and_then(Value::as_object).cloned(),
            thread_brand: str_field(o, "threadBrand"),
            edge_mode: str_field(o, "edgeMode"),
            enhancement_mode: str_field(o, "enhancementMode"),
            symmetry,
            backstitch: o
                .get("backstitch")
                .and_then(Value::as_array)
                .map(|lines| {
                    lines
                        .iter()
                        .filter_map(|l| {
                            let e = l.as_object()?;
                            let n = |k: &str| e.get(k).and_then(Value::as_u64).map(|v| v as usize);
                            Some(Backstitch {
                                x1: n("x1")?,
                                y1: n("y1")?,
                                x2: n("x2")?,
                                y2: n("y2")?,
                                palette_index: n("paletteIndex")?,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default(),
            kept: KEPT_FIELDS
                .iter()
                .filter_map(|key| o.get(*key).map(|value| (*key, value.clone())))
                .collect(),
            fabric: o.get("fabric").cloned(),
        })
    }

    /// `compactUnusedColors`: drops colours no stitch uses, keeping the rest in order.
    /// Drops palette entries nothing uses, and renumbers what is left.
    ///
    /// **A thread carrying only backstitch has no stitches** and was dropped by the count test alone
    /// (G-073 M5): its lines then pointed at whatever thread took its number, so a chart exported in the
    /// wrong colours, or lost the lines entirely. Backstitch keeps a thread alive, and is renumbered with
    /// the cells.
    pub fn compact_unused_colors(&self) -> Pattern {
        let in_backstitch: std::collections::HashSet<usize> =
            self.backstitch.iter().map(|l| l.palette_index).collect();
        let used: Vec<usize> = self
            .palette
            .iter()
            .filter(|c| c.count > 0 || in_backstitch.contains(&c.index))
            .map(|c| c.index)
            .collect();
        if used.len() == self.palette.len() {
            return self.clone();
        }
        let mut remap = vec![0u8; self.palette.len()];
        for (new, &old) in used.iter().enumerate() {
            remap[old] = new as u8;
        }
        let cells = self
            .cells
            .iter()
            .map(|&v| {
                if v == EMPTY_CELL {
                    EMPTY_CELL
                } else {
                    remap[v as usize]
                }
            })
            .collect();
        let palette = used
            .iter()
            .enumerate()
            .map(|(new, &old)| Color {
                index: new,
                ..self.palette[old].clone()
            })
            .collect();
        let backstitch = self
            .backstitch
            .iter()
            .filter(|l| l.palette_index < remap.len())
            .map(|l| Backstitch {
                palette_index: remap[l.palette_index] as usize,
                ..*l
            })
            .collect();
        Pattern {
            cells,
            palette,
            backstitch,
            ..self.clone()
        }
    }

    /// The kind of cell `index`: 0 whole where the chart has no half stitch.
    pub fn kind_at(&self, index: usize) -> u8 {
        self.kinds.get(index).copied().unwrap_or(0)
    }

    pub fn has_halves(&self) -> bool {
        !self.kinds.is_empty()
    }

    /// The chart as the Pattern Keeper PDF and the OXS file carry it: every half stitch a whole one (Owner, 2026-10-01).
    pub fn whole_stitches(&self) -> Pattern {
        Pattern {
            kinds: Vec::new(),
            ..self.clone()
        }
    }

    /// Cells of thread `color` in each kind: `[whole, "/", "\\"]`.
    pub fn kind_counts(&self, color: usize) -> [usize; 3] {
        let mut counts = [0usize; 3];
        for (i, &c) in self.cells.iter().enumerate() {
            if c as usize == color && c != EMPTY_CELL {
                counts[self.kind_at(i) as usize] += 1;
            }
        }
        counts
    }

    /// What a thread's stitches amount to for buying: a half stitch is half a stitch of thread, rounded up.
    pub fn thread_stitches(&self, color: usize) -> usize {
        if !self.has_halves() {
            return self.palette[color].count;
        }
        let [whole, slash, back] = self.kind_counts(color);
        whole + (slash + back).div_ceil(2)
    }

    /// One legend row for each stitch type and thread the chart uses (the Owner's rule, 2026-10-01: every combination
    /// is in the legend). A chart without half stitches has one row per thread, exactly as before.
    pub fn legend_entries(&self) -> Vec<LegendEntry> {
        if !self.has_halves() {
            return self
                .palette
                .iter()
                .map(|c| LegendEntry {
                    color: c.index,
                    kind: 0,
                    count: c.count,
                })
                .collect();
        }
        let mut entries = Vec::new();
        for c in &self.palette {
            let counts = self.kind_counts(c.index);
            let before = entries.len();
            for kind in 0..3u8 {
                if counts[kind as usize] > 0 {
                    entries.push(LegendEntry {
                        color: c.index,
                        kind,
                        count: counts[kind as usize],
                    });
                }
            }
            if entries.len() == before {
                entries.push(LegendEntry {
                    color: c.index,
                    kind: 0,
                    count: 0,
                });
            }
        }
        entries
    }

    /// `filledStitchCount`.
    pub fn filled_stitch_count(&self) -> usize {
        self.cells.iter().filter(|&&c| c != EMPTY_CELL).count()
    }
}

/// One row of a legend: a thread in one stitch type, with how many cells it has.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LegendEntry {
    pub color: usize,
    pub kind: u8,
    pub count: usize,
}

/// `tidyKinds`: an empty cell is whole, and a chart with no half stitch has no kinds at all.
fn tidy_kinds(cells: &[u8], kinds: Option<Vec<u8>>) -> Vec<u8> {
    let Some(mut kinds) = kinds else {
        return Vec::new();
    };
    if kinds.len() != cells.len() {
        return Vec::new();
    }
    let mut any = false;
    for (kind, &cell) in kinds.iter_mut().zip(cells) {
        if cell == EMPTY_CELL {
            *kind = 0;
        }
        any |= *kind != 0;
    }
    if any {
        kinds
    } else {
        Vec::new()
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SizeUnit {
    In,
    Cm,
}

impl SizeUnit {
    pub fn id(self) -> &'static str {
        match self {
            SizeUnit::In => "in",
            SizeUnit::Cm => "cm",
        }
    }
}

/// An export request's settings, with `runExportJob`'s names and defaults.
#[derive(Clone, Debug)]
pub struct Request {
    pub kind: String,
    pub base_name: String,
    pub aida_count: f64,
    pub size_unit: SizeUnit,
    pub author_name: String,
    pub overlap_cells: usize,
    /// The A4 pages' cell size in millimetres (G-083); the Pattern Keeper PDF and the full-size picture do not read it.
    pub cell_mm: f64,
    /// Which stitch texture the realistic preview is drawn with; an id of `lib/export/stitch-texture-catalog.ts`.
    pub stitch_texture: String,
    /// The canvas the realistic preview is drawn on; absent means a transparent ground.
    pub canvas: Option<Canvas>,
}

/// The canvas colour and cloth of the realistic preview (`canvas` in the request; `texture` is a catalog id or "off").
#[derive(Clone, Debug)]
pub struct Canvas {
    pub color: [u8; 3],
    pub texture: String,
}

fn parse_hex(text: &str) -> Option<[u8; 3]> {
    let hex = text.strip_prefix('#')?;
    if hex.len() != 6 {
        return None;
    }
    let byte = |i: usize| u8::from_str_radix(&hex[i..i + 2], 16).ok();
    Some([byte(0)?, byte(2)?, byte(4)?])
}

impl Request {
    pub fn from_json(text: &str) -> Result<Request, String> {
        let v: Value = serde_json::from_str(text).map_err(|e| e.to_string())?;
        let o = v.as_object().ok_or("request is not an object")?;
        Ok(Request {
            kind: str_field(o, "kind").ok_or("kind")?,
            base_name: str_field(o, "baseName").unwrap_or_else(|| "pattern".into()),
            aida_count: o.get("aidaCount").and_then(Value::as_f64).unwrap_or(14.0),
            size_unit: if str_field(o, "sizeUnit").as_deref() == Some("in") {
                SizeUnit::In
            } else {
                SizeUnit::Cm
            },
            author_name: str_field(o, "authorName").unwrap_or_default(),
            overlap_cells: o.get("overlapCells").and_then(Value::as_u64).unwrap_or(5) as usize,
            cell_mm: o
                .get("cellMm")
                .and_then(Value::as_f64)
                .filter(|v| v.is_finite())
                .map(|v| (v.clamp(MIN_CELL_MM, MAX_CELL_MM) * 4.0).round() / 4.0)
                .unwrap_or(DEFAULT_CELL_MM),
            stitch_texture: str_field(o, "stitchTexture").unwrap_or_else(|| "classic".into()),
            canvas: match o.get("canvas").and_then(Value::as_object) {
                None => None,
                Some(c) => Some(Canvas {
                    color: str_field(c, "color")
                        .as_deref()
                        .and_then(parse_hex)
                        .ok_or("canvas.color must be #rrggbb")?,
                    texture: str_field(c, "texture").unwrap_or_else(|| "off".into()),
                }),
            },
        })
    }
}
