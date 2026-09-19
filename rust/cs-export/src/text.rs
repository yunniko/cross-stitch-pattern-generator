//! DejaVu Sans text as the processor's canvas (`@napi-rs/canvas`, Skia) lays it out: shaped with HarfBuzz's rules
//! (rustybuzz), placed with the baseline offsets measured in the production image, and outlined for filling. The
//! image has no other font, so every `FONT_STACK` request resolves to DejaVu, and "bold" is Skia's synthetic bold.

use rustybuzz::{Face, UnicodeBuffer};
use std::sync::OnceLock;
use tiny_skia::{Path, PathBuilder, Transform};

pub const FONT_BYTES: &[u8] = include_bytes!("../../../public/fonts/DejaVuSans.ttf");
const UNITS_PER_EM: f32 = 2048.0;

pub fn face() -> &'static Face<'static> {
    static FACE: OnceLock<Face<'static>> = OnceLock::new();
    FACE.get_or_init(|| Face::from_slice(FONT_BYTES, 0).expect("DejaVu Sans parses"))
}

/// A `ctx.font` value: `{size}px …` or `bold {size}px …`, the only two forms the drawing code sets.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct FontSpec {
    pub size: f32,
    pub bold: bool,
}

impl FontSpec {
    pub fn parse(css: &str) -> FontSpec {
        let (bold, rest) = match css.strip_prefix("bold ") {
            Some(rest) => (true, rest),
            None => (false, css),
        };
        let size = rest
            .split("px")
            .next()
            .and_then(|n| n.trim().parse::<f32>().ok())
            .unwrap_or(10.0);
        FontSpec { size, bold }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Align {
    Left,
    Center,
    Right,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Baseline {
    Alphabetic,
    Top,
    Middle,
    Bottom,
}

/// Distance from the requested y down to the alphabetic baseline, as measured in the processor image for every
/// integer size from 1 to 300 (the export code only asks for integer sizes). `middle` carries a rounded term the
/// canvas's paragraph layout introduces; the formula reproduces all 300 sizes exactly.
pub fn baseline_offset(baseline: Baseline, size: f32) -> f32 {
    let s = size as f64;
    (match baseline {
        Baseline::Alphabetic => 0.0,
        Baseline::Top => 1681.0 / 2048.0 * s,
        Baseline::Middle => (1754.0 / 2048.0 * s - (336.0 / 2048.0 * s).round()) / 2.0,
        Baseline::Bottom => -428.0 / 2048.0 * s,
    }) as f32
}

/// One shaped glyph: its id and its pen position along the line, in pixels.
pub struct PlacedGlyph {
    pub id: u16,
    pub x: f32,
    pub y: f32,
}

pub struct ShapedText {
    pub glyphs: Vec<PlacedGlyph>,
    /// The advance width `measureText` reports.
    pub width: f32,
}

pub fn shape(text: &str, size: f32) -> ShapedText {
    let mut buffer = UnicodeBuffer::new();
    buffer.push_str(text);
    let shaped = rustybuzz::shape(face(), &[], buffer);
    let scale = size / UNITS_PER_EM;
    let mut pen = 0.0f32;
    let mut glyphs = Vec::with_capacity(shaped.len());
    for (info, pos) in shaped.glyph_infos().iter().zip(shaped.glyph_positions()) {
        glyphs.push(PlacedGlyph {
            id: info.glyph_id as u16,
            x: pen + pos.x_offset as f32 * scale,
            y: -(pos.y_offset as f32) * scale,
        });
        pen += pos.x_advance as f32 * scale;
    }
    ShapedText { glyphs, width: pen }
}

/// `measureText(text).width`: the shaped advance, which the processor's canvas reports rounded to hundredths of a
/// pixel (measured: every width it returned was a whole number of hundredths).
pub fn measure(text: &str, size: f32) -> f32 {
    ((shape(text, size).width as f64 * 100.0).round() / 100.0) as f32
}

struct Outline(PathBuilder);

impl rustybuzz::ttf_parser::OutlineBuilder for Outline {
    fn move_to(&mut self, x: f32, y: f32) {
        self.0.move_to(x, y);
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.0.line_to(x, y);
    }
    fn quad_to(&mut self, x1: f32, y1: f32, x: f32, y: f32) {
        self.0.quad_to(x1, y1, x, y);
    }
    fn curve_to(&mut self, x1: f32, y1: f32, x2: f32, y2: f32, x: f32, y: f32) {
        self.0.cubic_to(x1, y1, x2, y2, x, y);
    }
    fn close(&mut self) {
        self.0.close();
    }
}

/// A glyph's outline in font units, y up; `None` for an empty glyph such as a space.
pub fn glyph_path(id: u16) -> Option<Path> {
    let mut outline = Outline(PathBuilder::new());
    face().outline_glyph(rustybuzz::ttf_parser::GlyphId(id), &mut outline)?;
    outline.0.finish()
}

/// Maps font units at the glyph's pen position onto the canvas: scale, flip y, move to `(x, baseline)`.
pub fn glyph_transform(size: f32, x: f32, baseline_y: f32) -> Transform {
    let scale = size / UNITS_PER_EM;
    Transform::from_row(scale, 0.0, 0.0, -scale, x, baseline_y)
}

/// Skia's synthetic bold: the outline stroked by `size × k`, k interpolated from 1/24 at 9 px to 1/32 at 36 px.
pub fn fake_bold_stroke(size: f32) -> f32 {
    let k = if size <= 9.0 {
        1.0 / 24.0
    } else if size >= 36.0 {
        1.0 / 32.0
    } else {
        let t = (size - 9.0) / (36.0 - 9.0);
        1.0 / 24.0 + t * (1.0 / 32.0 - 1.0 / 24.0)
    };
    size * k
}

/// The ink bounds `measureText` reports (`actualBoundingBox*`), relative to the drawing point with left alignment on
/// the alphabetic baseline: (left, right, ascent, descent).
pub fn ink_bounds(text: &str, size: f32) -> (f32, f32, f32, f32) {
    let shaped = shape(text, size);
    let scale = size / UNITS_PER_EM;
    let (mut left, mut right, mut ascent, mut descent) = (
        f32::INFINITY,
        f32::NEG_INFINITY,
        f32::NEG_INFINITY,
        f32::INFINITY,
    );
    for g in &shaped.glyphs {
        if let Some(b) = face().glyph_bounding_box(rustybuzz::ttf_parser::GlyphId(g.id)) {
            left = left.min(g.x + b.x_min as f32 * scale);
            right = right.max(g.x + b.x_max as f32 * scale);
            ascent = ascent.max(b.y_max as f32 * scale - g.y);
            descent = descent.min(b.y_min as f32 * scale - g.y);
        }
    }
    if !left.is_finite() {
        return (0.0, 0.0, 0.0, 0.0);
    }
    (-left, right, ascent, -descent)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Widths and bounds against the processor image's own `measureText`, when the calibration file is at hand.
    #[test]
    fn widths_match_the_processor_canvas() {
        let Ok(path) = std::env::var("TEXT_CALIBRATION") else {
            eprintln!("TEXT_CALIBRATION not set: skipped");
            return;
        };
        let data: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        let mut worst = 0.0f32;
        for w in data["widths"].as_array().unwrap() {
            let spec = FontSpec::parse(w["font"].as_str().unwrap());
            let text = w["text"].as_str().unwrap();
            let expected = w["width"].as_f64().unwrap() as f32;
            let got = measure(text, spec.size);
            let error = (got - expected).abs();
            worst = worst.max(error);
            if error > 1e-4 {
                println!("{:?} {} expected {expected} got {got}", text, w["font"]);
            }
        }
        println!("worst width error {worst}");
        assert!(worst <= 1e-4, "widths differ by up to {worst} px");
    }
}
