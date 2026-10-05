//! What a generation is asked for and what it returns: the options, the chart, and `build_pattern`. Port of
//! `buildPattern` (`lib/pipeline/pattern.ts`): every edge mode, both quantizers, thread brands and the four photo
//! sliders. The work itself is the stages in `pipeline/` (G-099). Contour refinement (experimental, off by default)
//! and custom quantizers are not ported, and the five enhancement modes were removed with G-074 M4 (D240).

use crate::color::Rgb;
use crate::dither::DitherMode;
use crate::dither_hand_drawn::DitherTexture;
use crate::overlay::Overlay;
use crate::photo_adjust::PhotoAdjust;
use crate::quantize::Quantizer;
use crate::settings::Settings;
use crate::threads::Brand;
use crate::Image;
use std::sync::Arc;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum EdgeMode {
    Standard,
    Crisp,
    CrispPlus,
}

impl EdgeMode {
    pub fn id(self) -> &'static str {
        match self {
            EdgeMode::Standard => "standard",
            EdgeMode::Crisp => "crisp",
            EdgeMode::CrispPlus => "crisp-plus",
        }
    }

    /// The edge handling the settings ask for (`edgeMode`); standard when they do not say.
    pub fn from_settings(settings: &mut Settings) -> Result<Self, String> {
        match settings.text("edgeMode")?.as_deref() {
            None | Some("standard") => Ok(EdgeMode::Standard),
            Some("crisp") => Ok(EdgeMode::Crisp),
            Some("crisp-plus") => Ok(EdgeMode::CrispPlus),
            Some(other) => Err(format!("unknown edgeMode {other}")),
        }
    }
}

#[derive(Clone, Debug)]
pub struct BuildOptions {
    pub longer_side_stitches: f64,
    pub color_count: usize,
    pub quantizer: Quantizer,
    pub optimize: bool,
    pub edge_mode: EdgeMode,
    /// `None` is the full palette.
    pub brand: Option<Brand>,
    /// Dithering (G-052); `Off` is the pipeline as it was. Refused with Crisp, whose purpose is the opposite (D199).
    pub dither: DitherMode,
    /// What a drawn pattern is made of (G-055); ignored by every other pattern.
    pub dither_texture: DitherTexture,
    /// Vivid (G-061): a stitch keeps its area-mean lightness and the chroma of its most colourful part.
    pub vivid: bool,
    /// The four photo sliders (G-074). Neutral leaves the photo exactly as it was decoded.
    pub photo_adjust: PhotoAdjust,
    /// What is laid over the stitches, in the order it runs (`overlay.rs`): the traced lines (G-084) and the texture
    /// strokes (G-085), each only when the settings ask for it.
    pub overlays: Vec<Arc<dyn Overlay>>,
    /// A set of colours the chart is made from instead of colours the quantiser finds (G-087, D277).
    pub palette_set: Option<PaletteSet>,
}

/// A colour of a set the user chose: its colour, and in a thread brand its code and label.
#[derive(Clone, Debug)]
pub struct SetColor {
    pub rgb: Rgb,
    pub code: Option<String>,
    /// The name the chart shows: "code - name" in a brand, empty for a custom colour (which is named from its colour).
    pub label: String,
}

/// The colours a chart is made from when the user sets up the palette (G-087). The chart has these threads and no others;
/// the colour count is their number. In a thread brand each has a code; in the full colour mode they are custom colours.
#[derive(Clone, Debug)]
pub struct PaletteSet {
    pub brand: Option<Brand>,
    pub colors: Vec<SetColor>,
}

#[derive(Clone, Debug)]
pub struct PaletteColor {
    pub index: usize,
    pub rgb: Rgb,
    pub symbol: String,
    pub name: String,
    pub count: usize,
    /// `ThreadSwatchRef`: the thread this colour was snapped to, absent for a custom colour. The editor reopens a
    /// colour on this swatch (D122), so it has to survive the trip out of generation.
    pub source: Option<ThreadSource>,
}

/// `ThreadSwatchRef`: a brand and that brand's own code.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ThreadSource {
    pub brand: &'static str,
    pub code: String,
}

#[derive(Clone, Debug)]
pub struct StitchPattern {
    pub width: usize,
    pub height: usize,
    pub cell_palette: Vec<u8>,
    pub palette: Vec<PaletteColor>,
    pub is_landscape: bool,
    pub thread_brand: Option<&'static str>,
    pub edge_mode: Option<&'static str>,
    /// The dither pattern the chart was generated with (G-052); `None` means none.
    pub dither_mode: Option<&'static str>,
    /// What the drawn marks were made of (G-055); `None` for every other pattern and for the default texture.
    pub dither_texture: Option<DitherTexture>,
    /// Generated with Vivid (G-061); `None` means the stitches are plain area means.
    pub vivid: Option<bool>,
    /// The sliders the chart was generated with (G-074); `None` when they were all centred.
    pub photo_adjust: Option<PhotoAdjust>,
    /// Backstitch traced from the picture (G-084); empty for every chart made without it.
    pub backstitch: Vec<BackstitchLine>,
}

/// `BackstitchLine`: a straight line between two grid corners in the thread `palette_index`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BackstitchLine {
    pub x1: i32,
    pub y1: i32,
    pub x2: i32,
    pub y2: i32,
    pub palette_index: usize,
}

/// Wall time per stage, in milliseconds, in pipeline order.
pub type StageTimes = Vec<(&'static str, f64)>;

/// `now` returns milliseconds from any fixed origin; it times the stages into `times` (WASM has no `Instant`).
pub fn build_pattern(
    image: &Image,
    options: &BuildOptions,
    times: &mut StageTimes,
    now: &dyn Fn() -> f64,
) -> StitchPattern {
    build_pattern_reporting(image, options, times, now, &|_| {})
}

/// `build_pattern` with `buildPattern`'s `onProgress`: the same four fractions at the same four points, for a caller
/// that shows progress (the processor's sidecar).
pub fn build_pattern_reporting(
    image: &Image,
    options: &BuildOptions,
    times: &mut StageTimes,
    now: &dyn Fn() -> f64,
    on_progress: &dyn Fn(f64),
) -> StitchPattern {
    crate::pipeline::run(image, options, times, now, on_progress)
}
