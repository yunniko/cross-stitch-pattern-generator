//! G-048: generation as a WebAssembly module, for timing against native and TypeScript (single-threaded: rayon runs
//! on the calling thread). A raw ABI, no bindings generator:
//!
//! - `alloc(len)` / `dealloc(ptr, len)`: memory for the RGBA pixels and the options JSON;
//! - `generate(pixels, width, height, options, options_len)`: builds the pattern and returns a pointer to its JSON
//!   (`{ pattern, runs }`), whose length `result_len()` reports; free it with `dealloc`.
//!
//! The host provides `env.now_ms()`, a millisecond clock for the stage times.

#![cfg(target_arch = "wasm32")]

use cs_core::json::{parse_options, pattern_json, run_json};
use cs_core::pattern::{build_pattern, StageTimes};
use cs_core::Image;
use serde_json::json;

#[link(wasm_import_module = "env")]
extern "C" {
    fn now_ms() -> f64;
}

static mut RESULT_LEN: usize = 0;

#[no_mangle]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut buffer = Vec::<u8>::with_capacity(len);
    let ptr = buffer.as_mut_ptr();
    std::mem::forget(buffer);
    ptr
}

/// # Safety
/// `ptr` must come from `alloc(len)` or be a result pointer with `len = result_len()`.
#[no_mangle]
pub unsafe extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    drop(Vec::from_raw_parts(ptr, 0, len));
}

#[no_mangle]
pub extern "C" fn result_len() -> usize {
    unsafe { RESULT_LEN }
}

/// # Safety
/// `pixels` must hold `width * height * 4` bytes and `options` `options_len` bytes of UTF-8, both from `alloc`.
#[no_mangle]
pub unsafe extern "C" fn generate(
    pixels: *mut u8,
    width: usize,
    height: usize,
    options: *const u8,
    options_len: usize,
) -> *mut u8 {
    let len = width * height * 4;
    let data = Vec::from_raw_parts(pixels, len, len);
    let text = std::str::from_utf8(std::slice::from_raw_parts(options, options_len)).unwrap_or("");
    let out = match parse_options(text) {
        Ok((build, _threads)) => {
            let image = Image {
                width,
                height,
                data,
            };
            let now = || unsafe { now_ms() };
            let mut times: StageTimes = Vec::new();
            let start = now();
            let p = build_pattern(&image, &build, &mut times, &now);
            let run = run_json(now() - start, &times);
            std::mem::forget(image.data);
            json!({ "pattern": pattern_json(&p), "runs": [run] })
        }
        Err(e) => {
            std::mem::forget(data);
            json!({ "error": e })
        }
    };
    let mut bytes = out.to_string().into_bytes();
    bytes.shrink_to_fit();
    RESULT_LEN = bytes.len();
    let ptr = bytes.as_mut_ptr();
    std::mem::forget(bytes);
    ptr
}
