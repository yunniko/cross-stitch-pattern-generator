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

/// `runExportJob`: every export but the editable save works on the pattern with unused colours dropped.
pub fn export(pattern: &Pattern, request: &Request) -> Result<ExportFile, String> {
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
            bundle::add_a4_pages(&mut zip, "", &compacted, mode, request);
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
            Ok(ExportFile {
                filename: format!("{base}_patternkeeper.pdf"),
                bytes: pdf::build(&compacted, mode, request),
            })
        }
        "all" => Ok(ExportFile {
            filename: format!("{base}.cspzip"),
            bytes: export_all(&compacted, request)?,
        }),
        other => Err(format!("unknown export kind {other}")),
    }
}

/// `generateExportAllZip`: every format in one `.cspzip`, in the order the TypeScript adds them. `p` is already
/// compacted, so the bundled editable save is too, as the TypeScript's is.
fn export_all(p: &Pattern, request: &Request) -> Result<Vec<u8>, String> {
    let base = &request.base_name;
    let mut zip = bundle::Zip::new();
    zip.file(
        &format!("{base}_editable.json"),
        editable::serialize(p).as_bytes(),
    );
    zip.file(
        &format!("{base}.oxs"),
        &oxs::serialize(p, &request.author_name, request.aida_count),
    );
    for (mode, label) in [(render::Mode::Color, "color"), (render::Mode::Bw, "bw")] {
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
    zip.file(
        &format!("{base}_patternkeeper.pdf"),
        &pdf::build(p, render::Mode::Color, request),
    );
    for (mode, folder) in [
        (render::Mode::Color, "A4_color"),
        (render::Mode::Bw, "A4_bw"),
    ] {
        zip.folder(folder);
        bundle::add_a4_pages(&mut zip, &format!("{folder}/"), p, mode, request);
    }
    Ok(zip.finish())
}
