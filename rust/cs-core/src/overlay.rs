//! What is laid over the stitches (G-099, D294): backstitch found in the picture before the stitches are made.
//!
//! An overlay looks at the picture and may return lines to stitch over the chart, each in a thread of its own colour, and
//! may hand back the picture with what it found painted out, so that the stitches underneath take the colour beside it.
//! Overlays run in the order of `OVERLAYS`, each on the picture the ones before it left, before anything else reads the
//! picture; their lines are put on the finished chart in the same order.
//!
//! **To add one:** a module with a type that implements `Overlay` and a `configure` that reads its own settings, and one
//! line in `OVERLAYS`. The traced lines (`lines.rs`) and the texture strokes (`texture.rs`) are the two there are.

use crate::color::Rgb;
use crate::settings::Settings;
use crate::stitch_fit::Segment;
use crate::Image;
use std::fmt::Debug;
use std::sync::Arc;

/// What one overlay found.
pub struct Laid {
    pub segments: Vec<Segment>,
    /// The colour of each thread the segments are stitched in; `Segment::thread` indexes it.
    pub colors: Vec<Rgb>,
    /// The picture with what was found painted out of it, when the overlay takes it out of the stitches.
    pub picture: Option<Image>,
}

pub trait Overlay: Debug + Send + Sync {
    /// Its name in the stage timings.
    fn name(&self) -> &'static str;
    /// Looks at `image`, a picture to be a chart of `gw` by `gh` stitches. `None` when it finds nothing worth laying.
    fn lay(&self, image: &Image, gw: usize, gh: usize) -> Option<Laid>;
}

/// Reads an overlay's own settings and returns it ready to run, or `None` when the settings do not ask for it. It takes
/// every setting it knows whether or not it is asked for, so none of them is left to be refused as unknown.
pub type Configure = fn(&mut Settings) -> Result<Option<Arc<dyn Overlay>>, String>;

/// Every overlay, in the order they run.
pub const OVERLAYS: &[Configure] = &[crate::lines::configure, crate::texture::configure];

/// The overlays the settings ask for, in the order they run.
pub fn configure(settings: &mut Settings) -> Result<Vec<Arc<dyn Overlay>>, String> {
    let mut chosen = Vec::new();
    for configure in OVERLAYS {
        if let Some(overlay) = configure(settings)? {
            chosen.push(overlay);
        }
    }
    Ok(chosen)
}
