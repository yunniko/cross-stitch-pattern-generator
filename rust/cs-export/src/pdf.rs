//! Port of the Pattern Keeper PDF (`lib/export/pattern-keeper-pdf.ts`) and its canvas adapter
//! (`pdf-canvas-adapter.ts`): the A4 pages drawn at 72 dpi onto PDF operators, symbols as real text in an embedded,
//! subset DejaVu Sans (Type0 / CIDFontType2, Identity-H, with a ToUnicode map), so Pattern Keeper and text extraction
//! read them. Text is measured and placed as pdf-lib does: a shaped run's width is the sum of its glyphs' own advances
//! (no kerning), and baselines come from the font's hhea ascent and descent.

use crate::a4;
use crate::jsfmt::number;
use crate::model::{Pattern, Request};
use crate::render::{Ctx, Mode};
use crate::text::{self, Align, Baseline, FontSpec, FONT_BYTES};
use flate2::write::ZlibEncoder;
use flate2::Compression;
use pdf_writer::types::{CidFontType, FontFlags, SystemInfo, UnicodeCmap};
use pdf_writer::{Filter, Finish, Name, Pdf, Rect, Ref, Str, TextStr};
use std::collections::BTreeMap;
use std::io::Write;
use subsetter::GlyphRemapper;

const ASCENT: f64 = 1901.0;
const DESCENT: f64 = 483.0;
const UNITS_PER_EM: f64 = 2048.0;

/// Glyphs used anywhere in the document, renumbered for the subset, with the text each stands for.
struct FontUse {
    remapper: GlyphRemapper,
    unicode: BTreeMap<u16, String>,
    widths: BTreeMap<u16, f64>,
}

#[derive(Clone)]
struct State {
    dx: f64,
    dy: f64,
    fill: String,
    stroke: String,
    line_width: f64,
    font: FontSpec,
    align: Align,
    baseline: Baseline,
}

/// Parses a CSS colour into pdf-lib's `r g b` operands and the alpha.
fn color_operands(css: &str) -> (String, f64) {
    let c = crate::canvas::parse_color(css);
    let c8 = c.to_color_u8();
    let alpha = if css.starts_with("rgba(") {
        css.trim_end_matches(')')
            .rsplit(',')
            .next()
            .and_then(|a| a.trim().parse().ok())
            .unwrap_or(1.0)
    } else {
        1.0
    };
    let part = |v: u8| number(v as f64 / 255.0);
    (
        format!(
            "{} {} {}",
            part(c8.red()),
            part(c8.green()),
            part(c8.blue())
        ),
        alpha,
    )
}

/// One page being drawn: the content stream as pdf-lib's operator text, and which opacities it used.
pub struct PdfPage<'a> {
    fonts: &'a mut FontUse,
    ops: String,
    page_height: f64,
    state: State,
    stack: Vec<State>,
    opacities: Vec<f64>,
}

impl PdfPage<'_> {
    fn op(&mut self, line: &str) {
        self.ops.push_str(line);
        self.ops.push('\n');
    }

    fn gs_for(&mut self, alpha: f64) -> String {
        let index = match self.opacities.iter().position(|&a| a == alpha) {
            Some(i) => i,
            None => {
                self.opacities.push(alpha);
                self.opacities.len() - 1
            }
        };
        format!("/GS{index}")
    }

    fn rect(&mut self, x: f64, y: f64, w: f64, h: f64) -> (f64, f64, f64, f64) {
        let (x0, y0) = (x + self.state.dx, y + self.state.dy);
        let (x1, y1) = (x + w + self.state.dx, y + h + self.state.dy);
        let (left, top) = (x0.min(x1), y0.min(y1));
        let (width, height) = ((x1 - x0).abs(), (y1 - y0).abs());
        (left, self.page_height - top - height, width, height)
    }

    /// `font.widthOfTextAtSize`: each shaped glyph's own advance, in pdf-lib's arithmetic.
    fn width(text: &str, size: f64) -> f64 {
        let scale = 1000.0 / UNITS_PER_EM;
        let mut total = 0.0;
        for g in &text::shape(text, size as f32).glyphs {
            let advance = text::face()
                .glyph_hor_advance(rustybuzz::ttf_parser::GlyphId(g.id))
                .unwrap_or(0) as f64;
            total += advance * scale;
        }
        total * (size / 1000.0)
    }
}

impl Ctx for PdfPage<'_> {
    fn set_fill(&mut self, css: &str) {
        self.state.fill = css.to_string();
    }
    fn set_stroke(&mut self, css: &str) {
        self.state.stroke = css.to_string();
    }
    fn set_line_width(&mut self, w: f64) {
        self.state.line_width = w;
    }
    fn set_font(&mut self, css: &str) {
        self.state.font = FontSpec::parse(css);
    }
    fn set_align(&mut self, align: Align) {
        self.state.align = align;
    }
    fn set_baseline(&mut self, baseline: Baseline) {
        self.state.baseline = baseline;
    }

    fn fill_rect(&mut self, x: f64, y: f64, w: f64, h: f64) {
        let (px, py, pw, ph) = self.rect(x, y, w, h);
        let (rg, alpha) = color_operands(&self.state.fill.clone());
        let geometry = format!(
            "{} {} {} {} re",
            number(px),
            number(py),
            number(pw),
            number(ph)
        );
        if alpha < 1.0 {
            let gs = self.gs_for(alpha);
            self.op("q");
            self.op(&format!("{gs} gs"));
            self.op(&format!("{rg} rg"));
            self.op(&geometry);
            self.op("f");
            self.op("Q");
        } else {
            self.op(&format!("{rg} rg"));
            self.op(&geometry);
            self.op("f");
        }
    }

    fn stroke_rect(&mut self, x: f64, y: f64, w: f64, h: f64) {
        let (px, py, pw, ph) = self.rect(x, y, w, h);
        let (rg, _) = color_operands(&self.state.stroke.clone());
        let lw = number(self.state.line_width);
        self.op("q");
        self.op(&format!("{rg} RG"));
        self.op(&format!("{lw} w"));
        self.op(&format!(
            "{} {} {} {} re",
            number(px),
            number(py),
            number(pw),
            number(ph)
        ));
        self.op("S");
        self.op("Q");
    }

    fn fill_text(&mut self, text_value: &str, x: f64, y: f64) {
        if text_value.is_empty() {
            return;
        }
        let size = self.state.font.size as f64;
        let ascent = ASCENT / UNITS_PER_EM * size;
        let descent = DESCENT / UNITS_PER_EM * size;
        let dx = match self.state.align {
            Align::Center => -Self::width(text_value, size) / 2.0,
            Align::Right => -Self::width(text_value, size),
            Align::Left => 0.0,
        };
        let dy = match self.state.baseline {
            Baseline::Top => ascent,
            Baseline::Middle => (ascent - descent) / 2.0,
            Baseline::Bottom => -descent,
            Baseline::Alphabetic => 0.0,
        };
        let bx = x + dx + self.state.dx;
        let by = y + dy + self.state.dy;
        let (rg, _) = color_operands(&self.state.fill.clone());

        // Glyph codes are the subset's glyph ids, four hex digits each, as pdf-lib encodes them.
        let shaped = rustybuzz::shape(text::face(), &[], {
            let mut b = rustybuzz::UnicodeBuffer::new();
            b.push_str(text_value);
            b
        });
        let infos = shaped.glyph_infos();
        let mut hex = String::with_capacity(infos.len() * 4);
        for (i, info) in infos.iter().enumerate() {
            let old = info.glyph_id as u16;
            let new = self.fonts.remapper.remap(old);
            let start = info.cluster as usize;
            let end = infos
                .iter()
                .skip(i + 1)
                .map(|n| n.cluster as usize)
                .find(|&c| c != start)
                .unwrap_or(text_value.len());
            let chars = &text_value[start.min(end)..end.max(start)];
            if !chars.is_empty() {
                self.fonts
                    .unicode
                    .entry(new)
                    .or_insert_with(|| chars.to_string());
            }
            let advance = text::face()
                .glyph_hor_advance(rustybuzz::ttf_parser::GlyphId(old))
                .unwrap_or(0) as f64;
            self.fonts
                .widths
                .entry(new)
                .or_insert(advance * 1000.0 / UNITS_PER_EM);
            hex.push_str(&format!("{new:04X}"));
        }
        self.op("q");
        self.op("BT");
        self.op(&format!("{rg} rg"));
        self.op(&format!("/F0 {} Tf", number(size)));
        self.op(&format!(
            "1 0 0 1 {} {} Tm",
            number(bx),
            number(self.page_height - by)
        ));
        self.op(&format!("<{hex}> Tj"));
        self.op("ET");
        self.op("Q");
    }

    fn measure_text(&self, text_value: &str) -> f64 {
        Self::width(text_value, self.state.font.size as f64)
    }

    fn line(&mut self, x0: f64, y0: f64, x1: f64, y1: f64) {
        let (rg, _) = color_operands(&self.state.stroke.clone());
        let h = self.page_height;
        let (ax, ay, bx, by) = (
            x0 + self.state.dx,
            y0 + self.state.dy,
            x1 + self.state.dx,
            y1 + self.state.dy,
        );
        self.op(&format!("{rg} RG"));
        self.op(&format!("{} w", number(self.state.line_width)));
        self.op(&format!("{} {} m", number(ax), number(h - ay)));
        self.op(&format!("{} {} l", number(bx), number(h - by)));
        self.op("S");
    }

    fn save(&mut self) {
        self.stack.push(self.state.clone());
    }
    fn restore(&mut self) {
        if let Some(s) = self.stack.pop() {
            self.state = s;
        }
    }
    fn translate(&mut self, x: f64, y: f64) {
        self.state.dx += x;
        self.state.dy += y;
    }
}

fn deflate(bytes: &[u8]) -> Vec<u8> {
    let mut e = ZlibEncoder::new(Vec::new(), Compression::new(6));
    e.write_all(bytes).expect("deflate");
    e.finish().expect("deflate")
}

/// `buildPatternKeeperPdf`.
pub fn build(p: &Pattern, mode: Mode, request: &Request) -> Vec<u8> {
    let l = a4::calculate_layout(p.width, p.height, request.overlap_cells, 72.0);
    let plan = a4::plan_info_pages(
        p,
        &l,
        request.aida_count,
        request.size_unit,
        &request.author_name,
    );
    let mut fonts = FontUse {
        remapper: GlyphRemapper::new(),
        unicode: BTreeMap::new(),
        widths: BTreeMap::new(),
    };

    // Every page's operators, drawn in document order.
    let mut pages: Vec<(Vec<u8>, Vec<f64>)> = Vec::new();
    let mut draw = |fonts: &mut FontUse, f: &mut dyn FnMut(&mut PdfPage)| {
        let mut page = PdfPage {
            fonts,
            ops: String::new(),
            page_height: l.page_h,
            state: State {
                dx: 0.0,
                dy: 0.0,
                fill: "#000000".into(),
                stroke: "#000000".into(),
                line_width: 1.0,
                font: FontSpec {
                    size: 10.0,
                    bold: false,
                },
                align: Align::Left,
                baseline: Baseline::Alphabetic,
            },
            stack: Vec::new(),
            opacities: Vec::new(),
        };
        f(&mut page);
        pages.push((deflate(page.ops.as_bytes()), page.opacities));
    };
    let total = l.pages.len();
    for (i, range) in l.pages.iter().enumerate() {
        draw(&mut fonts, &mut |pg| {
            a4::draw_grid_page(pg, p, mode, &l, range, i, total, None)
        });
    }
    draw(&mut fonts, &mut |pg| a4::draw_legend_page(pg, p, &l));
    draw(&mut fonts, &mut |pg| {
        a4::draw_info_page1(pg, p, &plan, &l, request.aida_count)
    });
    for (k, (from, to)) in a4::continuation_slices(&plan).into_iter().enumerate() {
        draw(&mut fonts, &mut |pg| {
            a4::draw_info_continuation(
                pg,
                &plan,
                &p.palette[from..to],
                k + 2,
                &l,
                request.aida_count,
            )
        });
    }

    let mut next = 1;
    let mut alloc = || {
        let r = Ref::new(next);
        next += 1;
        r
    };
    let catalog = alloc();
    let pages_ref = alloc();
    let info_ref = alloc();
    let type0 = alloc();
    let cid = alloc();
    let descriptor = alloc();
    let font_file = alloc();
    let cmap_ref = alloc();
    let page_refs: Vec<(Ref, Ref)> = pages.iter().map(|_| (alloc(), alloc())).collect();

    let mut pdf = Pdf::new();
    pdf.catalog(catalog).pages(pages_ref);
    let title = p
        .name
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Cross stitch pattern");
    pdf.document_info(info_ref).title(TextStr(title));
    pdf.pages(pages_ref)
        .kids(page_refs.iter().map(|(page, _)| *page))
        .count(page_refs.len() as i32);

    for ((page_ref, content_ref), (content, opacities)) in page_refs.iter().zip(&pages) {
        let mut page = pdf.page(*page_ref);
        page.parent(pages_ref)
            .media_box(Rect::new(0.0, 0.0, l.page_w as f32, l.page_h as f32))
            .contents(*content_ref);
        let mut resources = page.resources();
        resources.fonts().pair(Name(b"F0"), type0);
        if !opacities.is_empty() {
            let mut states = resources.ext_g_states();
            for (i, alpha) in opacities.iter().enumerate() {
                let name = format!("GS{i}");
                states
                    .insert(Name(name.as_bytes()))
                    .start::<pdf_writer::writers::ExtGraphicsState>()
                    .non_stroking_alpha(*alpha as f32)
                    .stroking_alpha(*alpha as f32);
            }
        }
        resources.finish();
        page.finish();
        pdf.stream(*content_ref, content)
            .filter(Filter::FlateDecode);
    }

    let subset = subsetter::subset(FONT_BYTES, 0, &fonts.remapper).expect("font subset");
    let base_font = Name(b"AAAAAA+DejaVuSans");
    let system = SystemInfo {
        registry: Str(b"Adobe"),
        ordering: Str(b"Identity"),
        supplement: 0,
    };
    pdf.type0_font(type0)
        .base_font(base_font)
        .encoding_predefined(Name(b"Identity-H"))
        .descendant_font(cid)
        .to_unicode(cmap_ref);
    let mut cid_font = pdf.cid_font(cid);
    cid_font
        .subtype(CidFontType::Type2)
        .base_font(base_font)
        .system_info(system)
        .font_descriptor(descriptor)
        .cid_to_gid_map_predefined(Name(b"Identity"));
    {
        let mut widths = cid_font.widths();
        for (gid, w) in &fonts.widths {
            widths.consecutive(*gid, [*w as f32]);
        }
    }
    cid_font.finish();
    let face = text::face();
    let bbox = face.global_bounding_box();
    let scale = 1000.0 / UNITS_PER_EM as f32;
    pdf.font_descriptor(descriptor)
        .name(base_font)
        .flags(FontFlags::SYMBOLIC)
        .bbox(Rect::new(
            bbox.x_min as f32 * scale,
            bbox.y_min as f32 * scale,
            bbox.x_max as f32 * scale,
            bbox.y_max as f32 * scale,
        ))
        .italic_angle(0.0)
        .ascent(ASCENT as f32 * scale)
        .descent(-(DESCENT as f32) * scale)
        .cap_height(face.capital_height().unwrap_or(1493) as f32 * scale)
        .stem_v(80.0)
        .font_file2(font_file);
    pdf.stream(font_file, &deflate(&subset))
        .filter(Filter::FlateDecode);
    let mut cmap = UnicodeCmap::new(Name(b"Custom"), system);
    for (gid, chars) in &fonts.unicode {
        cmap.pair_with_multiple(*gid, chars.chars());
    }
    pdf.cmap(cmap_ref, &cmap.finish());
    pdf.finish()
}
