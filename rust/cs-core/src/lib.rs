//! The cross-stitch generation pipeline in Rust (G-048). The exact tier reproduces the TypeScript pipeline byte for
//! byte (D107 golden hashes); every module names the TypeScript file it ports. See D182.

// Loops, comparisons and bounds mirror the TypeScript line for line, which is what makes the port checkable against it
// (a clamp or range rewrite would also change NaN behaviour).
#![allow(
    clippy::needless_range_loop,
    clippy::int_plus_one,
    clippy::manual_range_contains,
    clippy::neg_cmp_op_on_partial_ord,
    clippy::manual_clamp,
    clippy::type_complexity,
    clippy::too_many_arguments
)]

pub mod color;
pub mod crisp;
pub mod denoise;
pub mod dither;
pub mod dither_hand_drawn;
pub mod downsample;
pub mod edge_map;
pub mod enhance;
mod fdlibm;
pub mod jsmath;
#[cfg(feature = "json")]
pub mod hue_reserve;
pub mod json;
pub mod names;
pub mod optimize;
pub mod pair_evidence;
pub mod palette_merge;
pub mod pattern;
pub mod photo_adjust;
pub mod prng;
pub mod quantize;
pub mod threads;

/// An RGBA image, row-major, 4 bytes per pixel (the `PixelBuffer` shape).
/// The "no stitch here" cell value, as `lib/types.ts` defines it: never a palette index (G-050, D143).
pub const EMPTY_CELL: u8 = 255;

pub struct Image {
    pub width: usize,
    pub height: usize,
    pub data: Vec<u8>,
}
