# Handover — cross-stitch-pattern-generator

Last verified: 2026-09-13 at 0f4dc8a plus the Brighten and mode-release commit that carries this line

Photo → editable, printable cross-stitch chart, entirely client-side. A
standalone Owner project (not svc-lab, no monetization), live at
<https://cross-stitch.craftodejnice.cz>. Goals are in `GOALS.md`, completed
goals in `docs/goals-archive.md`, and company rules in `E:\CLAUDE\COMPANY\`.

## Current state

**Production** runs `master` as deployed on 2026-09-13 (last deploy-log
row). G-032 (photo enhancement) is live with every mode offered on the
Owner's decision (D118), so they can judge the modes by eye.

**What works** (verified in this session unless marked otherwise):
- Generation from a photo at 10–1000 stitches and 2–100 colors, with Latest
  or Original clustering, Full range, DMC, Cosmo or Anchor palettes, and
  Standard or Crisp edges. It runs in a reused Web Worker with progress and
  cancellation.
- Editing: brush (double-click fills), 8-connected fill, rectangle select with
  copy, paste, move and flip, move, pan, zoom, highlight. Also merge (including
  into Empty), recolor, rename, symbol swap, add color, empty stitches, canvas
  resize, and one undo history covering regeneration.
- Five view modes (keys 1–5) and a view-only canvas color. Shortcuts: Ctrl+Z,
  Ctrl+Y, Ctrl+Shift+Z, Space-drag, B, F, and Escape to merge a selection.
- Exports: editable JSON (format version 6, embeds the source photo),
  realistic preview PNG, Color and B&W full-chart PNG, A4 page ZIPs, Pattern
  Keeper PDF (the Owner confirmed a real import), and "Export all" `.cspzip`.
  Open accepts JSON, ZIP and `.cspzip`, detected by content.
- Persistence: the open project autosaves to IndexedDB (photo stored once by
  SHA-256, 500 ms debounce) and restores on reload. A corrupt record shows a
  banner with an on-demand error report. Options persist in localStorage.

- Photo enhancement: a Photo control (Off, Brighten, Auto, Vivid,
  Portrait), an enhanced preview with "Compare with original" before
  Generate, and the mode recorded in saved files. Brighten is a cautious
  exposure fix for dark or flat photos only. The other three are
  experimental: none passed its real-photo rule
  (`docs/reviews/2026-09-13-photo-enhancement-calibration.md`).

**Checks run 2026-09-13**: `tsc --noEmit` and eslint clean; 745/745 Vitest
tests; 58/58 Playwright tests on a fresh production build. CI
(`.github/workflows/ci.yml`) runs `next typegen` before the type-check,
because route types such as `LayoutProps` are generated and git-ignored.
It passed on GitHub for `fb28d4e`.

**Performance** at 1500×1000 → 1000 stitches / 64 colors: Standard 14.6 s,
Crisp 27.4 s, Standard + DMC 18.5 s. Details in
`docs/reviews/2026-09-13-pipeline-performance.md`. Enhancing a 4000×3000
photo takes 1.58–1.93 s by mode in `npm run bench` (G-032 M1 progress log),
above the goal's 1.5 s target.

**Known limitations**:
- Crisp is about 2× slower than Standard at the largest size, and falls back to
  Standard behavior for thin lines, junctions and gradual shading (D096).
- Export all and A4 exports run on the main thread and stall the tab while
  rendering each step (D079).
- The PDF has no bold face. Whether µ (which extracts as μ) matters in Pattern
  Keeper is unconfirmed (D074, D097).
- A double-click fill leaves 3 undo steps (D086). Highlight does nothing in
  the realistic preview (D028).
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
- **Generation path**: `app/hooks/use-generation.ts` →
  `lib/pipeline/pattern-client.ts` (one reused worker; discarded after a
  native error) → `lib/pipeline/pattern.worker.ts` → `buildPattern` in
  `lib/pipeline/pattern.ts`.
- **Pipeline order** in `buildPattern`:
  1. Area-weighted linear-light downsample.
  2. Sobel importance and per-pair color structure-tensor evidence (D044).
  3. One shared `PipelineContext` holding cell OKLab (D106).
  4. Importance-gated medoid pre-filter for the quantizer only (D041, D051).
  5. OKLab k-means: plain (Original) or merge-and-reinvest (Latest) (D018, D039).
  6. Coarse then fine ICM on an 8-neighbor stencil (D043, D045).
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
  merges, and mode-aware finalization (D061–D072).
- **Threads** (`lib/threads/`): `thread-brands.ts` is the registry. Its
  `matching` field is "direct" for DMC and Cosmo, or "dmc-equivalence" for
  Anchor. `brand-match.ts` does the snapping. Data provenance is in
  `docs/*-colors-provenance.md`.
- **Export** (`lib/export/`): `render.ts` handles the chart layout budget and
  the realistic preview. A4 page drawing takes a `ChartDrawingContext`, so the
  same code draws PNG pages and PDF pages through `pdf-canvas-adapter.ts`
  (D074). `export-all.ts` bundles the existing exporters.
- **Editor data** (`lib/editor/`): pure mutations in `pattern-edit.ts`,
  validating (de)serializer in `pattern-serialize.ts` (D099), IndexedDB store
  in `project-store.ts` (D100), and options in `workspace-storage.ts`.
- **Experimental** (`lib/experimental/`): contour refinement, boundary chains,
  simulated annealing, diagnostics. Status table in its README.
- **Tests**: unit specs in `tests/unit/`. `golden-hashes.spec.ts` pins exact
  `buildPattern` output for 18 configurations (D107), and
  `m3-equivalence.spec.ts` compares the optimizer with a verbatim pre-M3 copy.
  E2E specs are in `tests/e2e/`. `npm run bench` runs `scripts/bench.ts`.
- **Deploy**: `Dockerfile` (standalone build) and `docker-compose.yml`
  (profile `app`, `127.0.0.1:30150`). Recipe and shared-host rules are in
  `COMPANY/INFRASTRUCTURE_DEPLOY.md`; verification per D027.

## Rules in force

- Nothing is pushed or deployed without Owner approval.
- Keep one session per working tree. A stale `next dev` (PID 17476, from
  2026-09-12) belongs to another session; don't stop it.
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
- Every `cellPalette` mutation passes `EMPTY_CELL` (255) through untouched
  (D028).
- View-only settings (canvas color) never reach an export call site (D087).
- Crisp consumers use the shared admissible-cost functions or throw. Crisp
  with contour refinement throws (D063, D068).
- ICM inner loops use no closures or array scans (D044).
- Brand-aware UI reads `pattern.threadBrand`. A new brand needs data, a
  provenance doc, a registry entry, and the inline union in `lib/types.ts`
  widened (D093).
- Anchor uses code pairs from an unlicensed table under an Owner judgment
  call. Read `docs/anchor-colors-provenance.md` before touching it (D094).
- Don't strip the embedded photo from saved files without asking (D028).
- Mount-time restores defer setState in a microtask, because of the
  set-state-in-effect lint rule (D033).
- E2E locators scope canvases to `main` and use accessible names. Export
  options are selected by value (D080, D085).
- `npm ci --legacy-peer-deps` is required (npm arborist crash).
- On this Windows host, stopping a background task can leave node running;
  check the process list (D096).
- Run `node E:\CLAUDE\COMPANY\scripts\docs-lint.mjs .` before every check-in.

## Next steps and open questions

- **PENDING APPROVAL: G-031 sign-off.** All five milestones are done and
  verified; see the G-031 progress log in `GOALS.md`.
- **PENDING APPROVAL: G-032 sign-off.** On 2026-09-13 the Owner asked for
  every mode in the UI to check them by eye, plus a cautious Brighten fix.
  Both are live (D118). Their verdict decides which modes stay. Brighten
  wasn't run on the real-photo set because the machine was low on memory.
  Also open: the 1.5 s enhancement target, and a Codex review of the M2–M4
  diff (usage limit hit on 2026-09-13).
- G-028 (OXS import and export) is a draft. G-030 (public launch) is a
  far-future draft. G-023 (Rust sidecar) was measured as not needed.
- Owner decisions not yet made: a real evenweave/linen fabric model (`docs/domain-reference-fabric-types.md`);
  gaps from `docs/reviews/2026-09-12-competitive-analysis.md`; moving exports
  into a worker if the tab stall bothers users.

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

## Decisions

See `docs/decisions/README.md`.
