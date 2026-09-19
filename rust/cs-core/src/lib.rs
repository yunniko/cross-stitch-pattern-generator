//! The cross-stitch generation pipeline in Rust (G-048). The exact tier reproduces the TypeScript pipeline byte for
//! byte (D107 golden hashes); every module names the TypeScript file it ports. See D182.

// Index loops mirror the TypeScript line for line, which is what makes the port checkable against it.
#![allow(clippy::needless_range_loop)]

pub mod color;
pub mod denoise;
pub mod downsample;
pub mod edge_map;
pub mod jsmath;
pub mod names;
pub mod optimize;
pub mod pair_evidence;
pub mod palette_merge;
pub mod pattern;
pub mod prng;
pub mod quantize;

/// An RGBA image, row-major, 4 bytes per pixel (the `PixelBuffer` shape).
pub struct Image {
    pub width: usize,
    pub height: usize,
    pub data: Vec<u8>,
}
