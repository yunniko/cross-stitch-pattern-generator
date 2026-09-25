//! Port of the raster chart in `lib/export/render.ts`: `renderPatternToCanvas` (the colour and B&W chart PNGs) and the
//! shared `drawChart` and grid lines the A4 pages reuse.

use crate::backstitch::{
    backstitch_threads, bead_positions, dash_pattern_for, dash_segments, line_length_cells,
};
use crate::canvas::Canvas;
use crate::format::{finished_size, hex, luminance, skein_estimate, stitch_count};
use crate::jsfmt::number;
use crate::model::{Backstitch, Color, Pattern, SizeUnit, EMPTY_CELL};
use crate::text::{self, Align, Baseline};
use tiny_skia::Pixmap;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Color,
    Bw,
}

const DEFAULT_CELL_SIZE: i64 = 24;
const MAX_CANVAS_DIMENSION: i64 = 12000;
const MAX_CHART_DIMENSION_PX: f64 = 8000.0;
const MAX_CHART_AREA_PX: f64 = 40_000_000.0;
const MIN_CHART_CELL_SIZE_PX: i64 = 4;
pub const LEGIBILITY_FLOOR_PX: i64 = 6;
pub const FONT_STACK: &str = "Arial, 'Segoe UI', sans-serif";
pub const GRID_LINE_COLOR: &str = "#333333";
const LEGEND_ITEM_HEIGHT: f64 = 40.0;
const LEGEND_SWATCH_SIZE: f64 = 20.0;
const LEGEND_PADDING: f64 = 16.0;
const LEGEND_COLUMN_WIDTH: f64 = 170.0;
const BW_MIN_GRAY: f64 = 150.0;
const BW_MAX_GRAY: f64 = 245.0;
const MARKER_MARGIN: f64 = 16.0;
const NUMBER_MARGIN: f64 = 20.0;
const HEADER_HEIGHT: f64 = 26.0;

pub struct TooLarge;

fn bw_gray(rgb: [u8; 3]) -> u8 {
    let t = luminance(rgb) / 255.0;
    (BW_MIN_GRAY + t * (BW_MAX_GRAY - BW_MIN_GRAY)).round() as u8
}

/// `fillForCell`.
pub fn fill_for_cell(mode: Mode, rgb: [u8; 3]) -> String {
    match mode {
        Mode::Color => format!("rgb({}, {}, {})", rgb[0], rgb[1], rgb[2]),
        Mode::Bw => {
            let g = bw_gray(rgb);
            format!("rgb({g}, {g}, {g})")
        }
    }
}

/// `symbolTextColor`.
pub fn symbol_text_color(mode: Mode, rgb: [u8; 3]) -> &'static str {
    if mode == Mode::Bw || luminance(rgb) > 140.0 {
        "#000000"
    } else {
        "#ffffff"
    }
}

/// `symbolStampsFor`: each symbol drawn once in its text colour on a transparent tile, stamped per stitch (D172).
pub struct SymbolStamps {
    pub pad: i64,
    pub tiles: Vec<Pixmap>,
}

pub fn symbol_stamps(palette: &[Color], mode: Mode, cell_size: i64) -> Option<SymbolStamps> {
    if cell_size < LEGIBILITY_FLOOR_PX || palette.is_empty() {
        return None;
    }
    let size = (cell_size as f64 * 0.6).round() as f32;
    let half = cell_size as f32 / 2.0;
    let middle = text::baseline_offset(Baseline::Middle, size);
    let mut reach = 0.0f32;
    for color in palette {
        let (left, right, ascent, descent) = text::ink_bounds(&color.symbol, size);
        let width = text::measure(&color.symbol, size);
        // Bounds relative to a centred, middle-baseline drawing point, drawn at (cell centre, cell centre + 1).
        let (l, r) = (left + width / 2.0, right - width / 2.0);
        let (a, d) = (ascent - middle, descent + middle);
        reach = reach
            .max(l - half)
            .max(r - half)
            .max(a - 1.0 - half)
            .max(d + 1.0 - half);
    }
    let pad = (reach.ceil().max(0.0) as i64) + 1;
    let tile = (cell_size + 2 * pad) as u32;
    let tiles = palette
        .iter()
        .map(|color| {
            let mut c = Canvas::new(tile, tile);
            c.set_font(&format!("{size}px {FONT_STACK}"));
            c.set_align(Align::Center);
            c.set_baseline(Baseline::Middle);
            c.set_fill(symbol_text_color(mode, color.rgb));
            c.fill_text(
                &color.symbol,
                pad as f64 + half as f64,
                pad as f64 + half as f64 + 1.0,
            );
            c.pixmap
        })
        .collect();
    Some(SymbolStamps { pad, tiles })
}

/// A rectangle of the pattern's global stitch coordinates, end-exclusive.
#[derive(Clone, Copy)]
pub struct Region {
    pub x0: usize,
    pub y0: usize,
    pub x1: usize,
    pub y1: usize,
}

/// The drawing target: the raster canvas, or the PDF page (which draws symbols as text).
pub trait Ctx {
    fn set_fill(&mut self, css: &str);
    fn set_stroke(&mut self, css: &str);
    fn set_line_width(&mut self, w: f64);
    fn set_font(&mut self, css: &str);
    fn set_align(&mut self, align: Align);
    fn set_baseline(&mut self, baseline: Baseline);
    fn fill_rect(&mut self, x: f64, y: f64, w: f64, h: f64);
    fn stroke_rect(&mut self, x: f64, y: f64, w: f64, h: f64);
    fn fill_text(&mut self, text: &str, x: f64, y: f64);
    fn measure_text(&self, text: &str) -> f64;
    /// One straight line, the only path the shared drawing strokes.
    fn line(&mut self, x0: f64, y0: f64, x1: f64, y1: f64);
    fn save(&mut self);
    fn restore(&mut self);
    fn translate(&mut self, x: f64, y: f64);
    /// Raster only: a symbol stamp at whole pixels.
    fn stamp(&mut self, _tile: &Pixmap, _x: f64, _y: f64) {}
    /// Raster only: a backstitch bead (G-073 M5). The one PDF this project writes is the Pattern
    /// Keeper export, which deliberately carries no backstitch on its grid, so nothing calls this
    /// through the PDF adapter (`docs/reviews/2026-09-25-backstitch-research.md`).
    fn fill_circle(&mut self, _cx: f64, _cy: f64, _radius: f64) {}
}

impl Ctx for Canvas {
    fn set_fill(&mut self, css: &str) {
        Canvas::set_fill(self, css)
    }
    fn set_stroke(&mut self, css: &str) {
        Canvas::set_stroke(self, css)
    }
    fn set_line_width(&mut self, w: f64) {
        Canvas::set_line_width(self, w)
    }
    fn set_font(&mut self, css: &str) {
        Canvas::set_font(self, css)
    }
    fn set_align(&mut self, align: Align) {
        Canvas::set_align(self, align)
    }
    fn set_baseline(&mut self, baseline: Baseline) {
        Canvas::set_baseline(self, baseline)
    }
    fn fill_rect(&mut self, x: f64, y: f64, w: f64, h: f64) {
        Canvas::fill_rect(self, x, y, w, h)
    }
    fn stroke_rect(&mut self, x: f64, y: f64, w: f64, h: f64) {
        Canvas::stroke_rect(self, x, y, w, h)
    }
    fn fill_text(&mut self, text: &str, x: f64, y: f64) {
        Canvas::fill_text(self, text, x, y)
    }
    fn measure_text(&self, text: &str) -> f64 {
        Canvas::measure_text(self, text)
    }
    fn line(&mut self, x0: f64, y0: f64, x1: f64, y1: f64) {
        self.begin_path();
        self.move_to(x0, y0);
        self.line_to(x1, y1);
        self.stroke();
    }
    fn save(&mut self) {
        Canvas::save(self)
    }
    fn restore(&mut self) {
        Canvas::restore(self)
    }
    fn translate(&mut self, x: f64, y: f64) {
        Canvas::translate(self, x, y)
    }
    fn fill_circle(&mut self, cx: f64, cy: f64, radius: f64) {
        Canvas::fill_circle(self, cx, cy, radius)
    }
    fn stamp(&mut self, tile: &Pixmap, x: f64, y: f64) {
        self.draw_stamp(tile, x, y)
    }
}

/// `drawChart` with the default empty colour (white) and stroked grid lines.
pub fn draw_chart(
    ctx: &mut dyn Ctx,
    p: &Pattern,
    mode: Mode,
    cell_size: i64,
    region: Option<Region>,
    stamps: Option<&SymbolStamps>,
) {
    let r = region.unwrap_or(Region {
        x0: 0,
        y0: 0,
        x1: p.width,
        y1: p.height,
    });
    let draw_symbols = cell_size >= LEGIBILITY_FLOOR_PX;
    if draw_symbols {
        ctx.set_font(&format!(
            "{}px {FONT_STACK}",
            number((cell_size as f64 * 0.6).round())
        ));
        ctx.set_align(Align::Center);
        ctx.set_baseline(Baseline::Middle);
    }
    let fills: Vec<String> = p
        .palette
        .iter()
        .map(|c| fill_for_cell(mode, c.rgb))
        .collect();
    let cs = cell_size as f64;
    for y in r.y0..r.y1 {
        for x in r.x0..r.x1 {
            let v = p.cells[y * p.width + x];
            let lx = (x - r.x0) as f64 * cs;
            let ly = (y - r.y0) as f64 * cs;
            if v == EMPTY_CELL {
                ctx.set_fill("#ffffff");
                ctx.fill_rect(lx, ly, cs, cs);
                continue;
            }
            ctx.set_fill(&fills[v as usize]);
            ctx.fill_rect(lx, ly, cs, cs);
            match (draw_symbols, stamps) {
                (true, Some(s)) => {
                    ctx.stamp(&s.tiles[v as usize], lx - s.pad as f64, ly - s.pad as f64)
                }
                (true, None) => {
                    ctx.set_fill(symbol_text_color(mode, p.palette[v as usize].rgb));
                    ctx.fill_text(
                        &p.palette[v as usize].symbol,
                        lx + cs / 2.0,
                        ly + cs / 2.0 + 1.0,
                    );
                }
                _ => {}
            }
        }
    }
    draw_grid_lines(ctx, r, cell_size);
}

/// The width of a backstitch stroke: the Owner's fifth of a cell, never thinner than one pixel.
pub fn backstitch_width(cell_size: i64) -> f64 {
    (cell_size as f64 / 5.0).max(1.0)
}

/// How close in lightness a line and the cell under it may be before the line needs a casing to be seen.
///
/// Calibrated by eye on sample exports rather than derived (`docs/reviews/2026-09-25-backstitch-research.md`).
/// Below this the line and its background are near enough in tone that the stroke disappears into them.
///
/// On `format::luminance`'s own 0..255 scale, which is the measure the in-cell symbol already uses to
/// choose black or white text — one notion of lightness in this codebase rather than two.
const CASING_LIGHTNESS_GAP: f64 = 56.0;

/// Every cell a line passes over, so the casing asks about what the line is actually crossing.
fn cells_under(line: &Backstitch, steps: usize) -> Vec<(usize, usize)> {
    let mut out = Vec::new();
    for i in 0..=steps {
        let t = i as f64 / steps as f64;
        let x = line.x1 as f64 + (line.x2 as f64 - line.x1 as f64) * t;
        let y = line.y1 as f64 + (line.y2 as f64 - line.y1 as f64) * t;
        // A corner belongs to the cell below and right of it, except at the far edges.
        let cx = x.floor().max(0.0) as usize;
        let cy = y.floor().max(0.0) as usize;
        out.push((cx, cy));
    }
    out.dedup();
    out
}

/// Whether this line would be lost against the cells it crosses, and so needs its hairline casing.
fn needs_casing(p: &Pattern, line: &Backstitch, mode: Mode) -> bool {
    let Some(thread) = p.palette.get(line.palette_index) else {
        return false;
    };
    let line_l = luminance(match mode {
        Mode::Bw => {
            let g = bw_gray(thread.rgb);
            [g, g, g]
        }
        _ => thread.rgb,
    });
    let steps = (line_length_cells(line).ceil() as usize).max(1) * 2;
    cells_under(line, steps).into_iter().any(|(cx, cy)| {
        if cx >= p.width || cy >= p.height {
            return false;
        }
        let v = p.cells[cy * p.width + cx];
        // An empty cell is white, which no thread this dark is close to.
        let under = if v == EMPTY_CELL {
            [255, 255, 255]
        } else {
            match (mode, p.palette.get(v as usize)) {
                (Mode::Bw, Some(c)) => {
                    let g = bw_gray(c.rgb);
                    [g, g, g]
                }
                (_, Some(c)) => c.rgb,
                (_, None) => return false,
            }
        };
        (luminance(under) - line_l).abs() < CASING_LIGHTNESS_GAP
    })
}

/// Backstitch over a drawn chart (G-073 M5): dashes in the thread's colour, beads carrying its symbol.
///
/// Drawn after the stitches and the grid, in chart coordinates offset by the region, so a page of an A4
/// export shows the part of each line that crosses it. A chart with no backstitch draws nothing at all and
/// is byte-identical to before this existed (criterion 7).
///
/// Called by each export that wants it rather than from inside `draw_chart`: the Pattern Keeper PDF
/// shares `a4::draw_grid_page` with the A4 ZIP and must carry **no** backstitch on its grid pages, so
/// the difference is a parameter someone has to pass rather than something to remember
/// (`docs/reviews/2026-09-25-backstitch-research.md`).
pub fn draw_backstitch(
    ctx: &mut dyn Ctx,
    p: &Pattern,
    mode: Mode,
    cell_size: i64,
    region: Option<Region>,
) {
    if p.backstitch.is_empty() {
        return;
    }
    let r = region.unwrap_or(Region {
        x0: 0,
        y0: 0,
        x1: p.width,
        y1: p.height,
    });
    let cs = cell_size as f64;
    let width = backstitch_width(cell_size);
    let threads = backstitch_threads(&p.backstitch);
    let draw_symbols = cell_size >= LEGIBILITY_FLOOR_PX;

    for line in &p.backstitch {
        let Some(thread) = p.palette.get(line.palette_index) else {
            continue;
        };
        let stroke = fill_for_cell(mode, thread.rgb);
        let segments = dash_segments(line, dash_pattern_for(line.palette_index, &threads));
        let at = |x: f64, y: f64| ((x - r.x0 as f64) * cs, (y - r.y0 as f64) * cs);

        if needs_casing(p, line, mode) {
            // A hairline of the opposite tone under the stroke, so the line keeps an edge against cells of
            // its own lightness. Drawn first and wider, which is what makes it a casing rather than a line.
            ctx.set_stroke(if luminance(thread.rgb) < 128.0 {
                "#ffffff"
            } else {
                "#000000"
            });
            ctx.set_line_width(width + (cs / 12.0).max(1.0));
            for s in &segments {
                let (x0, y0) = at(s.x1, s.y1);
                let (x1, y1) = at(s.x2, s.y2);
                ctx.line(x0, y0, x1, y1);
            }
        }

        ctx.set_stroke(&stroke);
        ctx.set_line_width(width);
        for s in &segments {
            let (x0, y0) = at(s.x1, s.y1);
            let (x1, y1) = at(s.x2, s.y2);
            ctx.line(x0, y0, x1, y1);
        }

        if !draw_symbols {
            continue;
        }
        // The bead: the line swells to a lozenge the size of an in-cell symbol, which is what lets the
        // glyph be read at all (`docs/reviews/2026-09-25-backstitch-research.md`).
        let length = line_length_cells(line);
        if length <= 0.0 {
            continue;
        }
        let ux = (line.x2 as f64 - line.x1 as f64) / length;
        let uy = (line.y2 as f64 - line.y1 as f64) / length;
        for d in bead_positions(line) {
            let (bx, by) = at(line.x1 as f64 + ux * d, line.y1 as f64 + uy * d);
            let radius = cs * 0.3;
            ctx.set_fill(&stroke);
            ctx.fill_circle(bx, by, radius);
            ctx.set_fill(symbol_text_color(mode, thread.rgb));
            ctx.set_font(&format!(
                "{}px {FONT_STACK}",
                number((cell_size as f64 * 0.6).round())
            ));
            ctx.set_align(Align::Center);
            ctx.set_baseline(Baseline::Middle);
            ctx.fill_text(&thread.symbol, bx, by + 1.0);
        }
    }
}

/// `drawGridLines` in its stroked form: every 5th line medium, every 10th major.
pub fn draw_grid_lines(ctx: &mut dyn Ctx, r: Region, cell_size: i64) {
    let cs = cell_size as f64;
    let minor = (cs / 24.0).round().max(1.0);
    let medium = (cs * (2.0 / 24.0)).round().max(1.0);
    let major = (cs * (3.0 / 24.0)).round().max(1.0);
    let weight = |i: usize| {
        if i.is_multiple_of(10) {
            major
        } else if i.is_multiple_of(5) {
            medium
        } else {
            minor
        }
    };
    ctx.set_stroke(GRID_LINE_COLOR);
    for x in r.x0..=r.x1 {
        ctx.set_line_width(weight(x));
        let px = (x - r.x0) as f64 * cs;
        ctx.line(px, 0.0, px, (r.y1 - r.y0) as f64 * cs);
    }
    for y in r.y0..=r.y1 {
        ctx.set_line_width(weight(y));
        let py = (y - r.y0) as f64 * cs;
        ctx.line(0.0, py, (r.x1 - r.x0) as f64 * cs, py);
    }
}

/// `truncateToWidth`: a trailing ellipsis when the text does not fit.
pub fn truncate_to_width(ctx: &dyn Ctx, text: &str, max_width: f64) -> String {
    if ctx.measure_text(text) <= max_width {
        return text.to_string();
    }
    let chars: Vec<char> = text.chars().collect();
    let (mut low, mut high) = (0usize, chars.len());
    while low < high {
        let mid = (low + high).div_ceil(2);
        let candidate: String = chars[..mid].iter().collect::<String>() + "…";
        if ctx.measure_text(&candidate) <= max_width {
            low = mid;
        } else {
            high = mid - 1;
        }
    }
    if low > 0 {
        chars[..low].iter().collect::<String>() + "…"
    } else {
        "…".to_string()
    }
}

/// `headerText`.
pub fn header_text(p: &Pattern, aida: f64, unit: SizeUnit, author: &str) -> String {
    let base = format!(
        "{} × {} grid, {} — approx. {} on {}-count Aida",
        p.width,
        p.height,
        stitch_count(p.filled_stitch_count()),
        finished_size(p.width, p.height, aida, unit),
        number(aida)
    );
    let author = author.trim();
    if author.is_empty() {
        base
    } else {
        format!("{base} — Designed by {author}")
    }
}

struct Layout {
    cell_size: i64,
    chart_w: f64,
    chart_h: f64,
    below: bool,
    left: f64,
    top: f64,
    canvas_w: f64,
    canvas_h: f64,
}

fn legend_extent(p: &Pattern, chart_w: f64, chart_h: f64) -> (f64, f64, bool) {
    let n = p.palette.len() as f64;
    if p.is_landscape {
        let columns = (chart_w / LEGEND_COLUMN_WIDTH).floor().max(1.0);
        let rows = (n / columns).ceil();
        return (
            0.0,
            MARKER_MARGIN + LEGEND_PADDING + rows * LEGEND_ITEM_HEIGHT,
            true,
        );
    }
    let rows_per_column = (chart_h / LEGEND_ITEM_HEIGHT).floor().max(1.0);
    let columns = (n / rows_per_column).ceil();
    (
        MARKER_MARGIN + LEGEND_PADDING + columns * LEGEND_COLUMN_WIDTH,
        0.0,
        false,
    )
}

/// `findChartLayout`.
fn find_layout(p: &Pattern, requested: i64, header_w: f64) -> Option<Layout> {
    let longer = p.width.max(p.height) as f64;
    let start =
        MIN_CHART_CELL_SIZE_PX.max(requested.min((MAX_CHART_DIMENSION_PX / longer).floor() as i64));
    let mut cell = start;
    while cell >= MIN_CHART_CELL_SIZE_PX {
        let chart_w = p.width as f64 * cell as f64;
        let chart_h = p.height as f64 * cell as f64;
        let (extra_w, extra_h, below) = legend_extent(p, chart_w, chart_h);
        let left = MARKER_MARGIN + NUMBER_MARGIN;
        let top = MARKER_MARGIN + NUMBER_MARGIN;
        let right = if below { MARKER_MARGIN } else { 0.0 };
        let bottom = if below { 0.0 } else { MARKER_MARGIN };
        let canvas_w = (left + chart_w + right + extra_w).max(header_w);
        let canvas_h = HEADER_HEIGHT + top + chart_h + bottom + extra_h;
        if canvas_w <= MAX_CHART_DIMENSION_PX
            && canvas_h <= MAX_CHART_DIMENSION_PX
            && canvas_w * canvas_h <= MAX_CHART_AREA_PX
        {
            return Some(Layout {
                cell_size: cell,
                chart_w,
                chart_h,
                below,
                left,
                top,
                canvas_w,
                canvas_h,
            });
        }
        cell -= 1;
    }
    None
}

fn draw_legend_item(ctx: &mut dyn Ctx, color: &Color, x: f64, y: f64, aida: f64) {
    ctx.set_fill(&format!(
        "rgb({}, {}, {})",
        color.rgb[0], color.rgb[1], color.rgb[2]
    ));
    ctx.fill_rect(x, y, LEGEND_SWATCH_SIZE, LEGEND_SWATCH_SIZE);
    ctx.set_stroke(GRID_LINE_COLOR);
    ctx.set_line_width(1.0);
    ctx.stroke_rect(x, y, LEGEND_SWATCH_SIZE, LEGEND_SWATCH_SIZE);

    ctx.set_fill(if luminance(color.rgb) > 140.0 {
        "#000000"
    } else {
        "#ffffff"
    });
    ctx.set_font(&format!(
        "{}px {FONT_STACK}",
        number((LEGEND_SWATCH_SIZE * 0.6).round())
    ));
    ctx.set_align(Align::Center);
    ctx.set_baseline(Baseline::Middle);
    ctx.fill_text(
        &color.symbol,
        x + LEGEND_SWATCH_SIZE / 2.0,
        y + LEGEND_SWATCH_SIZE / 2.0 + 1.0,
    );

    let text_x = x + LEGEND_SWATCH_SIZE + 8.0;
    let max_w = LEGEND_COLUMN_WIDTH - LEGEND_SWATCH_SIZE - 12.0;
    ctx.set_align(Align::Left);
    ctx.set_baseline(Baseline::Middle);
    ctx.set_fill("#111111");
    ctx.set_font(&format!("13px {FONT_STACK}"));
    let name = truncate_to_width(ctx, &color.name, max_w);
    ctx.fill_text(&name, text_x, y + LEGEND_SWATCH_SIZE / 2.0 + 1.0);
    ctx.set_fill("#666666");
    ctx.set_font(&format!("11px {FONT_STACK}"));
    let meta = format!(
        "{} · {} sts · {}",
        hex(color.rgb),
        color.count,
        skein_estimate(color.count, aida)
    );
    let meta = truncate_to_width(ctx, &meta, max_w);
    ctx.fill_text(&meta, text_x, y + LEGEND_SWATCH_SIZE + 10.0);
}

fn draw_legend(ctx: &mut dyn Ctx, p: &Pattern, l: &Layout, aida: f64) {
    if l.below {
        let columns = (l.chart_w / LEGEND_COLUMN_WIDTH).floor().max(1.0) as usize;
        for (i, color) in p.palette.iter().enumerate() {
            let (col, row) = (i % columns, i / columns);
            draw_legend_item(
                ctx,
                color,
                LEGEND_PADDING + col as f64 * LEGEND_COLUMN_WIDTH,
                l.chart_h + MARKER_MARGIN + LEGEND_PADDING + row as f64 * LEGEND_ITEM_HEIGHT,
                aida,
            );
        }
    } else {
        let rows_per_column = (l.chart_h / LEGEND_ITEM_HEIGHT).floor().max(1.0) as usize;
        for (i, color) in p.palette.iter().enumerate() {
            let (col, row) = (i / rows_per_column, i % rows_per_column);
            draw_legend_item(
                ctx,
                color,
                l.chart_w + MARKER_MARGIN + LEGEND_PADDING + col as f64 * LEGEND_COLUMN_WIDTH,
                row as f64 * LEGEND_ITEM_HEIGHT,
                aida,
            );
        }
    }
}

fn draw_center_markers(c: &mut Canvas, w: f64, h: f64) {
    let size = MARKER_MARGIN * 0.6;
    let (mx, my) = (w / 2.0, h / 2.0);
    c.set_fill(GRID_LINE_COLOR);
    let mut triangle = |points: [(f64, f64); 3]| {
        c.begin_path();
        c.move_to(points[0].0, points[0].1);
        c.line_to(points[1].0, points[1].1);
        c.line_to(points[2].0, points[2].1);
        c.close_path();
        c.fill();
    };
    triangle([
        (mx - size / 2.0, -MARKER_MARGIN),
        (mx + size / 2.0, -MARKER_MARGIN),
        (mx, -MARKER_MARGIN + size),
    ]);
    triangle([
        (mx - size / 2.0, h + MARKER_MARGIN),
        (mx + size / 2.0, h + MARKER_MARGIN),
        (mx, h + MARKER_MARGIN - size),
    ]);
    triangle([
        (-MARKER_MARGIN, my - size / 2.0),
        (-MARKER_MARGIN, my + size / 2.0),
        (-MARKER_MARGIN + size, my),
    ]);
    triangle([
        (w + MARKER_MARGIN, my - size / 2.0),
        (w + MARKER_MARGIN, my + size / 2.0),
        (w + MARKER_MARGIN - size, my),
    ]);
}

fn draw_row_column_numbers(c: &mut Canvas, width: usize, height: usize, cell_size: i64) {
    if cell_size < LEGIBILITY_FLOOR_PX {
        return;
    }
    let cs = cell_size as f64;
    Canvas::set_fill(c, GRID_LINE_COLOR);
    Canvas::set_font(
        c,
        &format!("{}px {FONT_STACK}", number(12f64.min((cs * 0.45).round()))),
    );
    c.set_align(Align::Center);
    c.set_baseline(Baseline::Bottom);
    let mut x = 10;
    while x < width {
        Canvas::fill_text(c, &x.to_string(), x as f64 * cs, -MARKER_MARGIN - 4.0);
        x += 10;
    }
    c.set_align(Align::Right);
    c.set_baseline(Baseline::Middle);
    let mut y = 10;
    while y < height {
        Canvas::fill_text(c, &y.to_string(), -MARKER_MARGIN - 4.0, y as f64 * cs);
        y += 10;
    }
}

/// `renderPatternToCanvas` with the default cell size.
pub fn render_pattern(
    p: &Pattern,
    mode: Mode,
    aida: f64,
    unit: SizeUnit,
    author: &str,
) -> Result<Canvas, TooLarge> {
    let header = header_text(p, aida, unit, author);
    let header_w = text::measure(&header, 13.0) as f64 + LEGEND_PADDING * 2.0;
    let l = find_layout(p, DEFAULT_CELL_SIZE, header_w).ok_or(TooLarge)?;
    // A canvas size is truncated to whole pixels, as `createCanvas` truncates it.
    let mut c = Canvas::new(l.canvas_w as u32, l.canvas_h as u32);
    let (cw, ch) = (c.width() as f64, c.height() as f64);
    Canvas::set_fill(&mut c, "#ffffff");
    Canvas::fill_rect(&mut c, 0.0, 0.0, cw, ch);

    Canvas::set_fill(&mut c, "#111111");
    Canvas::set_font(&mut c, &format!("13px {FONT_STACK}"));
    c.set_align(Align::Left);
    c.set_baseline(Baseline::Middle);
    Canvas::fill_text(&mut c, &header, LEGEND_PADDING, HEADER_HEIGHT / 2.0);

    Canvas::save(&mut c);
    Canvas::translate(&mut c, l.left, HEADER_HEIGHT + l.top);
    let stamps = symbol_stamps(&p.palette, mode, l.cell_size);
    draw_chart(&mut c, p, mode, l.cell_size, None, stamps.as_ref());
    draw_backstitch(&mut c, p, mode, l.cell_size, None);
    draw_legend(&mut c, p, &l, aida);
    draw_center_markers(&mut c, l.chart_w, l.chart_h);
    draw_row_column_numbers(&mut c, p.width, p.height, l.cell_size);
    Canvas::restore(&mut c);
    Ok(c)
}

/// `effectiveCellSize`, for the realistic preview.
pub fn effective_cell_size(width: usize, height: usize) -> i64 {
    let longer = width.max(height) as i64;
    MIN_CHART_CELL_SIZE_PX.max(DEFAULT_CELL_SIZE.min(MAX_CANVAS_DIMENSION / longer))
}
