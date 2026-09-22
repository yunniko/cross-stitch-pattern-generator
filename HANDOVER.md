# Handover — cross-stitch-pattern-generator

Last verified: 2026-09-22 at 76df9aa (G-057: the swatch shows the chart's own marks, deployed and verified live)

Photo → editable, printable cross-stitch chart. Decoding, generation and every export but the editable save run on the server. A
standalone Owner project (not svc-lab, no monetization), live at
<https://cross-stitch.craftodejnice.cz>. Goals are in `GOALS.md`, completed
goals in `docs/goals-archive.md`, and company rules in `E:\CLAUDE\COMPANY\`.

## Current state

**Production** runs 76df9aa (2026-09-22), the last deployed commit: the 1b shell with the Owner's corrections, and generation, the enhancement preview and every export but the editable save running in the `processor` container — the work itself in the Rust sidecar (D190, D193), with TypeScript as the fallback.
Every signed-off goal, with what it produced and how it was verified, is in `docs/goals-archive.md` — G-028 onwards, from the OXS format to the Atelier redesign (D157–D167), the move to the server (D149–D155) and the Rust port.

**G-048, generation and exports in Rust — signed off 2026-09-20, archived.** `rust/` holds all generation and every
export, byte-identical to TypeScript at any thread count, plus a WASM build (D182–D189); on the host it is 1.6–13.0×
faster at one thread and far lighter on memory (`docs/reviews/2026-09-20-rust-comparison-report.md`). Live since
2026-09-20: each job runs in the `cs-job` sidecar (D190, D193), the editable save stays in the browser (D191), 4–5 px
chart symbols changed appearance (D192), and `CS_JOB=0` returns to TypeScript without a rebuild.

**What works** (verified in this session unless marked otherwise):
- Generation from a photo at 10–1500 stitches (D181) and 2–100 colors, with Refined or Classic clustering (stored as
  `latest`/`original`), Full range, DMC, Cosmo or Anchor palettes, and Standard, Crisp or Crisp+ edges — on the
  processor, with progress, a queue position and cancellation. A chart can also start blank: every stitch empty and no
  photo, so Generate and the photo settings stay away for its whole life (G-040, D143).
- Editing: brush (double-click fills a region as one undo step when the Chart pane's switch is on, D138, D146),
  8-connected fill, symmetry on four axes and quick mirror (D137), rectangle select with copy, paste, move, flip,
  rotate, crop, "Apply here" and "Cancel" (D147, D148), pan, zoom; Isolate dims every thread but the lit ones and stays
  on under another tool (D158); merge, recolor, rename, re-symbol, add colour, empty stitches, resize, one undo history.
- Colour editor: opens under its legend row on the colour's remembered thread swatch (D122), with an Okhsl comparison on hover or focus (D123); Full range drags are one undo step, Cancel or Escape restores.
- Zoom keeps the stitch under the cursor in place, the buttons the view's centre (D124); five view modes (keys 1–5), a view-only canvas colour, shortcuts Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Space-drag, B, F, Escape.
- Exports: editable JSON (format version 7, embeds the source photo and each color's thread swatch), realistic preview
  PNG, Color and B&W full-chart PNG, A4 page ZIPs, Pattern Keeper PDF, an OXS chart, a pixel-art PNG at 1 px per stitch
  (D195), "Export all" `.cspzip`. Open accepts JSON, ZIP, `.cspzip` and `.oxs` by content; OXS lists what it couldn't keep.
- A transparent background generates as empty stitches (G-050, D196): a cell covered less than half takes no colour, and every stage reads covered pixels only.
- Pixel art in and out (G-049): the start screen's fourth card opens an image as a chart, one pixel per stitch,
  transparent pixels empty, nothing resampled; too large, too colourful or partly transparent is refused with the real
  numbers, under 10 stitches is centred in a chart of the minimum (D194), and the pixel-art PNG writes the image back.
- Dithering (G-052 and G-053 signed off 2026-09-21, G-054 on top of them): a Dither control offers ten patterns in
  four groups — screens that cluster their stitches (clustered dots, rings, two line screens), scattered matrices
  (Bayer 4×4/8×8, blue noise), two error-diffusion kernels (Floyd–Steinberg, Atkinson) and Hand-drawn, which scatters
  drawn marks across the chart instead of repeating one (D201, D202) — each mixing neighbouring stitches between the
  two threads either side of a colour instead of rounding each one. Off is byte-identical to before; a dithered chart
  runs no smoothing pass and refuses Crisp (D199). A matrix pattern is data, not code (D198); a kernel is a row of
  taps (D200); the drawn marks take an **editable texture** — nine numbers with published ranges, edited by sliders
  with a live swatch and saved inside the chart's own file (G-055, D203, D204) — and a **painted mark**, a grid of
  fill steps drawn in the same panel and mixed in as a fifth shape (G-056, D205). Measured in
  `docs/reviews/2026-09-21-dithering-comparison.md`: kernels lowest error (median 0.44–0.51×) and never worse,
  screens and drawn marks cheapest (+3.3 to +4.3 points, drawn +3.8 at 0.78×), matrices between.
- Photo upload and reopening a save decode in a worker, the old decode a logged fallback (D128).
- Persistence: the open project autosaves to IndexedDB (photo stored once by SHA-256, 500 ms debounce) and restores on
  reload; a corrupt record shows a banner with an on-demand error report. Options live in localStorage.
- Photo enhancement: Off, Brighten, Auto, Vivid, Portrait, with a "Compare with original" preview and recorded in
  saved files; only Brighten is released (`docs/reviews/2026-09-13-photo-enhancement-calibration.md`).

**Checks run 2026-09-22**: `tsc --noEmit` clean, `npm run lint` 0 errors; Vitest 1218 passed (8 opt-in skips);
Playwright **330 passed, 0 failed across all 27 specs against the Rust sidecar**, one spec per process against the single-path
build, with the processor serving generation, exports and previews; `npm run compare:rust` 81 cases identical. Export parity:
`docs/reviews/2026-09-17-export-parity.md`. CI runs `next typegen` before the type-check and `build:processor` before
the unit tests, because the worker bundle is git-ignored and the pool, preview and export specs run against it.

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
  (D193). The image builds it in its own `rust` stage; `CS_JOB=0` or a missing binary disables it.
- **Rust port (G-048)**: `rust/cs-core` ports the pipeline module by module, each file naming the TypeScript it ports:
  `crisp/` holds Crisp and Crisp+, `threads.rs` brand matching, `enhance.rs` enhancement, `dither.rs` G-052's patterns,
  `jsmath.rs` and `fdlibm.rs` the V8-exact maths (D183, D184) pinned by `rust/cs-core/tests/jsmath_vectors.rs`.
  `rust/cs-export` ports every export: `text.rs`/`canvas.rs` draw DejaVu text as the processor's canvas does (D187),
  `pdf.rs` pdf-lib's structure (D189), `bundle.rs` JSZip's ZIPs. `rust/cs-bench` is the CLI behind `npm run compare:rust`.
- **Tests**: unit specs in `tests/unit/`. `golden-hashes.spec.ts` pins exact `buildPattern` output for 18
  configurations (D107), and `m3-equivalence.spec.ts` compares the optimizer with a verbatim pre-M3 copy. E2E specs are
  in `tests/e2e/`; `npm run test:e2e` starts the processor and the app together, since the page needs both.
  `compare:export-parity` diffs two running builds, `compare:rust`/`compare:dither` measure the port and the patterns.
- **Deploy**: `Dockerfile` builds two targets (`runtime`, `processor`) and `docker-compose.yml` runs both under
  D149's caps (app on `127.0.0.1:30150`; the processor publishes no port). Recipe and shared-host rules:
  `COMPANY/INFRASTRUCTURE_DEPLOY.md`; verification per D027.

## Rules in force

- The Owner gave standing push and deploy approval on 2026-09-13: deploy verified work without asking, unless
  something needs the Owner's attention. Deploys still follow `COMPANY/INFRASTRUCTURE_DEPLOY.md`.
- One session per working tree. Never force-kill node processes you did not start: find the owner of the port you actually need and check its start time first. A rule naming a fixed PID goes stale within days and PIDs are recycled -- the number this rule used to carry (17476, 2026-09-12) was long gone by 2026-09-18 and only caused a later session to believe it had killed someone else's server.
- A goal isn't DONE with a dirty tree, placeholders, or no logged Owner sign-off (OPERATIONS.md §5, D098).
- E2E runs against a production build on port 30200 (D102); locally an existing server is reused, so stop it after code changes.
- Speed-ups must leave `tests/unit/fixtures/golden-hashes.json` unchanged; regenerate it (`UPDATE_GOLDEN_HASHES=1`)
  only for an intended output change, with a decision file (D107).
- Omitting `edgeMode`, `contourRefinement`, a brand or `enhancementMode` (or passing Off) must reproduce Standard output byte-for-byte.
- Which enhancement modes are offered is the Owner's decision, made in `releasedEnhancementModes()` (D118); every
  mode must still pass the safety gates in `tests/unit/enhancement-calibration.spec.ts`.
- Brighten must never white-balance, add local contrast or saturate, and must leave a photo with both deep shadows and highlights untouched (D118).
- Enhancement calibration photos stay outside the repository; two show
  identifiable people.
- Every `cellPalette` mutation passes `EMPTY_CELL` (255) through untouched (D028); view-only settings (canvas colour) never reach an export call site (D087).
- Export drawing creates canvases, encodes PNGs and loads the font and texture only through
  `lib/export/canvas-backend.ts`, never by touching `document` or `Image` directly (D125). That is the seam the
  server backend plugs into (D153), so breaking it breaks server exports.
- An export canvas is encoded once, through `canvasToPngBlobAndRelease`, and never touched afterwards (D171); symbol
  stamps are passed only with a canvas context, never the PDF adapter, whose symbols must stay text (D172).
- The PDF adapter keeps opaque drawing on direct operators, written as text, with one font resource per page (D126,
  D174); `tests/unit/pdf-text-content.spec.ts` pins the bytes. Call `finish()` on each page's adapter before the page
  is flushed or saved, or the page loses its content.
- Crisp consumers use the shared admissible-cost functions or throw; Crisp with contour refinement throws (D063, D068).
- Crisp boundary evidence must stay identical to its verbatim reference copy:
  `tests/unit/crisp-evidence-equivalence.spec.ts` (G-035 M4). Crisp+ changes stay behind
  `edgeModel: "blurred-step"` and `"crisp-plus"`, never Crisp's defaults (D139).
- ICM inner loops use no closures or array scans (D044).
- Pixel art is never resampled, colour-converted or premultiplied on the way in: every pixel is a stitch, so the photo path's 4000 px downscale would destroy the work (`pixel-art-file.ts`, D194).
- Cell importance reads each cell's own footprint, never pixels assigned by truncation (D197): the two agree exactly below 1:1, and only the footprint fills a finer chart's cells.
- A new pass after quantization is gated on `smooth` in both languages, or it silently undoes dithering (D199); a
  matrix pattern is generated data, never computed at runtime (D198).
- A drawn pattern's randomness comes from `lib/prng.ts`/`prng.rs` on a seed carried in its texture, consumed in the
  same order by both languages, and its shapes use no transcendental function — `atan2` and friends differ between V8
  and libm (D183, D201, D202). Its cells are ranked and spread evenly over 0..1, which is what holds tone; a shape
  that breaks the ranking changes how much thread the chart carries.
- A texture is data with ranges, validated by number and not by type union, and the default is frozen against
  `tests/unit/helpers/dither-frozen-g054.ts` — do not update that copy to match a change (D203). A texture is
  compared **by value**: it crosses the wire as JSON, so a reference check silently writes a default into every
  drawn chart (D204). A new knob needs a range, a Rust field, a parity case and a line in the editor.
- A drawn mark's shape list only ever grows at the end, and what a short weight list falls back to is pinned by name
  (`lump`), never "the last shape" — otherwise adding one changes every existing texture (D205). Every cell of a mark
  keeps an order, painted or not, because that ranking is what holds tone.
- A drawn chart's field depends on the grid's **width and height**: marks are placed across the whole grid and their
  shapes drawn from the stream left afterwards. So a preview of a corner has to build the chart's own field (D206),
  and a tone compared with a threshold is the pipeline's rule only while the dark thread is the nearer one.
- A pipeline stage that reads `cellPalette` must skip `EMPTY_CELL`: it is a sentinel, not palette index 255, and both
  TypeScript and Rust must skip it in the same places or the two diverge (D196).
- Rust export references are generated in the processor image, never on a laptop: only DejaVu Sans is installed there, so every raster would differ (D188).
- Rust calls `jsmath` for every `Math` function (`libm` and `f64` differ from V8, D183, D184; recheck the vectors on a
  Node upgrade), and threads a stage only if each value keeps its TypeScript order (D185; `RUST_THREADS=3`).
- Code e2e specs load in Node takes symmetry types from `lib/editor/symmetry-axes.ts`, not `symmetry.ts` (G-037).
- Screen drawing = frozen pre-G-036 drawing with band grid lines (photos ±16, outlines ±1),
  per `tests/e2e/chart-viewport-parity.spec.ts`; exports keep stroked grid lines (D135).
- ICM and both k-means paths stay identical to their pre-M5 copies (D133):
  `tests/unit/m5-equivalence.spec.ts`, `tests/unit/m5-equivalence-adversarial.spec.ts`,
  `tests/unit/icm-neighbour-bound.spec.ts`. ICM's skipped scan needs a colour weight of zero or more (D170).
- Brand-aware UI reads `pattern.threadBrand`. A new brand needs data, a
  provenance doc, a registry entry, and the inline union in `lib/types.ts`
  widened (D093).
- A color's thread identity is its immutable `source` (brand and code), never
  its name or RGB. A brand lock means every color has a source of that brand;
  OXS thread numbers and printed codes come from `source` (D122).
- Anchor uses code pairs from an unlicensed table under an Owner judgment call; read `docs/anchor-colors-provenance.md` first (D094).
- Don't strip the embedded photo from saved files without asking (D028).
- Mount-time restores defer setState in a microtask, because of the
  set-state-in-effect lint rule (D033).
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
- A job event stream carries an SSE comment frame every 15 s so a proxy does not drop an idle job. Both clients take
  the frame's data line and skip the rest: parsing every frame as JSON broke production (`tests/unit/job-stream-keepalive.spec.ts`).
- `PROCESSOR_WORKER_HEAP_MB` caps each pool worker's heap. Unset in production, it proves the PDF's heap is bounded: at
  512 MB a 1500-stitch Pattern Keeper PDF and Export all complete, where 1000 once failed at every cap to 1536 MB (D169).
- `MAX_STITCHES` (1500) is measured: raising it means re-running `docs/reviews/2026-09-19-new-cap-measurements.md`, and above ~1550 Export all's chart PNG no longer fits its budget (D026, D181).
- The PDF releases each page as it is drawn through two private pdf-lib 1.17.1 fields (D169); an upgrade must keep `tests/unit/pdf-page-flush.spec.ts` green, or the flush stops silently and the heap grows back.
- Rate-limit capacities default to production values, overridable by `RATE_LIMIT_JOBS_PER_MINUTE` and
  `RATE_LIMIT_PREVIEWS_PER_MINUTE` so the e2e suite is not refused; a zero or malformed value falls back to the default.

## Next steps and open questions

- Left open from G-039: ending a drag costs 116–132 ms at a 6 px stitch against a 100 ms target, and a drag with symmetry on keeps the pre-M3 cost (D145). From G-038: Crisp+ can end under the requested colour count on a busy photo (14 of 24 on road-mountains), since a refill split learns only from cells inside a colour (D142).
- Left open: G-028 — OXS symbols use each reader's own font glyph, and the export is untested in PCStitch or WinStitch (`docs/reviews/2026-09-13-oxs-format-evidence.md`); G-032 — the 1.5 s enhancement target and Brighten's real-photo calibration; G-033 — "+ Add" keeps its old flow, touch screens pick on tap with no comparison readout.
- Settled by G-044 (2026-09-18, D156): origins are compared in a canonical form, so the loopback spellings read as one site, and `APP_URL` has no compose default. Production supplies it through the deploy `.env` that `COMPANY/INFRASTRUCTURE_DEPLOY.md` prescribes -- the file the earlier note here overlooked when it claimed the localhost default was in force.
- Known gap in the processor: if a worker file is missing or corrupt, `new Worker(...)` throws inside `spawn()` and can take the service down instead of failing one job. Low risk (the bundle ships inside the image), unfixed deliberately — it surfaced only when a build directory was deleted mid-run.
- From G-048 (signed off, archived): generation at 1500 stitches holds 42 MB more than TypeScript in Standard, 9 MB
  more in Crisp+ (D190). Worth doing if it matters: the sidecar spawns per job; a worker could keep one process warm.
- Archived and signed off 2026-09-19: G-046 (the cap is 1500; a cap of 2000 would need two Owner decisions, a longer
  generation deadline and Export all without the chart PNG, D181) and G-047 (raster exports 2–3× faster, the preview
  streamed, the PDF 3.5× faster, generation a quarter to a half faster, D171–D178). G-030 (public launch) is a
  far-future draft.
- G-052 and G-053 (dithering, then the ring screen and Atkinson) are signed off and archived. Open from their
  measurements: on a noisy photo at 8 colours the clustered, ring and line screens can read worse than the undithered
  chart, which is why the pane groups them as the cheap-but-weaker choice rather than hiding them. The screenshot that
  prompted G-053 was **hand-drawn** (Owner, 2026-09-21) — no algorithm to recover, which is why its rings sat
  aperiodically. **G-054 built that look** — irregular drawn marks, signed off and archived; on flat regions they read
  as grain rather than marks, which is inherent to dithering a flat area. **G-055 added the texture editor**, signed
  off and archived, and **G-056 added the stamp painter** it deferred, deployed and awaiting sign-off.
- Owner decisions not yet made: a real evenweave/linen fabric model (`docs/domain-reference-fabric-types.md`); gaps from `docs/reviews/2026-09-12-competitive-analysis.md`.

## Deploy log

Every deploy, with what changed and how it was verified, is in `docs/deploy-log.md`. The last three entries:

| Date | Commit | What changed | How verified |
|---|---|---|---|
| 2026-09-22 | 50f1424 | The dithering explanations are out of the Photo pane (Owner request): the paragraph under the Dither list, the swatch's caption, and the Edges note's dithering sentence | Vitest 1214 passed, 8 skipped; Playwright 328 passed across all 27 specs; tsc, eslint and docs-lint clean. UI only, so the processor image was unchanged and only the app container was recreated; 23 containers before and after with an identical name set, 38 vhosts unchanged. Live: the pane shows the Dither list and the Texture panel with no prose between them, and the Edges note reads as it did before dithering existed |
| 2026-09-22 | 00a8d16 | G-056: a painted mark — a grid of fill steps drawn in the Texture panel and mixed in as a fifth shape, with what it leaves unpainted still filling (D205) | Vitest 1218 passed, 8 skipped; Playwright 330 passed across all 27 specs against the Rust sidecar; `compare:rust` 81 cases identical, including a painted cross and a stamp wider than its own spacing; the default texture still reproduces G-054 against its frozen copy, and the 18 golden hashes are untouched; tsc, eslint, docs-lint and the build clean. Both cross-stitch containers recreated; 23 containers before and after with an identical name set, no other container restarted, 38 vhosts unchanged and every live site still answering (17 at 200; the 502s are the decommissioned svc-lab services). Live: a cross painted on the 5x5 grid reaches the chart, which records the stamp and its 0.3 share; no Rust fallback in the processor logs |
| 2026-09-22 | 76df9aa | G-057: the texture swatch is a corner of the chart the settings would make, over a dark-to-light ramp, drawn by the pipeline's own rule (D206) | Vitest 1219 passed, 8 skipped; Playwright 330 passed across all 27 specs; tsc, eslint and docs-lint clean. The engine gained a window helper only — the eleven patterns, the default texture and the 18 golden hashes are untouched. UI change, so only the app container was recreated; 23 containers before and after with an identical name set, 38 vhosts unchanged. Live: the swatch reads 56x56 with row shares 0.18, 0.39, 0.54, 0.66 down the ramp, and changing the chart size from 200 to 100 stitches changes 1325 of its 3136 stitches — which is the point: the marks are that chart's own |
