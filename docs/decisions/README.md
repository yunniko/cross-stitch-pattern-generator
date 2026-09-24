# Decisions — index

One file per significant decision (`Dnnn-<slug>.md`, template and size cap in
`COMPANY/STANDARDS.md` → Documentation). Append-only: a reversal is a new file
that names the old one, and the old file's Status line points forward.

D001–D098 were migrated in G-031 M5 from the narrative decision record that
used to live in `HANDOVER.md`. Each migrated file's Evidence line cites the
original entry at commit f7bb51c, where the full reasoning and measurements
remain readable with git show.

**Grouped by subsystem** (STANDARDS.md → Documentation): past fifty entries a flat list stops being an
index. Within a group the decisions stay in number order, so a `Dnnn` reference is still found by scanning.
A decision that touches two areas is filed under the one its text is mostly about.

## Generation pipeline

- D001 — Colors are reduced by clustering cell averages in a perceptual space, not matched per pixel — superseded (superseded by: D006)
- D002 — Size presets are 50, 100 and 150 stitches on the longer side — active
- D006 — The pipeline optimizes a stitchable pattern: OKLab clustering plus an energy optimizer in a worker — active
- D008 — Edge importance weights the optimizer as a strict generalization of the plain Potts penalty — partly superseded (superseded by: D044 for pair edge evidence)
- D009 — Contour cleanup ships diagonal fixes and component recoloring; simulated annealing stays unwired — active
- D011 — Second domain review: clamp the pair energy, recompute palette colors, normalize edges at the 99.9th percentile — active
- D012 — Charts carry centre markers, row/column numbers, a size header and a pinned font stack — active
- D018 — K-means merges redundant colors and reinvests freed slots in the worst-represented cell — active
- D020 — Users choose between the Latest and Original color-picking algorithms — active
- D026 — Code-review fixes: whole-chart pixel budget, area-weighted downsampling, OKLab palette centroids — active
- D039 — The quantizer refills slots lost to Lloyd attrition and biases reinvestment by importance — active
- D041 — Quantizer input is pre-filtered by an importance-gated 3×3 OKLab vector medoid — partly superseded (superseded by: D051)
- D043 — Boundary energy uses an 8-neighbor stencil with 1/√2 diagonal weights — active
- D044 — Per-pair color structure-tensor edge evidence replaces per-cell max(importance) — active
- D045 — The coarse pass's edgeLoss is 0.015; other multi-scale weights stay unchanged — active
- D046 — Crisp edges mode is planned from the external design report, queued behind open work — active
- D047 — XL (200) and XXL (250) size presets, with an explicit label map — active
- D048 — Contour refinement is a staged research effort with admissibility constraints — active
- D050 — Thin axial lines were erased because Sobel importance is zero on a ridge — superseded (superseded by: D051)
- D051 — Denoise protects a cell with high ridge strength and a matching neighbor — active
- D052 — Boundary chains are ordered lattice-edge walks that end at junctions — active
- D054 — Contour refinement is an opt-in pacing bias inside the single-cell ICM decision — active
- D055 — Contour refinement is not adopted: it fragments real photos without improving real shapes — active
- D057 — Crisp mode starts from locked reproduction fixtures and a per-module build-on/leave-alone inventory — active
- D058 — Crisp boundary evidence fits two modes per cell; confidence is color separation times spatial separation — partly superseded (superseded by: D059, D064)
- D059 — Crisp coverage sums each pixel's true overlap with the cell — active
- D061 — Crisp palettes train on coverage-weighted modes; unary cost is α·fit + β·(1 − coverage) — active
- D062 — A goal-number collision is resolved by renumbering the goal with no references — active
- D063 — Crisp pipeline integration follows a fixed contract, and Crisp refuses contour refinement — active
- D064 — Crisp confidence includes edge sharpness from a step-versus-affine model comparison — active
- D065 — One frozen Crisp evidence layer, pre-filtered by pair evidence and confirmed by a confident neighbor — partly superseded (superseded by: D132 for the pre-filter)
- D066 — Confident Crisp cells start at the argmin of unary cost against the returned palette — active
- D067 — In ICM, protected cells search only admissible labels, with α from weights.color, and keep their label on ties — active
- D068 — Contour cleanup costs candidates through the shared Crisp-aware lookup — active
- D069 — After a palette change, only inadmissible Crisp labels are repaired, by the shared argmin rule — active
- D070 — Final Crisp palette colors average each protected cell's selected mode, with at most 3 repair rounds — active
- D072 — buildPattern takes edgeMode, defaulting to Standard and byte-identical when omitted — active
- D077 — Edge mode is a toggle saved both on the pattern and as a workspace preference — active
- D089 — Pattern size, color count, algorithm and palette persist, each validated field by field — active
- D096 — Crisp acceptance covers every report fixture, measured at real downsampling ratios — active
- D106 — Pipeline stages share one `PipelineContext` — active
- D107 — Pipeline speed-ups must be byte-identical, proven by golden hashes — active
- D111 — Out-of-gamut OKLab colors are mapped with the CSS Color 4 chroma-reduction hybrid — active
- D112 — Enhancement runs inside buildPattern; color stages read the enhanced photo, edge stages the original — active
- D113 — Auto, Vivid and Portrait are built, and each ships in the UI only after passing calibration gates — partly superseded (superseded by: D118)
- D114 — Enhancement steps are capped and target-seeking, with guards against false white balance and clipped tails — active
- D115 — Release gates compare pattern structure; synthetic fixtures show no harm but not benefit, so nothing is released yet — active
- D117 — No enhancement mode is released: no evidence of benefit, and the gates can't yet detect harm — superseded (superseded by: D118)
- D118 — All photo modes are offered, plus a cautious Brighten mode, on the Owner's decision — active
- D127 — The photo cap is an exact grid multiple on opaque photos, with enhancement analysed on the full photo — superseded by D130
- D129 — No default photo cap: pair evidence isn't resolution-invariant — superseded by D130
- D131 — Crisp's candidate pre-filter isn't recalibrated for speed — active
- D132 — Crisp evaluates every cell; the pair-evidence pre-filter is removed — active
- D133 — Large grids: ICM skips unchanged neighbourhoods and k-means caches distances, output identical — active
- D139 — Crisp+ evidence also fits a blurred step, keeping Crisp's margin and threshold — active
- D140 — Crisp+ snaps thin blend strips that the source confirms as a blurred edge — active
- D141 — Crisp+ prunes thin mix colours whose cells ramp in the photo; freed slots stay free — superseded (superseded by: D142 for the freed slots)
- D142 — Crisp+ refills only the slots it frees, splitting interior cells, never into a blend — active
- D170 — ICM scans the palette only when no neighbour label is below `total` — active
- D175 — Crisp skips the two-mode fit where no two modes can be far enough apart — active
- D176 — Crisp's weighted quantizer works on a column pool, not sample objects — active
- D177 — k-means works on the OKLab buffer and skips provably unchanged assignments — active
- D178 — The denoise computes each pair once, and luminance is computed once — active
- D196 — Transparency becomes absence, at half coverage — active
- D197 — Cell importance reads each cell's own footprint — active
- D198 — Dither patterns are generated data, shared by both languages — active
- D199 — Dithering skips every smoothing pass, and is refused with Crisp — active
- D201 — Drawn marks are a third dither family, and hold tone by construction — active
- D204 — A chart embeds its texture, and the swatch is pinned to the pipeline — active
- D209 — The colour floor belongs in the palette merge — reverted (see D210)
- D211 — Vivid keeps a stitch's colour — active
- D212 — A thread for a hue the photo has — active

## Threads and palettes

- D003 — Chart symbols come from a fixed, hand-curated list — active
- D005 — Generation runs on the main thread, deferred one tick — superseded (superseded by: D006)
- D017 — Legend colors get unique names from color-name-list, assigned greedily by OKLab distance — active
- D031 — DMC matching is a post-process over a finished pattern; floss is estimated generously — partly superseded (superseded by: D040, D092)
- D032 — Up to 100 colors with single-glyph symbols; reassigning a used symbol swaps it — active
- D034 — Thread mode is stored on the pattern; A4 export adds a paginated extended legend — partly superseded (superseded by: D092 for the brand field)
- D035 — G-013 to G-016 shipped in one redeploy without the planned DMC e2e coverage — active
- D036 — A thread-mode pattern's color editor offers only real threads; free-form patterns get a switch — active
- D040 — Palette mode is independent of the clustering algorithm — partly superseded (superseded by: D092 for multiple brands)
- D056 — Snapping to a thread palette re-runs the fine ICM pass inside buildPattern — active
- D071 — Brand snapping rebuilds Crisp mode mappings against thread colors and repairs, even without re-optimization — active
- D092 — Thread brands live in one registry with a matching strategy; patterns store threadBrand — active
- D093 — Cosmo colors come from the MIT CosmoToRGB dataset and show codes only — active
- D094 — Anchor matches the nearest real DMC thread, relabels it, and discloses the derivation — active
- D122 — Palette colours remember their thread swatch by brand and code; a brand lock means every colour is that brand's thread — active
- D123 — The swatch comparison reports Okhsl lightness and saturation differences in percentage points — active
- D158 — Isolate is a way of looking, not a tool — active
- D185 — The optimised Rust tier stays exact: threads only where results cannot change — active
- D206 — The swatch is a corner of the real chart, at the price of building one — active

## The editor

- D004 — Chart canvas size is clamped by shrinking the cell size — partly superseded (superseded by: D026 for whole-chart budgets)
- D014 — The realistic preview is a separate renderer drawing one cross per cell — superseded (superseded by: D015)
- D022 — The editor uses pure pattern mutations, a snapshot undo stack and a DOM legend — active
- D023 — A brush stroke is one undo step; colors are renamed by hand; the legend sorts a copy — active
- D028 — One docked workspace with a single undo history; saved files embed the source photo — partly superseded (superseded by: D109 for the resize fill color)
- D030 — Scrollable centered containers use grid centering; wheel zoom uses a native non-passive listener — active
- D037 — Rectangle selections float until merged; the Fill tool is 8-connected — active
- D042 — Lloyd's last step reassigns against the returned centroids; a shape-fidelity suite guards boundaries — active
- D049 — The shape harness measures N classes, degenerate boundaries, fractional scales, junctions and thin lines — active
- D082 — Tools are hand-drawn SVG icons in three groups, keeping their names as aria-labels — active
- D084 — The Brush tool icon shows a handle, a bristle head and a stroke — active
- D086 — Global keyboard shortcuts skip typing targets; brush double-click fills from the pre-click pattern — partly superseded (superseded by: D103; D138)
- D087 — Keys 1–5 switch views, including an original-photo view; canvas color is view-only — active
- D091 — The navigator preview draws empty cells in the canvas color — active
- D103 — Keyboard shortcuts live in a hook that reads state through a ref — active
- D104 — Brush, Move and Select drags redraw only what changed — partly superseded by D135
- D108 — The workspace is a thin shell over hooks and dock components — active
- D109 — Canvas resize expands with empty stitches, never a new color — active
- D120 — Stitch counts count only filled stitches; sizes stay the canvas grid — active
- D121 — Every view mode draws into one canvas at the same size, so zoom, scroll and pan are shared — superseded by D135
- D124 — Zooming keeps the point under the cursor in place — partly superseded by D135
- D135 — The Image window paints a viewport canvas inside a chart-sized frame — active
- D136 — Realistic view from per-colour stitch tiles; Grid + photo paints less overscan — active
- D137 — Symmetry is the group the active axes generate, computed in doubled centred coordinates — active
- D138 — A brush double-click fill is one undo step; symmetry is saved as an optional file field — active
- D144 — A Move drag paints the visible view only, at most once per animation frame — active
- D145 — A Move frame shifts the pixels already drawn and patches the exposed strips — active
- D146 — The Brush double-click fill is a workspace option, on by default — active
- D147 — Selection actions, icon buttons, and chrome a photo-free chart does not need — partly superseded (D148 for Cancel)
- D148 — Cancel drops only the floating piece — active
- D150 — The server decodes photos with @napi-rs/canvas — active
- D157 — The workspace is rebuilt to design direction 1b — active
- D160 — The top panel is one strip, and the select tool takes it over — active
- D161 — Two 1b details the Owner overrode — active
- D162 — The file actions leave the rail for the start screen — active
- D163 — The chart frame hides; it is never unmounted — active
- D164 — One disabled look per control shape, and a start screen that touches nothing — active
- D165 — The empty-grid card owns its settings, and Create carries the confirm — active
- D167 — The start screen's accent is a selection, not decoration — active
- D179 — The editor's zoom has no chart-size cap — active
- D205 — A painted mark is a fifth shape, and what it leaves unpainted still fills — active
- D208 — The preview belongs to every pattern, and each family pays only its own cost — active
- D210 — The colour floor is withdrawn — active
- D213 — The editing bar's tool options scroll inside their own track — active
- D214 — One gesture for every shape tool, spine plus stamp — active
- D215 — A filled shape is exactly the shape; the brush is its outline's thickness — active
- D216 — The cursor's outline is drawn on a canvas of its own — active
- D217 — The empty stitch is a sentinel, and no tool paints an index the palette lacks — active

## Exports and print

- D021 — The editable pattern file is plain JSON, not a PNG with embedded data — active
- D024 — A4 export splits pure page layout from rendering and ZIP bundling — active
- D073 — PDF charts embed DejaVu Sans with pdf-lib so every symbol is real extractable text — active
- D074 — The PDF exporter reuses the A4 page-drawing code through a bounded canvas adapter — active
- D075 — The Pattern Keeper PDF export fetches its font on click and is tested against real legend symbols — active
- D076 — Overlap bands carry no text; the legend page explains them once — active
- D078 — One export dropdown, an "Export all" .cspzip bundle, and import that detects ZIPs by content — active
- D080 — Export controls sit in the top bar as pills, with the label kept as an accessible name — active
- D085 — The export dropdown defaults to editable JSON and groups formats under Color and Black & white — active
- D097 — Pattern Keeper compatibility rests on the Owner's real import of an exported PDF — active
- D101 — A failed auto-restore shows a banner with an on-demand report, not a page-load download — active
- D119 — OXS is read by a dedicated XML reader and written with the cloth at index 0; losses are counted, never silently dropped — active
- D125 — Exports run in a worker with OffscreenCanvas, falling back to the main thread — active
- D126 — The PDF adapter omits opacity for opaque colors and caches parsed styles — active
- D134 — The on-screen chart fills small stitches and the highlight mask from scaled pixels — partly superseded by D135
- D154 — Export all gets a fifteen-minute deadline — superseded by D155
- D155 — The Pattern Keeper PDF exhausts the worker heap on large charts — superseded by D169
- D168 — Paginated export deadlines grow with the page count — active
- D169 — Each Pattern Keeper page is released as soon as it is drawn — active
- D171 — The server writes its own PNGs and releases each canvas once encoded — active
- D172 — Raster exports stamp symbols from tiles drawn once per colour — active
- D173 — The realistic preview PNG is streamed from per-colour tiles — active
- D174 — The PDF adapter writes its direct operators as text — active
- D180 — The OXS export is built a row at a time — active
- D181 — The chart cap is 1500 stitches per side — active
- D189 — The Rust PDF mirrors pdf-lib's structure with pdf-writer and a subset Type0 font — active
- D192 — Chart PNGs ship with Rust's 4-5 px symbols, which differ visibly from production's — active

## Server, processor and Rust

- D013 — Deployed to cross-stitch.craftodejnice.cz from a public repository — active
- D027 — A redeploy is verified by container isolation, neighbor sites and the original repro on the live URL — active
- D029 — Rendering deploys re-check the small-chart header clip on production — active
- D079 — Heavy exports yield to the main thread between steps instead of moving to a worker — superseded (superseded by: D125)
- D090 — Pattern-load failures are logged with a report of the bad file; a corrupt autosave is cleared — partly superseded (superseded by: D101)
- D102 — Playwright runs against `next build && next start` on its own port — active
- D116 — The photo preview has its own worker; unreleased modes appear only in the test build — partly superseded (superseded by: D118 for the test-build flag)
- D128 — Photos decode in a worker, with the old decode as a logged fallback — active
- D149 — The processor runs three workers inside a 3-CPU, 2 GiB cap — active
- D151 — Generation runs in a processor service that only the app can reach — active
- D152 — The enhancement preview gets its own worker on the server — active
- D153 — Server exports draw their text with DejaVu Sans — active
- D156 — Loopback spellings are one origin, and APP_URL has no default — active
- D182 — Generation is ported to Rust, a language new to the portfolio — active
- D183 — Rust uses V8's own maths routines, proven bit-exact — active
- D184 — Rust also ports V8's sin, cos, atan2, log and hypot — active
- D186 — The WASM build uses a raw ABI and runs single-threaded — active
- D187 — Rust rasters draw DejaVu text from measured canvas metrics, compared by pixel difference — active
- D188 — Export references are made in the production processor image — active
- D190 — Rust ships for generation and every server-side export — active
- D191 — The editable save stays TypeScript, in the browser — active
- D193 — Rust runs as a sidecar process, not a native addon — active
- D195 — The pixel-art PNG is written in the page, and is not a processor export — active
- D203 — A texture is data with ranges, and its default is frozen — active
- D218 — A crash hands over a report, and the test breaks the browser rather than the app — active
- D219 — The chart rasteriser stays one module; only its words move out — active
- D220 — Latest-value refs update before paint, not after — active
- D221 — The sidecar is the only engine; the TypeScript pipeline stops shipping — active
- D222 — The safety net is properties and gates, not only recorded hashes — active
- D223 — The V8 maths port stays; it is the fast path, not a parity tax — active
- D224 — `x86-64-v3` is the build baseline, and the config lives at the repository root — active
- D225 — A shaped selection carries two masks, not one — active
- D226 — A drawn lasso is smoothed by corner cutting, and short paths are left alone — active

## Files, formats and storage

- D033 — Fabric count, unit and author name are persisted options; the open project restores on reload — partly superseded (superseded by: D100 for project storage)
- D060 — not assigned (numbering gap in the original record; D061 cites D059's critique under this number)
- D095 — Pre-brand pattern files open as DMC patterns, checked through the real file-open path — active
- D098 — A concurrent review's findings are recorded for triage; goals need explicit Owner sign-off — active
- D099 — The pattern deserializer validates every field, not just grid geometry — active
- D100 — Project autosave moves to IndexedDB, photo stored once by content hash — active
- D143 — An empty palette is legal only for a chart with nothing stitched — active
- D166 — Two more 1b texts the Owner cut — active
- D194 — Pixel art imports exactly, and is refused rather than repaired — active

## Testing, tooling and process

- D007 — First domain-expert review: fix the rendering and averaging bugs, defer chart conventions to M9a — active
- D010 — Quality diagnostics and a tolerance-band regression suite; no debug-visualization UI — active
- D105 — `npm run bench` runs a Vitest file, not a separate TS runner — active
- D159 — The view chips stay toggle buttons, not a radiogroup — active

## General and cross-cutting

- D015 — The realistic preview tints the Owner's stitch photo per palette color — active
- D016 — Finished-size conversion lives in one pure module — active
- D019 — Fabric count is selectable from 11/14/16/18 and size shows in one chosen unit — active
- D025 — Superseded generation jobs reject, and async results are gated by a source revision — active
- D038 — The realistic preview has a transparent background and no border — active
- D053 — The pacing objective is worth building, but only with corner and junction admissibility — active
- D081 — The root declares color-scheme: light dark so native controls follow the theme — active
- D083 — The Fill tool icon is a paint bucket — active
- D088 — Dropping a color on the Empty row merges it into no-stitch — active
- D110 — Text on controls is not selectable; text fields stay selectable — active
- D130 — The photo resolution cap is cancelled — active
- D200 — Atkinson is a second kernel that drops part of the error, and runs serpentine — active
- D202 — One fixed seed, and marks sized in stitches — active
- D207 — Switches let the knobs reach every mark, and the size knob is read backwards — active
