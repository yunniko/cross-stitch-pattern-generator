//! G-048 M4: the exports in Rust (`lib/export/`, `lib/editor/oxs.ts`, `lib/editor/pattern-serialize.ts`). The pattern
//! arrives as the editable save; `export` returns the file `runExportJob` would.

pub mod editable;
pub mod jsfmt;
pub mod model;
pub mod oxs;
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
        other => Err(format!("export kind {other} is not ported yet")),
    }
}
