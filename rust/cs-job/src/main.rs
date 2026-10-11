//! The processor's Rust sidecar (G-048 M6): one generation or one export per process, spoken to over pipes.
//!
//!   cs-job generate <width> <height>    # options JSON, a newline, then RGBA pixels on stdin; pattern JSON on stdout
//!   cs-job export                       # the request JSON, a newline, then an editable save on stdin; the file's bytes
//!                                       # on stdout
//!   cs-job predict <width> <height>     # options JSON, a newline, then RGBA pixels on stdin; the predicted colours
//!                                       # (and the coverage of a set) on stdout
//!
//!   cs-job dither-preview               # the request JSON on stdin; a dither pattern's preview as a PNG on stdout (G-100)
//!
//! Every request comes on stdin, never the command line: a generation's carries the thread systems it may use (G-132,
//! D400), up to thousands of threads, and an export's an author name, either more than a command line may hold (D407).
//!
//! stderr carries one JSON object per line, never the payload: `{"progress":0.4}` as `buildPattern`'s `onProgress`
//! reports it, `{"exportProgress":{"completed":12,"total":180,"label":"Page 12 of 180"}}` as `runExportJob` does,
//! `{"filename":"chart.pdf"}` before an export's bytes, and `{"error":"…"}` before a non-zero exit.
//! Anything else on stderr (a panic) the parent logs and does not show, reporting a generic failure (D407).
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

/// A generation's or a prediction's stdin: the options as one line of JSON, then exactly `width * height * 4` bytes of RGBA.
fn read_options_and_pixels(width: usize, height: usize) -> (String, Vec<u8>) {
    let input = read_stdin();
    let Some(newline) = input.iter().position(|&b| b == b'\n') else {
        fail("stdin must start with the options and a newline");
    };
    let options = String::from_utf8(input[..newline].to_vec())
        .unwrap_or_else(|e| fail(&format!("the options are not UTF-8: {e}")));
    let data = input[newline + 1..].to_vec();
    if data.len() != width * height * 4 {
        fail(&format!(
            "expected {} bytes of RGBA, got {}",
            width * height * 4,
            data.len()
        ));
    }
    (options, data)
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
    let (options, data) = read_options_and_pixels(width, height);
    let (options, _) = parse_options(&options).unwrap_or_else(|e| fail(&e));
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

/// The predicted colour count and colours of a picture, and how well a set covers it (G-087).
fn predict(args: &[String]) {
    let width: usize = args[2]
        .parse()
        .unwrap_or_else(|_| fail("width must be a number"));
    let height: usize = args[3]
        .parse()
        .unwrap_or_else(|_| fail("height must be a number"));
    let (options, data) = read_options_and_pixels(width, height);
    let (options, set) =
        cs_core::json::parse_predict_options(&options).unwrap_or_else(|e| fail(&e));
    let image = Image {
        width,
        height,
        data,
    };
    let prediction = cs_core::predict::predict(&image, &options);
    let mut out = cs_core::json::prediction_json(&prediction);
    if let Some(set) = set {
        out["coverage"] =
            cs_core::json::coverage_json(&cs_core::predict::coverage(&image, &options, &set));
    }
    write_stdout(out.to_string().as_bytes());
}

fn export() {
    let input = String::from_utf8(read_stdin())
        .unwrap_or_else(|e| fail(&format!("stdin is not UTF-8: {e}")));
    let Some((request, text)) = input.split_once('\n') else {
        fail("stdin must start with the request and a newline");
    };
    let request = cs_export::model::Request::from_json(request).unwrap_or_else(|e| fail(&e));
    let pattern = cs_export::model::Pattern::from_editable_json(text).unwrap_or_else(|e| fail(&e));
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

/// A dither pattern's preview for the photo pane (G-100, D327): `ditherMode`, the pattern's own settings and the
/// chart's size, as `parse_dither_preview` reads them; the 56 × 56 corner as a two-tone PNG.
fn dither_preview() {
    use cs_core::dither::preview::{ramp_window, DARK, LIGHT, WINDOW};
    let request = String::from_utf8(read_stdin())
        .unwrap_or_else(|e| fail(&format!("the request is not UTF-8: {e}")));
    let (pattern, width, height) =
        cs_core::json::parse_dither_preview(&request).unwrap_or_else(|e| fail(&e));
    let picture = ramp_window(pattern.as_deref(), width, height, WINDOW, WINDOW);
    write_stdout(&cs_export::png::encode_labels(
        &picture.labels,
        picture.width as u32,
        picture.height as u32,
        [DARK, LIGHT],
    ));
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("generate") if args.len() == 4 => generate(&args),
        Some("predict") if args.len() == 4 => predict(&args),
        Some("export") if args.len() == 2 => export(),
        Some("dither-preview") if args.len() == 2 => dither_preview(),
        _ => {
            eprintln!("usage: cs-job generate|predict <width> <height> | cs-job export | cs-job dither-preview (requests on stdin)");
            std::process::exit(2);
        }
    }
}
