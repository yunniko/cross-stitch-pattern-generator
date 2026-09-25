//! Ports of `lib/export/a4-layout.ts`, the page drawing of `a4-render.ts` (on the shared `Ctx`, so the PDF draws the
//! same pages) and `a4-export.ts` (the ZIP of PNG pages).

use crate::format::{
    color_count, finished_size, luminance, skein_estimate, split_thread_code_name, stitch_count,
};
use crate::model::{Color, Pattern, SizeUnit};
use crate::render::{
    draw_backstitch, draw_chart, truncate_to_width, Ctx, Mode, Region, SymbolStamps, FONT_STACK,
    GRID_LINE_COLOR, LEGIBILITY_FLOOR_PX,
};
use crate::text::{Align, Baseline};
use crate::threads::brand_label;

pub const PRINT_DPI: f64 = 300.0;

pub fn mm_to_px(mm: f64, dpi: f64) -> f64 {
    (mm * dpi / 25.4).round()
}

#[derive(Clone, Copy, Debug)]
pub struct PageRange {
    pub row: usize,
    pub column: usize,
    pub start_x: usize,
    pub end_x: usize,
    pub start_y: usize,
    pub end_y: usize,
}

#[derive(Clone, Debug)]
pub struct Layout {
    pub rows: usize,
    pub columns: usize,
    pub pages: Vec<PageRange>,
    pub page_w: f64,
    pub page_h: f64,
    pub margin: f64,
    pub cell: f64,
    pub dpi: f64,
    pub overlap: usize,
    pub origin_x: f64,
    pub origin_y: f64,
}

fn axis_pages(total: usize, per_page: usize, overlap: usize) -> Vec<(usize, usize)> {
    if total <= per_page {
        return vec![(0, total)];
    }
    let step = per_page - overlap;
    let mut pages = Vec::new();
    let mut start = 0;
    loop {
        let end = (start + per_page).min(total);
        pages.push((start, end));
        if end >= total {
            break;
        }
        start += step;
    }
    pages
}

fn cells_per_page(printable: f64, cell: f64) -> usize {
    let n = (printable / cell).floor() as usize;
    if n < 10 {
        n
    } else {
        n / 10 * 10
    }
}

fn layout_for(
    w: usize,
    h: usize,
    landscape: bool,
    cell: f64,
    margin: f64,
    overlap: usize,
    dpi: f64,
) -> Layout {
    let (pw, ph) = (mm_to_px(210.0, dpi), mm_to_px(297.0, dpi));
    let (page_w, page_h) = if landscape { (ph, pw) } else { (pw, ph) };
    let caption = mm_to_px(8.0, dpi);
    let gutter = mm_to_px(6.0, dpi);
    let origin_x = margin + gutter;
    let origin_y = margin + caption + gutter;
    let per_x = cells_per_page(page_w - margin - origin_x, cell);
    let per_y = cells_per_page(page_h - margin - origin_y, cell);
    let xs = axis_pages(w, per_x, overlap);
    let ys = axis_pages(h, per_y, overlap);
    let mut pages = Vec::new();
    for (row, &(sy, ey)) in ys.iter().enumerate() {
        for (column, &(sx, ex)) in xs.iter().enumerate() {
            pages.push(PageRange {
                row,
                column,
                start_x: sx,
                end_x: ex,
                start_y: sy,
                end_y: ey,
            });
        }
    }
    Layout {
        rows: ys.len(),
        columns: xs.len(),
        pages,
        page_w,
        page_h,
        margin,
        cell,
        dpi,
        overlap,
        origin_x,
        origin_y,
    }
}

/// `calculateA4Layout` with the default cell size and margin; the orientation needing fewer pages, portrait on a tie.
pub fn calculate_layout(w: usize, h: usize, overlap: usize, dpi: f64) -> Layout {
    let cell = mm_to_px(2.75, dpi);
    let margin = mm_to_px(12.0, dpi);
    let portrait = layout_for(w, h, false, cell, margin, overlap, dpi);
    let landscape = layout_for(w, h, true, cell, margin, overlap, dpi);
    if landscape.rows * landscape.columns < portrait.rows * portrait.columns {
        landscape
    } else {
        portrait
    }
}

const OVERLAP_TINT: &str = "rgba(255, 200, 0, 0.35)";

fn font(px: f64) -> String {
    format!("{}px {FONT_STACK}", crate::jsfmt::number(px))
}

fn bold(px: f64) -> String {
    format!("bold {}px {FONT_STACK}", crate::jsfmt::number(px))
}

/// `drawA4GridPage`.
/// One grid page of an A4 export.
///
/// `backstitch` is false for the Pattern Keeper PDF, which shares this routine and must keep its grid
/// pages free of anything its parser does not expect — that export exists to be machine-read, and the app
/// cannot use backstitch anyway (`docs/reviews/2026-09-25-backstitch-research.md`).
#[allow(clippy::too_many_arguments)]
pub fn draw_grid_page(
    ctx: &mut dyn Ctx,
    p: &Pattern,
    mode: Mode,
    l: &Layout,
    page: &PageRange,
    index: usize,
    total: usize,
    stamps: Option<&SymbolStamps>,
    backstitch: bool,
) {
    ctx.set_fill("#ffffff");
    ctx.fill_rect(0.0, 0.0, l.page_w, l.page_h);

    ctx.set_fill("#111111");
    ctx.set_font(&font(mm_to_px(4.5, l.dpi)));
    ctx.set_align(Align::Left);
    ctx.set_baseline(Baseline::Top);
    let caption = format!(
        "Page {} / {}  —  Row {}, Column {}",
        index + 1,
        total,
        page.row + 1,
        page.column + 1
    );
    ctx.fill_text(&caption, l.origin_x, l.margin);

    ctx.save();
    ctx.translate(l.origin_x, l.origin_y);
    let region = Region {
        x0: page.start_x,
        y0: page.start_y,
        x1: page.end_x,
        y1: page.end_y,
    };
    draw_chart(ctx, p, mode, l.cell as i64, Some(region), stamps);
    if backstitch {
        draw_backstitch(ctx, p, mode, l.cell as i64, Some(region));
    }

    let gw = (page.end_x - page.start_x) as f64 * l.cell;
    let gh = (page.end_y - page.start_y) as f64 * l.cell;
    let band = l.overlap as f64 * l.cell;
    if band > 0.0 {
        let has = l.overlap > 0;
        ctx.set_fill(OVERLAP_TINT);
        if has && page.column > 0 {
            ctx.fill_rect(0.0, 0.0, band, gh);
        }
        if has && page.column < l.columns - 1 {
            ctx.fill_rect(gw - band, 0.0, band, gh);
        }
        if has && page.row > 0 {
            ctx.fill_rect(0.0, 0.0, gw, band);
        }
        if has && page.row < l.rows - 1 {
            ctx.fill_rect(0.0, gh - band, gw, band);
        }
    }

    if (l.cell as i64) >= LEGIBILITY_FLOOR_PX {
        ctx.set_fill(GRID_LINE_COLOR);
        ctx.set_font(&font(mm_to_px(3.2, l.dpi)));
        ctx.set_align(Align::Center);
        ctx.set_baseline(Baseline::Bottom);
        let mut x = page.start_x.div_ceil(10) * 10;
        while x < page.end_x {
            if x != 0 {
                ctx.fill_text(&x.to_string(), (x - page.start_x) as f64 * l.cell, -4.0);
            }
            x += 10;
        }
        ctx.set_align(Align::Right);
        ctx.set_baseline(Baseline::Middle);
        let mut y = page.start_y.div_ceil(10) * 10;
        while y < page.end_y {
            if y != 0 {
                ctx.fill_text(&y.to_string(), -4.0, (y - page.start_y) as f64 * l.cell);
            }
            y += 10;
        }
    }
    ctx.restore();
}

fn swatch(ctx: &mut dyn Ctx, color: &Color, x: f64, y: f64, size: f64) {
    ctx.set_fill(&format!(
        "rgb({}, {}, {})",
        color.rgb[0], color.rgb[1], color.rgb[2]
    ));
    ctx.fill_rect(x, y, size, size);
    ctx.set_stroke(GRID_LINE_COLOR);
    ctx.set_line_width(1.0);
    ctx.stroke_rect(x, y, size, size);
}

/// The simple legend page: **what to buy** (G-073 M5, criterion 6).
///
/// A thread consumption table headed with the pattern's own name and its designer, one row per thread:
/// the colour cell, the colour's name, and how many skeins it needs. The hex and the stitch count moved
/// to the extended legend, which is the page for reading the chart rather than for shopping.
pub fn draw_legend_page(ctx: &mut dyn Ctx, p: &Pattern, l: &Layout, aida: f64, author: &str) {
    ctx.set_fill("#ffffff");
    ctx.fill_rect(0.0, 0.0, l.page_w, l.page_h);
    let title_px = mm_to_px(6.0, l.dpi);
    ctx.set_fill("#111111");
    ctx.set_font(&bold(title_px));
    ctx.set_align(Align::Left);
    ctx.set_baseline(Baseline::Top);
    ctx.fill_text(&info_title(p.name.as_deref(), author), l.margin, l.margin);
    let sub_px = mm_to_px(3.4, l.dpi);
    ctx.set_fill("#666666");
    ctx.set_font(&font(sub_px));
    ctx.fill_text("Threads needed", l.margin, l.margin + title_px * 1.25);

    let swatch_px = mm_to_px(6.0, l.dpi);
    let row_h = mm_to_px(9.0, l.dpi);
    let col_w = mm_to_px(45.0, l.dpi);
    let name_px = mm_to_px(3.2, l.dpi);
    let detail_px = mm_to_px(2.6, l.dpi);
    let mut grid_top = l.margin + title_px * 1.8 + sub_px;

    if l.overlap > 0 {
        let note = mm_to_px(4.0, l.dpi);
        let gap = mm_to_px(2.0, l.dpi);
        ctx.set_fill(OVERLAP_TINT);
        ctx.fill_rect(l.margin, grid_top, note, note);
        ctx.set_stroke(GRID_LINE_COLOR);
        ctx.set_line_width(1.0);
        ctx.stroke_rect(l.margin, grid_top, note, note);
        ctx.set_fill("#7a5200");
        ctx.set_font(&font(detail_px));
        ctx.set_align(Align::Left);
        ctx.set_baseline(Baseline::Middle);
        ctx.fill_text(
            "Tinted bands on grid pages repeat on the adjacent page — don't stitch them twice.",
            l.margin + note + gap,
            grid_top + note / 2.0,
        );
        grid_top += note + mm_to_px(3.0, l.dpi);
    }

    let printable_w = l.page_w - 2.0 * l.margin;
    let columns = (printable_w / col_w).floor().max(1.0) as usize;
    let bs_length = crate::backstitch::length_by_color(&p.backstitch, p.palette.len());
    for (i, color) in p.palette.iter().enumerate() {
        let (col, row) = (i % columns, i / columns);
        let x = l.margin + col as f64 * col_w;
        let y = grid_top + row as f64 * row_h;
        swatch(ctx, color, x, y, swatch_px);
        ctx.set_fill(if luminance(color.rgb) > 140.0 {
            "#000000"
        } else {
            "#ffffff"
        });
        ctx.set_font(&font((swatch_px * 0.6).round()));
        ctx.set_align(Align::Center);
        ctx.set_baseline(Baseline::Middle);
        ctx.fill_text(
            &color.symbol,
            x + swatch_px / 2.0,
            y + swatch_px / 2.0 + 1.0,
        );

        let text_x = x + swatch_px + mm_to_px(2.0, l.dpi);
        let max_w = col_w - swatch_px - mm_to_px(4.0, l.dpi);
        ctx.set_align(Align::Left);
        ctx.set_baseline(Baseline::Middle);
        ctx.set_fill("#111111");
        ctx.set_font(&font(name_px));
        let name = truncate_to_width(ctx, &color.name, max_w);
        ctx.fill_text(&name, text_x, y + swatch_px / 2.0 - detail_px * 0.6);
        ctx.set_fill("#666666");
        ctx.set_font(&font(detail_px));
        // A thread that carries only backstitch has no stitches to estimate skeins from, and “0
        // skeins” would read as “do not buy this”. It says what it is for instead (G-073 M5).
        let need = if color.count == 0 && bs_length.get(i).copied().unwrap_or(0.0) > 0.0 {
            "backstitch only".to_string()
        } else {
            skein_estimate(color.count, aida)
        };
        ctx.fill_text(&need, text_x, y + swatch_px / 2.0 + name_px * 0.6);
    }
}

/// `infoPageTitle`.
fn info_title(name: Option<&str>, author: &str) -> String {
    let name = name.map(str::trim).filter(|s| !s.is_empty());
    let author = author.trim();
    match (name, author.is_empty()) {
        (Some(n), false) => format!("{n} by {author}"),
        (None, false) => format!("Cross stitch pattern by {author}"),
        (Some(n), true) => n.to_string(),
        (None, true) => "Cross stitch pattern".to_string(),
    }
}

fn detail_rows(p: &Pattern, aida: f64, unit: SizeUnit) -> Vec<(String, String)> {
    let secondary = if unit == SizeUnit::In {
        SizeUnit::Cm
    } else {
        SizeUnit::In
    };
    let mut rows = vec![
        (
            "Stitch count".into(),
            format!(
                "{} × {} ({})",
                p.width,
                p.height,
                stitch_count(p.filled_stitch_count())
            ),
        ),
        (
            "Finished size".into(),
            format!(
                "{} ({})",
                finished_size(p.width, p.height, aida, unit),
                finished_size(p.width, p.height, aida, secondary)
            ),
        ),
        (
            "Fabric".into(),
            format!("{}-count Aida", crate::jsfmt::number(aida)),
        ),
    ];
    if let Some(brand) = &p.thread_brand {
        rows.push(("Thread".into(), brand_label(brand).to_string()));
    }
    rows.push(("Color count".into(), color_count(p.palette.len())));
    // The chart's own backstitch total, next to its stitch count — what a stitcher needs before starting,
    // where the per-thread lengths in the colour key are what they need while stitching (G-073 M5).
    if !p.backstitch.is_empty() {
        let cells: f64 = p
            .backstitch
            .iter()
            .map(crate::backstitch::line_length_cells)
            .sum();
        rows.push((
            "Backstitch".into(),
            format!("approx. {}", crate::backstitch::format_length(cells, aida)),
        ));
    }
    rows
}

struct KeyColumns {
    symbol_x: f64,
    symbol_w: f64,
    code_x: f64,
    code_w: f64,
    name_x: f64,
    name_w: f64,
    stitch_x: f64,
    stitch_w: f64,
    /// Backstitch length, replacing the skein count: skeins are on the simple legend now, which is the
    /// page for buying thread (G-073 M5, criterion 6). Zero width when the chart has no backstitch.
    backstitch_x: f64,
    backstitch_w: f64,
    total: f64,
}

fn key_columns(printable_w: f64, has_code: bool, has_backstitch: bool, dpi: f64) -> KeyColumns {
    let symbol_w = mm_to_px(12.0, dpi);
    let code_w = if has_code { mm_to_px(18.0, dpi) } else { 0.0 };
    let stitch_w = mm_to_px(28.0, dpi);
    let backstitch_w = if has_backstitch {
        mm_to_px(28.0, dpi)
    } else {
        0.0
    };
    let name_w = mm_to_px(30.0, dpi).max(printable_w - symbol_w - code_w - stitch_w - backstitch_w);
    let symbol_x = 0.0;
    let code_x = symbol_x + symbol_w;
    let name_x = code_x + code_w;
    let stitch_x = name_x + name_w;
    let backstitch_x = stitch_x + stitch_w;
    KeyColumns {
        symbol_x,
        symbol_w,
        code_x,
        code_w,
        name_x,
        name_w,
        stitch_x,
        stitch_w,
        backstitch_x,
        backstitch_w,
        total: backstitch_x + backstitch_w,
    }
}

pub struct InfoPlan {
    title: String,
    details: Vec<(String, String)>,
    cols: KeyColumns,
    has_code: bool,
    printable_w: f64,
    /// Backstitch length per palette index, for the column that replaced the skein count (G-073 M5).
    bs_length: Vec<f64>,
    pub rows_on_page1: usize,
    pub rows_per_continuation: usize,
    pub total_colors: usize,
    pub total_pages: usize,
}

/// `planInfoPages`.
pub fn plan_info_pages(
    p: &Pattern,
    l: &Layout,
    aida: f64,
    unit: SizeUnit,
    author: &str,
) -> InfoPlan {
    let has_code = p.thread_brand.is_some();
    let bs_length = crate::backstitch::length_by_color(&p.backstitch, p.palette.len());
    let printable_w = l.page_w - 2.0 * l.margin;
    let printable_h = l.page_h - 2.0 * l.margin;
    let details = detail_rows(p, aida, unit);
    let title_px = mm_to_px(6.0, l.dpi);
    let gap = mm_to_px(6.0, l.dpi);
    let details_h = details.len() as f64 * mm_to_px(7.5, l.dpi);
    let key_title = mm_to_px(5.0, l.dpi);
    let key_header = mm_to_px(6.5, l.dpi);
    let key_row = mm_to_px(8.0, l.dpi);
    let page1_fixed = title_px * 1.8 + gap + details_h + gap + key_title * 1.6 + key_header;
    let cont_fixed = mm_to_px(4.5, l.dpi) * 1.8 + key_header;
    let rows_on_page1 = ((printable_h - page1_fixed) / key_row).floor().max(1.0) as usize;
    let rows_per_continuation = ((printable_h - cont_fixed) / key_row).floor().max(1.0) as usize;
    let total_colors = p.palette.len();
    let remaining = total_colors.saturating_sub(rows_on_page1);
    let continuation = if remaining == 0 {
        0
    } else {
        remaining.div_ceil(rows_per_continuation)
    };
    InfoPlan {
        bs_length,
        title: info_title(p.name.as_deref(), author),
        details,
        cols: key_columns(printable_w, has_code, !p.backstitch.is_empty(), l.dpi),
        has_code,
        printable_w,
        rows_on_page1,
        rows_per_continuation,
        total_colors,
        total_pages: 1 + continuation,
    }
}

fn draw_details_table(
    ctx: &mut dyn Ctx,
    x: f64,
    y: f64,
    width: f64,
    rows: &[(String, String)],
    dpi: f64,
) -> f64 {
    let row_h = mm_to_px(7.5, dpi);
    let label_w = mm_to_px(42.0, dpi);
    let label_px = mm_to_px(3.4, dpi);
    let total = rows.len() as f64 * row_h;
    for (i, (label, value)) in rows.iter().enumerate() {
        let mid = y + i as f64 * row_h + row_h / 2.0;
        ctx.set_align(Align::Left);
        ctx.set_baseline(Baseline::Middle);
        ctx.set_fill("#555555");
        ctx.set_font(&font(label_px));
        ctx.fill_text(label, x + mm_to_px(2.0, dpi), mid);
        ctx.set_fill("#111111");
        ctx.set_font(&bold(label_px));
        ctx.fill_text(value, x + label_w + mm_to_px(2.0, dpi), mid);
    }
    ctx.set_stroke(GRID_LINE_COLOR);
    ctx.set_line_width(1.0);
    ctx.stroke_rect(x, y, width, total);
    ctx.line(x + label_w, y, x + label_w, y + total);
    for i in 1..rows.len() {
        let ly = y + i as f64 * row_h;
        ctx.line(x, ly, x + width, ly);
    }
    y + total
}

/// `printedThreadCodeName`.
fn printed_code_name(color: &Color) -> (String, String) {
    let (code, name) = split_thread_code_name(&color.name);
    match &color.source {
        None => (code, name),
        Some(s) if code == s.code => (s.code.clone(), name),
        Some(s) => (s.code.clone(), color.name.clone()),
    }
}

#[allow(clippy::too_many_arguments)]
fn draw_key_block(
    ctx: &mut dyn Ctx,
    x: f64,
    y0: f64,
    c: &KeyColumns,
    has_code: bool,
    colors: &[Color],
    aida: f64,
    dpi: f64,
    // Backstitch length per palette index, for the column that replaced the skein count.
    bs_length: &[f64],
) -> f64 {
    let header_h = mm_to_px(6.5, dpi);
    let row_h = mm_to_px(8.0, dpi);
    let header_px = mm_to_px(3.0, dpi);
    let total = header_h + colors.len() as f64 * row_h;

    ctx.set_fill("#f0f0f0");
    ctx.fill_rect(x, y0, c.total, header_h);
    ctx.set_fill("#111111");
    ctx.set_font(&bold(header_px));
    ctx.set_baseline(Baseline::Middle);
    let header_mid = y0 + header_h / 2.0;
    ctx.set_align(Align::Center);
    ctx.fill_text("Symbol", x + c.symbol_x + c.symbol_w / 2.0, header_mid);
    if has_code {
        ctx.fill_text("Color #", x + c.code_x + c.code_w / 2.0, header_mid);
    }
    ctx.set_align(Align::Left);
    ctx.fill_text("Color name", x + c.name_x + mm_to_px(1.5, dpi), header_mid);
    ctx.set_align(Align::Center);
    ctx.fill_text(
        "Stitch count",
        x + c.stitch_x + c.stitch_w / 2.0,
        header_mid,
    );
    if c.backstitch_w > 0.0 {
        ctx.fill_text(
            "Backstitch",
            x + c.backstitch_x + c.backstitch_w / 2.0,
            header_mid,
        );
    }

    for (i, color) in colors.iter().enumerate() {
        let top = y0 + header_h + i as f64 * row_h;
        let mid = top + row_h / 2.0;
        let size = (c.symbol_w - mm_to_px(2.0, dpi)).min(row_h - mm_to_px(2.0, dpi));
        let sx = x + c.symbol_x + (c.symbol_w - size) / 2.0;
        let sy = top + (row_h - size) / 2.0;
        swatch(ctx, color, sx, sy, size);
        ctx.set_fill(if luminance(color.rgb) > 140.0 {
            "#000000"
        } else {
            "#ffffff"
        });
        ctx.set_font(&font((size * 0.55).round()));
        ctx.set_align(Align::Center);
        ctx.fill_text(&color.symbol, sx + size / 2.0, mid + 1.0);

        let (code, name) = if has_code {
            printed_code_name(color)
        } else {
            (String::new(), color.name.clone())
        };
        if has_code {
            ctx.set_fill("#111111");
            ctx.set_font(&font(header_px));
            ctx.set_align(Align::Center);
            ctx.fill_text(&code, x + c.code_x + c.code_w / 2.0, mid);
        }
        ctx.set_fill("#111111");
        ctx.set_font(&font(mm_to_px(3.2, dpi)));
        ctx.set_align(Align::Left);
        let shown = truncate_to_width(ctx, &name, c.name_w - mm_to_px(3.0, dpi));
        ctx.fill_text(&shown, x + c.name_x + mm_to_px(1.5, dpi), mid);
        ctx.set_font(&font(header_px));
        ctx.set_align(Align::Center);
        ctx.fill_text(
            &color.count.to_string(),
            x + c.stitch_x + c.stitch_w / 2.0,
            mid,
        );
        if c.backstitch_w > 0.0 {
            let cells = bs_length.get(color.index).copied().unwrap_or(0.0);
            // A dash rather than “0 cm”: this thread has no backstitch at all, which is a different
            // thing from having a very short run of it.
            let text = if cells > 0.0 {
                crate::backstitch::format_length(cells, aida)
            } else {
                "\u{2014}".to_string()
            };
            ctx.fill_text(&text, x + c.backstitch_x + c.backstitch_w / 2.0, mid);
        }
    }

    ctx.set_stroke(GRID_LINE_COLOR);
    ctx.set_line_width(1.0);
    ctx.stroke_rect(x, y0, c.total, total);
    for i in 0..=colors.len() {
        let ly = y0 + header_h + i as f64 * row_h;
        ctx.line(x, ly, x + c.total, ly);
    }
    let mut xs = vec![c.symbol_x];
    if has_code {
        xs.push(c.code_x);
    }
    xs.extend([c.name_x, c.stitch_x]);
    if c.backstitch_w > 0.0 {
        xs.push(c.backstitch_x);
    }
    for cx in xs {
        if cx == 0.0 {
            continue;
        }
        ctx.line(x + cx, y0, x + cx, y0 + total);
    }
    y0 + total
}

fn draw_footer(ctx: &mut dyn Ctx, l: &Layout, page: usize, total: usize) {
    if total <= 1 {
        return;
    }
    ctx.set_fill("#888888");
    ctx.set_font(&font(mm_to_px(3.0, l.dpi)));
    ctx.set_align(Align::Right);
    ctx.set_baseline(Baseline::Bottom);
    ctx.fill_text(
        &format!("Page {page} / {total}"),
        l.page_w - l.margin,
        l.page_h - l.margin * 0.5,
    );
}

/// `drawInfoPage1`.
pub fn draw_info_page1(ctx: &mut dyn Ctx, p: &Pattern, plan: &InfoPlan, l: &Layout, aida: f64) {
    ctx.set_fill("#ffffff");
    ctx.fill_rect(0.0, 0.0, l.page_w, l.page_h);
    let title_px = mm_to_px(6.0, l.dpi);
    let gap = mm_to_px(6.0, l.dpi);
    let key_title = mm_to_px(5.0, l.dpi);
    let mut y = l.margin;
    ctx.set_fill("#111111");
    ctx.set_font(&bold(title_px));
    ctx.set_align(Align::Left);
    ctx.set_baseline(Baseline::Top);
    ctx.fill_text(&plan.title, l.margin, y);
    y += title_px * 1.8 + gap;
    y = draw_details_table(ctx, l.margin, y, plan.printable_w, &plan.details, l.dpi);
    y += gap;
    ctx.set_fill("#111111");
    ctx.set_font(&bold(key_title));
    ctx.set_align(Align::Left);
    ctx.set_baseline(Baseline::Top);
    ctx.fill_text("Color key", l.margin, y);
    y += key_title * 1.6;
    let n = plan.rows_on_page1.min(plan.total_colors);
    draw_key_block(
        ctx,
        l.margin,
        y,
        &plan.cols,
        plan.has_code,
        &p.palette[..n],
        aida,
        l.dpi,
        &plan.bs_length,
    );
    draw_footer(ctx, l, 1, plan.total_pages);
}

/// `drawInfoContinuationPage`.
pub fn draw_info_continuation(
    ctx: &mut dyn Ctx,
    plan: &InfoPlan,
    colors: &[Color],
    page_number: usize,
    l: &Layout,
    aida: f64,
) {
    ctx.set_fill("#ffffff");
    ctx.fill_rect(0.0, 0.0, l.page_w, l.page_h);
    let caption_px = mm_to_px(4.5, l.dpi);
    ctx.set_fill("#111111");
    ctx.set_font(&bold(caption_px));
    ctx.set_align(Align::Left);
    ctx.set_baseline(Baseline::Top);
    ctx.fill_text("Color key (continued)", l.margin, l.margin);
    draw_key_block(
        ctx,
        l.margin,
        l.margin + caption_px * 1.8,
        &plan.cols,
        plan.has_code,
        colors,
        aida,
        l.dpi,
        &plan.bs_length,
    );
    draw_footer(ctx, l, page_number, plan.total_pages);
}

/// The colours on each info page after the first.
pub fn continuation_slices(plan: &InfoPlan) -> Vec<(usize, usize)> {
    let mut consumed = plan.rows_on_page1.min(plan.total_colors);
    let mut out = Vec::new();
    for _ in 0..plan.total_pages.saturating_sub(1) {
        let here = plan.rows_per_continuation.min(plan.total_colors - consumed);
        out.push((consumed, consumed + here));
        consumed += here;
    }
    out
}

/// `zipEntryName`: "." and ".." segments resolved as JSZip resolves them.
pub fn zip_entry_name(name: &str) -> String {
    let parts: Vec<&str> = name.split('/').collect();
    let mut out: Vec<&str> = Vec::new();
    for (i, part) in parts.iter().enumerate() {
        if *part == "." || (part.is_empty() && i != 0 && i != parts.len() - 1) {
            continue;
        }
        if *part == ".." {
            out.pop();
        } else {
            out.push(part);
        }
    }
    out.join("/")
}
