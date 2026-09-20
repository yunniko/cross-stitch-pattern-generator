//! The processor's Rust sidecar (G-048 M6): one generation or one export per process, spoken to over pipes.
//!
//!   cs-job generate <width> <height> '<options json>'   # RGBA pixels on stdin, pattern JSON on stdout
//!   cs-job export '<request json>'                      # an editable save on stdin, the file's bytes on stdout
//!
//! stderr carries one JSON object per line, never the payload: `{"progress":0.4}` as `buildPattern`'s `onProgress`
//! reports it, `{"exportProgress":{"completed":12,"total":180,"label":"Page 12 of 180"}}` as `runExportJob` does,
//! `{"filename":"chart.pdf"}` before an export's bytes, and `{"error":"…"}` before a non-zero exit.
//! Anything the parent cannot parse is a failure it falls back to TypeScript from (D193).
//!
//! `CS_JOB_THREADS` sizes the rayon pool; one by default, because the processor's pool is already one worker per core
//! (D190).

use cs_core::json::{parse_options, pattern_json};
use cs_core::pattern::{build_pattern_reporting, StageTimes};
use cs_core::Image;
use std::io::{Read, Write};
use std::time::Instant;

fn fail(message: &str) -> ! {
    let line = serde_json::json!({ "error": message });
    eprintln!("{line}");
    std::process::exit(1);
}

fn note(value: serde_json::Value) {
    // A parent that has stopped reading stderr must not wedge the job, so a failed write is ignored.
    let mut err = std::io::stderr();
    let _ = writeln!(err, "{value}");
    let _ = err.flush();
}

fn read_stdin() -> Vec<u8> {
    let mut buffer = Vec::new();
    if let Err(e) = std::io::stdin().lock().read_to_end(&mut buffer) {
        fail(&format!("reading stdin: {e}"));
    }
    buffer
}

fn write_stdout(bytes: &[u8]) {
    let mut out = std::io::stdout().lock();
    if let Err(e) = out.write_all(bytes).and_then(|()| out.flush()) {
        fail(&format!("writing stdout: {e}"));
    }
}

fn threads() -> usize {
    std::env::var("CS_JOB_THREADS")
        .ok()
        .and_then(|t| t.parse().ok())
        .filter(|&t| t > 0)
        .unwrap_or(1)
}

fn generate(args: &[String]) {
    let width: usize = args[2]
        .parse()
        .unwrap_or_else(|_| fail("width must be a number"));
    let height: usize = args[3]
        .parse()
        .unwrap_or_else(|_| fail("height must be a number"));
    let (options, _) = parse_options(&args[4]).unwrap_or_else(|e| fail(&e));
    let data = read_stdin();
    if data.len() != width * height * 4 {
        fail(&format!(
            "expected {} bytes of RGBA, got {}",
            width * height * 4,
            data.len()
        ));
    }
    let image = Image {
        width,
        height,
        data,
    };
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(threads())
        .build()
        .unwrap_or_else(|e| fail(&e.to_string()));
    let origin = Instant::now();
    let now = || origin.elapsed().as_secs_f64() * 1000.0;
    let mut times: StageTimes = Vec::new();
    let pattern = pool.install(|| {
        build_pattern_reporting(&image, &options, &mut times, &now, &|fraction| {
            note(serde_json::json!({ "progress": fraction }))
        })
    });
    write_stdout(
        serde_json::to_string(&pattern_json(&pattern))
            .unwrap_or_else(|e| fail(&e.to_string()))
            .as_bytes(),
    );
}

fn export(args: &[String]) {
    let request = cs_export::model::Request::from_json(&args[2]).unwrap_or_else(|e| fail(&e));
    let text = String::from_utf8(read_stdin())
        .unwrap_or_else(|e| fail(&format!("the save is not UTF-8: {e}")));
    let pattern = cs_export::model::Pattern::from_editable_json(&text).unwrap_or_else(|e| fail(&e));
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(threads())
        .build()
        .unwrap_or_else(|e| fail(&e.to_string()));
    let file = pool
        .install(|| {
            cs_export::export_reporting(&pattern, &request, &|completed, total, label| {
                note(serde_json::json!({ "exportProgress": { "completed": completed, "total": total, "label": label } }))
            })
        })
        .unwrap_or_else(|e| fail(&e));
    note(serde_json::json!({ "filename": file.filename }));
    write_stdout(&file.bytes);
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("generate") if args.len() == 5 => generate(&args),
        Some("export") if args.len() == 3 => export(&args),
        _ => {
            eprintln!("usage: cs-job generate <width> <height> '<options json>' | cs-job export '<request json>'");
            std::process::exit(2);
        }
    }
}
