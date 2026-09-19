//! The subset of the 2D canvas the export drawing uses (`ChartDrawingContext` plus `drawImage` of a symbol stamp),
//! rasterised with tiny-skia, a port of Skia's own rasteriser, and DejaVu text from `text.rs`. Transforms are
//! translations only, as in every raster export.

use crate::text::{self, Align, Baseline, FontSpec};
use tiny_skia::{
    Color, FillRule, LineCap, LineJoin, Paint, PathBuilder, Pixmap, PixmapPaint, Rect, Stroke,
    Transform,
};

/// A CSS colour as the drawing code writes one: `#rgb`, `#rrggbb`, `rgb(r, g, b)` or `rgba(r, g, b, a)`.
pub fn parse_color(css: &str) -> Color {
    let css = css.trim();
    if let Some(hex) = css.strip_prefix('#') {
        let full: String = if hex.len() == 3 {
            hex.chars().flat_map(|c| [c, c]).collect()
        } else {
            hex.to_string()
        };
        let n = u32::from_str_radix(&full, 16).unwrap_or(0);
        return Color::from_rgba8((n >> 16) as u8, (n >> 8) as u8, n as u8, 255);
    }
    let inner = css
        .trim_start_matches("rgba(")
        .trim_start_matches("rgb(")
        .trim_end_matches(')');
    let parts: Vec<f32> = inner
        .split(',')
        .map(|p| p.trim().parse().unwrap_or(0.0))
        .collect();
    let alpha = parts.get(3).copied().unwrap_or(1.0);
    // Skia keeps colours as 8-bit values: the alpha is quantised the way a canvas quantises it.
    let a8 = (alpha * 255.0).round().clamp(0.0, 255.0) as u8;
    Color::from_rgba8(parts[0] as u8, parts[1] as u8, parts[2] as u8, a8)
}

#[derive(Clone)]
struct State {
    dx: f32,
    dy: f32,
    fill: Color,
    stroke: Color,
    line_width: f32,
    font: FontSpec,
    align: Align,
    baseline: Baseline,
}

pub struct Canvas {
    pub pixmap: Pixmap,
    state: State,
    stack: Vec<State>,
    path: PathBuilder,
}

fn paint(color: Color) -> Paint<'static> {
    let mut p = Paint::default();
    p.set_color(color);
    p.anti_alias = true;
    p
}

impl Canvas {
    pub fn new(width: u32, height: u32) -> Canvas {
        Canvas {
            pixmap: Pixmap::new(width.max(1), height.max(1)).expect("canvas size"),
            state: State {
                dx: 0.0,
                dy: 0.0,
                fill: Color::BLACK,
                stroke: Color::BLACK,
                line_width: 1.0,
                font: FontSpec {
                    size: 10.0,
                    bold: false,
                },
                align: Align::Left,
                baseline: Baseline::Alphabetic,
            },
            stack: Vec::new(),
            path: PathBuilder::new(),
        }
    }

    pub fn width(&self) -> u32 {
        self.pixmap.width()
    }

    pub fn height(&self) -> u32 {
        self.pixmap.height()
    }

    fn transform(&self) -> Transform {
        Transform::from_translate(self.state.dx, self.state.dy)
    }

    pub fn set_fill(&mut self, css: &str) {
        self.state.fill = parse_color(css);
    }

    pub fn set_stroke(&mut self, css: &str) {
        self.state.stroke = parse_color(css);
    }

    pub fn set_line_width(&mut self, w: f64) {
        self.state.line_width = w as f32;
    }

    pub fn set_font(&mut self, css: &str) {
        self.state.font = FontSpec::parse(css);
    }

    pub fn set_align(&mut self, align: Align) {
        self.state.align = align;
    }

    pub fn set_baseline(&mut self, baseline: Baseline) {
        self.state.baseline = baseline;
    }

    pub fn save(&mut self) {
        self.stack.push(self.state.clone());
    }

    pub fn restore(&mut self) {
        if let Some(s) = self.stack.pop() {
            self.state = s;
        }
    }

    pub fn translate(&mut self, x: f64, y: f64) {
        self.state.dx += x as f32;
        self.state.dy += y as f32;
    }

    pub fn fill_rect(&mut self, x: f64, y: f64, w: f64, h: f64) {
        // Whole-pixel opaque rectangles are written directly: anti-aliasing covers every such pixel fully, so the
        // bytes are the general path's, which a 1000-stitch chart would otherwise take 670 000 times.
        let (fx, fy) = (x + self.state.dx as f64, y + self.state.dy as f64);
        if self.state.fill.is_opaque()
            && fx.fract() == 0.0
            && fy.fract() == 0.0
            && w.fract() == 0.0
            && h.fract() == 0.0
        {
            self.fill_pixels(fx as i64, fy as i64, w as i64, h as i64);
            return;
        }
        let Some(rect) = Rect::from_xywh(x as f32, y as f32, w as f32, h as f32) else {
            return;
        };
        let path = PathBuilder::from_rect(rect);
        self.pixmap.fill_path(
            &path,
            &paint(self.state.fill),
            FillRule::Winding,
            self.transform(),
            None,
        );
    }

    fn fill_pixels(&mut self, x: i64, y: i64, w: i64, h: i64) {
        let (cw, ch) = (self.pixmap.width() as i64, self.pixmap.height() as i64);
        let (x0, y0, x1, y1) = (x.max(0), y.max(0), (x + w).min(cw), (y + h).min(ch));
        if x0 >= x1 || y0 >= y1 {
            return;
        }
        let c = self.state.fill.to_color_u8();
        let pixel = [c.red(), c.green(), c.blue(), 255];
        let data = self.pixmap.data_mut();
        for yy in y0..y1 {
            let row = &mut data[(yy * cw + x0) as usize * 4..(yy * cw + x1) as usize * 4];
            for p in row.chunks_exact_mut(4) {
                p.copy_from_slice(&pixel);
            }
        }
    }

    pub fn stroke_rect(&mut self, x: f64, y: f64, w: f64, h: f64) {
        let Some(rect) = Rect::from_xywh(x as f32, y as f32, w as f32, h as f32) else {
            return;
        };
        let path = PathBuilder::from_rect(rect);
        let stroke = Stroke {
            width: self.state.line_width,
            line_cap: LineCap::Butt,
            line_join: LineJoin::Miter,
            miter_limit: 10.0,
            dash: None,
        };
        self.pixmap.stroke_path(
            &path,
            &paint(self.state.stroke),
            &stroke,
            self.transform(),
            None,
        );
    }

    pub fn begin_path(&mut self) {
        self.path = PathBuilder::new();
    }

    pub fn move_to(&mut self, x: f64, y: f64) {
        self.path.move_to(x as f32, y as f32);
    }

    pub fn line_to(&mut self, x: f64, y: f64) {
        self.path.line_to(x as f32, y as f32);
    }

    pub fn close_path(&mut self) {
        self.path.close();
    }

    pub fn stroke(&mut self) {
        let builder = std::mem::replace(&mut self.path, PathBuilder::new());
        let Some(path) = builder.clone().finish() else {
            return;
        };
        self.path = builder;
        let stroke = Stroke {
            width: self.state.line_width,
            line_cap: LineCap::Butt,
            line_join: LineJoin::Miter,
            miter_limit: 10.0,
            dash: None,
        };
        self.pixmap.stroke_path(
            &path,
            &paint(self.state.stroke),
            &stroke,
            self.transform(),
            None,
        );
    }

    pub fn fill(&mut self) {
        let builder = std::mem::replace(&mut self.path, PathBuilder::new());
        let Some(path) = builder.clone().finish() else {
            return;
        };
        self.path = builder;
        self.pixmap.fill_path(
            &path,
            &paint(self.state.fill),
            FillRule::Winding,
            self.transform(),
            None,
        );
    }

    /// `measureText(text).width` in the current font.
    pub fn measure_text(&self, text: &str) -> f64 {
        text::measure(text, self.state.font.size) as f64
    }

    pub fn font_size(&self) -> f32 {
        self.state.font.size
    }

    /// `fillText`: shaped DejaVu glyphs, aligned and placed on the requested baseline, filled (and, for bold, also
    /// stroked, as Skia's synthetic bold is).
    pub fn fill_text(&mut self, text: &str, x: f64, y: f64) {
        if text.is_empty() {
            return;
        }
        let FontSpec { size, bold } = self.state.font;
        let shaped = text::shape(text, size);
        let width = text::measure(text, size);
        let start = match self.state.align {
            Align::Left => x as f32,
            Align::Center => x as f32 - width / 2.0,
            Align::Right => x as f32 - width,
        } + self.state.dx;
        let baseline = y as f32 + text::baseline_offset(self.state.baseline, size) + self.state.dy;
        let fill = paint(self.state.fill);
        let bold_stroke = bold.then(|| Stroke {
            width: text::fake_bold_stroke(size),
            line_cap: LineCap::Butt,
            line_join: LineJoin::Miter,
            miter_limit: 4.0,
            dash: None,
        });
        for g in &shaped.glyphs {
            let Some(path) = text::glyph_path(g.id) else {
                continue;
            };
            let t = text::glyph_transform(size, start + g.x, baseline + g.y);
            self.pixmap
                .fill_path(&path, &fill, FillRule::Winding, t, None);
            if let Some(stroke) = &bold_stroke {
                // The stroke width is in canvas pixels, so the path is transformed first and stroked untransformed.
                if let Some(canvas_path) = path.clone().transform(t) {
                    self.pixmap.stroke_path(
                        &canvas_path,
                        &fill,
                        stroke,
                        Transform::identity(),
                        None,
                    );
                }
            }
        }
    }

    /// `drawImage(stamp, x, y)`: premultiplied source-over, `src + dst * (1 - src alpha)`, computed directly at
    /// whole-pixel positions and through the general pipeline otherwise.
    pub fn draw_stamp(&mut self, stamp: &Pixmap, x: f64, y: f64) {
        let (fx, fy) = (x + self.state.dx as f64, y + self.state.dy as f64);
        if fx.fract() != 0.0 || fy.fract() != 0.0 {
            self.pixmap.draw_pixmap(
                fx as i32,
                fy as i32,
                stamp.as_ref(),
                &PixmapPaint::default(),
                Transform::identity(),
                None,
            );
            return;
        }
        let (px, py) = (fx as i64, fy as i64);
        let (cw, ch) = (self.pixmap.width() as i64, self.pixmap.height() as i64);
        let (sw, sh) = (stamp.width() as i64, stamp.height() as i64);
        let src = stamp.data();
        let dst = self.pixmap.data_mut();
        for sy in 0..sh {
            let dy = py + sy;
            if dy < 0 || dy >= ch {
                continue;
            }
            for sx in 0..sw {
                let dx = px + sx;
                if dx < 0 || dx >= cw {
                    continue;
                }
                let si = ((sy * sw + sx) * 4) as usize;
                let s = &src[si..si + 4];
                let sa = s[3] as u32;
                if sa == 0 {
                    continue;
                }
                let o = ((dy * cw + dx) * 4) as usize;
                let d = &mut dst[o..o + 4];
                if sa == 255 {
                    d.copy_from_slice(s);
                    continue;
                }
                let inv = 255 - sa;
                for k in 0..4 {
                    // Rounded division by 255, as Skia's div255: (v + 128) * 257 >> 16.
                    let v = d[k] as u32 * inv + 128;
                    d[k] = (s[k] as u32 + ((v + (v >> 8)) >> 8)).min(255) as u8;
                }
            }
        }
    }

    /// Unpremultiplied RGBA rows `[y0, y0 + rows)`, as `getImageData` returns them.
    pub fn rgba_rows(&self, y0: u32, rows: u32, out: &mut Vec<u8>) {
        let w = self.pixmap.width() as usize;
        let data = self.pixmap.data();
        out.clear();
        out.reserve(w * rows as usize * 4);
        for y in y0..y0 + rows {
            let row = &data[y as usize * w * 4..(y as usize + 1) * w * 4];
            for p in row.chunks_exact(4) {
                let a = p[3];
                if a == 255 || a == 0 {
                    out.extend_from_slice(if a == 0 { &[0, 0, 0, 0] } else { p });
                } else {
                    let unpremul =
                        |c: u8| ((c as u32 * 255 + a as u32 / 2) / a as u32).min(255) as u8;
                    out.extend_from_slice(&[unpremul(p[0]), unpremul(p[1]), unpremul(p[2]), a]);
                }
            }
        }
    }
}
