# Handover — cross-stitch-pattern-generator

Last verified: 2026-09-25 at 1437439 (G-073 complete, M1-M6 plus the split thread lights; deployed and exercised live)

Photo → editable, printable cross-stitch chart. Decoding, generation and every export but the editable save run on the server. A
standalone Owner project (not svc-lab, no monetization), live at
<https://cross-stitch.craftodejnice.cz>. Goals are in `GOALS.md`, completed
goals in `docs/goals-archive.md`, and company rules in `E:\CLAUDE\COMPANY\`.

## Current state

**Production** runs 36bc22a (2026-09-25), the last deployed commit: the 1b shell with the Owner's corrections, and generation, the enhancement preview and every export but the editable save running in the `processor` container. The work itself is in the Rust sidecar and **nothing stands behind it** — the TypeScript pipeline is deleted, not disabled (D221). Verified on this build by generating, enhancing, exporting a PDF and reloading in a browser.
Every signed-off goal, with what it produced and how it was verified, is in `docs/goals-archive.md` — G-028 onwards, from the OXS format to the Atelier redesign (D157–D167), the move to the server (D149–D155) and the Rust port.

**G-048, generation and exports in Rust — signed off 2026-09-20, archived.** `rust/` holds all generation and every
export, plus a WASM build (D182–D193, and `docs/reviews/2026-09-20-rust-comparison-report.md`). Since G-068 M2 it is the only engine: nothing falls back to TypeScript, and the recorded golden hashes are checked against the binary by `npm run test:goldens:rust` (D221).

**What works** (verified in this session unless marked otherwise):
- Generation from a photo at 10–1500 stitches (D181) and 2–100 colors, with Refined or Classic clustering (stored as
  `latest`/`original`), Full range, DMC, Cosmo or Anchor palettes, and Standard, Crisp or Crisp+ edges — on the
  processor, with progress, a queue position and cancellation. A chart can also start blank: every stitch empty and no
  photo, so Generate and the photo settings stay away for its whole life (G-040, D143).
- Editing: brush (double-click fills a region as one undo step when the Chart pane's switch is on, D138, D146),
- Drawing tools (G-064): two colours in `lib/editor/color-slots.ts` — two squares in the bar that never move, a left press painting with the front one, a right press with the one behind, a right click on a thread row loading the square behind, `X` swapping them; right clicks are claimed on the chart and the thread rows only. The brush covers a stamp rather than a stitch (`lib/editor/brush-stamp.ts`, odd sizes 1–15, block or disc, size 1 being one stitch as before). Line, Rectangle and Oval (`L`, `R`, `O`) drag from one stitch to another through one gesture (D214) whose rasterisers live in `lib/editor/shape-raster.ts`; an outline is the brush walked along the spine and a filled shape is exactly the shape (D215). Symmetry mirrors every stamped cell, not the stamp's centre; a shape is one undo step, previews without accumulating, and `Escape` or another tool drops it.
- Lasso tools (G-072): `lib/editor/lasso.ts` turns a freehand path into the cells it encloses by an even-odd
  scanline fill, so crossing the path carves a hole; the path as drawn is always included. **Lasso** (Q) lifts
  that shape as a floating piece, **Lasso fill** (G) paints it in one undo step with symmetry. Both smooth the
  drawn path with two passes of Chaikin corner cutting, closing the loop as a curve (D226); paths under 8 points
  are left alone. The preview draws the smoothed shape, and a fill outlines in the thread it will lay down.
- A throw in the editor lands on a crash screen that names the failure and downloads a report — error, stack, commit, view, tool, brush, zoom and the chart as an editable save, without the photo (G-066, D218). Verified against a reintroduced D217, the class of crash that motivated it.
- The cursor carries an outline of what a press would cover (G-065): the brush's own shape, one anchor stitch for a filled shape, on a second canvas over the chart's (D216) so a pointer move never repaints the chart. `stampOutline` in `lib/editor/brush-stamp.ts` gives a stamp's boundary edges.
- With a piece in hand, undo and redo are refused from keyboard and bar alike (G-063): stepping through history underneath a floating selection is a state nobody asked for. Apply or Cancel first.
- The start screen owns the context bar while it is up: Select's bar yields to it (`activeTool === "select" && pattern && !startingNew`), because Select's bar carries no way back and the tool rail is disabled there (Owner, 2026-09-23). The selection itself survives the trip, so Back returns to the piece still floating.
  8-connected fill, symmetry on four axes and quick mirror (D137), rectangle select with copy, paste, move, flip,
  rotate, crop, "Apply here" and "Cancel" (D147, D148), pan, zoom; Isolate dims every thread but the lit ones and stays
  on under another tool (D158); merge, recolor, rename, re-symbol, add colour, empty stitches, resize, one undo history.
- Colour editor: opens under its legend row on the colour's remembered thread swatch (D122), with an Okhsl comparison on hover or focus (D123); Full range drags are one undo step, Cancel or Escape restores.
- Zoom keeps the stitch under the cursor in place, the buttons the view's centre (D124); five view modes (keys 1–5), zoom from 25% to 800% (raised from 400% on 2026-09-23; measured to cost nothing, because the canvas paints the view rather than the chart), where every press changes the cell size — levels that would round to the pixels already on screen are skipped, and at either end the readout stays put rather than drifting from what is drawn, a view-only canvas colour, shortcuts Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Space-drag, B, F, L, R, O, X, and — with a selection in hand — Enter to apply it and Escape to cancel it (G-063; Escape merged before).
- Exports: editable JSON (format version 7, embeds the source photo and each color's thread swatch), realistic preview
  PNG, Color and B&W full-chart PNG, A4 page ZIPs, Pattern Keeper PDF, an OXS chart, a pixel-art PNG at 1 px per stitch
  (D195), "Export all" `.cspzip`. Open accepts JSON, ZIP, `.cspzip` and `.oxs` by content; OXS lists what it couldn't keep.
- A transparent background generates as empty stitches (G-050, D196): a cell covered less than half takes no colour, and every stage reads covered pixels only.
- Pixel art in and out (G-049): the start screen's fourth card opens an image as a chart, one pixel per stitch,
  nothing resampled; too large, too colourful or partly transparent is refused with the numbers, under 10 stitches is centred in a chart of the minimum (D194), and the pixel-art PNG writes the image back.
- Dithering (G-052 to G-059): the Dither control offers screens (clustered dots, rings, lines in four directions),
  scattered matrices (Bayer 4×4/8×8, blue noise), two error-diffusion kernels (Floyd–Steinberg, Atkinson) and
  Hand-drawn, which scatters drawn marks instead of repeating a tile (D201, D202). Off is byte-identical to before; a
  dithered chart runs no smoothing pass and refuses Crisp (D199). A matrix is data (D198), a kernel a row of taps
  (D200), the drawn marks an editable texture with a painted-mark grid (D203–D205, D207). A preview of the chart's
  own corner is shown for every pattern (D206, D208). Measured in
  `docs/reviews/2026-09-21-dithering-comparison.md`: kernels lowest error (median 0.44–0.51×) and never worse,
  screens and drawn marks cheapest (+3.3 to +4.3 points), matrices between.
- **Color detail — Averaged or Vivid** (G-061/G-062, D211, D212), off by default and byte-identical off. Two halves under one switch: a stitch keeps its area-mean lightness with the chroma of its most colourful quarter instead of averaging a small bright thing into a grey, and then every hue the cells hold that no thread speaks for takes a palette slot, paid for by merging the closest pair. It stands down below 24 source pixels a stitch (at ~4 pixels a cell, noise alone produces more chroma, 0.127, than real sub-stitch colour does at 144–400, 0.03–0.04; ungated it cost 121× the error on `flat regions`), and Crisp keeps its own palette stage. Measured in `docs/reviews/2026-09-22-vivid.md`: a red that needed 64 colours arrives at 20, a blue that needed 32 at 8, a pink that never arrived at 16, for 1.01–1.07× the 3×3 error and −0.37 to +0.55 points of confetti; the flat-region control is untouched.
- **Backstitch** (G-073 M1–M3): straight lines over the stitches, corner to corner at a fifth of a cell. A line is drawn by dragging it or by clicking its two corners (K, D236); a press holding **Ctrl** (or Cmd) as it places the end carries the run on into the next line, which is the only way a chain continues (D231). One editing tool, **BS edit** (J): a press takes the line it lands on, wherever on it, and only a line already in hand has live ends, which then drag to re-aim it (D229). Copy, paste, duplicate, mirror both ways, turn both ways, recolour and delete act on the line in hand, each one undo step, and the selected line is drawn thicker. **Delete** (or Backspace) removes it from the keyboard; the key is claimed only while that tool is in hand. A **double-click takes the whole run** — every line joined to it end to end in the same thread — and a run then moves, mirrors, turns and deletes as one (D230). Symmetry mirrors a line as it does a stitch. A cell selection takes a line only when **both** ends are inside it, and then carries it through a move, a flip and a turn (D228). Saved as an additive optional field (D138) and traded with OXS in both directions. In the thread list it is a **second section under the crosses** (D232), listing the same palette entries that have lines, counted by length in cm rather than by number of lines; Isolate lights the two layers separately (D235) — the cross row's eye lights a thread's stitches, the backstitch row's lights its lines — and merging a thread carries its backstitch or, into the empty thread, deletes it. **Exports carry it** (M5): the chart PNGs and the A4 pages draw it at a fifth of a cell in the thread's colour, each thread told apart by one of five dash patterns with beads carrying its symbol on lines of five cells or more, and a hairline casing where a line crosses cells close to its own lightness (D233). The Pattern Keeper PDF keeps it **off its grid** and reports it as text only. The A4 legends split (D234): the simple one is a thread consumption table headed with the pattern's name, the extended one carries per-thread backstitch lengths and the chart's total.
- Photo upload and reopening a save decode in a worker, the old decode a logged fallback (D128).
- Persistence: the open project autosaves to IndexedDB (photo stored once by SHA-256, 500 ms debounce) and restores on
  reload; a corrupt record shows a banner with an on-demand error report. Options live in localStorage.
- Photo enhancement: Off, Brighten, Auto, Vivid, Portrait, with a "Compare with original" preview and recorded in
  saved files; only Brighten is released (`docs/reviews/2026-09-13-photo-enhancement-calibration.md`).

**Checks run 2026-09-25**: `tsc --noEmit` clean, `npm run lint` 0 errors, `prettier --check` clean, `docs-lint` ok; Vitest 797 passed; Playwright 411 passed across all 39 specs (2 pre-existing flakes in color-editor and shape-tools, green on retry), one spec per process against the single-path build, the processor serving generation, exports and previews, run with `CS_JOB_BINARY` set. **The e2e suite needs that variable and the app server needs `PROCESSOR_URL`** — without either, generation fails and every spec that opens a chart fails with it. Last full Rust pass 2026-09-22: 330 e2e against the sidecar, `npm run compare:rust`
81 cases identical; export parity in `docs/reviews/2026-09-17-export-parity.md`. CI runs `next typegen` before the
type-check and `build:processor` before the unit tests: the worker bundle is git-ignored and specs run against it.

**Performance** (G-035, medians of 5 on the Owner's machine; tables in `docs/reviews/2026-09-15-performance-results.md`):
a 12 MP photo at 100 stitches / 16 colors takes 2.9 s Standard and 7.5 s Crisp; at 1000 / 64, 4.9 s and 6.8 s; enhancing a
4000×3000 photo 1.9–2.2 s, above G-032's 1.5 s target. The server is ~3.4× slower per core (D149); live at 1000 stitches
the A4 export takes 62.1 s and the PDF 9.4–12.7 s, and host generation at 2000 is 20–37 s (D170, D175–D178).

**Known limitations**: Crisp takes about 2.6× Standard's time on a 12 MP photo (every cell gets the two-mode fit,
D132) and falls back to Standard for thin lines, junctions and shading (D096). At 1500 stitches chart actions stay
under 100 ms but Grid + photo (105 ms); 4× CPU throttling reached 480 ms (G-036). Generation and every export but the
editable save need the server, so they stop working offline (G-034). The PDF has no bold face; whether µ (which
extracts as μ) matters in Pattern Keeper is unconfirmed (D074, D097). Isolate does nothing in the realistic preview
(D028); contour refinement exists but isn't adopted (D055).

## How things fit together

- **Stack**: Next.js 16 App Router (`output: "standalone"`), React 19, TypeScript strict, Tailwind 4, Vitest 4,
  Playwright 1.62, Node 22. Runtime deps: pdf-lib with fontkit, jszip, react-colorful, color-name-list,
  @napi-rs/canvas (server decode and preview encoding, D150). Rust 1.96 for G-048's port only (D182).
- **UI shell** (direction 1b, D157): `app/page.tsx` renders `app/workspace.tsx`, which owns only undo history,
  cross-pane state and pointer dispatch (pan → move → select → brush). Behavior lives in `app/hooks/`: options,
  restore, source image, generation, pan/zoom, chart renderer, canvas tools, exports, shortcuts. The tool rail, the
  context and status bars and the inspector's Photo, Chart and Threads panes live in `app/components/`, with shared
  controls in `ui.tsx`; tool hooks reach the renderer through a ref assigned after render (D108). The chart frame takes
  layout, input and the zoom anchor; one canvas inside paints the visible part plus overscan (`app/chart-scene.ts`,
  D135, D136). Realistic and Original photo are view-only, where only Pan and Zoom act.
- **Generation path (G-034, D151)**: `app/hooks/use-generation.ts` → `lib/pipeline/pattern-server.ts` → the Route
  Handlers in `app/api/` → the `processor` container (`processor/server.ts`, its pool in `processor/pool.ts`, decoded
  photos in `processor/photo-store.ts`), which runs `buildPattern` in `processor/pool-worker.ts`, bundled by
  `scripts/build-processor.mjs`. The photo is uploaded once by `lib/pipeline/photo-upload.ts` and referred to by hash;
  `lib/pipeline/server-errors.ts` separates a busy server, an unreachable one and an expired photo, and
  `processor/validate-settings.ts` checks requests against the type unions. It is the only path (M5).
- **Preview path (server, G-034 M3, D152)**: `use-enhance-preview.ts` → `lib/pipeline/enhance-preview-server.ts` →
  `app/api/photos/[hash]/preview/route.ts` → its own worker (`processor/preview-{runner,worker}.ts`), cached as WebP.
- **Export path (server, G-034 M4, D153)**: `app/hooks/use-exports.ts` → `lib/export/export-server.ts` →
  `app/api/exports/route.ts` → the same pool as generation, inside D149's cap. The drawing asks
  `lib/export/canvas-backend.ts` for canvases, PNG encoding, images and the PDF font, which
  `processor/export-backend.ts` answers with `@napi-rs/canvas`; `processor/validate-export.ts` checks requests, and
  page progress and the file come back over the job routes.
- **Photo decode**: `lib/editor/load-image.ts` sends the file or data URL to `decode-image.worker.ts`;
  `decode-main-thread.ts` is the fallback, both sizing through `decode-bitmap.ts` (D128, reused by D150).
- **Pipeline order** in `buildPattern`: area-weighted linear-light downsample; Sobel importance and per-pair
  structure-tensor evidence (D044); one shared `PipelineContext` of cell OKLab (D106); importance-gated medoid
  pre-filter for the quantizer only (D041, D051); OKLab k-means, plain for Classic or merge-and-reinvest for Refined
  (D018, D039); dithering, when asked for, places each stitch between the two nearest threads here and stops
  (`lib/pipeline/dither.ts`, D198, D199); otherwise coarse then fine ICM on an 8-neighbour stencil, re-evaluating a cell only after a neighbour changes
  (D043, D045, D133); small-component recolor and diagonal-pinch fixes; palette merge, zero-count compaction and
  OKLab recompute; thread-brand snap with fine ICM re-run (D056), then dark-to-light sort, symbols and names.
- **Photo enhancement** (`lib/pipeline/enhance.ts`): a preset is analysed from the photo (white balance, levels and
  gamma, CLAHE, vibrance) then applied per pixel, once, inside `buildPattern`. Downsampling and Crisp's colour fits
  read the enhanced photo; importance and pair evidence read the original (D112). Off, or every stage abstaining,
  returns the input untouched (D118). `releasedEnhancementModes()` decides what the UI offers, while files may record
  any recognized mode (D113).
- **Crisp mode** (`lib/crisp/`): a frozen evidence layer (D065) feeds weighted quantization, admissible-label unary
  costs in ICM and cleanup, repair after merges, and mode-aware finalization (D061–D072); it evaluates every cell
  (D132). Crisp+ (G-038) adds blurred-step evidence (D139), strip snapping (D140), pruning (D141), refill (D142).
- **Threads** (`lib/threads/`): `thread-brands.ts` is the registry ("direct" matching for DMC and Cosmo, "dmc-equivalence" for Anchor); `brand-match.ts` snaps, provenance in `docs/*-colors-provenance.md`.
- **Export** (`lib/export/`): `render.ts` holds the chart layout budget and the realistic preview, streamed a strip at
  a time from `stitch-texture.ts`'s tiles (D173). A4 page drawing takes a `ChartDrawingContext`, so one code path draws
  PNG and PDF pages (`pdf-canvas-adapter.ts`, D074, D126). `export-jobs.ts` runs every export on the processor, through
  the canvases, assets and PNG writer (`processor/png-encode.ts`, D171) that `canvas-backend.ts` hands it (D125, D153).
  The editable JSON alone is written in the page by `use-exports.ts`, so work can be saved with the server unreachable.
- **Editor data** (`lib/editor/`): pure mutations in `pattern-edit.ts`, validating (de)serializer in
  `pattern-serialize.ts` (D099), IndexedDB store in `project-store.ts` (D100), options in `workspace-storage.ts`. OXS
  lives in `oxs.ts` on the XML reader `oxs-xml.ts` (D119); `pattern-import.ts` sniffs the format.
- **Experimental** (`lib/experimental/`): contour refinement, boundary chains, simulated annealing, diagnostics (status table in its README).
- **Rust in the processor (G-048)**: `processor/rust-jobs.ts` spawns `cs-job` per job — pixels or the editable save
  in, the file out, progress as JSON lines on stderr — and returns null on any failure, falling back to TypeScript
  (D193). The image builds it in its own `rust` stage; a missing binary fails the job rather than disabling it.
- **Rust port (G-048)**: `rust/cs-core` ports the pipeline module by module, each file naming the TypeScript it ports:
  `crisp/` holds Crisp and Crisp+, `threads.rs` brand matching, `enhance.rs` enhancement, `dither.rs` G-052's patterns,
  `jsmath.rs` and `fdlibm.rs` the V8-exact maths (D183, D184) pinned by `rust/cs-core/tests/jsmath_vectors.rs`.
  `rust/cs-export` ports every export: `text.rs`/`canvas.rs` draw DejaVu text as the processor's canvas does (D187),
  `pdf.rs` pdf-lib's structure (D189), `bundle.rs` JSZip's ZIPs. `rust/cs-bench` is the CLI behind `npm run compare:rust`.
- **Tests**: four layers (D222). Unit specs in `tests/unit/` cover the browser and the editor. The generation
  pipeline is covered by `scripts/rust-goldens.ts` (38 recorded hashes, D107), `rust/cs-core/tests/
  pattern_invariants.rs` (what must hold of *any* chart), `scripts/rust-enhancement-gates.ts` (D118's release
  gates) and `scripts/rust-enhance-parity.ts` (the shipped preview against the binary). All four need
  `cargo build --release` first and run under `vitest.rust.config.ts`. E2E specs are in `tests/e2e/`;
  `npm run test:e2e` starts the processor and the app together, since the page needs both.
  `compare:export-parity` diffs two running builds.
- **Deploy**: `Dockerfile` builds two targets (`runtime`, `processor`) and `docker-compose.yml` runs both under
  D149's caps (app on `127.0.0.1:30150`; the processor publishes no port). Recipe and shared-host rules:
  `COMPANY/INFRASTRUCTURE_DEPLOY.md`; verification per D027.

(Backstitch is corners rather than cells, so it has its own geometry module: `lib/editor/backstitch.ts` holds hit-testing, the transforms, the symmetry orbit and the both-ends rule, with no React and no canvas in it. `app/hooks/use-canvas-tools.ts` has the two hooks that drive it and `app/editor-geometry.ts` draws it.
Every *export* of it is Rust: `rust/cs-export/src/backstitch.rs` for the dash and bead rules,
`draw_backstitch` in `render.rs` for the drawing, called by the chart PNG and by `a4::draw_grid_page` —
which the Pattern Keeper PDF shares and calls with backstitch switched off.)

## Rules in force

- **The autosave record is assembled field by field** (`encodeRecord` in `lib/editor/project-store.ts`), so a new field on `StitchPattern` is silently dropped from it until someone names it there — the editable save carries the whole object and hides the gap. Backstitch was lost this way, found on the live build and fixed on 2026-09-25; `tests/unit/project-store.spec.ts` and a reload in `backstitch-edit.spec.ts` now hold it.
- **Backstitch is corners, not cells.** A line's ends run `0..width` and `0..height` **inclusive**, and its arithmetic differs from the cells' by one: a cell mirrors to `width - 1 - cx`, the corner bounding it to `width - x` (D228). Anything that rearranges a floating piece supplies both transforms to `withShape`.
- **A line has no partial form** and is never cut at a boundary. A resize, a crop or a drag that would put an end outside the chart drops or refuses the whole line (`clipLines`), and a cell selection takes one only when **both** ends are inside it (D228).
- **The dash table exists twice** — `lib/editor/backstitch-style.ts` for the screen and `rust/cs-export/src/backstitch.rs` for every export — and `scripts/rust-backstitch-style.ts` compares them through the real binary. Change one alone and it fails (D233).
- **Export-time palette compaction drops threads with no stitches**, which is every backstitch-only thread (`compact_unused_colors`). It keeps them for backstitch and renumbers the lines; before G-073 M5 a chart exported in the wrong colours or lost its lines entirely.
- **A palette entry is shared by both sections of the thread list** (D232), so anything that removes one must renumber `backstitch` too — `mergeColors` does, and a line left pointing at a thread that has gone is a corrupt chart rather than a wrong-looking one.
- **Activating a thread row toggles it.** Anything driving the list reads `data-active` first; picking the same thread twice puts it down again and leaves the tool with nothing to draw with.
- **A backstitch run keeps its shape.** A drag carries a set of lines, so a frame is all-or-nothing: one line of the run falling off the chart declines the whole frame rather than clipping that line away (D230).
- **A backstitch press is hit-tested where the pointer is, not where its corner snaps to** (D229). `preciseCornerFromEvent` decides what a press grabs; `cornerFromEvent` decides only where a drag *puts* an end. Snapping first makes every endpoint claim the half-cell around it whatever the end zone says, and leaves a one-cell line with no body to press.
- A floating selection may be a shape, not just a box (D225). Anything that rearranges a piece moves `cells`
  and `mask` together — use `withShape` — and leaves `originMask` alone, because that describes the hole left
  behind and does not turn with the piece. Code that reads `cells` directly must ask the mask first.

- `.cargo/config.toml` belongs at the **repository root**, not in `rust/` (D224). Cargo reads config upwards from
  the working directory, and CI, the Dockerfile and the local scripts all build from the root with
  `--manifest-path rust/Cargo.toml` — moved into `rust/` it is silently ignored by all three and the 6.6%
  goes away with no error. Building needs a ~2013 CPU or later; below `x86-64-v3` the binary faults.

- The Owner gave standing push and deploy approval on 2026-09-13: deploy verified work without asking, unless
  something needs the Owner's attention. Deploys still follow `COMPANY/INFRASTRUCTURE_DEPLOY.md`.
- One session per working tree. Never force-kill node processes you did not start: find the owner of the port you actually need and check its start time first. A rule naming a fixed PID goes stale within days and PIDs are recycled -- the number this rule used to carry (17476, 2026-09-12) was long gone by 2026-09-18 and only caused a later session to believe it had killed someone else's server.
- A goal isn't DONE with a dirty tree, placeholders, or no logged Owner sign-off (OPERATIONS.md §5, D098).
- E2E runs against a production build on port 30200 (D102); locally an existing server is reused, so stop it after code changes — **and never leave a hand-started one behind**: one without `PROCESSOR_URL` was reused on 2026-09-25 and failed all 16 specs of a run with "Couldn't generate a pattern".
- Speed-ups must leave `tests/unit/fixtures/golden-hashes.json` unchanged. `GOLDEN_RECORD=1` adds a hash for a
  *new* case and refuses to overwrite an existing one, so an intended output change means editing the file by
  hand with a decision file (D107, D222).
- Omitting `edgeMode`, `contourRefinement`, a brand or `enhancementMode` (or passing Off) must reproduce Standard output byte-for-byte.
- Which enhancement modes are offered is the Owner's decision, made in `releasedEnhancementModes()` (D118).
  A mode is released only once `scripts/rust-enhancement-gates.ts` passes it: do-no-harm, noise and thread
  palette are gated, recovery is reported and not gated (D115). All four released modes pass; the thinnest
  margin is do-no-harm on the landscape fixture at 0.919 against a gate of 0.90.
- Brighten must never white-balance, add local contrast or saturate, and must leave a photo with both deep shadows and highlights untouched (D118).
- Enhancement calibration photos stay outside the repository; two show identifiable people.
- **The TypeScript pipeline is gone** (G-068 M3): generation, crisp edges, quantisation, denoise and the optimiser exist only in `rust/`. `lib/pipeline` keeps the vocabulary (`generation-modes.ts`), the dither preview the browser draws, `regions.ts` behind the Fill tool, `downsample.ts`'s grid maths and `enhance.ts`. Adding a pipeline feature is a Rust change and a golden-hash decision, not two implementations.
- **`lib/pipeline/enhance.ts` is still TypeScript and still runs**, in the Next API route that serves the photo-enhancement preview — while `rust/cs-core/src/enhance.rs` does the same work during generation. That is the one duplication G-068 did not remove; routing the preview through the processor would.
- A crash report carries the chart but never the photo (D218), and names a commit only when the image is built with `APP_COMMIT=$(git rev-parse --short HEAD)`; the plain deploy command leaves it "unknown". Confirmed after a deploy by grepping the shipped chunks for the short SHA.
- Nothing test-only ships: a build-flagged crash hook was found in the production chunks, so the boundary's spec breaks `fillRect` instead (D218). Grep a production build before trusting a flag to remove code.
- `lib/` imports no framework. It is the layer the unit tests exercise without rendering and the processor runs server-side; two hooks had drifted in before G-067 M6, so eslint `no-restricted-imports` now refuses `react` there. A hook goes in `app/hooks/`, its logic stays in `lib/` as a pure module.
- A palette index is read through `colorAt` (`lib/color/palette.ts`), which fails naming the index and the palette size. The renderers stay strict on purpose — a cell nothing can draw is a bug to find (D217, D219).
- `lib/experimental/` may be imported only behind a flag that is off by default and refuses loudly when combined with something it cannot support, as `contourRefinement` does (D068). It is on the production import graph; that is only safe while the flag is.
- A helper or locator used by more than two e2e specs lives in `tests/e2e/helpers/`. Fifteen copies of one helper turned a single new canvas into an edit in 27 files (G-067 M5). A tool is put in hand with `pickTool`, which matches the rail label **exactly**: a new label containing an old one ("Lasso fill" over "Fill", "BS move" over "Move") turns every loose locator in the suite into a strict-mode violation at once.
- `EMPTY_CELL` (255) is a sentinel, never an index to shift: renumbering it after a merge made 254, and the next press killed the page (D217). `paintableIndex` gates every press, and the renderers stay strict so a bad index is found, not painted around.
- `main` holds two canvases: the chart's is `data-testid="chart-canvas"` and the cursor's `brush-outline` (D216). A spec asking for "the canvas in main" gets both and fails strict mode.
- A shape tool contributes a rasteriser returning spine cells only; thickness is the brush's, and a filled shape never stamps it (D214, D215).
- A control added to the editing bar goes inside its `at-tool-track` unless it belongs to the view, and `main` must never become scrollable: a bar wider than its container slides the whole chart column sideways when a control in it takes focus (D213, asserted in `tests/e2e/navigation.spec.ts`).
- Every `cellPalette` mutation passes `EMPTY_CELL` (255) through untouched (D028); view-only settings (canvas colour) never reach an export call site (D087).
- Export drawing creates canvases, encodes PNGs and loads the font and texture only through
  `lib/export/canvas-backend.ts`, never by touching `document` or `Image` directly (D125). That is the seam the
  server backend plugs into (D153), so breaking it breaks server exports.
- An export canvas is encoded once, through `canvasToPngBlobAndRelease`, and never touched afterwards (D171); symbol
  stamps are passed only with a canvas context, never the PDF adapter, whose symbols must stay text (D172).
- The PDF adapter keeps opaque drawing on direct operators, written as text, with one font resource per page (D126,
  D174); `tests/unit/pdf-text-content.spec.ts` pins the bytes. Call `finish()` on each page's adapter before the page
  is flushed or saved, or the page loses its content.
- Crisp lives in Rust only (G-068 M3). The rules that governed the TypeScript copy — shared admissible-cost
  functions, evidence identical to a verbatim reference, Crisp+ behind its own flags (D063, D068, D139) —
  described code deleted at bf726db; they bind `rust/cs-core/src/crisp/` now, and nothing checks them.
- ICM inner loops use no closures or array scans (D044).
- Pixel art is never resampled, colour-converted or premultiplied on the way in: every pixel is a stitch, so the photo path's 4000 px downscale would destroy the work (`pixel-art-file.ts`, D194).
- Cell importance reads each cell's own footprint, never pixels assigned by truncation (D197): the two agree exactly below 1:1, and only the footprint fills a finer chart's cells.
- A new pass after quantization is gated on `smooth` in both languages, or it silently undoes dithering (D199); a
  matrix pattern is generated data, never computed at runtime (D198).
- A drawn pattern's randomness comes from `lib/prng.ts`/`prng.rs` on a seed in its texture, consumed in the same
  order by both languages, and its shapes use no transcendental function — `atan2` differs between V8 and libm (D183,
  D201, D202). Its cells are ranked and spread evenly over 0..1, which is what holds tone.
- A texture is data with ranges, validated by number not by type union, and its default is frozen against
  `tests/unit/helpers/dither-frozen-g054.ts` — never update that copy to match a change (D203). A texture is compared
  **by value**: it crosses the wire as JSON, so a reference check silently writes a default into every drawn chart
  (D204). A new knob needs a range, a Rust field, a parity case and a line in the editor.
- A drawn mark's shape list only grows at the end and a short weight list falls back to `lump` by name, never "the
  last shape" (D205); every cell keeps an order, painted or not, because that ranking is what holds tone.
- A drawn chart's field depends on the grid's **width and height**: marks are placed across the whole grid and their
  shapes drawn from the stream left afterwards. So a preview of a corner has to build the chart's own field (D206),
  and a tone compared with a threshold is the pipeline's rule only while the dark thread is the nearer one.
- A knob that reaches a shape it was not written for goes behind a switch that starts off, or it changes every
  texture already drawn (D207). The panel's Ring thickness is the stored radius read backwards: ink is fixed by tone,
  so a wider circle is a thinner stroke.
- The preview is shown for every pattern and builds only what that family forces: a matrix needs its window, a kernel
  the chart's full width down to the window, the drawn marks the whole grid (D208). The four line screens are one
  option with a direction, stored as four `lines-*` ids so old files keep opening; the list row carries its own value
  because a `select` cannot show one its options lack.
- A pipeline stage that reads `cellPalette` must skip `EMPTY_CELL`: it is a sentinel, not palette index 255, and both
  TypeScript and Rust must skip it in the same places or the two diverge (D196).
- Rust export references are generated in the processor image, never on a laptop: only DejaVu Sans is installed there, so every raster would differ (D188).
- Rust calls `jsmath` for every `Math` function (`libm` and `f64` differ from V8, D183, D184; recheck the vectors on a
  Node upgrade), and threads a stage only if each value keeps its TypeScript order (D185; `RUST_THREADS=3`).
- Code e2e specs load in Node takes symmetry types from `lib/editor/symmetry-axes.ts`, not `symmetry.ts` (G-037).
- Screen drawing = frozen pre-G-036 drawing with band grid lines (photos ±16, outlines ±1),
  per `tests/e2e/chart-viewport-parity.spec.ts`; exports keep stroked grid lines (D135).
- Brand-aware UI reads `pattern.threadBrand`. A new brand needs data, a
  provenance doc, a registry entry, and the inline union in `lib/types.ts`
  widened (D093).
- A color's thread identity is its immutable `source` (brand and code), never
  its name or RGB. A brand lock means every color has a source of that brand;
  OXS thread numbers and printed codes come from `source` (D122).
- Anchor uses code pairs from an unlicensed table under an Owner judgment call; read `docs/anchor-colors-provenance.md` first (D094).
- Don't strip the embedded photo from saved files without asking (D028).
- E2E acts on `getByTestId("chart-frame")` and reads pixels from `main canvas` inside
  its `data-painted-rect`; export options are selected by value (D080, D085, D135).
- The inspector mounts one pane at a time: a Photo, Chart or Threads control is absent from the DOM while another
  tab is up, and generating or restoring a chart moves the tab to Threads. Anything reaching for such a control
  selects its tab first — ten of G-045 M5's twenty-eight e2e failures were only this.
- A legend row prints its stitch count bare, with the skein estimate beneath it. Read the count from the
  `legend-color-count` testid, never by parsing the row's text: the old "123 sts" suffix is gone.
- The top panel is one strip (D160): symmetry sits in it beside the view controls, and the Select tool replaces the
  whole bar with the selection bar, which carries Undo and Redo so they do not disappear with it. Nothing else the
  context bar holds is reachable while a piece is floating.
- No symmetry control exists before a chart does — 1b's first-run and before-generate panels draw none — so anything
  reaching for one needs an open chart, not merely a loaded photo.
- The colour editor and the symbol picker both open under the row they edit, one at a time: opening either closes the
  other, and both dismiss on Escape or a pointer outside them.
- Names are no longer unique across panels, so address a control inside the panel that owns it. "Cancel" is shared by
  the selection bar, the colour editor, both "+ Add" flows, the canvas stepper, the new-chart panel and the Generating
  card; and the top panel echoes the brush's thread name, so a thread's label — "Empty (no stitch)" included — now
  appears both there and in the Threads list. `tests/e2e/color-editor.spec.ts` and `tests/e2e/empty-stitch.spec.ts`
  show the scoping that survives this.
- The file actions are not on the rail. New opens the start screen and the three ways into a chart live there
  (D162); the two file inputs are mounted in `app/workspace.tsx`, still named "Image" and "Open pattern file", so
  anything addressing them by name reaches them whatever screen is up.
- Replacing the one autosaved chart asks first, and only that: reaching the start screen is free, and so is opening the
  empty-grid card, whose settings live inside it collapsed until chosen — so the confirm sits on Create there, and on the
  photo and saved-pattern cards themselves (D162, D165). Anything reaching for "Width in stitches" opens the card first.
- A hand-started server must carry the environment `scripts/playwright-servers.ts` gives the configs' own
  (`PROCESSOR_URL`, the rate-limit overrides) or not be left listening: `reuseExistingServer` adopts it silently, and one bare `next start` cost an 85-failure run.
- The chart frame is hidden, never unmounted, while a pattern exists (D163). The redraw is a layout effect keyed on
  the pattern and the scene, so a remounted canvas is never repainted: it comes back blank and without
  `data-painted-rect`. Assert pixels, not presence, when a test claims the chart survived something.
- A disabled control wears one of exactly two looks, both exported by `app/components/ui.tsx`: DISABLED_ICON fades an
  icon control to 40%, DISABLED_TEXT drops a labelled one to `--at-faint`. Every hover on a control that can be
  disabled is written `enabled:hover:`, never a bare `hover:`, so a disabled one cannot light under the pointer
  (D164). Three treatments and eight pointer-answering controls had grown up before this rule existed.
- While the start screen is up, nothing reaches the chart behind it: one `startScreenVisible` in `app/workspace.tsx`
  disables the rail, the zoom controls and New, locks Chart and Threads (1b draws Photo live and selected), forces 1b's
  Photo pane, and drops the inspector footer (D164). Undo and Redo belong to the editing bar: no chart, no buttons.
- `npm ci --legacy-peer-deps` is required (npm arborist crash).
- On this Windows host, stopping a background task can leave node running; check the process list (D096).
- Both photo decode paths must stay byte-identical: `tests/e2e/decode-parity.spec.ts` (D128).
- Generation reads the full decoded photo; a future cap starts from D129's findings (D130).
- The processor publishes no port and is reached only through `app/api/`, which holds the Origin check and the rate
  limit. Job results travel in the editable-JSON save format, so `pattern-serialize.ts` is the wire format (D151).
- What the processor accepts is derived from the type unions in `processor/validate-settings.ts` and
  `validate-export.ts`, never retyped: a hand-written copy once spelled `PaletteMode`'s "full" as "free" and rejected every generation.
- The export font and stitch texture travel with the bundle: `npm run build:processor` copies them into
  `dist/processor/assets`. The image carries no fonts, and without a registered one every text width measures zero (D153).
- Paginated exports (A4, PDF) get 60 s plus 2 s per A4 grid page, never under the old fixed 150 s, and Export all that
  share for each of its three paginated sets (D168; `processor/job-protocol.ts`, `exportDeadlineFor`).
- The Origin check compares canonical origins: the loopback spellings on one scheme and port are one site, scheme and
  port still separate, an unparseable origin is dropped. `APP_URL` has no default: unset trusts only the arrival origin (D156).
- A job event stream carries an SSE comment frame every 15 s so a proxy does not drop an idle job; both clients take the frame's data line and skip the rest (`tests/unit/job-stream-keepalive.spec.ts`).
- `PROCESSOR_WORKER_HEAP_MB` caps each pool worker's heap. Unset in production, it proves the PDF's heap is bounded: at
  512 MB a 1500-stitch Pattern Keeper PDF and Export all complete, where 1000 once failed at every cap to 1536 MB (D169).
- `MAX_STITCHES` (1500) is measured: raising it means re-running `docs/reviews/2026-09-19-new-cap-measurements.md`, and above ~1550 Export all's chart PNG no longer fits its budget (D026, D181).
- The PDF releases each page as it is drawn through two private pdf-lib 1.17.1 fields (D169); an upgrade must keep `tests/unit/pdf-page-flush.spec.ts` green, or the flush stops silently and the heap grows back.
- Rate-limit capacities default to production values, overridable by `RATE_LIMIT_JOBS_PER_MINUTE` and
  `RATE_LIMIT_PREVIEWS_PER_MINUTE` so the e2e suite is not refused; a zero or malformed value falls back to the default.

## Next steps and open questions

- **G-073 is at M6 of 6, all six milestones built and deployed, waiting on the Owner's sign-off.** Backstitch draws, edits, lives in the thread list, and reaches every export. Five Owner-reported changes landed on top of the plan: the zoom displacement, the two editing tools becoming one (D229), the run selection (D230), the Delete key, and drawing that ends where it is placed rather than chaining by default (D231).
- **Left for a future goal, found while building it:** the casing threshold and bead spacing were judged on screen, never on paper — only a print settles how a 0.55 mm dashed line reads at a 2.75 mm cell (`docs/reviews/2026-09-25-backstitch-samples.md`). Backstitch is also absent from the realistic preview,
  which draws stitches from tiles and has no notion of a line.
- Two drafts wait on the Owner: **G-069** (the workspace's shape, from `docs/reviews/2026-09-24-workspace-shape.md`) and G-030 (public launch, far future).
- Weakest area, unchanged by G-073 and reinforced by it: **tests assert data, not what is drawn.** Every backstitch defect the Owner found in G-073 — the zoom displacement, the missing highlight — was invisible to a suite asserting exported coordinates, and two more were found only by *looking* at a sample export. Three pixel-level tests now exist (`backstitch-scene-placement.spec.ts`, and the highlight and Isolate cases in the e2e); nothing else asserts a frame during a gesture except `tests/unit/piece-preview-cells.spec.ts`.
- **`cargo fmt --check` is not clean and not in CI**: 11 pre-existing diffs in `cs-core`, against STANDARDS → Code style, which names `cargo fmt --check` as a required CI check. Found 2026-09-25 during G-073 M5 and left alone rather than mixed into that change.
- G-070 is closed as answered: the V8 maths port costs nothing — replacing it is **13–25% slower** with
  identical output (D223). Its one actionable finding shipped as G-071: the build targets `x86-64-v3`,
  worth a mean 6.6% (D224). Both are written up in `docs/reviews/2026-09-24-parity-tax.md`.
- Watch: `tests/e2e/brush-outline.spec.ts` ("the outline sits on the stitch under the pointer") went flaky
  once on 2026-09-24, passing on retry. First sighting; if it recurs it is a real pointer-timing race, of
  the kind D220 fixed elsewhere.
- Left open from G-039: ending a drag costs 116–132 ms at a 6 px stitch against a 100 ms target, and a drag with symmetry on keeps the pre-M3 cost (D145). From G-038: Crisp+ can end under the requested colour count on a busy photo (14 of 24 on road-mountains), since a refill split learns only from cells inside a colour (D142).
- Left open: G-028 — OXS symbols use each reader's own font glyph, untested in PCStitch or WinStitch (`docs/reviews/2026-09-13-oxs-format-evidence.md`); G-032 — the 1.5 s enhancement target and Brighten's calibration; G-033 — "+ Add" keeps its old flow.
- Known gap in the processor: if a worker file is missing or corrupt, `new Worker(...)` throws inside `spawn()` and can take the service down instead of failing one job. Low risk (the bundle ships inside the image), unfixed deliberately — it surfaced only when a build directory was deleted mid-run.
- From G-048: generation at 1500 stitches holds 42 MB more than TypeScript in Standard, 9 MB more in Crisp+ (D190); the sidecar spawns per job. Archived 2026-09-19: G-046 (raising the 1500 cap needs two Owner decisions, D181) and G-047 (D171–D178). G-030 (public launch) is a far-future draft.
- The dithering line (G-052 to G-059) is complete and signed off. Open: on a noisy photo at 8 colours the screens can
  read worse than no dithering, and drawn marks become grain on a flat region, which is inherent to dithering one.
- **528 unit tests went with the TypeScript pipeline** (1315 → 787), and M4 rebuilt the floor on the Rust side rather than porting them: 38 golden hashes (up from 18, now covering enhancement, all 13 dither modes, Vivid sampling and Crisp+), 5 Rust property tests over degenerate and arbitrary input, the D118 release gates, and preview-against-binary enhancement parity. What is still covered only by a hash is the *internals* — crisp-edge behaviour, denoise, the local optimiser, thread matching — which is to say a change there is caught but not explained. That is the thinnest area now.
- A crash now hands over a report (D218, G-066 signed off 2026-09-24), so the next one is diagnosable from the file rather than by reproducing it. Still open: the Owner has seen the same dead page **before 2026-09-23**, from a route D217 does not explain — the first report to arrive from the wild is the evidence to chase it with.
- The colour question that drove G-060 to G-062 is answered (D212); the hues arrive **as the photo holds them**, so
  a dusty pink stays dusty. Open behind it: Photo fix keeps a Vivid of its own until it is redone, and its Auto and
  Vivid modes were measured to *lower* a pastel photo's chroma (median 0.020 → 0.010), which nothing has looked at.
- Owner decisions not yet made: a real evenweave/linen fabric model (`docs/domain-reference-fabric-types.md`); gaps from `docs/reviews/2026-09-12-competitive-analysis.md`.

## Deploy log

Every deploy, with what changed and how it was verified, is in `docs/deploy-log.md`. The last two, newest first:

| Date | Commit | What changed | How verified |
|---|---|---|---|
| 2026-09-25 | 1437439 | **Each section of the thread list lights its own layer** (Owner): the cross row's eye lights a thread's stitches, the backstitch row's lights its lines, where one shared set had lit the whole thread (D235). Isolate dims what is not lit in both layers | 824 unit, 432 e2e (9 in the threads spec, including the pixel test), tsc, eslint, prettier, docs-lint clean. The test caught a gap in the first version — with no backstitch lit, nothing dimmed, so lighting a thread's stitches left every outline bright over a dimmed chart. Live on the deployed build: lit a thread's backstitch and watched its stitches stay unlit, then lit the stitches and watched the two toggle independently. 23 containers before and after with an identical name set and only this project's app restarted; ten sites returned 200. |
| 2026-09-25 | 354c7c2 | **G-073 M6: the docs catch up with the finished goal.** The README describes backstitch as a reader meets it and stops claiming the app drops it on open — which it has not done since M1 — and lists the two Rust parity suites, which had never been written down. `HANDOVER.md` reads as a finished goal and names the Rust side of backstitch. No behaviour change | 824 unit, 432 e2e, 73 golden hashes, both Rust parity suites, tsc, eslint, prettier, docs-lint clean. Live on the deployed build: a chart drawn with backstitch, an editing gesture, and a full-chart PNG exported through the live processor showing its dashes and symbol beads. 23 containers before and after with an identical name set and only this project's app restarted; ten sites returned 200. |

## Decisions

One file per decision in `docs/decisions/`, indexed in `docs/decisions/README.md`.
