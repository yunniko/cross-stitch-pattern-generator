# Handover — cross-stitch-pattern-generator

Last verified: 2026-09-15 at eedb455 plus the handover commit that carries this line

Photo → editable, printable cross-stitch chart, entirely client-side. A
standalone Owner project (not svc-lab, no monetization), live at
<https://cross-stitch.craftodejnice.cz>. Goals are in `GOALS.md`, completed
goals in `docs/goals-archive.md`, and company rules in `E:\CLAUDE\COMPANY\`.

## Current state

**Production** runs `master` as deployed on 2026-09-15 (last deploy-log row).
Signed off: G-036 charts without freezing (`docs/reviews/2026-09-15-chart-rendering-results.md`), G-035
performance (`docs/reviews/2026-09-15-performance-results.md`; photo cap
cancelled, D130), G-032 enhancement (D118), G-028 OXS (D119). G-033 (swatch-aware
color editor) is deployed and awaits Owner sign-off.

**What works** (verified in this session unless marked otherwise):
- Generation from a photo at 10–1000 stitches and 2–100 colors, with Latest
  or Original clustering, Full range, DMC, Cosmo or Anchor palettes, and
  Standard or Crisp edges. It runs in a reused Web Worker with progress and
  cancellation.
- Editing: brush (double-click fills), 8-connected fill, rectangle select with
  copy, paste, move and flip, move, pan, zoom, highlight. Also merge (including
  into Empty), recolor, rename, symbol swap, add color, empty stitches, canvas
  resize, and one undo history covering regeneration.
- Color editor: opens under its legend row on the color's remembered thread
  swatch (D122), marked and scrolled into view; hovering or focusing a swatch
  shows an Okhsl comparison (D123); picks apply at once and the editor stays
  open, Full range drags are one undo step, Done keeps and Cancel or Escape
  restores, and a click outside closes it while still acting.
- Wheel and Zoom-tool zoom keep the stitch under the cursor in place; the
  zoom buttons keep the view's centre (D124).
- Five view modes (keys 1–5) and a view-only canvas color. Shortcuts: Ctrl+Z,
  Ctrl+Y, Ctrl+Shift+Z, Space-drag, B, F, and Escape to merge a selection.
- Exports: editable JSON (format version 7, embeds the source photo and each
  color's thread swatch), realistic preview PNG, Color and B&W full-chart PNG, A4 page ZIPs, Pattern
  Keeper PDF (the Owner re-confirmed a real import after G-035 M2), an OXS chart, and "Export
  all" `.cspzip`. Open accepts JSON, ZIP, `.cspzip` and `.oxs`, detected by
  content; an OXS import shows a notice listing everything it couldn't keep.
- Photo upload and reopening a save decode in a worker, with the old decode
  as a logged fallback; a 12 MP upload showed no main-thread task over 50 ms
  (D128).
- Persistence: the open project autosaves to IndexedDB (photo stored once by
  SHA-256, 500 ms debounce) and restores on reload. A corrupt record shows a
  banner with an on-demand error report. Options persist in localStorage.
- Photo enhancement: a Photo control (Off, Brighten, Auto, Vivid,
  Portrait), an enhanced preview with "Compare with original" before
  Generate, and the mode recorded in saved files. Brighten is a cautious
  exposure fix for dark or flat photos only. The other three are
  experimental: none passed its real-photo rule
  (`docs/reviews/2026-09-13-photo-enhancement-calibration.md`).

**Checks run 2026-09-15**: `tsc --noEmit` and eslint clean; Vitest 946 passed
(1 opt-in skip) at G-037 M2; Playwright 289/289 (including 208 parity cases) on a
production build of G-036 M4. CI
(`.github/workflows/ci.yml`) runs `next typegen` before the type-check,
because route types such as `LayoutProps` are generated and git-ignored.
It passed on GitHub for `fb28d4e`.

**Performance** (G-035 results, 2026-09-15, medians of 5 on the Owner's machine):
a 12 MP photo at 100 stitches / 16 colors takes 2.9 s in Standard and 7.5 s in
Crisp, down from 7.7 s and 42.7 s. At 1500×1000 → 1000 stitches / 64 colors,
Standard takes 4.9 s and Crisp 6.8 s. In the browser at 1000 stitches, generating
takes 6.9 s, the Pattern Keeper PDF 11.1 s and Export all 37.8 s, with no
main-thread freeze during exports. Tables are in
`docs/reviews/2026-09-15-performance-results.md`. Enhancing a 4000×3000 photo
takes 1.9–2.2 s by mode, above G-032's 1.5 s target.

**Known limitations**:
- Crisp takes about 2.6× Standard's time on a 12 MP photo (7.5 s against 2.9 s),
  because every cell gets the two-mode fit (D132). It falls back to
  Standard behavior for thin lines, junctions and gradual shading (D096).
- At 1000 stitches chart actions stay under 100 ms, but 4× CPU throttling still reaches 480 ms (G-036).
- Browsers without OffscreenCanvas 2D in workers fall back to main-thread
  exports, which stall the tab between pages (D125).
- The PDF has no bold face. Whether µ (which extracts as μ) matters in Pattern
  Keeper is unconfirmed (D074, D097).
- Highlight does nothing in the realistic preview (D028).
- Contour refinement exists but isn't adopted (D055).

## How things fit together

- **Stack**: Next.js 16 App Router (`output: "standalone"`), React 19,
  TypeScript strict, Tailwind 4, Vitest 4, Playwright 1.62, Node 22. Runtime
  dependencies: pdf-lib with fontkit, jszip, react-colorful, color-name-list.
- **UI shell**: `app/page.tsx` renders `app/workspace.tsx`, which owns only
  undo history, cross-dock state and pointer dispatch (pan → move → select →
  brush). Behavior lives in `app/hooks/`: options, restore, source image,
  generation, pan/zoom, chart renderer, canvas tools, exports, shortcuts. Docks
  live in `app/components/`, with shared controls in `app/components/ui.tsx`.
  Tool hooks reach the renderer through a ref assigned after render (D108).
  The chart frame (full chart size) takes layout, input and the zoom anchor; one canvas
  inside paints the visible part plus overscan (`app/chart-scene.ts`, D135, D136). Realistic
  and Original photo are view-only, where only Pan and Zoom act.
- **Generation path**: `app/hooks/use-generation.ts` →
  `lib/pipeline/pattern-client.ts` (one reused worker; discarded after a
  native error) → `lib/pipeline/pattern.worker.ts` → `buildPattern` in
  `lib/pipeline/pattern.ts`.
- **Photo decode**: `lib/editor/load-image.ts` sends the file or data URL to
  `lib/editor/decode-image.worker.ts`; `lib/editor/decode-main-thread.ts` is
  the fallback, and both size through `lib/editor/decode-bitmap.ts` (D128).
- **Pipeline order** in `buildPattern`:
  1. Area-weighted linear-light downsample.
  2. Sobel importance and per-pair color structure-tensor evidence (D044).
  3. One shared `PipelineContext` holding cell OKLab (D106).
  4. Importance-gated medoid pre-filter for the quantizer only (D041, D051).
  5. OKLab k-means: plain (Original) or merge-and-reinvest (Latest) (D018, D039).
  6. Coarse then fine ICM on an 8-neighbor stencil (D043, D045); a cell is
     re-evaluated only after a neighbour changes (D133).
  7. Small-component recolor and diagonal-pinch fixes.
  8. Palette merge, zero-count compaction, then OKLab palette recompute.
  9. Thread-brand snap with a re-run of fine ICM (D056), then dark-to-light
     sort, symbols and unique names.
- **Photo enhancement** (`lib/pipeline/enhance.ts`): a preset is analysed
  from the photo (white balance, levels and gamma, CLAHE, vibrance) and then
  applied per pixel. `buildPattern` enhances once. Downsampling and Crisp's
  colour fits read the enhanced photo; importance and pair evidence read the
  original (D112). Off returns the input untouched. The preview has its own
  worker (`lib/pipeline/enhance-preview.worker.ts`, D116).
  `releasedEnhancementModes()` decides what the UI offers; files may record
  any recognized mode (D113). If every stage abstains, the source buffer
  itself is returned (D118).
- **Crisp mode** (`lib/crisp/`): a frozen evidence layer (D065) feeds weighted
  quantization, admissible-label unary costs in ICM and cleanup, repair after
  merges, and mode-aware finalization (D061–D072). The layer evaluates every
  cell (D132); its sampling uses typed arrays and converts each source row to
  OKLab once per job (G-035 M4).
- **Threads** (`lib/threads/`): `thread-brands.ts` is the registry. Its
  `matching` field is "direct" for DMC and Cosmo, or "dmc-equivalence" for
  Anchor. `brand-match.ts` does the snapping. Data provenance is in
  `docs/*-colors-provenance.md`.
- **Export** (`lib/export/`): `render.ts` handles the chart layout budget and
  the realistic preview. A4 page drawing takes a `ChartDrawingContext`, so the
  same code draws PNG pages and PDF pages through `pdf-canvas-adapter.ts`
  (D074). `export-all.ts` bundles the existing exporters. `export-jobs.ts`
  runs every export; `export-client.ts` sends all but the editable JSON to
  `export.worker.ts`, which draws into `OffscreenCanvas` through
  `canvas-backend.ts` (D125). The PDF adapter writes opaque drawing as direct
  content-stream operators with one font resource per page (D126).
- **Editor data** (`lib/editor/`): pure mutations in `pattern-edit.ts`,
  validating (de)serializer in `pattern-serialize.ts` (D099), IndexedDB store
  in `project-store.ts` (D100), and options in `workspace-storage.ts`. OXS
  reading and writing live in `oxs.ts` on the dedicated XML reader
  `oxs-xml.ts` (D119); `pattern-import.ts` sniffs the format.
- **Experimental** (`lib/experimental/`): contour refinement, boundary chains,
  simulated annealing, diagnostics. Status table in its README.
- **Tests**: unit specs in `tests/unit/`. `golden-hashes.spec.ts` pins exact
  `buildPattern` output for 18 configurations (D107), and
  `m3-equivalence.spec.ts` compares the optimizer with a verbatim pre-M3 copy.
  E2E specs are in `tests/e2e/`. `npm run bench` runs `scripts/bench.ts`; `npm run bench:browser` runs
  `scripts/bench-browser.spec.ts` against a production build and writes to the
  OS temp folder.
- **Deploy**: `Dockerfile` (standalone build) and `docker-compose.yml`
  (profile `app`, `127.0.0.1:30150`). Recipe and shared-host rules are in
  `COMPANY/INFRASTRUCTURE_DEPLOY.md`; verification per D027.

## Rules in force

- The Owner gave standing push and deploy approval for this project on
  2026-09-13: deploy verified work without asking, unless something needs
  the Owner's attention. Deploys still follow `COMPANY/INFRASTRUCTURE_DEPLOY.md`.
- One session per working tree; don't stop another session's `next dev` (PID 17476, 2026-09-12).
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
- Export drawing creates canvases only through `lib/export/canvas-backend.ts`,
  and code on the worker path never touches `document` or `Image` (D125).
- The PDF adapter keeps opaque drawing on direct operators with one font
  resource per page; `tests/unit/pdf-canvas-adapter-resources.spec.ts` guards
  it (D126).
- Crisp consumers use the shared admissible-cost functions or throw. Crisp
  with contour refinement throws (D063, D068).
- Crisp boundary evidence must stay identical to its verbatim reference copy:
  `tests/unit/crisp-evidence-equivalence.spec.ts` (G-035 M4).
- ICM inner loops use no closures or array scans (D044).
- Modules e2e specs load in Node (the project store, serializer, import, exports) take symmetry types from
  `lib/editor/symmetry-axes.ts`, never `symmetry.ts`: its `pattern-edit` chain crashes Playwright (G-037).
- Screen drawing = frozen pre-G-036 drawing with band grid lines (photos ±16, outlines ±1),
  per `tests/e2e/chart-viewport-parity.spec.ts`; exports keep stroked grid lines (D135).
- ICM and both k-means paths stay identical to their pre-M5 copies (D133):
  `tests/unit/m5-equivalence.spec.ts`, `tests/unit/m5-equivalence-adversarial.spec.ts`.
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
- `npm ci --legacy-peer-deps` is required (npm arborist crash).
- On this Windows host, stopping a background task can leave node running;
  check the process list (D096).
- Both photo decode paths must stay byte-identical:
  `tests/e2e/decode-parity.spec.ts` (D128).
- Generation reads the full decoded photo; a future cap starts from D129's
  findings, not from a shrink alone (D130).
- Run `node E:\CLAUDE\COMPANY\scripts\docs-lint.mjs .` before every check-in.

## Next steps and open questions

- **G-037 in progress:** M1–M2 done (symmetry geometry, toggles, guide lines, D137, D138); M3 needs approval.
- **PENDING APPROVAL: G-031 sign-off.** All five milestones are done and
  verified; see the G-031 progress log in `GOALS.md`.
- **PENDING APPROVAL: G-033 sign-off.** The swatch-aware color editor is
  live (D122, D123); see the G-033 progress log in `GOALS.md`. Out of scope: "+ Add"
  keeps its old flow, and touch screens pick on tap with no comparison.
- Left open from G-028: OXS symbols use each reader's own font glyph, and the
  export is untested in PCStitch or WinStitch
  (`docs/reviews/2026-09-13-oxs-format-evidence.md`).
- Left open from G-032: the 1.5 s enhancement target, and Brighten's
  real-photo calibration.
- G-030 (public launch) is a far-future draft. G-023 (Rust sidecar) was measured as not needed.
- Owner decisions not yet made: a real evenweave/linen fabric model (`docs/domain-reference-fabric-types.md`);
  gaps from `docs/reviews/2026-09-12-competitive-analysis.md`.

## Deploy log

| Date | Commit | What changed | How verified |
|---|---|---|---|
| 2026-09-09 | 43175f8 | First deploy (G-001), port 30150 | Live upload, generate, both PNGs; neighbors unchanged |
| 2026-09-09 | 3903d8d | Interactive editor (G-007) | Live editor walkthrough |
| 2026-09-10 | 4ec00c8 | Brush, legend sort, rename (G-008) | Isolation check; live editor and legend |
| 2026-09-10 | 2d88480 | A4 page export (G-009) | Live ZIP downloaded and unzipped |
| 2026-09-10 | 21bd67d | Pattern name (G-011), job race fix (G-010 M1) | Live name field |
| 2026-09-10 | 10b0a95 | Review fixes G-010 M2–M6 | Header-clip repro on production; 9 sites 200 |
| 2026-09-10 | aadfec5 | Docked workspace (G-012) | Size-10 PNG 349 px wide on production |
| 2026-09-10 | cd46fb0 | Pan/zoom edge and wheel fixes (D030) | Isolation check |
| 2026-09-11 | eef7c1a | DMC, 100 symbols, options, A4 legend (G-013–G-016) | cm default, 100-color slider, DMC name live |
| 2026-09-11 | 2736d14 | Thread-only color editor (G-017) | Switcher live |
| 2026-09-11 | 7ef117f | Select and diagonal fill (G-018) | Pixel readback on production |
| 2026-09-11 | 634c341 | Transparent realistic preview (G-019) | Decoded production PNG: 700×700, alpha 0 on empty |
| 2026-09-11 | 5999b31 | Quantizer docs and attrition fix (G-020 M1–M2) | 2-color fixture stays 2 colors |
| 2026-09-11 | 83fe6c6 | Importance-biased reinvestment (G-020 M3) | Same smoke test |
| 2026-09-11 | 61b3011 | DMC as palette mode (G-021) | Original + DMC names live |
| 2026-09-11 | e3589f2 | Medoid pre-filter (G-020 M4) | Verified after Owner fixed a host-wide nginx outage |
| 2026-09-11 | c38f4ec | Lloyd final assignment (G-022 M1) | Regenerate, no console errors |
| 2026-09-11 | 748af98 | 8-neighbor energy (G-022 M2) | Regenerate, no console errors |
| 2026-09-11 | 05ff077 | Pair edge evidence (G-022 M3) | Regenerate, no console errors |
| 2026-09-11 | d8322c5 | Coarse edgeLoss 0.015 (G-022 M4) | Regenerate, no console errors |
| 2026-09-11 | fb449ec | XL and XXL presets (G-025) | XXL regenerate on production |
| 2026-09-11 | d246679 | Thin-line denoise fix, contour research (D051, G-022 M5) | 1-px line survives at 100 stitches on production |
| 2026-09-11 | 9654b11 | Brand snap re-runs ICM (G-020 M5) | Close-color circle gives DMC 318/414 live |
| 2026-09-12 | 1465baf | Crisp pipeline, no UI (G-024 M4) | Two live regenerations |
| 2026-09-12 | 958587d | Pattern Keeper PDF (G-026 M3) | 585 KB PDF downloaded live |
| 2026-09-12 | 8e03f03 | Edges toggle (G-024 M5), overlap note (D076) | Toggle renders live |
| 2026-09-12 | 5b314e9 | Export dropdown, Export all, yields (G-027) | Controls render live |
| 2026-09-12 | a56ca45 | Export controls in top bar (D080) | Toolbar check live |
| 2026-09-12 | 2aa0fb1 | Dark-mode select fix, tool icons (D081–D082) | colorScheme and icons live |
| 2026-09-12 | 91dd031 | Bucket icon (D083) | Icon live |
| 2026-09-12 | 82effd2 | Brush icon, grouped export list (D084–D085) | Default export value live |
| 2026-09-12 | 0f64f04 | Shortcuts, view modes, settings persistence (D086–D089) | Restored options and F/2 keys live |
| 2026-09-12 | 1e802f9 | Load-failure reports, navigator color (D090–D091) | Page loads clean; paths covered by e2e |
| 2026-09-12 | ca4cfb1 | Cosmo and Anchor palettes (G-029) | Four palette options live, no console errors |
| 2026-09-13 | 1380bd3 | G-031: IndexedDB autosave, strict loader, shortcut and drag fixes, faster pipeline, workspace split | Only this container restarted; 5 sites 200; live 1000-stitch generation 8.5 s, 50-cell stroke 1.2 s, 4 MB photo survives reload, 9/9 live e2e |
| 2026-09-13 | fb28d4e | Resize with empty stitches (D109), unselectable control text (D110), CI typegen | Only this container restarted; 5 sites 200; resize e2e 3/3 on production; computed user-select none on buttons, text on inputs |
| 2026-09-13 | 50d632a | G-032 photo enhancement in the pipeline, preview and saved files, hidden (Off only, D117) | Only this container restarted; 7 sites 200; CI green; live upload shows no Photo modes, generation 0.9 s, saved file format 6 without a mode, no console errors |
| 2026-09-13 | 8f842bb | All photo modes offered, cautious Brighten mode (D118) | Only this container restarted; 7 sites 200; live: five mode buttons, Brighten preview 0.2 s, saved file records "brighten", no console errors |
| 2026-09-13 | e52608f | OXS import and export (G-028, D119) | Only this container restarted; 7 sites 200; live: a self-authored OXS chart opened with the expected notice, name and 18-count; its OXS re-export is 6 wide with the cloth at index 0 and 14 stitches; no console errors |
| 2026-09-13 | 0cd4790 | Stitch counts count only filled stitches (D120); G-028 archived | Only this container restarted; 7 sites 200; live: header "50 × 31, 1,550 stitches" became "55 × 31, 1,550 stitches" after expanding the canvas; no console errors |
| 2026-09-13 | ebde884 | One canvas for every view mode: zoom, scroll and pan shared (D121) | Only this container restarted; 7 sites 200; live at zoom ×4 and scroll 120/90, all five modes showed the same 2702×1676 canvas box and kept the scroll; no console errors |
| 2026-09-13 | ca8d883 | G-033 M1: palette colors remember their thread swatch, format 7 (D122) | Only this container restarted; 7 sites 200; live: a DMC pattern's editable export is format 7, locked to DMC, with a matching DMC source on all 16 colors; no console errors |
| 2026-09-13 | 5ead992 | G-033 M2–M3: swatch-aware color editor with Okhsl comparison (D123) | Only this container restarted; 7 sites 200; live: a DMC color opened with one marked swatch in view, hover read "DMC 3328 - Salmon - Dark: 7% lighter, 10% more saturated", a pick stayed open, Escape restored the color; no console errors |
| 2026-09-14 | 35b9d16 | Zoom keeps the stitch under the cursor in place (D124) | Only this container restarted; 7 sites 200; live: wheel zoom 196%→274%→384%→274% kept the point under the cursor within 0.4 px (one stitch 38–54 px); no console errors |
| 2026-09-14 | 71a23af | G-035 M1: sRGB lookup table and allocation-free OKLab conversion; 12 MP bench rows; bench:browser | Only this container restarted; 20 of 20 sites 200; live: a 12 MP photo generated at 100 st in 3.5 s and at 250 st in 3.4 s; no console errors |
| 2026-09-14 | 03b69c5 | G-035 M2: exports in a worker with page progress; direct PDF operators; OXS in the worker (D125, D126) | Only this container restarted; 20 of 20 sites 200; live: PNG, PDF, A4, OXS and Export all downloaded with 0 ms main-thread tasks, Export all 3.1 s; a 12 MP photo generated at 100 st in 3.5 s and at 250 st in 4.0 s; no console errors |
| 2026-09-14 | 9b8de28 | G-035 M3: photo decode in a worker; flag-gated resolution comparison; no default cap (D127–D129) | Only this container restarted; 20 of 20 sites 200; live: no switch without the flag; with `?compare-resolution` Full read 160×100 and 2 px read 100×62, Undo restored Full's details; no decode fallback warning; no console errors |
| 2026-09-14 | a0c4bcf | Photo resolution cap and comparison switch removed on the Owner's decision (D130) | Only this container restarted; 20 of 20 sites 200; live: no resolution control even with `?compare-resolution`, upload decoded without fallback, a 50 × 31 chart generated; no console errors |
| 2026-09-14 | f31b2c1 | G-035 M4: Crisp evidence on typed arrays with a per-row OKLab cache, identical output | Only this container restarted; 20 of 20 sites 200; live: a Crisp 50 × 31 chart generated, no decode fallback, no console errors |
| 2026-09-14 | 3085e6c | Crisp evaluates every cell; the lossy pre-filter is removed (D132) | Only this container restarted; 20 of 20 sites 200; live: a Crisp 50 × 31 chart generated, no decode fallback, no console errors |
| 2026-09-15 | 5ab38eb | G-035 M5: identical-output ICM and k-means for large grids (D133) | This container restarted; a concurrent deploy by another session recreated natural-dye-mordant-calculator (00:01:57) and julienika-home (00:03:22), and julienika.cz briefly returned 502, then 200 on three retries; 20 of 20 sites 200 after; live: a Crisp 50 × 31 chart generated, no console errors |
| 2026-09-15 | b201c9a | G-036 M1–M2: chart parity oracle, `npm run bench:chart`, fast on-screen fills and highlight mask (D134) | Only this container restarted; 20 of 20 sites 200 before and after; live: chart drawn, zoom, highlight and view switches, no console errors |
| 2026-09-15 | ab1cfaa | G-036 M3: chart frame with a viewport canvas, grid bands on screen (D135) | Only this container restarted (care-card-generator's uptime rolled over an hour); 20 of 20 sites 200 before and after; live: zoomed frame 2700 px, canvas 1680 px, far-corner scroll painted, highlight, views, no console errors |
| 2026-09-15 | 0142872 | G-036 M4: Realistic view from stitch tiles, less Grid + photo overscan, caches (D136) | Only this container restarted; 20 of 20 sites 200 before and after; live: M3 viewport check passed, Realistic 2101 and Grid + photo 2195 distinct colours, no console errors |
| 2026-09-15 | 4c31ab1 | G-036 M5: results report, export and screen comparison tooling | Only this container restarted (another uptime rolled over an hour); 20 of 20 sites 200 before and after; exports match 919923b; live: M3 and M4 checks passed, no console errors |

## Decisions

See `docs/decisions/README.md`.
