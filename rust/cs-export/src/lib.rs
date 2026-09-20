//! G-048 M4: the exports in Rust (`lib/export/`, `lib/editor/oxs.ts`, `lib/editor/pattern-serialize.ts`). The pattern
//! arrives as the editable save; `export` returns the file `runExportJob` would.

pub mod a4;
pub mod bundle;
pub mod canvas;
pub mod editable;
pub mod format;
pub mod jsfmt;
pub mod model;
pub mod oxs;
pub mod pdf;
pub mod png;
pub mod preview;
pub mod render;
pub mod text;
pub mod threads;

use model::{Pattern, Request};

/// One finished export: its file name and bytes.
pub struct ExportFile {
    pub filename: String,
    pub bytes: Vec<u8>,
}

/// What a long export reports as it goes: `(completed, total, label)`, the fields of the TypeScript's `ExportProgress`
/// so the editor's "Page 12 of 180" reads the same from either side.
pub type Progress<'a> = &'a (dyn Fn(usize, usize, &str) + Sync);

/// `runExportJob` without progress.
pub fn export(pattern: &Pattern, request: &Request) -> Result<ExportFile, String> {
    export_reporting(pattern, request, &|_, _, _| {})
}

/// `runExportJob`: every export but the editable save works on the pattern with unused colours dropped.
pub fn export_reporting(
    pattern: &Pattern,
    request: &Request,
    progress: Progress,
) -> Result<ExportFile, String> {
    let base = &request.base_name;
    if request.kind == "editable" {
        return Ok(ExportFile {
            filename: format!("{base}_editable.json"),
            bytes: editable::serialize(pattern).into_bytes(),
        });
    }
    let compacted = pattern.compact_unused_colors();
    match request.kind.as_str() {
        "oxs" => Ok(ExportFile {
            filename: format!("{base}.oxs"),
            bytes: oxs::serialize(&compacted, &request.author_name, request.aida_count),
        }),
        "png-color" | "png-bw" => {
            let mode = if request.kind == "png-bw" {
                render::Mode::Bw
            } else {
                render::Mode::Color
            };
            let canvas = render::render_pattern(
                &compacted,
                mode,
                request.aida_count,
                request.size_unit,
                &request.author_name,
            )
            .map_err(|_| "This pattern is too large to render as a single image.".to_string())?;
            let label = if mode == render::Mode::Bw {
                "bw"
            } else {
                "color"
            };
            Ok(ExportFile {
                filename: format!("{base}_{label}.png"),
                bytes: png::encode(&canvas, canvas.width(), canvas.height()),
            })
        }
        "png-realistic" => {
            let cell = render::effective_cell_size(compacted.width, compacted.height) as u32;
            let preview = preview::Preview {
                tiles: preview::stitch_tiles(&compacted, cell),
                pattern: &compacted,
                cell_size: cell,
            };
            let (w, h) = (
                compacted.width as u32 * cell,
                compacted.height as u32 * cell,
            );
            Ok(ExportFile {
                filename: format!("{base}_preview.png"),
                bytes: png::encode(&preview, w, h),
            })
        }
        "a4-color" | "a4-bw" => {
            let mode = if request.kind == "a4-bw" {
                render::Mode::Bw
            } else {
                render::Mode::Color
            };
            let mut zip = bundle::Zip::new();
            bundle::add_a4_pages_reporting(
                &mut zip,
                "",
                &compacted,
                mode,
                request,
                &|done, total| progress(done, total, &format!("Page {done} of {total}")),
            );
            let label = if mode == render::Mode::Bw {
                "bw"
            } else {
                "color"
            };
            Ok(ExportFile {
                filename: format!("{base}_A4_{label}.zip"),
                bytes: zip.finish(),
            })
        }
        "pdf-color" | "pdf-bw" => {
            let mode = if request.kind == "pdf-bw" {
                render::Mode::Bw
            } else {
                render::Mode::Color
            };
            let bytes = pdf::build_reporting(&compacted, mode, request, &|done, total| {
                progress(done, total, &format!("Page {done} of {total}"))
            });
            let pages = bundle::a4_page_count(&compacted, request, 72.0);
            progress(pages, pages, "Saving PDF…");
            Ok(ExportFile {
                filename: format!("{base}_patternkeeper.pdf"),
                bytes,
            })
        }
        "all" => Ok(ExportFile {
            filename: format!("{base}.cspzip"),
            bytes: export_all(&compacted, request, progress)?,
        }),
        other => Err(format!("unknown export kind {other}")),
    }
}

/// `generateExportAllZip`: every format in one `.cspzip`, in the order the TypeScript adds them. `p` is already
/// compacted, so the bundled editable save is too, as the TypeScript's is.
fn export_all(p: &Pattern, request: &Request, progress: Progress) -> Result<Vec<u8>, String> {
    let base = &request.base_name;
    // `generateExportAllZip`'s own counting: two units for the save and OXS, one per chart, one per preview, then
    // every PDF page and both A4 page sets.
    let pdf_pages = bundle::a4_page_count(p, request, 72.0);
    let a4_pages = bundle::a4_page_count(p, request, a4::PRINT_DPI);
    let total = 5 + pdf_pages + 2 * a4_pages;
    let mut completed = 0;
    let mut step = |units: usize, label: &str| {
        completed += units;
        progress(completed, total, label);
        completed
    };
    let mut zip = bundle::Zip::new();
    zip.file(
        &format!("{base}_editable.json"),
        editable::serialize(p).as_bytes(),
    );
    zip.file(
        &format!("{base}.oxs"),
        &oxs::serialize(p, &request.author_name, request.aida_count),
    );
    step(2, "Editable file and OXS");
    for (mode, label, note) in [
        (render::Mode::Color, "color", "Color chart"),
        (render::Mode::Bw, "bw", "Black-and-white chart"),
    ] {
        let canvas = render::render_pattern(
            p,
            mode,
            request.aida_count,
            request.size_unit,
            &request.author_name,
        )
        .map_err(|_| "This pattern is too large to render as a single image.".to_string())?;
        zip.file(
            &format!("{base}_{label}.png"),
            &png::encode(&canvas, canvas.width(), canvas.height()),
        );
        step(1, note);
    }
    let cell = render::effective_cell_size(p.width, p.height) as u32;
    let preview = preview::Preview {
        tiles: preview::stitch_tiles(p, cell),
        pattern: p,
        cell_size: cell,
    };
    zip.file(
        &format!("{base}_preview.png"),
        &png::encode(&preview, p.width as u32 * cell, p.height as u32 * cell),
    );
    let base_done = step(1, "Realistic preview");
    let pdf = pdf::build_reporting(p, render::Mode::Color, request, &|done, pages| {
        progress(
            base_done + done.min(pdf_pages),
            total,
            &format!("PDF page {} of {pages}", done.min(pages)),
        )
    });
    zip.file(&format!("{base}_patternkeeper.pdf"), &pdf);
    let mut completed = base_done + pdf_pages;
    for (mode, folder, label) in [
        (render::Mode::Color, "A4_color", "A4 color"),
        (render::Mode::Bw, "A4_bw", "A4 black-and-white"),
    ] {
        zip.folder(folder);
        let base_done = completed;
        bundle::add_a4_pages_reporting(
            &mut zip,
            &format!("{folder}/"),
            p,
            mode,
            request,
            &|done, pages| {
                progress(
                    base_done + done.min(a4_pages),
                    total,
                    &format!("{label} page {done} of {pages}"),
                )
            },
        );
        completed = base_done + a4_pages;
    }
    progress(total, total, "Compressing bundle…");
    Ok(zip.finish())
}
