# Handover — cross-stitch-pattern-generator

Last verified: 2026-09-19 at c9eea53 (G-046 M3: ICM's exact neighbour bound, deployed and verified live)

Photo → editable, printable cross-stitch chart. Decoding, generation and every export but the editable save run on the server. A
standalone Owner project (not svc-lab, no monetization), live at
<https://cross-stitch.craftodejnice.cz>. Goals are in `GOALS.md`, completed
goals in `docs/goals-archive.md`, and company rules in `E:\CLAUDE\COMPANY\`.

## Current state

**Production** runs c9eea53 (2026-09-19), the last deployed commit: the 1b shell with the Owner's corrections, and generation, the enhancement preview and every export but the editable save running in the `processor` container.
Signed off: G-045 the Atelier redesign in direction 1b (D157-D167), G-044 the Origin check reads one site as one site (D156), G-034 photo processing and every export moved to the server (D149-D155), G-043 the narrowed Cancel (D148), G-042 selection actions and leaner chrome (D147), G-041 the optional double-click fill (D146), G-039 the Move tool at one frame per stitch (D144, D145), G-040 blank charts (D143), G-038 Crisp+ (`docs/reviews/2026-09-16-crisp-plus-calibration.md`), G-037 symmetry and quick mirror, G-036 charts without freezing (`docs/reviews/2026-09-15-chart-rendering-results.md`), G-035 performance (`docs/reviews/2026-09-15-performance-results.md`; photo cap cancelled, D130), G-033 the swatch-aware color editor (D122, D123), G-032 enhancement (D118), G-031 the review actions, G-028 OXS (D119).

**G-034, processing moved to the server — signed off 2026-09-18.** M1 measured the caps (D149, D150); M2 built the
`processor` service and its API (D151); M3 added the server photo preview (D152); M4 moved every export there,
drawing with DejaVu because the image has no fonts (D153), parity measured in
`docs/reviews/2026-09-17-export-parity.md`; M5 deleted the browser workers and the build flag, halving the client
bundle (2370 KB to 1129 KB). **Deployed and verified live on 2026-09-18**, after the Owner's nginx change (40 MB bodies, 300 s proxy reads).
Export all and the Pattern Keeper PDF failed on charts near 1000 stitches, a documented limitation (D155) until G-046 M2 bounded the PDF's heap (D169).

**G-045, the Atelier redesign (direction 1b) — signed off 2026-09-18.** The four stacked bars above the chart are
gone: a 64px tool rail led by New, a context bar that changes with the document, the
chart in a ruled well, a status bar, and a 360px inspector showing one of Photo, Chart or Threads at a time (D157).
Highlight left the tool union to become Isolate, a view mode that survives picking up a brush, with its own light on
every thread (D158); the view chips stay `aria-pressed` buttons rather than a radiogroup (D159). Later passes on
the Owner's reading of the design put symmetry and the brush's own
thread in the top panel, made the Select tool replace that panel rather than stack under it (D160), opened the symbol
picker under the row it edits as the colour editor already did, marked and named Export all as 1b draws it, stopped
the rail clipping its own file menu, and built the first-run screen: three cards where the chart will be, over the
three steps in the Photo tab. Two details depart from 1b at the Owner's direction (D161). A last pass made the
disabled state consistent across every control and stopped the start screen reaching the chart it covers (D164).

**What works** (verified in this session unless marked otherwise):
- Generation from a photo at 10–1000 stitches and 2–100 colors, with Latest or Original clustering, Full range, DMC,
  Cosmo or Anchor palettes, and Standard, Crisp or Crisp+ edges — on the processor, reporting progress, a queue
  position while it waits, and cancellation. A chart can also start blank: every stitch empty, no colours and no
  photo, so Generate and the photo settings stay away for its whole life (G-040, D143).
- Editing: brush (double-click fills a region as one undo step when the Chart pane's switch is on, D138, D146),
  8-connected fill, symmetry on up to four axes and quick mirror (D137), rectangle select with copy, paste, move,
  flip, rotate, crop, "Apply here" and "Cancel" (D147, D148), pan, zoom; Isolate dims every thread but the lit
  ones and stays on while another tool is active (D158); merge, recolor, rename, symbol swap, add color, empty
  stitches, canvas resize, and one undo history covering regeneration.
- Color editor: opens under its legend row on the color's remembered thread swatch (D122), marked and scrolled into
  view; hovering or focusing a swatch shows an Okhsl comparison (D123); picks apply at once and the editor stays
  open, Full range drags are one undo step, Done keeps and Cancel or Escape restores, and a click outside closes it
  while still acting.
- Wheel and Zoom-tool zoom keep the stitch under the cursor in place; the zoom buttons keep the
  view's centre (D124). Five view modes (keys 1–5) and a view-only canvas color. Shortcuts: Ctrl+Z,
  Ctrl+Y, Ctrl+Shift+Z, Space-drag, B, F, and Escape to merge a selection.
- Exports: editable JSON (format version 7, embeds the source photo and each color's thread swatch), realistic
  preview PNG, Color and B&W full-chart PNG, A4 page ZIPs, Pattern Keeper PDF (a real import re-confirmed after
  G-035 M2), an OXS chart, and "Export all" `.cspzip`. Open accepts JSON, ZIP, `.cspzip` and `.oxs` by content;
  an OXS import lists what it couldn't keep.
- Photo upload and reopening a save decode in a worker, with the old decode as a logged fallback; a 12 MP
  upload showed no main-thread task over 50 ms (D128).
- Persistence: the open project autosaves to IndexedDB (photo stored once by SHA-256, 500 ms debounce) and
  restores on reload. A corrupt record shows a banner with an on-demand error report; options live in
  localStorage.
- Photo enhancement: a Photo control (Off, Brighten, Auto, Vivid, Portrait), an enhanced preview with "Compare with
  original", and the mode recorded in saved files; only Brighten is released
  (`docs/reviews/2026-09-13-photo-enhancement-calibration.md`).

**Checks run 2026-09-19**: `tsc --noEmit` clean, `npm run lint` 0 errors, production build clean; Vitest 1065
passed (8 opt-in skips); Playwright **318 passed, 0 failed across all 26 specs**, one spec per process, against the
single-path build, with the processor serving generation, exports and previews. Export parity:
`docs/reviews/2026-09-17-export-parity.md`. CI runs `next typegen` before the type-check and `build:processor` before
the unit tests, because the worker bundle is git-ignored and the pool, preview and export specs run against it.

**Performance** (G-035, 2026-09-15, medians of 5 on the Owner's machine; tables in
`docs/reviews/2026-09-15-performance-results.md`): a 12 MP photo at 100 stitches / 16 colors takes 2.9 s Standard
and 7.5 s Crisp, down from 7.7 s and 42.7 s; at 1000 stitches / 64 colors, 4.9 s and 6.8 s. In the browser at 1000
stitches, generating takes 6.9 s, the PDF 11.1 s, Export all 37.8 s, with no main-thread freeze. Enhancing a
4000×3000 photo takes 1.9–2.2 s, above G-032's 1.5 s target. The server is ~3.4× slower per core (D149), and a
1000-stitch A4 export there took 127.7 s on 2026-09-18 (G-046 M1); its deadline now grows with the page count (D168).
G-046 M3 made ICM 14–55 % faster by palette size (D170), which moved generation on the host by only 0–5 s: k-means
assignment and Crisp's evidence fits now cost more (`docs/reviews/2026-09-19-icm-candidate-reduction.md`).

**Known limitations**:
- Crisp takes about 2.6× Standard's time on a 12 MP photo (7.5 s against 2.9 s), because every cell
  gets the two-mode fit (D132); it falls back to Standard for thin lines, junctions and shading (D096).
- At 1000 stitches chart actions stay under 100 ms, but 4× CPU throttling still reaches 480 ms (G-036). Generation
  and every export but the editable save need the server, so they stop working offline or during an outage (G-034).
  The PDF has no bold face; whether µ (which extracts as μ) matters in Pattern Keeper is unconfirmed (D074, D097).
  Isolate does nothing in the realistic preview (D028), and contour refinement exists but isn't adopted (D055).

## How things fit together

- **Stack**: Next.js 16 App Router (`output: "standalone"`), React 19, TypeScript strict, Tailwind 4, Vitest 4,
  Playwright 1.62, Node 22. Runtime deps: pdf-lib with fontkit, jszip, react-colorful, color-name-list,
  @napi-rs/canvas (server decode and preview encoding, D150).
- **UI shell** (direction 1b, D157): `app/page.tsx` renders `app/workspace.tsx`, which owns only undo history,
  cross-pane state and pointer dispatch (pan → move → select → brush). Behavior lives in `app/hooks/`: options,
  restore, source image, generation, pan/zoom, chart renderer, canvas tools, exports, shortcuts. The tool rail
  (`app/components/tool-rail.tsx`), the context and status bars, and the inspector's Photo, Chart and Threads
  panes live in `app/components/`, with shared controls in `app/components/ui.tsx`. Tool hooks reach the renderer through a
  ref assigned after render (D108). The chart frame (full chart size) takes layout, input and the zoom anchor;
  one canvas inside paints the visible part plus overscan (`app/chart-scene.ts`, D135, D136). Realistic and
  Original photo are view-only, where only Pan and Zoom act.
- **Generation path (G-034, D151)**: `app/hooks/use-generation.ts` → `lib/pipeline/pattern-server.ts` → the Route
  Handlers in `app/api/` → the `processor` container (`processor/server.ts`, its pool in `processor/pool.ts`, decoded
  photos in `processor/photo-store.ts`), which runs `buildPattern` in `processor/pool-worker.ts`;
  `scripts/build-processor.mjs` bundles it. The photo is uploaded once by `lib/pipeline/photo-upload.ts` and referred
  to by hash; `lib/pipeline/server-errors.ts` separates a busy server, an unreachable one and an expired photo;
  `processor/validate-settings.ts` checks requests against the type unions. M5 deleted the browser's own generation
  worker, so this is the only path.
- **Preview path (server, G-034 M3, D152)**: `app/hooks/use-enhance-preview.ts` →
  `lib/pipeline/enhance-preview-server.ts` → `app/api/photos/[hash]/preview/route.ts` → its own worker
  (`processor/preview-runner.ts`, `processor/preview-worker.ts`), cached as WebP in `processor/preview-cache.ts`.
- **Export path (server, G-034 M4, D153)**: `app/hooks/use-exports.ts` → `lib/export/export-server.ts` →
  `app/api/exports/route.ts` → the same pool as generation, so concurrency stays inside D149's cap. The drawing code
  is unchanged: it asks `lib/export/canvas-backend.ts` for canvases, PNG encoding, images and the PDF font, and
  `processor/export-backend.ts` answers with `@napi-rs/canvas`. Requests are checked by
  `processor/validate-export.ts`; page progress and the finished file come back over the job routes.
- **Photo decode**: `lib/editor/load-image.ts` sends the file or data URL to
  `lib/editor/decode-image.worker.ts`; `lib/editor/decode-main-thread.ts` is the fallback, and both size
  through `lib/editor/decode-bitmap.ts` (D128), which the server reuses (D150).
- **Pipeline order** in `buildPattern`, in sequence: area-weighted linear-light downsample; Sobel importance and
  per-pair structure-tensor evidence (D044); one shared `PipelineContext` of cell OKLab (D106); importance-gated
  medoid pre-filter for the quantizer only (D041, D051); OKLab k-means, plain for Original or merge-and-reinvest for
  Latest (D018, D039); coarse then fine ICM on an 8-neighbour stencil, re-evaluating a cell only after a neighbour
  changes (D043, D045, D133); small-component recolor and diagonal-pinch fixes; palette merge, zero-count compaction
  and OKLab recompute; thread-brand snap with fine ICM re-run (D056), then dark-to-light sort, symbols and names.
- **Photo enhancement** (`lib/pipeline/enhance.ts`): a preset is analysed from the photo (white balance, levels and
  gamma, CLAHE, vibrance) then applied per pixel, once, inside `buildPattern`. Downsampling and Crisp's colour fits
  read the enhanced photo; importance and pair evidence read the original (D112). Off, or every stage abstaining,
  returns the input untouched (D118). The preview has its own worker (D116); `releasedEnhancementModes()` decides
  what the UI offers, while files may record any recognized mode (D113).
- **Crisp mode** (`lib/crisp/`): a frozen evidence layer (D065) feeds weighted quantization, admissible-label
  unary costs in ICM and cleanup, repair after merges, and mode-aware finalization (D061–D072). The layer
  evaluates every cell (D132) and converts each source row to OKLab once per job (G-035 M4). Crisp+
  (`edgeMode: "crisp-plus"`, G-038) adds blurred-step evidence (D139), strip snapping (D140), blend pruning
  (D141), slot refill (D142).
- **Threads** (`lib/threads/`): `thread-brands.ts` is the registry; its `matching` field is "direct" for DMC and
  Cosmo, or "dmc-equivalence" for Anchor. `brand-match.ts` does the snapping, provenance in
  `docs/*-colors-provenance.md`.
- **Export** (`lib/export/`): `render.ts` handles the chart layout budget and the realistic preview. A4 page drawing
  takes a `ChartDrawingContext`, so the same code draws PNG pages and PDF pages through `pdf-canvas-adapter.ts`
  (D074). `export-all.ts` bundles the existing exporters, and `export-jobs.ts` runs every export — on the processor
  since M5, through the canvas and assets `canvas-backend.ts` hands it (D125, D153). The editable JSON is the
  exception, written in the page by `use-exports.ts` so work can be saved when the server cannot be reached. The PDF
  adapter writes opaque drawing as direct content-stream operators with one font resource per page (D126).
- **Editor data** (`lib/editor/`): pure mutations in `pattern-edit.ts`, validating (de)serializer in
  `pattern-serialize.ts` (D099), IndexedDB store in `project-store.ts` (D100), options in
  `workspace-storage.ts`. OXS reading and writing live in `oxs.ts` on the dedicated XML reader `oxs-xml.ts`
  (D119); `pattern-import.ts` sniffs the format.
- **Experimental** (`lib/experimental/`): contour refinement, boundary chains, simulated annealing,
  diagnostics. Status table in its README.
- **Tests**: unit specs in `tests/unit/`. `golden-hashes.spec.ts` pins exact `buildPattern` output for 18
  configurations (D107), and `m3-equivalence.spec.ts` compares the optimizer with a verbatim pre-M3 copy. E2E specs
  are in `tests/e2e/`; `npm run test:e2e` starts the processor and the app together, since the page needs both.
  `npm run compare:export-parity` diffs exports between two running builds. `npm run bench` runs `scripts/bench.ts`;
  `npm run bench:browser` runs `scripts/bench-browser.spec.ts` against a production build, writing to the OS temp folder.
- **Deploy**: `Dockerfile` builds two targets (`runtime` for the app, `processor` for generation) and
  `docker-compose.yml` runs both under D149's caps (app on `127.0.0.1:30150`; the processor publishes
  no port). Recipe and shared-host rules: `COMPANY/INFRASTRUCTURE_DEPLOY.md`; verification per D027.

## Rules in force

- The Owner gave standing push and deploy approval for this project on
  2026-09-13: deploy verified work without asking, unless something needs
  the Owner's attention. Deploys still follow `COMPANY/INFRASTRUCTURE_DEPLOY.md`.
- One session per working tree. Never force-kill node processes you did not start: find the owner of the port you actually need and check its start time first. A rule naming a fixed PID goes stale within days and PIDs are recycled -- the number this rule used to carry (17476, 2026-09-12) was long gone by 2026-09-18 and only caused a later session to believe it had killed someone else's server.
- A goal isn't DONE with a dirty tree, placeholders, or no logged Owner
  sign-off (OPERATIONS.md §5, D098).
- E2E runs against a production build on port 30200 (D102). Locally an
  existing server is reused, so stop the 30200 server after code changes.
- Speed-ups must leave `tests/unit/fixtures/golden-hashes.json` unchanged.
  Regenerate it (`UPDATE_GOLDEN_HASHES=1`) only for an intended output change,
  with a decision file (D107).
- Omitting `edgeMode`, `contourRefinement`, a brand or `enhancementMode` (or
  passing Off) must reproduce Standard output byte-for-byte.
- Which enhancement modes are offered is the Owner's decision, made in
  `releasedEnhancementModes()` (D118). Every mode must still pass the safety
  gates in `tests/unit/enhancement-calibration.spec.ts`.
- Brighten must never white-balance, add local contrast or saturate, and it
  must leave a photo with both deep shadows and highlights untouched (D118).
- Enhancement calibration photos stay outside the repository; two show
  identifiable people.
- Every `cellPalette` mutation passes `EMPTY_CELL` (255) through untouched (D028).
- View-only settings (canvas color) never reach an export call site (D087).
- Export drawing creates canvases, encodes PNGs and loads the font and texture only through
  `lib/export/canvas-backend.ts`, never by touching `document` or `Image` directly (D125). That is the seam the
  server backend plugs into (D153), so breaking it breaks server exports.
- The PDF adapter keeps opaque drawing on direct operators with one font
  resource per page; `tests/unit/pdf-canvas-adapter-resources.spec.ts` guards
  it (D126).
- Crisp consumers use the shared admissible-cost functions or throw. Crisp
  with contour refinement throws (D063, D068).
- Crisp boundary evidence must stay identical to its verbatim reference copy:
  `tests/unit/crisp-evidence-equivalence.spec.ts` (G-035 M4). Crisp+ changes stay behind
  `edgeModel: "blurred-step"` and `"crisp-plus"`, never Crisp's defaults (D139).
- ICM inner loops use no closures or array scans (D044).
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
- Anchor uses code pairs from an unlicensed table under an Owner judgment
  call. Read `docs/anchor-colors-provenance.md` before touching it (D094).
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
- On this Windows host, stopping a background task can leave node running;
  check the process list (D096).
- Both photo decode paths must stay byte-identical:
  `tests/e2e/decode-parity.spec.ts` (D128).
- Generation reads the full decoded photo; a future cap starts from D129's
  findings, not from a shrink alone (D130).
- The processor publishes no port and is reached only through `app/api/`, which holds the Origin
  check and the rate limit. Job results travel in the editable-JSON save format, so a change to
  `pattern-serialize.ts` changes the wire format too (D151).
- What the processor accepts is derived from the type unions in `processor/validate-settings.ts` and
  `processor/validate-export.ts`, never retyped: a hand-written copy once spelled `PaletteMode`'s "full" as "free"
  and rejected every generation.
- The export font and stitch texture travel with the bundle: `npm run build:processor` copies them into
  `dist/processor/assets`, so `dist/processor` runs anywhere. The image carries no fonts of its own, and without a
  registered one every measured text width is zero (D153).
- Paginated exports (A4, PDF) get 60 s plus 2 s per A4 grid page, never under the old fixed 150 s, and Export all that
  share for each of its three paginated sets (D168; `processor/job-protocol.ts`, `exportDeadlineFor`).
- The Origin check compares canonical origins: `localhost`, `127.0.0.1` and `[::1]` on one scheme and port are
  one site, while scheme and port still separate origins and an unparseable origin is dropped rather than
  compared. `APP_URL` has no default, so leaving it unset trusts only the origin a request arrived at (D156).
- A job event stream carries an SSE comment frame every 15 s so an idle or queued job is not dropped by a proxy.
  Both clients must take the frame's data line and skip anything else: parsing every frame as JSON broke
  generation and exports in production (`tests/unit/job-stream-keepalive.spec.ts`).
- `PROCESSOR_WORKER_HEAP_MB` caps each pool worker's heap. Unset in production, it proves the PDF's heap is bounded: at
  512 MB a 1000-stitch Pattern Keeper PDF completes, where it once failed at every cap up to 1536 MB (D169).
- The PDF releases each page as it is drawn through two private pdf-lib 1.17.1 fields (D169). A pdf-lib upgrade must keep
  `tests/unit/pdf-page-flush.spec.ts` green, or the flush silently stops and the heap grows back.
- Rate-limit capacities default to production values and are overridable by environment variable
  (`RATE_LIMIT_JOBS_PER_MINUTE`, `RATE_LIMIT_PREVIEWS_PER_MINUTE`) so the e2e suite is not refused; a zero or
  malformed value falls back to the default rather than disabling the limit.

## Next steps and open questions

- Left open from G-039: ending a drag costs 116–132 ms at a 6 px stitch against a 100 ms target, a drag's first frame paints in full (34–77 ms), and a drag with symmetry on keeps the pre-M3 cost (D145). From G-038: Crisp+ can end under the requested colour count on a busy photo (road-mountains 14 of 24), since a refill split learns only from cells inside a colour (D142). From G-033: "+ Add" keeps its old flow, and touch screens pick on tap without a comparison readout.
- Left open: G-028 — OXS symbols use each reader's own font glyph, and the export is untested in PCStitch or WinStitch (`docs/reviews/2026-09-13-oxs-format-evidence.md`); G-032 — the 1.5 s enhancement target and Brighten's real-photo calibration.
- G-034 is signed off (2026-09-18) and archived in `docs/goals-archive.md`. Its one unmet criterion — Export all and the Pattern Keeper PDF at 1000 stitches, shipped as a limitation (D155) — was met by G-046 M2 on 2026-09-19 (D169).
- Settled by G-044 (2026-09-18, D156): origins are compared in a canonical form, so the loopback spellings read as one site, and `APP_URL` has no compose default. Production supplies it through the deploy `.env` that `COMPANY/INFRASTRUCTURE_DEPLOY.md` prescribes -- the file the earlier note here overlooked when it claimed the localhost default was in force.
- Known gap in the processor: if a worker file is missing or corrupt, `new Worker(...)` throws inside `spawn()` and can take the service down instead of failing one job. Low risk (the bundle ships inside the image), unfixed deliberately — it surfaced only when a build directory was deleted mid-run.
- G-046 (larger canvases) is ACTIVE: M1 measured every wall (`docs/reviews/2026-09-18-larger-canvas-walls.md`, candidate cap 1500); M2 bounded the PDF's heap (D169) and gave paginated exports a per-page deadline (D168); M3 made ICM 14–55 % faster, exactly (D170), all deployed 2026-09-19. 2000 Crisp still takes about 53 s on the host. M4 (the editor's zoom, the validators, then raising the cap) awaits the Owner. G-030 (public launch) is a far-future draft; G-023 (Rust) lives on as G-046's conditional M5.
- Owner decisions not yet made: a real evenweave/linen fabric model (`docs/domain-reference-fabric-types.md`); gaps from `docs/reviews/2026-09-12-competitive-analysis.md`.

## Deploy log

Every deploy, with what changed and how it was verified, is in `docs/deploy-log.md`. The last three entries:

| Date | Commit | What changed | How verified |
|---|---|---|---|
| 2026-09-19 | c9eea53 | G-046 M3: ICM evaluates a cell's neighbour labels first and scans the palette only when none scores below the least any other label can cost, with byte-identical results (D170); `npm run bench` gains a 2000-stitch configuration | Playwright 318 passed, 0 failed across all 26 specs; Vitest 1065 passed, 8 skipped; golden hashes and both M5 equivalence specs unchanged; tsc, eslint, docs-lint and the build clean. Both cross-stitch containers recreated; 41 containers before and after with an identical name set, no other container restarted, all 38 vhosts identical to the baseline (35 at 200). Live: a photo generated at 1000 stitches in 8.1 s and its Pattern Keeper PDF opened with all 147 pages |
| 2026-09-19 | fd174cd | G-046 M2: each Pattern Keeper page is released as soon as it is drawn, so the PDF's heap stays bounded with byte-identical files (D169, superseding D155); paginated exports get 60 s plus 2 s a page (D168); every Playwright config that starts servers shares one processor-and-app pair | Playwright 318 passed, 0 failed across all 26 specs; Vitest 1064 passed, 8 skipped; tsc, eslint, docs-lint and the build clean. Both cross-stitch containers recreated (the processor changed); 41 containers before and after with an identical name set, all 38 vhosts identical to the baseline (35 at 200). Live: a real photo at 1000 stitches exported a complete 147-page Pattern Keeper PDF in 38.5 s, which had failed on production since G-034; an A4 export at 1000 took 126.0 s |
| 2026-09-18 | f1cfa8b | G-045: the start screen's "01" badge is removed and its accent becomes a selection -- the photo card by default, the empty-grid card while its settings are open, never both, and taking another way in hands the mark back (D167) | Playwright 318 passed, 0 failed across all 26 specs; Vitest 1061 passed, 8 skipped; tsc, eslint, docs-lint and the build clean. Only the app container was recreated; 41 containers before and after with an identical name set, and all 38 vhosts byte-identical to the pre-deploy baseline (35 at 200 -- the host gained a site from another project between deploys). Live: the badge gone, the accent measured moving between the cards and back, and the start screen still wholly inert over a covered chart |
