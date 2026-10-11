//! Ports of `lib/export/a4-layout.ts`, the page drawing of `a4-render.ts` (on the shared `Ctx`, so the PDF draws the
//! same pages) and `a4-export.ts` (the ZIP of PNG pages).

use crate::format::{color_count, finished_size, luminance, skein_estimate, stitch_count};
use crate::model::{Color, LegendEntry, Pattern, SizeUnit};
use crate::render::{
    draw_backstitch, draw_chart, fill_for_cell, fill_stitch_cell, symbol_text_color,
    truncate_to_width, Ctx, Mode, Region, SymbolStamps, FONT_STACK, GRID_LINE_COLOR,
    LEGIBILITY_FLOOR_PX,
};
use crate::text::{Align, Baseline};

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
    /// The space outside the grid for numbers and labels, in pixels.
    pub gutter: f64,
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

/// Whole cells that fit; the Pattern Keeper layout rounds that down to a multiple of ten, the A4 export (`fill`) does not,
/// so its pattern fills the page (G-083).
fn cells_per_page(printable: f64, cell: f64, fill: bool) -> usize {
    let n = (printable / cell).floor() as usize;
    if fill || n < 10 {
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
    gutter: f64,
    fill: bool,
) -> Layout {
    let (pw, ph) = (mm_to_px(210.0, dpi), mm_to_px(297.0, dpi));
    let (page_w, page_h) = if landscape { (ph, pw) } else { (pw, ph) };
    let caption = mm_to_px(8.0, dpi);
    let origin_x = margin + gutter;
    let origin_y = margin + caption + gutter;
    let per_x = cells_per_page(page_w - margin - origin_x, cell, fill);
    let per_y = cells_per_page(page_h - margin - origin_y, cell, fill);
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
        gutter,
    }
}

/// The space outside the pattern on an A4 page of the A4 export (G-083), in millimetres.
pub const A4_PAGE_GUTTER_MM: f64 = 8.0;
/// The margin of those pages: narrow, as a printer allows (G-083, the Owner asked for smaller borders).
pub const A4_PAGE_MARGIN_MM: f64 = 8.0;

/// `calculateA4Layout` with the default cell size and margin; the orientation needing fewer pages, portrait on a tie.
/// This is the layout the Pattern Keeper PDF has always had, and it is not to change (G-083).
pub fn calculate_layout(w: usize, h: usize, overlap: usize, dpi: f64) -> Layout {
    let cell = mm_to_px(2.75, dpi);
    let margin = mm_to_px(12.0, dpi);
    let gutter = mm_to_px(6.0, dpi);
    let portrait = layout_for(w, h, false, cell, margin, overlap, dpi, gutter, false);
    let landscape = layout_for(w, h, true, cell, margin, overlap, dpi, gutter, false);
    if landscape.rows * landscape.columns < portrait.rows * portrait.columns {
        landscape
    } else {
        portrait
    }
}

/// The layout of the A4 pages with the Owner's cell size, and the wider gutter their overlap labels and letters need
/// (G-083). Same rule for the orientation as `calculate_layout`.
pub fn calculate_a4_layout(w: usize, h: usize, overlap: usize, dpi: f64, cell_mm: f64) -> Layout {
    let cell = mm_to_px(cell_mm, dpi);
    let margin = mm_to_px(A4_PAGE_MARGIN_MM, dpi);
    let gutter = mm_to_px(A4_PAGE_GUTTER_MM, dpi);
    let portrait = layout_for(w, h, false, cell, margin, overlap, dpi, gutter, true);
    let landscape = layout_for(w, h, true, cell, margin, overlap, dpi, gutter, true);
    if landscape.rows * landscape.columns < portrait.rows * portrait.columns {
        landscape
    } else {
        portrait
    }
}

const OVERLAP_TINT: &str = "rgba(255, 200, 0, 0.35)";

/// What the A4 pages of the A4 export add to a grid page (G-083). The Pattern Keeper PDF passes `PageMarks::none()`, so
/// its pages are not touched.
#[derive(Clone, Debug, Default)]
pub struct PageMarks {
    /// The black triangles on the rulers and the heavy frame round the centre.
    pub centre: bool,
    /// This page's letter, large and dark grey in the top right corner.
    pub letter: Option<String>,
    /// The letter of the page each overlap band repeats, for the top, right, bottom and left bands.
    pub overlap: [Option<String>; 4],
}

impl PageMarks {
    pub fn none() -> PageMarks {
        PageMarks::default()
    }
}

/// A page's letter: A to Z in the order the pages are numbered, then AA, AB and on, as a spreadsheet names its columns.
pub fn page_letter(index: usize) -> String {
    let mut n = index;
    let mut out = String::new();
    loop {
        out.insert(0, (b'A' + (n % 26) as u8) as char);
        if n < 26 {
            break;
        }
        n = n / 26 - 1;
    }
    out
}

/// The marks of page `index` of the A4 export: the centre, its letter, and the letter of the page each overlap band repeats.
pub fn marks_for(l: &Layout, index: usize) -> PageMarks {
    let page = &l.pages[index];
    let neighbour =
        |present: bool, other: usize| (l.overlap > 0 && present).then(|| page_letter(other));
    PageMarks {
        centre: true,
        letter: Some(page_letter(index)),
        overlap: [
            neighbour(page.row > 0, index.wrapping_sub(l.columns)),
            neighbour(page.column + 1 < l.columns, index + 1),
            neighbour(page.row + 1 < l.rows, index + l.columns),
            neighbour(page.column > 0, index.wrapping_sub(1)),
        ],
    }
}

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
    marks: &PageMarks,
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
    if let Some(letter) = &marks.letter {
        // The page's own letter, large and dark grey, in the top right corner (G-083).
        ctx.set_fill("#555555");
        ctx.set_font(&bold(mm_to_px(16.0, l.dpi)));
        ctx.set_align(Align::Right);
        ctx.set_baseline(Baseline::Top);
        ctx.fill_text(letter, l.page_w - l.margin, l.margin);
    }

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

    // The A4 pages of the A4 export draw their numbers with the marks, over the overlap labels (G-083); the Pattern Keeper
    // PDF's pages draw them here, as they always did.
    if !marks.centre && (l.cell as i64) >= LEGIBILITY_FLOOR_PX {
        ctx.set_fill(GRID_LINE_COLOR);
        ctx.set_font(&font(mm_to_px(3.2, l.dpi)));
        ctx.set_align(Align::Center);
        ctx.set_baseline(Baseline::Bottom);
        let gap = 4.0;
        let mut x = page.start_x.div_ceil(10) * 10;
        while x < page.end_x {
            if x != 0 {
                ctx.fill_text(&x.to_string(), (x - page.start_x) as f64 * l.cell, -gap);
            }
            x += 10;
        }
        ctx.set_align(Align::Right);
        ctx.set_baseline(Baseline::Middle);
        let mut y = page.start_y.div_ceil(10) * 10;
        while y < page.end_y {
            if y != 0 {
                ctx.fill_text(&y.to_string(), -gap, (y - page.start_y) as f64 * l.cell);
            }
            y += 10;
        }
    }
    draw_page_marks(ctx, p, l, page, marks);
    ctx.restore();
}

/// The map of the pages (G-083): one small blank page for each page of the set, laid out as the pages lie, each with its letter,
/// so the printed pages can be put together. The first page of the A4 set.
pub fn draw_map_page(ctx: &mut dyn Ctx, p: &Pattern, l: &Layout, author: &str) {
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
    let sub = format!(
        "Map of the pages: {} across, {} down. Each page carries its letter in the top right corner.",
        l.columns, l.rows
    );
    ctx.fill_text(&sub, l.margin, l.margin + title_px * 1.25);

    let top = l.margin + title_px * 1.25 + sub_px * 2.5;
    let avail_w = l.page_w - 2.0 * l.margin;
    let avail_h = l.page_h - l.margin - top;
    let gap = mm_to_px(2.0, l.dpi);
    let (cols, rows) = (l.columns as f64, l.rows as f64);
    // Each small page keeps the proportions of a real one.
    let aspect = l.page_w / l.page_h;
    let tile_w = ((avail_w - (cols - 1.0) * gap) / cols)
        .min(((avail_h - (rows - 1.0) * gap) / rows) * aspect);
    let tile_h = tile_w / aspect;
    let used_w = cols * tile_w + (cols - 1.0) * gap;
    let left = l.margin + (avail_w - used_w) / 2.0;
    for (i, page) in l.pages.iter().enumerate() {
        let x = left + page.column as f64 * (tile_w + gap);
        let y = top + page.row as f64 * (tile_h + gap);
        ctx.set_fill("#fafafa");
        ctx.fill_rect(x, y, tile_w, tile_h);
        ctx.set_stroke("#555555");
        ctx.set_line_width(2.0);
        ctx.stroke_rect(x, y, tile_w, tile_h);
        ctx.set_fill("#555555");
        let letter = page_letter(i);
        // The letter as large as the little page allows, never smaller than a legible few pixels.
        let size = (tile_h * 0.45)
            .min(tile_w * 0.8 / (letter.len() as f64 * 0.75))
            .max(8.0);
        ctx.set_font(&bold(size.round()));
        ctx.set_align(Align::Center);
        ctx.set_baseline(Baseline::Middle);
        ctx.fill_text(&letter, x + tile_w / 2.0, y + tile_h * 0.45);
        // Which stitches the page holds, when there is room to say.
        if tile_w > mm_to_px(22.0, l.dpi) {
            ctx.set_fill("#777777");
            ctx.set_font(&font(mm_to_px(2.6, l.dpi)));
            ctx.fill_text(
                &format!(
                    "{}–{} × {}–{}",
                    page.start_x + 1,
                    page.end_x,
                    page.start_y + 1,
                    page.end_y
                ),
                x + tile_w / 2.0,
                y + tile_h * 0.82,
            );
        }
    }
}

fn triangle(ctx: &mut dyn Ctx, a: (f64, f64), b: (f64, f64), c: (f64, f64)) {
    ctx.fill_polygon(&[a, b, c]);
}

/// The centre marks, the row and column numbers and the overlap labels, in the grid's own coordinates (G-083): all outside the
/// pattern, against its border, so nothing is drawn over a stitch but the frame round the centre. The overlap text repeats
/// along the whole border of each overlapped side (the sides read: top and bottom left to right, the right upward, the left
/// downward); the numbers and the centre triangles stand over it, each with a little white round it.
fn draw_page_marks(
    ctx: &mut dyn Ctx,
    p: &Pattern,
    l: &Layout,
    page: &PageRange,
    marks: &PageMarks,
) {
    let mm = |v: f64| mm_to_px(v, l.dpi);
    let cell = l.cell;
    let gw = (page.end_x - page.start_x) as f64 * cell;
    let gh = (page.end_y - page.start_y) as f64 * cell;
    let tri = mm(3.5);
    let half_base = mm(2.0);
    let pad = mm(0.6);
    // Where the centre triangles sit on this page, along each ruler, if they do.
    let mid_x = p.width as f64 / 2.0;
    let tri_x = (mid_x >= page.start_x as f64 && mid_x <= page.end_x as f64)
        .then(|| (mid_x - page.start_x as f64) * cell);
    let mid_y = p.height as f64 / 2.0;
    let tri_y = (mid_y >= page.start_y as f64 && mid_y <= page.end_y as f64)
        .then(|| (mid_y - page.start_y as f64) * cell);

    // 1. The overlap text, along each overlapped border, repeated.
    if marks.overlap.iter().any(Option::is_some) {
        ctx.set_fill("#7a5200");
        ctx.set_font(&font(mm(2.4)));
        ctx.set_baseline(Baseline::Middle);
        ctx.set_align(Align::Left);
        let across = mm(1.8);
        let gap = mm(5.0);
        let start = mm(1.5);
        if let Some(letter) = &marks.overlap[0] {
            let text = format!("overlap {letter}");
            let w = ctx.measure_text(&text);
            let mut x = start;
            while x + w <= gw {
                ctx.fill_text(&text, x, -across);
                x += w + gap;
            }
        }
        if let Some(letter) = &marks.overlap[2] {
            let text = format!("overlap {letter}");
            let w = ctx.measure_text(&text);
            let mut x = start;
            while x + w <= gw {
                ctx.fill_text(&text, x, gh + across);
                x += w + gap;
            }
        }
        if let Some(letter) = &marks.overlap[1] {
            let text = format!("overlap {letter}");
            let w = ctx.measure_text(&text);
            let mut y = gh - start;
            while y - w >= 0.0 {
                ctx.fill_text_ccw(&text, gw + across, y);
                y -= w + gap;
            }
        }
        if let Some(letter) = &marks.overlap[3] {
            let text = format!("overlap {letter}");
            let w = ctx.measure_text(&text);
            let mut y = start;
            while y + w <= gh {
                ctx.fill_text_cw(&text, -across, y);
                y += w + gap;
            }
        }
    }

    // 2. The heavy frame round the central stitch.
    if marks.centre {
        let (bx0, by0, bx1, by1) = crate::centre::centre_block(p.width, p.height);
        let (x0, y0) = (bx0.max(page.start_x), by0.max(page.start_y));
        let (x1, y1) = (bx1.min(page.end_x), by1.min(page.end_y));
        if x0 < x1 && y0 < y1 {
            ctx.set_stroke("#000000");
            ctx.set_line_width(crate::centre::frame_width(cell));
            ctx.stroke_rect(
                (x0 - page.start_x) as f64 * cell,
                (y0 - page.start_y) as f64 * cell,
                (x1 - x0) as f64 * cell,
                (y1 - y0) as f64 * cell,
            );
        }
    }

    // 3. The row and column numbers, close to the border, over the overlap text on a little white. A number that would meet a
    // centre triangle stands outside it.
    if marks.centre && (l.cell as i64) >= LEGIBILITY_FLOOR_PX {
        let near = mm(0.8);
        let height = mm(3.8);
        ctx.set_font(&font(mm(3.2)));
        let mut x = page.start_x.div_ceil(10) * 10;
        while x < page.end_x {
            if x != 0 {
                let cx = (x - page.start_x) as f64 * cell;
                let text = x.to_string();
                let w = ctx.measure_text(&text);
                let raised = tri_x.is_some_and(|t| (t - cx).abs() < half_base + w / 2.0 + pad);
                let bottom = -(near + if raised { tri } else { 0.0 });
                ctx.set_fill("#ffffff");
                ctx.fill_rect(
                    cx - w / 2.0 - pad,
                    bottom - height + mm(0.5),
                    w + 2.0 * pad,
                    height,
                );
                ctx.set_fill(GRID_LINE_COLOR);
                ctx.set_align(Align::Center);
                ctx.set_baseline(Baseline::Bottom);
                ctx.fill_text(&text, cx, bottom);
            }
            x += 10;
        }
        let mut y = page.start_y.div_ceil(10) * 10;
        while y < page.end_y {
            if y != 0 {
                let cy = (y - page.start_y) as f64 * cell;
                let text = y.to_string();
                let w = ctx.measure_text(&text);
                let raised = tri_y.is_some_and(|t| (t - cy).abs() < half_base + height / 2.0 + pad);
                let right = -(near + if raised { tri } else { 0.0 });
                ctx.set_fill("#ffffff");
                ctx.fill_rect(
                    right - w - pad,
                    cy - height / 2.0,
                    w + 2.0 * pad + mm(0.5),
                    height,
                );
                ctx.set_fill(GRID_LINE_COLOR);
                ctx.set_align(Align::Right);
                ctx.set_baseline(Baseline::Middle);
                ctx.fill_text(&text, right, cy);
            }
            y += 10;
        }
    }

    // 4. The centre triangles, against the border, over the overlap text on a little white.
    if marks.centre {
        let wide = half_base + pad;
        let mark = |ctx: &mut dyn Ctx,
                    a: (f64, f64),
                    b: (f64, f64),
                    c: (f64, f64),
                    halo: [(f64, f64); 4]| {
            ctx.set_fill("#ffffff");
            ctx.fill_polygon(&halo);
            ctx.set_fill("#000000");
            triangle(ctx, a, b, c);
        };
        if let Some(x) = tri_x {
            mark(
                ctx,
                (x - half_base, -tri),
                (x + half_base, -tri),
                (x, 0.0),
                [
                    (x - wide, -tri - pad),
                    (x + wide, -tri - pad),
                    (x + pad, 0.0),
                    (x - pad, 0.0),
                ],
            );
            mark(
                ctx,
                (x - half_base, gh + tri),
                (x + half_base, gh + tri),
                (x, gh),
                [
                    (x - wide, gh + tri + pad),
                    (x + wide, gh + tri + pad),
                    (x + pad, gh),
                    (x - pad, gh),
                ],
            );
        }
        if let Some(y) = tri_y {
            mark(
                ctx,
                (-tri, y - half_base),
                (-tri, y + half_base),
                (0.0, y),
                [
                    (-tri - pad, y - wide),
                    (-tri - pad, y + wide),
                    (0.0, y + pad),
                    (0.0, y - pad),
                ],
            );
            mark(
                ctx,
                (gw + tri, y - half_base),
                (gw + tri, y + half_base),
                (gw, y),
                [
                    (gw + tri + pad, y - wide),
                    (gw + tri + pad, y + wide),
                    (gw, y + pad),
                    (gw, y - pad),
                ],
            );
        }
    }
}

fn swatch(ctx: &mut dyn Ctx, color: &Color, kind: u8, x: f64, y: f64, size: f64) {
    // The stitch as the chart draws it: a half stitch's cut corners are part of the swatch (G-082).
    fill_stitch_cell(
        ctx,
        x,
        y,
        size,
        &format!("rgb({}, {}, {})", color.rgb[0], color.rgb[1], color.rgb[2]),
        kind,
    );
    ctx.set_stroke(GRID_LINE_COLOR);
    ctx.set_line_width(1.0);
    ctx.stroke_rect(x, y, size, size);
}

// The skein table of the A4 export (G-083): one row for each thread, with what the thread looks like on the colour chart, on the
// black-and-white chart, its number when the chart has a thread brand, its name and how many skeins it needs.
const TABLE_ROW_MM: f64 = 9.0;
const TABLE_HEADER_MM: f64 = 7.0;

struct TableColumns {
    colour_x: f64,
    colour_w: f64,
    bw_x: f64,
    bw_w: f64,
    system_x: f64,
    system_w: f64,
    number_x: f64,
    number_w: f64,
    name_x: f64,
    name_w: f64,
    skein_x: f64,
    skein_w: f64,
    total: f64,
}

/// The same columns in every chart, whatever its threads' systems (G-131, D396).
fn table_columns(printable_w: f64, dpi: f64) -> TableColumns {
    let mm = |v: f64| mm_to_px(v, dpi);
    let colour_w = mm(16.0);
    let bw_w = mm(16.0);
    let system_w = mm(18.0);
    let number_w = mm(22.0);
    let skein_w = mm(26.0);
    let name_w = (printable_w - colour_w - bw_w - system_w - number_w - skein_w).max(mm(30.0));
    let colour_x = 0.0;
    let bw_x = colour_x + colour_w;
    let system_x = bw_x + bw_w;
    let number_x = system_x + system_w;
    let name_x = number_x + number_w;
    let skein_x = name_x + name_w;
    TableColumns {
        colour_x,
        colour_w,
        bw_x,
        bw_w,
        system_x,
        system_w,
        number_x,
        number_w,
        name_x,
        name_w,
        skein_x,
        skein_w,
        total: skein_x + skein_w,
    }
}

/// How the table is split over pages: the rows on the first page (which carries the title and the overlap note) and on each
/// page after it.
fn skein_table_plan(l: &Layout) -> (usize, usize) {
    let mm = |v: f64| mm_to_px(v, l.dpi);
    let title_px = mm(6.0);
    let sub_px = mm(3.4);
    let mut first_top = l.margin + title_px * 1.8 + sub_px;
    if l.overlap > 0 {
        first_top += mm(4.0) + mm(3.0);
    }
    let rows_for = |top: f64| {
        ((l.page_h - l.margin - top - mm(TABLE_HEADER_MM)) / mm(TABLE_ROW_MM))
            .floor()
            .max(1.0) as usize
    };
    let first = rows_for(first_top);
    let later = rows_for(l.margin + mm(4.5) * 1.8);
    (first, later)
}

/// How many pages the skein table takes.
pub fn skein_table_pages(p: &Pattern, l: &Layout) -> usize {
    let (first, later) = skein_table_plan(l);
    let rows = p.palette.len();
    if rows <= first {
        1
    } else {
        1 + (rows - first).div_ceil(later)
    }
}

/// One page of the skein table (G-083), `index` counting from 0.
pub fn draw_skein_table_page(
    ctx: &mut dyn Ctx,
    p: &Pattern,
    l: &Layout,
    aida: f64,
    author: &str,
    index: usize,
) {
    let mm = |v: f64| mm_to_px(v, l.dpi);
    ctx.set_fill("#ffffff");
    ctx.fill_rect(0.0, 0.0, l.page_w, l.page_h);
    let (first, later) = skein_table_plan(l);
    let (from, to) = if index == 0 {
        (0, first.min(p.palette.len()))
    } else {
        let from = first + (index - 1) * later;
        (
            from.min(p.palette.len()),
            (from + later).min(p.palette.len()),
        )
    };
    let mut top;
    let title_px = mm(6.0);
    if index == 0 {
        ctx.set_fill("#111111");
        ctx.set_font(&bold(title_px));
        ctx.set_align(Align::Left);
        ctx.set_baseline(Baseline::Top);
        ctx.fill_text(&info_title(p.name.as_deref(), author), l.margin, l.margin);
        let sub_px = mm(3.4);
        ctx.set_fill("#666666");
        ctx.set_font(&font(sub_px));
        ctx.fill_text("Threads needed", l.margin, l.margin + title_px * 1.25);
        top = l.margin + title_px * 1.8 + sub_px;
        if l.overlap > 0 {
            let note = mm(4.0);
            let detail_px = mm(2.6);
            ctx.set_fill(OVERLAP_TINT);
            ctx.fill_rect(l.margin, top, note, note);
            ctx.set_stroke(GRID_LINE_COLOR);
            ctx.set_line_width(1.0);
            ctx.stroke_rect(l.margin, top, note, note);
            ctx.set_fill("#7a5200");
            ctx.set_font(&font(detail_px));
            ctx.set_align(Align::Left);
            ctx.set_baseline(Baseline::Middle);
            ctx.fill_text(
                "Tinted bands on grid pages repeat on the adjacent page (named beside each band) — don't stitch them twice.",
                l.margin + note + mm(2.0),
                top + note / 2.0,
            );
            top += note + mm(3.0);
        }
    } else {
        let caption_px = mm(4.5);
        ctx.set_fill("#111111");
        ctx.set_font(&bold(caption_px));
        ctx.set_align(Align::Left);
        ctx.set_baseline(Baseline::Top);
        ctx.fill_text("Threads needed (continued)", l.margin, l.margin);
        top = l.margin + caption_px * 1.8;
    }

    let printable_w = l.page_w - 2.0 * l.margin;
    let c = table_columns(printable_w, l.dpi);
    let x = l.margin;
    let header_h = mm(TABLE_HEADER_MM);
    let row_h = mm(TABLE_ROW_MM);
    let header_px = mm(3.0);
    let rows = to - from;
    let total_h = header_h + rows as f64 * row_h;

    ctx.set_fill("#f0f0f0");
    ctx.fill_rect(x, top, c.total, header_h);
    ctx.set_fill("#111111");
    ctx.set_font(&bold(header_px));
    ctx.set_baseline(Baseline::Middle);
    let mid = top + header_h / 2.0;
    ctx.set_align(Align::Center);
    ctx.fill_text("Color", x + c.colour_x + c.colour_w / 2.0, mid);
    ctx.fill_text("B&W", x + c.bw_x + c.bw_w / 2.0, mid);
    ctx.fill_text("System", x + c.system_x + c.system_w / 2.0, mid);
    ctx.fill_text("Number", x + c.number_x + c.number_w / 2.0, mid);
    ctx.set_align(Align::Left);
    ctx.fill_text("Color name", x + c.name_x + mm(1.5), mid);
    ctx.set_align(Align::Center);
    ctx.fill_text("Skeins", x + c.skein_x + c.skein_w / 2.0, mid);

    let bs_length = crate::backstitch::length_by_color(&p.backstitch, p.palette.len());
    let size = mm(6.5);
    for (r, color) in p.palette[from..to].iter().enumerate() {
        let row_top = top + header_h + r as f64 * row_h;
        let row_mid = row_top + row_h / 2.0;
        let sy = row_top + (row_h - size) / 2.0;
        for (cell_x, cell_w, mode) in [
            (c.colour_x, c.colour_w, Mode::Color),
            (c.bw_x, c.bw_w, Mode::Bw),
        ] {
            let sx = x + cell_x + (cell_w - size) / 2.0;
            ctx.set_fill(&fill_for_cell(mode, color.rgb));
            ctx.fill_rect(sx, sy, size, size);
            ctx.set_stroke(GRID_LINE_COLOR);
            ctx.set_line_width(1.0);
            ctx.stroke_rect(sx, sy, size, size);
            ctx.set_fill(symbol_text_color(mode, color.rgb));
            ctx.set_font(&font((size * 0.6).round()));
            ctx.set_align(Align::Center);
            ctx.set_baseline(Baseline::Middle);
            ctx.fill_text(&color.symbol, sx + size / 2.0, sy + size / 2.0 + 1.0);
        }
        let (system, code, name) = color.printed_thread();
        ctx.set_fill("#111111");
        ctx.set_baseline(Baseline::Middle);
        ctx.set_font(&font(header_px));
        ctx.set_align(Align::Center);
        ctx.fill_text(&system, x + c.system_x + c.system_w / 2.0, row_mid);
        let shown_code = truncate_to_width(ctx, &code, c.number_w - mm(2.0));
        ctx.fill_text(&shown_code, x + c.number_x + c.number_w / 2.0, row_mid);
        ctx.set_font(&font(mm(3.2)));
        ctx.set_align(Align::Left);
        let shown = truncate_to_width(ctx, &name, c.name_w - mm(3.0));
        ctx.fill_text(&shown, x + c.name_x + mm(1.5), row_mid);
        // A thread that carries only backstitch has no stitches to estimate skeins from, and “0 skeins” would read as “do
        // not buy this”; a half stitch is half a stitch of thread (G-082).
        let need = if color.count == 0 && bs_length.get(color.index).copied().unwrap_or(0.0) > 0.0 {
            "backstitch only".to_string()
        } else {
            skein_estimate(p.thread_stitches(color.index), aida)
        };
        ctx.set_font(&font(header_px));
        ctx.set_align(Align::Center);
        ctx.fill_text(&need, x + c.skein_x + c.skein_w / 2.0, row_mid);
    }

    ctx.set_stroke(GRID_LINE_COLOR);
    ctx.set_line_width(1.0);
    ctx.stroke_rect(x, top, c.total, total_h);
    for i in 0..=rows {
        let ly = top + header_h + i as f64 * row_h;
        ctx.line(x, ly, x + c.total, ly);
    }
    for cx in [c.bw_x, c.system_x, c.number_x, c.name_x, c.skein_x] {
        ctx.line(x + cx, top, x + cx, top + total_h);
    }
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
        swatch(ctx, color, 0, x, y, swatch_px);
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
        let name = truncate_to_width(ctx, &color.thread_label(), max_w);
        ctx.fill_text(&name, text_x, y + swatch_px / 2.0 - detail_px * 0.6);
        ctx.set_fill("#666666");
        ctx.set_font(&font(detail_px));
        // A thread that carries only backstitch has no stitches to estimate skeins from, and “0
        // skeins” would read as “do not buy this”. It says what it is for instead (G-073 M5).
        let need = if color.count == 0 && bs_length.get(i).copied().unwrap_or(0.0) > 0.0 {
            "backstitch only".to_string()
        } else {
            // A half stitch is half a stitch of thread, rounded up (G-082).
            skein_estimate(p.thread_stitches(color.index), aida)
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
    // The systems the chart's threads are of, not the one it was generated in: a chart may mix them (G-131, D396).
    let systems = p.thread_systems();
    if !systems.is_empty() {
        rows.push(("Thread".into(), systems.join(", ")));
    }
    rows.push(("Color count".into(), color_count(p.palette.len())));
    // The stitch count above counts both kinds together; these two say how it divides (G-082), and the Color key lists each
    // type and thread.
    if p.has_halves() {
        let halves = p.kinds.iter().filter(|&&k| k != 0).count();
        rows.push((
            "Full stitches".into(),
            (p.filled_stitch_count() - halves).to_string(),
        ));
        rows.push(("Half stitches".into(), halves.to_string()));
    }
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
    system_x: f64,
    system_w: f64,
    code_x: f64,
    code_w: f64,
    name_x: f64,
    name_w: f64,
    /// The stitch type ("whole", "half /", "half \\"), only when the chart has half stitches (G-082).
    type_x: f64,
    type_w: f64,
    stitch_x: f64,
    stitch_w: f64,
    /// Backstitch length, replacing the skein count: skeins are on the simple legend now, which is the
    /// page for buying thread (G-073 M5, criterion 6). Zero width when the chart has no backstitch.
    backstitch_x: f64,
    backstitch_w: f64,
    total: f64,
}

/// System and Number stand in every chart's key, whatever its threads' systems (G-131, D396).
fn key_columns(printable_w: f64, has_backstitch: bool, has_type: bool, dpi: f64) -> KeyColumns {
    let symbol_w = mm_to_px(14.0, dpi);
    let type_w = if has_type { mm_to_px(20.0, dpi) } else { 0.0 };
    let system_w = mm_to_px(16.0, dpi);
    let code_w = mm_to_px(18.0, dpi);
    let stitch_w = mm_to_px(28.0, dpi);
    let backstitch_w = if has_backstitch {
        mm_to_px(28.0, dpi)
    } else {
        0.0
    };
    let name_w = mm_to_px(30.0, dpi)
        .max(printable_w - symbol_w - system_w - code_w - type_w - stitch_w - backstitch_w);
    let symbol_x = 0.0;
    let system_x = symbol_x + symbol_w;
    let code_x = system_x + system_w;
    let name_x = code_x + code_w;
    let type_x = name_x + name_w;
    let stitch_x = type_x + type_w;
    let backstitch_x = stitch_x + stitch_w;
    KeyColumns {
        symbol_x,
        symbol_w,
        system_x,
        system_w,
        code_x,
        code_w,
        name_x,
        name_w,
        type_x,
        type_w,
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
    // One key row for each stitch type and thread in use: a thread per row unless the chart has half stitches (G-082).
    let total_colors = p.legend_entries().len();
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
        cols: key_columns(printable_w, !p.backstitch.is_empty(), p.has_halves(), l.dpi),
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

#[allow(clippy::too_many_arguments)]
fn draw_key_block(
    ctx: &mut dyn Ctx,
    x: f64,
    y0: f64,
    c: &KeyColumns,
    p: &Pattern,
    entries: &[LegendEntry],
    aida: f64,
    dpi: f64,
    // Backstitch length per palette index, for the column that replaced the skein count.
    bs_length: &[f64],
) -> f64 {
    let header_h = mm_to_px(6.5, dpi);
    let row_h = mm_to_px(8.0, dpi);
    let header_px = mm_to_px(3.0, dpi);
    let total = header_h + entries.len() as f64 * row_h;

    ctx.set_fill("#f0f0f0");
    ctx.fill_rect(x, y0, c.total, header_h);
    ctx.set_fill("#111111");
    ctx.set_font(&bold(header_px));
    ctx.set_baseline(Baseline::Middle);
    let header_mid = y0 + header_h / 2.0;
    ctx.set_align(Align::Center);
    ctx.fill_text("Symbol", x + c.symbol_x + c.symbol_w / 2.0, header_mid);
    ctx.fill_text("System", x + c.system_x + c.system_w / 2.0, header_mid);
    ctx.fill_text("Number", x + c.code_x + c.code_w / 2.0, header_mid);
    ctx.set_align(Align::Left);
    ctx.fill_text("Color name", x + c.name_x + mm_to_px(1.5, dpi), header_mid);
    ctx.set_align(Align::Center);
    if c.type_w > 0.0 {
        ctx.fill_text("Type", x + c.type_x + c.type_w / 2.0, header_mid);
    }
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

    for (i, entry) in entries.iter().enumerate() {
        let color = &p.palette[entry.color];
        let top = y0 + header_h + i as f64 * row_h;
        let mid = top + row_h / 2.0;
        let size = (c.symbol_w - mm_to_px(2.0, dpi)).min(row_h - mm_to_px(2.0, dpi));
        let sx = x + c.symbol_x + (c.symbol_w - size) / 2.0;
        let sy = top + (row_h - size) / 2.0;
        swatch(ctx, color, entry.kind, sx, sy, size);
        ctx.set_fill(if luminance(color.rgb) > 140.0 {
            "#000000"
        } else {
            "#ffffff"
        });
        ctx.set_font(&font((size * 0.55).round()));
        ctx.set_align(Align::Center);
        ctx.fill_text(&color.symbol, sx + size / 2.0, mid + 1.0);

        let (system, code, name) = color.printed_thread();
        ctx.set_fill("#111111");
        ctx.set_font(&font(header_px));
        ctx.set_align(Align::Center);
        ctx.fill_text(&system, x + c.system_x + c.system_w / 2.0, mid);
        let shown_code = truncate_to_width(ctx, &code, c.code_w - mm_to_px(2.0, dpi));
        ctx.fill_text(&shown_code, x + c.code_x + c.code_w / 2.0, mid);
        ctx.set_fill("#111111");
        ctx.set_font(&font(mm_to_px(3.2, dpi)));
        ctx.set_align(Align::Left);
        let shown = truncate_to_width(ctx, &name, c.name_w - mm_to_px(3.0, dpi));
        ctx.fill_text(&shown, x + c.name_x + mm_to_px(1.5, dpi), mid);
        ctx.set_font(&font(header_px));
        ctx.set_align(Align::Center);
        if c.type_w > 0.0 {
            ctx.fill_text(
                crate::halfstitch::label(entry.kind),
                x + c.type_x + c.type_w / 2.0,
                mid,
            );
        }
        ctx.fill_text(
            &entry.count.to_string(),
            x + c.stitch_x + c.stitch_w / 2.0,
            mid,
        );
        if c.backstitch_w > 0.0 {
            // A thread's backstitch is shown on its first row only; the others get the dash.
            let first_row = i == 0 || entries[i - 1].color != entry.color;
            let cells = if first_row {
                bs_length.get(color.index).copied().unwrap_or(0.0)
            } else {
                0.0
            };
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
    for i in 0..=entries.len() {
        let ly = y0 + header_h + i as f64 * row_h;
        ctx.line(x, ly, x + c.total, ly);
    }
    let mut xs = vec![c.symbol_x, c.system_x, c.code_x, c.name_x];
    if c.type_w > 0.0 {
        xs.push(c.type_x);
    }
    xs.push(c.stitch_x);
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
        p,
        &p.legend_entries()[..n],
        aida,
        l.dpi,
        &plan.bs_length,
    );
    draw_footer(ctx, l, 1, plan.total_pages);
}

/// `drawInfoContinuationPage`.
pub fn draw_info_continuation(
    ctx: &mut dyn Ctx,
    p: &Pattern,
    plan: &InfoPlan,
    entries: &[LegendEntry],
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
        p,
        entries,
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

#[cfg(test)]
mod code_column_tests {
    use super::*;

    /// The labels the app sends with a request (`systemLabels`), in the order it loads the systems.
    fn labels() -> Vec<(String, String)> {
        [("dmc", "DMC"), ("cosmo", "Cosmo"), ("anchor", "Anchor")]
            .iter()
            .map(|(k, l)| (k.to_string(), l.to_string()))
            .collect()
    }

    /// A colour as an export sees it once the request's labels are applied.
    fn color(name: &str, source: Option<(&str, &str)>) -> Color {
        let label = |brand: &str| {
            labels()
                .into_iter()
                .find(|(k, _)| k == brand)
                .map_or(brand.to_string(), |(_, l)| l)
        };
        Color {
            index: 0,
            rgb: [0, 0, 0],
            symbol: "A".into(),
            name: name.into(),
            count: 1,
            source: source.map(|(brand, code)| crate::model::ThreadRef {
                brand: brand.into(),
                code: code.into(),
                label: label(brand),
            }),
        }
    }

    fn printed(name: &str, source: Option<(&str, &str)>) -> (String, String, String) {
        color(name, source).printed_thread()
    }

    #[test]
    fn each_thread_prints_its_own_system_and_number_and_its_name_without_the_number() {
        assert_eq!(
            printed("321 - Red", Some(("dmc", "321"))),
            ("DMC".into(), "321".into(), "Red".into())
        );
        assert_eq!(
            printed("403 - Black", Some(("anchor", "403"))),
            ("Anchor".into(), "403".into(), "Black".into())
        );
    }

    #[test]
    fn a_typed_number_and_a_renamed_thread_print_as_they_are() {
        assert_eq!(
            printed("Mine", Some(("dmc", "X-77"))),
            ("DMC".into(), "X-77".into(), "Mine".into())
        );
        assert_eq!(
            printed("310 - Black", Some(("dmc", "321"))),
            ("DMC".into(), "321".into(), "310 - Black".into())
        );
    }

    #[test]
    fn a_colour_that_is_no_thread_prints_its_whole_name_even_when_it_looks_like_one() {
        assert_eq!(
            printed("321 - Red", None),
            (String::new(), String::new(), "321 - Red".into())
        );
    }

    #[test]
    fn the_legends_without_columns_print_the_same_three_on_one_line() {
        let label = |name: &str, source| color(name, source).thread_label();
        assert_eq!(
            label("403 - Black", Some(("anchor", "403"))),
            "Anchor 403 - Black"
        );
        assert_eq!(label("403", Some(("anchor", "403"))), "Anchor 403");
        assert_eq!(label("Mine", Some(("cosmo", "X-77"))), "Cosmo X-77 - Mine");
        assert_eq!(label("Custom yellow", None), "Custom yellow");
    }

    #[test]
    fn the_thread_row_names_the_systems_in_use_in_the_order_loaded() {
        let mut p = crate::model::Pattern::from_editable_json(
            r#"{"width":1,"height":1,"cellPalette":[0],"palette":[{"rgb":[0,0,0],"symbol":"A","name":"a"}]}"#,
        )
        .unwrap();
        assert!(p.thread_systems().is_empty());
        p.thread_brand = Some("dmc".into());
        assert!(
            p.thread_systems().is_empty(),
            "the generation system is no thread"
        );
        p.palette = vec![
            color("403", Some(("anchor", "403"))),
            color("x", None),
            color("321", Some(("dmc", "321"))),
            color("310", Some(("dmc", "310"))),
        ];
        p.label_systems(&labels());
        assert_eq!(p.thread_systems(), vec!["DMC", "Anchor"]);
        // A system not loaded comes after the loaded ones, as the chart stores it (G-132).
        p.palette
            .insert(0, color("0210", Some(("Madeira", "0210"))));
        assert_eq!(p.thread_systems(), vec!["DMC", "Anchor", "Madeira"]);
        assert_eq!(p.palette[0].printed_thread().0, "Madeira");
    }
}
