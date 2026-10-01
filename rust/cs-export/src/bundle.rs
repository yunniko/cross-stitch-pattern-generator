//! ZIP output as JSZip writes it for these exports: stored (uncompressed) entries, in the order they are added; and
//! the A4 page set of `addA4PagesToZip`, raster pages encoded one at a time.

use crate::a4::{self, zip_entry_name};
use crate::canvas::Canvas;
use crate::model::{Pattern, Request};
use crate::png;
use crate::render::{symbol_stamps, Mode};
use rayon::prelude::*;
use std::io::{Cursor, Write};
use std::sync::atomic::{AtomicUsize, Ordering};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

pub struct Zip {
    writer: ZipWriter<Cursor<Vec<u8>>>,
}

impl Default for Zip {
    fn default() -> Self {
        Self::new()
    }
}

impl Zip {
    pub fn new() -> Zip {
        Zip {
            writer: ZipWriter::new(Cursor::new(Vec::new())),
        }
    }

    pub fn file(&mut self, name: &str, bytes: &[u8]) {
        let options = SimpleFileOptions::default()
            .compression_method(CompressionMethod::Stored)
            .large_file(bytes.len() > u32::MAX as usize / 2);
        self.writer.start_file(name, options).expect("zip entry");
        self.writer.write_all(bytes).expect("zip write");
    }

    pub fn folder(&mut self, name: &str) {
        self.writer
            .add_directory(format!("{name}/"), SimpleFileOptions::default())
            .expect("zip folder");
    }

    pub fn finish(self) -> Vec<u8> {
        self.writer.finish().expect("zip finish").into_inner()
    }
}

fn pad2(n: usize) -> String {
    format!("{n:02}")
}

fn page_png(width: f64, height: f64, draw: impl FnOnce(&mut Canvas)) -> Vec<u8> {
    let mut c = Canvas::new(width as u32, height as u32);
    draw(&mut c);
    png::encode(&c, c.width(), c.height())
}

/// `addA4PagesToZip`: grid pages in row-major order, the simple legend, then the extended legend pages, each under
/// `prefix` (a folder inside Export all, or nothing).
pub fn add_a4_pages(
    zip: &mut Zip,
    prefix: &str,
    p: &Pattern,
    mode: Mode,
    request: &Request,
) -> usize {
    add_a4_pages_reporting(zip, prefix, p, mode, request, &|_, _| {})
}

/// The page count the Pattern Keeper PDF reports against: grid pages, the simple legend and the extended legend pages,
/// on the layout that PDF has always had.
pub fn a4_page_count(p: &Pattern, request: &Request, dpi: f64) -> usize {
    let l = a4::calculate_layout(p.width, p.height, request.overlap_cells, dpi);
    let plan = a4::plan_info_pages(
        p,
        &l,
        request.aida_count,
        request.size_unit,
        &request.author_name,
    );
    l.pages.len() + 1 + 1 + a4::continuation_slices(&plan).len()
}

/// The page count the A4 PNG pages report against, on the Owner's cell size (G-083).
pub fn a4_png_page_count(p: &Pattern, request: &Request) -> usize {
    let l = a4::calculate_a4_layout(
        p.width,
        p.height,
        request.overlap_cells,
        a4::PRINT_DPI,
        request.cell_mm,
    );
    let plan = a4::plan_info_pages(
        p,
        &l,
        request.aida_count,
        request.size_unit,
        &request.author_name,
    );
    // The map of the pages, the grid pages, the skein table and the extended legend pages.
    1 + l.pages.len() + a4::skein_table_pages(p, &l) + a4::continuation_slices(&plan).len() + 1
}

/// `add_a4_pages` reporting `(finished, total)` as each page is done, for the sidecar's progress (G-048 M6).
pub fn add_a4_pages_reporting(
    zip: &mut Zip,
    prefix: &str,
    p: &Pattern,
    mode: Mode,
    request: &Request,
    report: &(dyn Fn(usize, usize) + Sync),
) -> usize {
    let l = a4::calculate_a4_layout(
        p.width,
        p.height,
        request.overlap_cells,
        a4::PRINT_DPI,
        request.cell_mm,
    );
    let base = &request.base_name;
    let total = l.pages.len();
    let stamps = symbol_stamps(&p.palette, mode, l.cell as i64);
    // Pages render and encode in parallel on the caller's rayon pool and enter the ZIP in order, so the output is
    // the same at any thread count.
    let all_pages = a4_png_page_count(p, request);
    // The map of the pages comes first (G-083); the name sorts before every grid page's.
    let map = page_png(l.page_w, l.page_h, |c| {
        a4::draw_map_page(c, p, &l, &request.author_name)
    });
    report(1, all_pages);
    zip.file(
        &format!(
            "{prefix}{}",
            zip_entry_name(&format!("{base}_00_page_map.png"))
        ),
        &map,
    );
    let finished = AtomicUsize::new(1);
    let pages: Vec<Vec<u8>> = l
        .pages
        .par_iter()
        .enumerate()
        .map(|(i, page)| {
            let bytes = page_png(l.page_w, l.page_h, |c| {
                a4::draw_grid_page(
                    c,
                    p,
                    mode,
                    &l,
                    page,
                    i,
                    total,
                    stamps.as_ref(),
                    true,
                    &a4::marks_for(&l, i),
                )
            });
            report(finished.fetch_add(1, Ordering::Relaxed) + 1, all_pages);
            bytes
        })
        .collect();
    let mut written = 1;
    for (page, bytes) in l.pages.iter().zip(pages) {
        zip.file(
            &format!(
                "{prefix}{}",
                zip_entry_name(&format!(
                    "{base}_r{}_c{}.png",
                    pad2(page.row + 1),
                    pad2(page.column + 1)
                ))
            ),
            &bytes,
        );
        written += 1;
    }
    // The skein table (G-083), replacing the swatch grid; one or more pages.
    let table_pages = a4::skein_table_pages(p, &l);
    for index in 0..table_pages {
        let bytes = page_png(l.page_w, l.page_h, |c| {
            a4::draw_skein_table_page(c, p, &l, request.aida_count, &request.author_name, index)
        });
        report(total + 2 + index, all_pages);
        let suffix = if table_pages > 1 {
            format!("_{}", pad2(index + 1))
        } else {
            String::new()
        };
        zip.file(
            &format!(
                "{prefix}{}",
                zip_entry_name(&format!("{base}_legend{suffix}.png"))
            ),
            &bytes,
        );
        written += 1;
    }

    let plan = a4::plan_info_pages(
        p,
        &l,
        request.aida_count,
        request.size_unit,
        &request.author_name,
    );
    let mut info = vec![page_png(l.page_w, l.page_h, |c| {
        a4::draw_info_page1(c, p, &plan, &l, request.aida_count)
    })];
    for (k, (from, to)) in a4::continuation_slices(&plan).into_iter().enumerate() {
        info.push(page_png(l.page_w, l.page_h, |c| {
            a4::draw_info_continuation(
                c,
                p,
                &plan,
                &p.legend_entries()[from..to],
                k + 2,
                &l,
                request.aida_count,
            )
        }));
    }
    let count = info.len();
    for (i, bytes) in info.into_iter().enumerate() {
        report(total + 2 + table_pages + i, all_pages);
        let suffix = if count > 1 {
            format!("_{}", pad2(i + 1))
        } else {
            String::new()
        };
        zip.file(
            &format!(
                "{prefix}{}",
                zip_entry_name(&format!("{base}_legend_extended{suffix}.png"))
            ),
            &bytes,
        );
        written += 1;
    }
    written
}
