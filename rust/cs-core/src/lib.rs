//! The cross-stitch generation pipeline (G-048), the only one since G-068. It was ported from a TypeScript pipeline byte
//! for byte, and that output is pinned by the golden hashes (D107); see D182.
//!
//! "The TypeScript" in a comment here means that original, deleted in G-068: where a comment says an order, a tie-break
//! or a sum follows it, that is what the golden hashes still hold this code to.

// Loops, comparisons and bounds keep the shape of the original line for line, which is what kept the port checkable
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
pub mod downsample;
pub mod edge_map;
mod fdlibm;
#[cfg(feature = "json")]
pub mod hue_reserve;
pub mod jsmath;
pub mod json;
pub mod lines;
pub mod names;
pub mod optimize;
pub mod overlay;
pub mod pair_evidence;
pub mod palette_merge;
pub mod pattern;
pub mod photo_adjust;
mod pipeline;
pub mod predict;
pub mod prng;
pub mod quantize;
pub mod ridges;
pub mod settings;
pub mod stitch_fit;
pub mod texture;
pub mod threads;

/// An RGBA image, row-major, 4 bytes per pixel (the `PixelBuffer` shape).
/// The "no stitch here" cell value, as `lib/types.ts` defines it: never a palette index (G-050, D143).
pub const EMPTY_CELL: u8 = 255;

pub struct Image {
    pub width: usize,
    pub height: usize,
    pub data: Vec<u8>,
}
