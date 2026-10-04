# Handover — cross-stitch-pattern-generator

Last verified: 2026-10-05 at 4433856 (G-094 deployed, awaiting sign-off)

Photo → editable, printable cross-stitch chart. Decoding, generation and every export but the editable save run on the server. A
standalone Owner project (not svc-lab), live at
<https://cross-stitch.craftodejnice.cz>. Goals are in `GOALS.md`, completed
goals in `docs/goals-archive.md`, and company rules in `E:\CLAUDE\COMPANY\`.

## Current state

**Production** runs 4433856 (2026-10-05, per the deploy log below): the 1b shell, and generation and every export but the editable save running in the `processor` container. The work itself is in the Rust sidecar and **nothing stands behind it** — the TypeScript pipeline is deleted, not disabled (D221).
Every signed-off goal, with what it produced and how it was verified, is in `docs/goals-archive.md` — G-028 onwards, from the OXS format to the Atelier redesign (D157–D167), the move to the server (D149–D155) and the Rust port.

**G-094, document module — built and deployed 2026-10-05 (4433856), awaiting the Owner's sign-off.** The chart is a document of layers (`lib/document/`: `types.ts`, `convert.ts` with `flatten`, `change.ts`, `history.ts`, `migrate.ts`); today it has one layer, the tools read and write its flat view (`StitchPattern`), and the file on disk is still one grid. Undo keeps what changed between two documents, not a copy (D289; measured in `docs/reviews/2026-10-05-undo-and-flatten.md`, repeatable with `scripts/measure-undo.ts`); the editor's history is `app/hooks/use-document-history.ts`. The file's version and the one step that brings an older file up to date are in `lib/document/migrate.ts`; a later version is refused. Fabric count and unit are the chart's own, saved in its file (D290). The server's writer of the editable file (`rust/cs-export/src/editable.rs`) is held to the editor's, byte for byte, by `tests/unit/file-migration.spec.ts`: a new field of the chart goes into both.

**G-093, command registry — signed off 2026-10-05, archived.** Every action is a command in one table (`app/commands/registry.ts`, plus the `commands` each tool module declares; pure half `lib/editor/commands.ts`, D286): the keyboard shortcuts name no key and read it, and the command list (`app/components/command-list.tsx`, opened from "Commands" under New or with Ctrl+K, D287, D288) draws it. A tool declares its options as data (`app/tools/options.tsx`, drawn by `app/components/tool-options.tsx`, D285). `npx tsx scripts/design-brief-commands.ts` checks the table against the brief and writes the command table in `docs/interface-placement.md`. To add a command or a tool option, follow `docs/architecture.md` section 3.

**G-092, tool registry — signed off 2026-10-05, archived.** A tool is one module under `app/tools/` (its definition and a `useRuntime(api)` hook) and one line in `app/tools/registry.ts`; `app/tools/use-tools.ts` routes the pointer and the keys to the tool in hand and has no per-tool code (D284). The tool list, shortcut keys, cursor and options read the registry. A tool touches the editor only through `EditorApi` in `app/tools/types.ts`. To add a tool, follow `docs/architecture.md` section 3.

**G-091, editor shell — signed off 2026-10-04, archived.** Replacing the open chart is one table: `lib/editor/document-replace.ts` says what each of the seven ways in resets and `lib/editor/document-replace-run.ts` carries it out (D282); a new piece of state that a new chart must reset is added there, not in `app/workspace.tsx`. Every new document resets the same things (D283). `ImageWindow` and `ContextBar` take named groups of props.

**G-090, readiness to grow — signed off 2026-10-04, archived.** `docs/reviews/2026-10-04-growth-readiness.md` answers whether the app is ready for layers, a vector editor and plugins (it is not: closed document model, closed tool list, wide workspace). `docs/architecture.md` is the target (four layers, registries) **and the placement guide for where a new tool, operation, chart field, setting or export goes today**: read it before adding a feature. `docs/interface-placement.md` gives every control's scope and the command list; `docs/development-loop.md` the lanes, the commands (`npm run check:fast`, `npm run e2e:servers`, `npm run test:e2e`) and measured times; `docs/qa-review/` the first exploratory QA report (16 findings; 11 fixed in the first fast-lane batch, 2 awaiting the Owner's choice, 3 left). Follow-up goals G-091 to G-096 are drafted in `GOALS.md` in dependency order: shell, tool registry, command registry, document module, redesign, loop fixes.

**G-088, design brief — written 2026-10-02, awaiting the Owner's sign-off.** `docs/design-brief/` (start at its `README.md`) describes what the app does and every control's range, values, states, defaults, what is kept and which actions run on the server, for a redesign; it names no interface element and leaves out accounts, the admin area and touch. `scripts/design-brief-ranges.ts`, `design-brief-words.mjs` and `design-brief-coverage.mjs --strict` keep it true; `docs/reviews/2026-10-02-design-brief-check.md` says what was checked and what was not. A goal that changes a behaviour or range updates the brief in the same change.

**G-087, set-up palette and colour prediction — signed off and deployed 2026-10-02 (4ef4538), archived.** The Photo tab's Palette section has an Automatic / Set up palette switch (`app/components/palette-setup.tsx`): the user adds threads of the palette mode in force (custom RGB colours in Full range), fills the set from the predicted colours, saves it by name (`lib/editor/saved-palettes.ts`, localStorage) or loads a palette file; the chart then takes each cell's nearest chosen colour (`PaletteSet` in `rust/cs-core/src/pattern.rs`, D277). `cs-job predict` (`rust/cs-core/src/predict.rs`, D276) answers in milliseconds with the suggested colour count and range, the colours, and how well a set covers the picture; it reaches the page through `POST /predictions` (processor) and `app/api/predictions/route.ts` and sets the colour slider's ceiling and hint (`app/hooks/use-color-prediction.ts`). The set is kept in the browser's options, in the editable file as the optional `generationPalette` (`lib/editor/palette-set.ts`), and restored on opening a file that has one; a file without one, or a new photo, resets it and the four photo sliders. The Export dropdown writes a palette file of the chart's threads. Measurements: `docs/reviews/2026-10-02-colour-prediction.md`. The hint thresholds were tuned on four fixtures, not on shadowed pictures. A new picture starts at its recommended colour count; saved palettes live only in the browser, plus the downloaded file.

**G-086, backstitch in the Stitched view — built and deployed 2026-10-02 (ac7a9cc), awaiting the Owner's look.** The Stitched view (`drawScene`, `app/chart-scene.ts`) and the realistic preview export (`rust/cs-export/src/preview.rs`, `lib/export/render.ts`) draw the chart's backstitch as plain solid coloured lines over the stitches (D275); a textured thread is to come.

**G-084, backstitch from lines — signed off 2026-10-02 and archived; built and deployed (bb9a210).** An optional generation setting (Photo tab, Lines; `backstitchLines`, `backstitchSensitivity`; off by default) that traces thin lines of a drawing, dark, light or coloured, as backstitch in up to three threads (D269). `rust/cs-core/src/lines.rs` finds them (sub-pixel ridges, linked, fitted to stitches by dynamic programming, D272) and paints them out of the picture before generation reads it; `attach_backstitch` in `pattern.rs` puts them on the chart in their threads (existing ones or new ones at the end of the palette). Only a mostly flat picture is traced (D267); the numbers are read from `docs/reviews/2026-10-02-backstitch-from-lines.md`. The option travels app to processor to `cs-job` like Vivid (`validate-settings.ts`, `rust-jobs.ts`).

**G-083, export fixes — built, deployed and signed off 2026-10-01 (live at ff36e18).** The A4 export has its own cell size (the Chart pane's "A4 cell size, mm", option `exportCellMm`, default 5.5, `lib/export/export-cell-size.ts`), carried to the Rust exporter as `cellMm`; its layout (`calculate_a4_layout`, margin 8 mm, gutter 12 mm) is separate from the Pattern Keeper PDF's (`calculate_layout`, unchanged). The A4 pages carry a map of the pages first, a letter on every page, "overlap X" labels outside the pattern, the centre marked, and a skein table (`rust/cs-export/src/a4.rs`, `centre.rs`); the full-size chart gains the centre marks in Rust and TypeScript and keeps its 24 px stitch. The TypeScript A4 path was not changed (D264).

**G-082, half stitches — signed off 2026-10-01 and archived; built and deployed 2026-10-01 (M1 to M5, 43bdb97; cut 50 % at 3d0ee8a).** A cell holds a whole stitch or a half stitch "/" or "\" (one kind per cell, Owner): `StitchPattern.cellKind` (`lib/editor/stitch-kind.ts`, D258), one byte per cell beside `cellPalette`, absent while every stitch is whole. A **Stitch type** choice (three radio icons) in the top bar (`app/components/context-bar.tsx`, option `stitchKind`) sets what the brush, Fill, the shapes, Lasso fill and Fill selection lay down. Colour and B&W draw the cell with two opposite corners cut away, 50 % of the side (`lib/export/half-stitch-shape.ts`, D259); the Stitched view and the preview picture cut the stitch texture with a supersampled mask of the same shape. The legend, the A4 colour key (a Type column) and the full chart list every stitch type and thread; the Pattern Keeper PDF and the OXS file carry half stitches as whole ones (D260). The Rust exporter (`rust/cs-export/src/halfstitch.rs`, `model.rs`, `render.rs`, `a4.rs`, `preview.rs`, `editable.rs`) and the TypeScript twin agree, checked by `tests/unit/half-stitch-export.spec.ts` and `rust/cs-export/tests/half_stitches.rs`; a chart with no half stitch exports the same bytes as before. Not done: the photo-overlay view shows a half stitch as its symbol only, and an OXS file's part stitches still open as whole stitches (the spec does not say which triangle of the cell a single colour fills).

**G-081, the Text tab — signed off 2026-10-01 and archived; M1 to M6 deployed 2026-10-01 (4337881, then b17745c: Add blocked in view-only modes, same letter = same stitches D256, 41 bundled fonts in `lib/editor/bundled-fonts.ts` and `public/fonts/bundled/`, D257), all deployed.** `app/components/text-pane.tsx` (the fourth Inspector tab), `lib/editor/text-raster.ts` (text -> whole stitches, weight as a coverage threshold, minimum size 7), `lib/editor/local-fonts.ts` (the browser's font listing, a face loaded in memory, the typed-name fallback), `lib/editor/lettering-warnings.ts`, and `lib/editor/text-selection.ts` with `select.insert` (Add as Paste). The tab's text and thread live in `app/workspace.tsx`. The legibility review is `docs/reviews/2026-10-01-text-legibility.md`. Fonts and text never reach a request or a saved chart (D255). Verified at M6: 926 unit, Text-tab e2e 45 of 45 over three repeats. Verified at M4: 911 unit, 490 of 493 e2e (the two admin-stats cases pass alone; one fonts-listing timing case fixed), tsc, eslint, prettier.

**G-080, a predictable cell cursor — signed off and deployed 2026-10-01 (cd6fbdb), archived.** A dot at the pointer (`drawPointerDot` in `app/editor-geometry.ts`, drawn by `app/hooks/use-chart-renderer.ts` with the outline) and a keyboard cursor (`app/hooks/use-keyboard-cursor.ts`, stepping in `lib/editor/keyboard-cursor.ts`): arrows move the stitch (Shift: ten), Enter is the pen, for the brush, Fill and the shape tools; it dispatches the pointer events the mouse would (D254). Record in `docs/goals-archive/G-071-to-G-080.md`.

**G-079, small fixes — signed off and deployed 2026-09-30/10-01 (ee8fa28), archived.** Errors have a cross and clear after 12 s (`app/components/ui.tsx` `NoticeBar`/`InlineError`, `app/hooks/use-auto-dismiss.ts`); the canvas colour is a `react-colorful` swatch on the Chart tab (`app/components/canvas-color-field.tsx`), not in the top panel, which no longer shows "Loaded: name" either (specs wait for Generate through `expectPhotoLoaded`); the transparency lock (`lockTransparency` option, padlock in `app/components/context-bar.tsx`) is one rule in `lib/editor/pattern-edit.ts` applied in `app/tools/` (D253). Record in `docs/goals-archive/G-071-to-G-080.md`.

**G-076, stitch textures — signed off and deployed 2026-09-30 (8fc5bf2), archived.** The Chart pane's texture buttons (`app/components/texture-picker.tsx`) set the persisted `stitchTexture` option, which draws the on-screen Stitched view and the exported realistic preview (D248, D249). Textures live in `lib/export/stitch-texture-catalog.ts` and `TEXTURES` in `rust/cs-export/src/preview.rs`. Record in `docs/goals-archive/G-071-to-G-080.md`.

**G-075, accounts — signed off 2026-09-30, archived.** Optional registration/login/personal cabinet
(`/account`) and admin tools (`/admin/users`, `/admin/stats`) on NextAuth v5 + Prisma + Postgres + bcryptjs
(D244–D247); generating and exporting are unaffected signed in or not. The Owner's own account is the real
admin; bootstrap is closed (`ADMIN_BOOTSTRAP_ENABLED=false`). Full record in `docs/goals-archive/G-071-to-G-080.md`.

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
- **The four photo sliders** (G-074 M2): brightness, contrast, saturation and warm/cool in the Photo tab,
  applied to the photo in the browser as they move, with no request to the server. One definition
  (`lib/pipeline/photo-adjust.ts`) mirrored in Rust (`rust/cs-core/src/photo_adjust.rs`) and compared byte
  for byte by `npm run test:photo-adjust:rust` (D237); it clips out-of-gamut colours rather than
  chroma-reducing them, which is both what a saturation slider should do and what makes it affordable
  (D238). The preview is a downscaled copy at 1440 px, drawn in a worker: quarter-size while a slider
  moves, full when it settles. Generation applies them at full resolution before any stage reads the
  photo (D239), so the chart is the chart of the photo on screen; the values travel with the request,
  are recorded on the pattern and saved with it, and are absent when neutral so a chart made without
  them is the file it always was. A chart carries its sliders wherever it goes (D241): the photo views draw
  the photo *as adjusted*, and opening a chart puts its sliders back, so Regenerate reproduces it. The
  sliders are provisional until a Generate (D243): on the Photo tab with a photo view up that view follows
  them live, and leaving without generating gives the change up.
- **The five photo-enhancement modes are gone** (D240, G-074 M4): the modes, their analysis, the preview
  endpoint, its worker, its cache and its rate-limit allowance — about 2,300 lines. D118 is settled as
  never released. A chart saved with one still opens and still says which; regenerating it will not
  reproduce it, because the mode that made it no longer exists. `lib/editor/legacy-enhancement.ts` is all
  that is left: the ids, to read them by.
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
- **Photo preview path (in the page, G-074 M2)**: `app/hooks/use-photo-adjust-preview.ts` →
  `lib/editor/photo-adjust-preview.ts` → `lib/editor/photo-adjust.worker.ts`, painting a downscaled copy
  (`lib/pipeline/photo-preview.ts`) onto a canvas. Nothing leaves the page; the server has no preview endpoint
  since D240.
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
- **The four photo sliders** (`lib/pipeline/photo-adjust.ts`, mirrored in `rust/cs-core/src/photo_adjust.rs`):
  brightness, contrast, saturation and warm/cool as fixed per-pixel transforms in OKLab, clipping rather than
  gamut-mapping (D238). Applied first in the pipeline, so every later stage reads the adjusted photo (D239);
  neutral returns the photo untouched, byte for byte.
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
  `crisp/` holds Crisp and Crisp+, `threads.rs` brand matching, `photo_adjust.rs` the four sliders, `dither.rs` G-052's patterns,
  `jsmath.rs` and `fdlibm.rs` the V8-exact maths (D183, D184) pinned by `rust/cs-core/tests/jsmath_vectors.rs`.
  `rust/cs-export` ports every export: `text.rs`/`canvas.rs` draw DejaVu text as the processor's canvas does (D187),
  `pdf.rs` pdf-lib's structure (D189), `bundle.rs` JSZip's ZIPs. `rust/cs-bench` is the CLI behind `npm run compare:rust`.
- **Tests**: four layers (D222). Unit specs in `tests/unit/` cover the browser and the editor. The generation
  pipeline is covered by `scripts/rust-goldens.ts` (39 recorded hashes, D107), `rust/cs-core/tests/
  pattern_invariants.rs` (what must hold of *any* chart), `scripts/rust-photo-adjust.ts` (the two copies of the
  adjustment) and `scripts/rust-photo-adjust-pipeline.ts` (that a chart made with the sliders is the adjusted
  photo's chart). All four need
  `cargo build --release` first and run under `vitest.rust.config.ts`. E2E specs are in `tests/e2e/`;
  `npm run test:e2e` starts the processor and the app together, since the page needs both.
  `compare:export-parity` diffs two running builds.
- **Deploy**: `Dockerfile` builds two targets (`runtime`, `processor`) and `docker-compose.yml` runs both under
  D149's caps (app on `127.0.0.1:30150`; the processor publishes no port). Recipe and shared-host rules:
  `COMPANY/INFRASTRUCTURE_DEPLOY.md`; verification per D027.
- **Accounts (G-075)**: `auth.ts` (NextAuth v5, Credentials provider, JWT sessions) sits in front of
  `prisma/schema.prisma` through `lib/prisma.ts`'s singleton client (D244); `lib/auth/actions.ts` holds
  register/login/logout as server actions (D245), validated by `lib/auth/validation.ts`, rate-limited by
  `authRateLimited` in `lib/server/request-guard.ts`. `docker-compose.yml` gained an un-profiled `db` service
  (local dev needs only `docker compose up -d db`) and a one-shot `migrate` service the `app` profile depends
  on; `prisma.config.ts` reads `DATABASE_URL` from `.env` for local Prisma CLI commands. The generated client
  (`generated/prisma/`) is gitignored and rebuilt by `npx prisma generate` — the Dockerfile's `build` stage and
  every e2e run do this before `next build`, which otherwise fails to typecheck pages importing it.
- **Personal cabinet (G-075 M2)**: `app/account/page.tsx` re-reads the account from Prisma on every request
  rather than trusting the JWT session (D246), and renders `NameForm`, `PasswordForm` and `DeleteAccount`
  (`app/components/account/`) plus its own logout button. All three call `lib/auth/account-actions.ts`, which
  reads the signed-in id from `auth()` and never trusts a form-carried id. `AccountBadge`
  (`app/components/auth/account-badge.tsx`) is a `position: fixed` pill, bottom-left past `ToolRail`'s 64px
  width (moved from top-right, Owner 2026-09-29 -- it overlapped the inspector's Threads tab there).
- **Admin (G-075 M3–M4)**: `app/admin/layout.tsx` guards every `/admin/*` page (signed out → `/login`,
  non-admin → `/`); `/admin` redirects to `/admin/users`, which paginates via `lib/admin/pagination.ts`
  (unit-tested; page size overridable like the rate limiter's env vars). Its row actions
  (`lib/admin/user-actions.ts`) are server actions bound to a row's id (`.bind(null, userId)`); each
  re-checks the caller is admin and refuses to act on the caller's own account. `/admin/stats` reads
  `lib/admin/usage.ts`'s `usageCountsByKind`, windowed by `usage-windows.ts` (pure, unit-tested; UTC
  calendar days, D247); its counter, `recordUsage`, is called but never awaited from `app/api/jobs/route.ts`
  and `app/api/exports/route.ts` (D247).

(Backstitch is corners rather than cells, so it has its own geometry module: `lib/editor/backstitch.ts` holds hit-testing, the transforms, the symmetry orbit and the both-ends rule, with no React and no canvas in it. `app/tools/` has the two hooks that drive it and `app/editor-geometry.ts` draws it.
Every *export* of it is Rust: `rust/cs-export/src/backstitch.rs` for the dash and bead rules,
`draw_backstitch` in `render.rs` for the drawing, called by the chart PNG and by `a4::draw_grid_page` —
which the Pattern Keeper PDF shares and calls with backstitch switched off.)

## Rules in force

- The Pattern Keeper PDF must stay byte for byte as it was before G-083: `rust/cs-export/tests/pattern_keeper_pinned.rs` pins it, and a mark added to the shared A4 page drawing is opt-in (`PageMarks`) and off for it (D264).
- Code that writes cells must write `cellKind` with them, or go through `withCellPalette`/`withCounts`, which make a changed cell whole and tidy the array; an empty cell is always whole (D258). The project store and the saved file name `cellKind` by hand.

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
- Omitting `edgeMode`, `contourRefinement`, a brand or `photoAdjust` (or passing it neutral) must reproduce
  Standard output byte-for-byte — `scripts/rust-goldens.ts` asserts it on every recorded case.
- **A callback handed to a long-lived worker must not close over an effect's state.** The worker keeps the
  callback it was created with, while the effect re-runs on every change; a `cancelled` flag from the
  first closure then silences every later answer. Found 2026-09-27 on the live build: the photo view
  moved for one keystroke and never for a drag. What is current goes in a ref.
- **A slider is tested by a drag, not by one value.** `fill()` sets a value once and passes where a real
  drag fails; the bug above survived a green suite that way (`tests/e2e/photo-sliders-generate.spec.ts`).
- **The TypeScript pipeline is gone** (G-068 M3): generation, crisp edges, quantisation, denoise and the optimiser exist only in `rust/`. `lib/pipeline` keeps the vocabulary (`generation-modes.ts`), the dither preview the browser draws, `regions.ts` behind the Fill tool, `downsample.ts`'s grid maths and `enhance.ts`. Adding a pipeline feature is a Rust change and a golden-hash decision, not two implementations.
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
- Six rules specific to the drawn dither pattern subsystem (G-052–G-059: seeding, texture validation, shape
  ranking, the field, per-shape knobs, the preview) moved to
  `docs/reviews/2026-09-27-drawn-pattern-rules.md` on 2026-09-27 — this section passed its cap. Read that file
  before touching `lib/pipeline/dither-hand-drawn.ts`, its Rust port, or the Texture editor.
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
- Small interface-only changes go by the fast lane (Owner, 2026-10-04, D280): affected tests only, one line under "Small changes" in `GOALS.md`, deployed in a batch after one full run. Anything touching chart data, files, exports, generation, the processor, Rust or accounts is a normal goal.
- Rate-limit capacities default to production values, overridable by `RATE_LIMIT_JOBS_PER_MINUTE`, `RATE_LIMIT_AUTH_PER_15MIN` (G-075) and `RATE_LIMIT_PREDICTIONS_PER_MINUTE` (G-087, 90, so the colour hint never spends a Generate), keyed separately per `kind`; a zero or malformed value falls back to the default.
- `ADMIN_BOOTSTRAP_ENABLED` must be set to `"false"` once the real admin account exists (G-075): left `"true"`,
  anyone who registers `ADMIN_EMAIL` becomes an admin, since there is no email verification to stop them.
- Prisma's own CLI and `@prisma/client` must stay on the same major version by hand: npm's `prisma` `latest`
  dist-tag currently points at an 8.x release candidate while `@prisma/client`/`@prisma/adapter-pg` resolve to
  7.x. `npm install -D prisma` alone installs the mismatched RC; pin `prisma@^7.x` explicitly (G-075 M1).
- The corner badge's name is stale until the next login (D246): it reads the JWT session, which a rename on
  `/account` does not touch. `/account` itself is always fresh. Don't "fix" this by reaching for the `jwt`
  callback first — call NextAuth's `update()` from `NameForm` instead (D246's rejected alternative explains why).
- An admin can never demote or disable their own account (`lib/admin/user-actions.ts` checks the target id
  against the caller's own before every write): the only way to undo the one signed-in admin would be another
  admin, and there may not be one. `UserRowActions` hides the buttons for that row too, so the only way to hit
  the check is a hand-crafted request, not a normal click.

## Next steps and open questions


- G-076 (stitch textures) was signed off 2026-09-30 and is archived.
- G-075 (accounts) was signed off 2026-09-30 and is archived. G-074 (the four photo sliders) was signed
  off on 2026-09-27 and is archived, as is G-073 (backstitch, 2026-09-26). Two drafts wait on the Owner:
  **G-069** (the workspace's shape, from `docs/reviews/2026-09-24-workspace-shape.md`) and **G-030** (public
  launch, far future).
- **Left for a future goal, found while building it:** the casing threshold and bead spacing were judged on screen, never on paper — only a print settles how a 0.55 mm dashed line reads at a 2.75 mm cell (`docs/reviews/2026-09-25-backstitch-samples.md`). Backstitch is also absent from the realistic preview,
  which draws stitches from tiles and has no notion of a line.
- Weakest area, unchanged by G-073 and reinforced by it: **tests assert data, not what is drawn.** Every backstitch defect the Owner found in G-073 — the zoom displacement, the missing highlight — was invisible to a suite asserting exported coordinates, and two more were found only by *looking* at a sample export. Three pixel-level tests now exist (`backstitch-scene-placement.spec.ts`, and the highlight and Isolate cases in the e2e); nothing else asserts a frame during a gesture except `tests/unit/piece-preview-cells.spec.ts`.
- **`cargo fmt --check` is not clean and not in CI**: 11 pre-existing diffs in `cs-core`, against STANDARDS → Code style, which names `cargo fmt --check` as a required CI check. Found 2026-09-25 during G-073 M5 and left alone rather than mixed into that change.
- G-070 is closed as answered: the V8 maths port costs nothing — replacing it is **13–25% slower** with
  identical output (D223). Its one actionable finding shipped as G-071: the build targets `x86-64-v3`,
  worth a mean 6.6% (D224). Both are written up in `docs/reviews/2026-09-24-parity-tax.md`.
- `tests/e2e/shape-tools.spec.ts` ("the outline/filled choice belongs to the shapes that enclose something") was flaky
  until 2026-10-01: it reloaded the page and expected the start screen, but a reload restores the autosaved chart. Its second
  visit is now a new browser context carrying only the saved settings (12 of 12 repeated runs).
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

Every deploy, with what changed and how it was verified, is in `docs/deploy-log.md`. The newest, first:

| Date | Commit | What changed | How verified |
|---|---|---|---|
| 2026-10-05 | 4433856 | **G-094:** the chart as a document; undo as recorded changes (D289); one migration step for the file, fabric in the chart (D290); the editable file in Export all no longer drops five fields | 1075 unit; Rust export tests; full local e2e 564 pass, 0 fail; live: 3 fabric and file cases pass (one on retry); app and processor restarted, other containers untouched; six sites 200 |
| 2026-10-05 | 4e5a685 | **Fast-lane batch 4 (D288):** keys S, V, H, Z, Ctrl+C/V/D, Ctrl+K; brush size and shape only with Brush, Line, Rectangle and Oval | 1048 unit; full local e2e 558 pass, 0 fail; the 4 new cases pass against the live site (one on retry); only this project's app restarted; six sites 200 |
| 2026-10-05 | 81e5db3 | **G-093:** tool options as data (D285), the command registry behind the keys (D286), the command list (D287); no key added or changed | 1047 unit; full local e2e 554 pass, 0 fail; live: the 7 command-list cases pass, 4 of them on retry; 24 containers before and after, only this project's app restarted; six sites 200 |
| 2026-10-04 | 6e3d786 | **G-092:** tool registry (D284): tools as modules, the shell routes to them; no behaviour change | 1023 unit; full local e2e 547 pass, 0 fail; live: tool-key, shape, backstitch-edit and crop cases pass (see goal log for the one case re-run); only this project's app restarted; six sites 200 |
| 2026-10-04 | 42c2aa6 | **Fast-lane batch 3:** a new chart opens in the Color view (D283); the new-chart confirmation gains the one-press "Export, then start new" | Full local e2e 547 pass, 0 fail; the new cases pass against the live site; only this project's app restarted |
| 2026-10-04 | fec38f9 | **G-091:** replacing the open chart is one table (D282), every new document resets the same things (D283), grouped props, Crop keeps a fresh frame across charts | 1015 unit; full local e2e 545 pass, 0 fail; 4 new cases against the live site; only this project's app restarted; six sites 200 |
| 2026-10-04 | 10e205f | **Fast-lane batch 2:** QA findings 7 and 8 (the palette-mode switch is asked first; Escape per field in Crop) | Full local e2e 541 pass, 0 fail; 2 cases against the live site; only this project's app restarted |
| 2026-10-04 | 48f9ad8 | **Fast-lane batch 1 (D280):** 11 QA fixes (custom size typing, Crop frame and bar, palette mode on load, stale-prediction fill, empty-palette export, file names); recommendations at once 2 to 4 | Full local e2e 540 pass, 0 fail; 1003 unit; 6 of the new cases pass against the live site; app and processor restarted, other containers untouched; six sites 200 |
| 2026-10-03 | 19692ed | **G-089:** the Crop tool; the canvas numbers moved into it (D278, D279) | New e2e spec (10); full local e2e 531 pass, the two admin-stats cases pass alone; the spec passes live case by case (a whole-file live run trips the 6-a-minute job limit); only this project's app restarted; six sites 200 |
| 2026-10-02 | 2acffc0 | **G-087:** Set up palette, colour prediction and the colour count ceiling (D276, D277); predictions have their own rate-limit bucket | New e2e spec (7) against the live site; full local e2e 519 pass of 524 before the two photo-slider specs were updated for the new reset and ceiling (then pass), admin-stats pass alone; 74 goldens unchanged; only this project's app and processor restarted; six other sites 200 |
| 2026-10-02 | ac7a9cc | **G-086:** backstitch in the Stitched view and the realistic preview (D275) | New e2e spec against the live site; full local e2e 516 pass; site 200 |
| 2026-10-02 | fdc3c26 | **G-085:** texture strokes (D274) | New e2e specs against the live site; full local e2e 513 pass; 74 goldens green; site 200 |

## Decisions

One file per decision in `docs/decisions/`, indexed in `docs/decisions/README.md`.
