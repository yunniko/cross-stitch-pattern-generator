//! The pattern and request an export works from. The pattern is read from the editable save format
//! (`lib/editor/pattern-serialize.ts`, version 7), which is also what the processor receives; counts and indices are
//! recomputed from the cells, as `deserializePattern` does.

use serde_json::{Map, Value};

pub const EMPTY_CELL: u8 = 255;
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

#[derive(Clone, Debug)]
pub struct Pattern {
    pub width: usize,
    pub height: usize,
    pub is_landscape: bool,
    pub cells: Vec<u8>,
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
}

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

    /// `filledStitchCount`.
    pub fn filled_stitch_count(&self) -> usize {
        self.cells.iter().filter(|&&c| c != EMPTY_CELL).count()
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
        })
    }
}
