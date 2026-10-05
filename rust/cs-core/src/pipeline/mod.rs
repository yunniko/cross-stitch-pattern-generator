//! The generation pipeline as stages (G-099, D293): what `build_pattern` was as one function, in the same order and
//! with the same arithmetic, so every chart it made it still makes (the golden hashes, D107).
//!
//! A stage is a function over one shared state, `Run`. `STAGES` is the pipeline: the order the stages run in, and the
//! fraction of the work reported as done after each. A stage reads what the stages before it left in the run and leaves
//! what the ones after it need; it records its own time under the names the timings have always had.
//!
//! - `prepare.rs`: the picture (the sliders, the overlays), the grid of stitches, and what the picture says about
//!   edges.
//! - `colours.rs`: which thread each stitch gets (a chosen set, Crisp's own stage or the quantizer; Vivid's reserved
//!   hues; the dither).
//! - `smooth.rs`: the passes that tidy the chart, the merge of near-identical threads, and Crisp's own repairs.
//! - `finish.rs`: the chart itself (its palette in order, names and symbols), the thread brand, the overlays' lines.
//!
//! **To add a step:** a function in the file it belongs to and a line in `STAGES`. A step that only some settings ask
//! for checks them itself and does nothing otherwise, as the Crisp stages do.

mod colours;
mod finish;
mod prepare;
mod smooth;

use crate::color::Rgb;
use crate::crisp::evidence::EvidenceLayer;
use crate::optimize::Ctx;
use crate::overlay::Laid;
use crate::pattern::{BuildOptions, EdgeMode, StageTimes, StitchPattern};
use crate::Image;

/// The wall time of each stage, under its name, in the order the stages ran.
pub(crate) struct Clock<'a> {
    now: &'a dyn Fn() -> f64,
    last: f64,
    times: &'a mut StageTimes,
}

impl Clock<'_> {
    /// Closes the stretch of work since the last call under `name`.
    pub(crate) fn lap(&mut self, name: &'static str) {
        let t = (self.now)();
        self.times.push((name, t - self.last));
        self.last = t;
    }
}

/// Everything one generation holds between its stages.
pub(crate) struct Run<'a> {
    pub options: &'a BuildOptions,
    /// The photo as it was decoded.
    source: &'a Image,
    /// The photo after the sliders; `None` when they are all centred, and the photo travels on untouched.
    pub adjusted: Option<Image>,
    /// What each overlay found, in the order they ran.
    pub laid: Vec<Laid>,
    pub gw: usize,
    pub gh: usize,
    /// Crisp edges are in force. A set of colours is matched with the standard edge handling: Crisp builds its own
    /// palette from the picture's edges (D277).
    pub crisp: bool,
    pub dithered: bool,
    /// The tidying passes run. Every one of them removes what dithering just created, so a dithered chart skips them
    /// (D199).
    pub smooth: bool,
    /// 1 where the photo is too transparent to stitch (G-050, D196); `None` for an opaque photo, which keeps it on
    /// exactly the path it had before.
    pub empty: Option<Vec<u8>>,
    pub opaque: Option<Vec<u8>>,
    /// The colour of every stitch as bytes, from the stage that makes them to the one that needs them in Oklab.
    pub cells: Vec<u8>,
    pub importance: Vec<f32>,
    pub pair_evidence: Vec<f32>,
    /// Crisp's frozen evidence; `None` in Standard.
    pub layer: Option<EvidenceLayer>,
    /// The colour of every stitch as the picture gives it, in Oklab.
    pub cell_oklab: Vec<f64>,
    /// The same, steadied for choosing threads; given up once the threads are chosen.
    pub denoised: Vec<f64>,
    /// The thread of every stitch, as it stands, and the threads.
    pub labels: Vec<u8>,
    pub palette: Vec<Rgb>,
    /// Crisp+ moved stitches: the colours its last stage reads, with the moved ones at their new thread's colour.
    pub finalize_oklab: Option<Vec<f64>>,
    pub pattern: Option<StitchPattern>,
}

impl<'a> Run<'a> {
    fn new(image: &'a Image, options: &'a BuildOptions) -> Self {
        let crisp = options.edge_mode != EdgeMode::Standard && options.palette_set.is_none();
        let dithered = options.dither.is_dithered();
        assert!(
            !(dithered && crisp),
            "Crisp preserves hard boundaries, which dithering deliberately blends: choose one (D199)"
        );
        Run {
            options,
            source: image,
            adjusted: None,
            laid: Vec::new(),
            gw: 0,
            gh: 0,
            crisp,
            dithered,
            smooth: options.optimize && !dithered,
            empty: None,
            opaque: None,
            cells: Vec::new(),
            importance: Vec::new(),
            pair_evidence: Vec::new(),
            layer: None,
            cell_oklab: Vec::new(),
            denoised: Vec::new(),
            labels: Vec::new(),
            palette: Vec::new(),
            finalize_oklab: None,
            pattern: None,
        }
    }

    /// The picture every stage reads: the photo, after the sliders, with what the overlays painted out of it. An
    /// adjusted photo *is* the photo, so structure is read from it too (G-074 M3).
    pub fn image(&self) -> &Image {
        self.laid
            .iter()
            .rev()
            .find_map(|laid| laid.picture.as_ref())
            .or(self.adjusted.as_ref())
            .unwrap_or(self.source)
    }

    /// What the tidying passes read of the run.
    pub fn ctx(&self) -> Ctx<'_> {
        Ctx {
            width: self.gw,
            height: self.gh,
            cell_oklab: &self.cell_oklab,
            importance: &self.importance,
            pair_evidence: &self.pair_evidence,
            evidence: self.layer.as_ref(),
            empty: self.empty.as_deref(),
        }
    }
}

struct Stage {
    run: fn(&mut Run, &mut Clock),
    /// The fraction of the work done once it has run, where the caller is told (`buildPattern`'s four points).
    progress: Option<f64>,
}

const fn stage(run: fn(&mut Run, &mut Clock)) -> Stage {
    Stage {
        run,
        progress: None,
    }
}

const fn stage_then(run: fn(&mut Run, &mut Clock), progress: f64) -> Stage {
    Stage {
        run,
        progress: Some(progress),
    }
}

/// The pipeline, in order.
const STAGES: &[Stage] = &[
    stage(prepare::adjust),
    stage_then(prepare::overlays, 0.1),
    stage(prepare::downsample),
    stage(prepare::importance),
    stage(prepare::pair_evidence),
    stage(prepare::crisp_evidence),
    stage(prepare::denoise),
    stage_then(colours::choose_threads, 0.4),
    stage_then(smooth::tidy, 0.8),
    stage(smooth::merge),
    stage(smooth::crisp_plus),
    stage(finish::chart),
    stage(finish::thread_brand),
    stage_then(finish::lay_overlays, 1.0),
];

pub(crate) fn run(
    image: &Image,
    options: &BuildOptions,
    times: &mut StageTimes,
    now: &dyn Fn() -> f64,
    on_progress: &dyn Fn(f64),
) -> StitchPattern {
    let mut clock = Clock {
        now,
        last: now(),
        times,
    };
    let mut run = Run::new(image, options);
    for stage in STAGES {
        (stage.run)(&mut run, &mut clock);
        if let Some(fraction) = stage.progress {
            on_progress(fraction);
        }
    }
    run.pattern
        .expect("the chart stage leaves a chart in the run")
}
