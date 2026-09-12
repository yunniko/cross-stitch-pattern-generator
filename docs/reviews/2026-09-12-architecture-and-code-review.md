# Architecture, code, algorithm and process review — 2026-09-12

Reviewed `cross-stitch-pattern-generator` at commit `ca4cfb1` plus the
uncommitted working tree present at review time (modified `GOALS.md`/
`HANDOVER.md`, the G-024 M6 delivery doc and assets, two untracked test
files). No application code was changed by this review. A second Claude
session was actively editing the same working tree while this review ran
(files under `tests/unit/` and `docs/reviews/` changed mid-review), so
nothing was written into the project tree except this document.

## Verification performed

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx eslint` | clean |
| `npx vitest run` | 60 files, 587 tests, all pass (8.0 s) |
| `npx playwright test` | **could not run** — Playwright's `webServer` refused to start because another `next dev` (the concurrent session, PID 17476, port 3001) already held the project directory; Next 16 allows one dev server per directory |
| Probe: `deserializePattern` with malformed / oversized palette | reproduced two validation gaps (see B1, B2) |
| Probe: DMC→Anchor equivalence coverage | complete — all 454 DMC codes have an Anchor mapping; no bug |
| Stage timing, 1200×800 source → 300 stitches, 24 colors | measured (table below) |
| Stage timing, 1500×1000 source → 1000 stitches, 64 colors | measured (table below) |

Measured stage times (Node 22, this machine, `tsx`, single run each):

| Stage | 300 st / 24 col | 1000 st / 64 col |
|---|---:|---:|
| `downsampleToGrid` | 273 ms | 1,032 ms |
| `computeEdgeMagnitude` | 101 ms | 141 ms |
| `computeCellImportance` | 43 ms | 72 ms |
| `computePairEdgeEvidence` | 623 ms | 2,612 ms |
| `denoiseForQuantization` | 86 ms | 1,473 ms |
| `kMeansQuantizer` | 443 ms | 9,084 ms |
| `runMultiScaleOptimizer` (ICM ×2) | **4,148 ms** | **154,623 ms** |
| `recolorSmallComponents` | 56 ms | 357 ms |
| `fixDiagonalConnections` | 21 ms | 299 ms |
| **Total** | **≈5.8 s** | **≈170 s** |

At the medium size the ICM optimizer is 72 % of the pipeline; at the
supported maximum it is 91 % and the whole generation takes close to three
minutes. `HANDOVER.md`'s "Next steps" still quotes 13.4 s for this exact
case — that figure predates the 8-neighbor stencil (G-022 M2) and the
per-pair tensor evidence (G-022 M3), which together multiplied the ICM
inner loop's work, and it was never re-measured. (`buildPattern` in the
brand modes runs a third ICM pass on top of this.)

## Overall assessment

The pipeline is genuinely well-founded: linear-light area-weighted
downsampling, OKLab k-means with LBG-style reinvestment, a single shared
Potts energy with rotation-neutral 8-neighbor weighting, and a crisp-edge
mode built on an explicit evidence layer. The pure-module discipline
(typed-array buffers, no DOM in `lib/`) is what makes 587 fast unit tests
possible, and it has been kept. Type checking is strict and clean.

The weaknesses are of a different kind from the 2026-09-09 review's: not
"the algorithm is wrong" but "the surrounding engineering hasn't kept
pace with four days of very fast feature growth". Concretely: the UI is one
2,384-line component; the pipeline's hot loops leave a 5–10× algorithmic
speed-up on the table while a Rust sidecar is being drafted; persistence
silently fails for exactly the projects where it matters; the handover
document is 7,000 lines with a stale "current state"; and the last goal was
marked done with an unfinished deliverable and uncommitted files.

## Bugs

Severity: **High** = wrong data or lost work reachable by an ordinary user;
**Medium** = incorrect behavior on a plausible path; **Low** = polish.

### B1 · High — Autosave silently stops working above the localStorage quota

`lib/workspace-storage.ts:172-180`, `lib/pattern-serialize.ts:47`.
`saveProject` runs on every history change and writes the whole pattern as
JSON: `cellPalette` as a plain number array (≈2.5 bytes per cell, so
≈1.6 MB for a 1000×667 grid) plus the original photo as a base64 data URL
(a 4 MB phone JPEG becomes ≈5.3 MB). Typical localStorage quota is 5 MB per
origin. Every write above that throws, is swallowed, and the "auto-restore on
reload" feature does nothing — with no indication to the user. The
feature therefore fails for precisely the large-photo, large-grid projects
where losing an editing session hurts most. The same synchronous
`JSON.stringify` + `setItem` of several MB runs on the main thread after
every brush stroke.

Fix: move the project slot to IndexedDB (async, no 5 MB cap); store
`cellPalette` as base64 of the `Uint8Array`; store the photo once, keyed by
a content hash, not inside every snapshot; debounce saves; surface an
"autosave unavailable" state when a write fails.

### B2 · High — `deserializePattern` accepts palettes that corrupt cell indices

`lib/pattern-serialize.ts:69-103`. The validator checks every cell index is
`< palette.length` but never checks `palette.length <= MAX_COLORS` (or even
`<= 255`). Probe: a file with a 300-entry palette is accepted;
`Uint8Array.from(cellPalette)` then silently truncates — cell index 260 is
stored as 4 and cell index 255 becomes `EMPTY_CELL`. Every later stage
trusts those indices.

### B3 · Medium — `deserializePattern` accepts malformed palette entries

Same function. `palette[i].rgb`, `symbol` and `name` are never type-checked.
Probe: `{ rgb: "red", symbol: 1, name: null }` is accepted and returned
as-is. Downstream, `fillForCell` produces `rgb(undefined, undefined,
undefined)` (ignored by canvas, so cells are painted with whatever fill was
last set), `luminance()` returns `NaN`, and the legend renders "null". The
docstring claims the function "throws a descriptive error on
malformed/tampered input rather than producing a silently-broken pattern";
today it produces exactly that. Validate `rgb` as three integers 0–255,
`symbol` as a non-empty string, `name` as a string, symbols unique.

### B4 · Medium — Space-to-pan closes over a stale `selection`

`app/workspace.tsx:917-976` (effect deps `[activeTool, pattern]`, exhaustive
deps disabled) and `:860-863` (`switchTool` merges the floating selection
when leaving the Select tool). The Space handler calls `switchTool("pan")`,
whose `selection` is whatever it was when the effect last ran. Drawing or
moving a selection does not re-run the effect, so pressing Space while a
piece is floating either merges nothing (tool switches, piece stays in
state) or, after a paste-then-drag, merges the piece at its **pre-drag**
position. Either way the behavior differs from the Deselect button and the
Escape handler (whose effect correctly lists `selection`). Fix: read
`selection`/`pattern` through refs inside the handler, or make the effect
depend on them.

### B5 · Medium — Global Space handler breaks keyboard activation of controls

`app/workspace.tsx:939-941`. Once a pattern exists, any Space keydown whose
target is not an input/textarea/contenteditable is `preventDefault`ed and
turned into "pan". Buttons, radios, the export `<select>` and checkboxes
all activate with Space when focused; a keyboard user tabbing to Undo,
Export, or a view-mode radio can no longer press Space on it. Exempt
`button`, `select`, `input[type=radio|checkbox]` or, better, only claim
Space when focus is on `body`/the canvas scroller.

### B6 · Medium — Storage-access exception disables all persistence for the session

`lib/workspace-storage.ts:150`. `loadSavedProject` calls
`window.localStorage.getItem` **outside** its `try`. Browsers that throw on
storage access (Safari/Firefox with site data blocked, some private modes)
throw here; the mount microtask in `workspace.tsx:388-414` then dies before
`workspaceRestoredRef.current = true`, so the option- and project-save
effects never fire for the rest of the session. `loadWorkspaceOptions` does
wrap its read, and the module header claims "every read/write is wrapped".

### B7 · Medium — Brush, Move and Select drags do O(cells) work per mouse-move

`app/workspace.tsx:1091-1099` → `lib/pattern-edit.ts:104-108` and `:12-28`.
Each pointermove during a brush stroke calls `paintStitch`, which copies the
full `cellPalette` and recounts every cell for every palette color, then
`redrawWith` repaints every cell (fillRect + fillText) of the whole canvas.
On a 1000×667 grid that is ~667k cells copied, counted and drawn per mouse
event; the same pattern applies to Move (`shiftPattern` + full redraw) and
Select (`compositeSelectionPreview` + full redraw). Painting on large
patterns will feel laggy. Fix: keep one working `Uint8Array` for the
stroke, draw only the changed cell(s) directly on the canvas, and build the
pattern + counts once on pointerup.

### B8 · Low — Ctrl+Shift+Z is not redo; Ctrl+Shift+Y is

`app/workspace.tsx:926-934`. The undo branch correctly excludes Shift, but
nothing maps Ctrl+Shift+Z to redo (the convention alongside Ctrl+Y on
Windows and the only one on macOS), while the redo branch ignores Shift.

### B9 · Low — Auto-restore failure triggers an unsolicited download on page load

`lib/error-report.ts:50-64` via `loadSavedProject`. A corrupt autosave
makes the page start a file download during mount, with no user gesture.
Browsers commonly block that, and when they don't it is startling. Keep the
failed payload in a separate storage slot and offer a "Download error
report" button instead. (Owner-requested behavior, so a design question,
not a defect in implementation.)

### Also noted, not bugs

- Anchor "dmc-equivalence" matching: verified all 454 DMC codes map to an
  Anchor code, so the `dmcEquivalence![code]` non-null assertion in
  `lib/dmc-match.ts:140` is currently safe. It should still be guarded (a
  future DMC-list update would make `code: undefined` collapse every
  unmapped color into one legend row named "undefined").
- Selecting a new photo resets undo history and clears the autosaved
  project (`handleFileChange`) with no confirmation; unsaved edits to the
  previous pattern are gone. Worth a "you have unsaved changes" prompt.

## Efficiency of algorithms

The 2026-09-09 review already noted "several passes recreate arrays of
OKLab triples" and "edge normalization sorts a full source-resolution
array"; both are still there, and G-023 proposes a Rust sidecar for the hot
path. The measurements above say the hot path is the ICM loop, and its cost
is mostly algorithmic, not language-bound.

### E1 · ICM inner loop does 8× more boundary work than needed

`lib/local-optimizer.ts:120-181`. For every cell, every pass, and every
candidate label `c`, the loop recomputes the edge evidence for all 8
neighbors and the pair energy — `O(passes × cells × k × 8)`. Two facts
allow a large cut:

1. The boundary sum for label `c` is `T − S[c]`, where `T = Σ_n w_n·q(edge_n)`
   over all neighbors and `S[c] = Σ_{n: label_n = c} w_n·q(edge_n)`. Both
   are computed once per cell per pass in `O(8)`, after which each label
   costs `O(1)`: total `O(8 + k)` instead of `O(8k)` per cell.
2. `w_n·q(edge_n)` depends only on the pair and the weights, which are fixed
   for the whole call — precompute it once per call into a `Float32Array`
   of 8 entries per cell (or 4 canonical, mirrored) instead of calling
   `getPairEdgeEvidence` + `boundaryPairEnergy` inside the innermost loop.

Also, `neighbors` (line 126) allocates an array of up to 8 objects per cell
per pass — 5.3 M short-lived objects per pass at 667k cells. Replace with
precomputed neighbor index/weight typed arrays or inline the 8 offsets.

Expected effect at k = 24–64: the boundary term drops by roughly k/2×; the
remaining color term (`oklabDistanceSquared` per label) can be cut further
by the spec's own suggestion of restricting candidates to the labels of the
8 neighbors plus the current label plus a few nearest palette entries.
A 5–10× reduction of the 4.1 s / 155 s measured here is realistic in plain
JS, which would bring the supported maximum from ~3 minutes to well under
30 s without any new toolchain.

### E2 · Every stage re-derives OKLab for all cells

`rgbToOklab(cellRgb(cells, i))` over the whole grid appears in `denoise.ts`,
`quantize.ts` (twice: plain + reinvest), `local-optimizer.ts` (called 2–3
times per build), `contour-cleanup.ts` (both functions, the first called
twice), `simulated-annealing.ts`, `diagnostics.ts` and
`crisp-palette-finalization.ts` — nine full conversions per build, each
with three `cbrt` and three `pow` per cell, each allocating a
`number[3]` per cell (the exact pattern `types.ts` says `CellColorBuffer`
exists to avoid). Compute a `Float32Array(3n)` once in `buildPattern` and
pass it in a shared context object (see A3).

### E3 · `computePairEdgeEvidence` recomputes derivatives ~16× per source pixel

`lib/pair-edge-evidence.ts:213-221, 256-267`. For each of 4 directions per
cell a window of about `(cellSize+1)²` source pixels is scanned; adjacent
windows overlap by half, so each source pixel is visited ~4 times per slot,
16 times in all, and each visit calls `derivativeAt` three times, each
returning a fresh tuple. Measured 2.6 s at 1500×1000. Precompute the six
per-pixel structure-tensor terms once (`Jxx = Lx²+Ax²+Bx²`, `Jyy`, `Jxy`),
build three summed-area tables, and each window projection becomes four
lookups: `s = u·J·u` from the box sums. That is `O(srcPixels)` total and
allocation-free.

### E4 · `computeEdgeMagnitude` sorts the whole source image for one percentile

`lib/edge-map.ts:62-63`. `Float32Array.from(magnitude).sort()` on up to
16 M values (4000×4000 decode cap) to read the 99.9th percentile. A
fixed-bin histogram (magnitude is bounded by the Sobel maximum) gives the
percentile in `O(n)` with one small array. Currently 141 ms at 1500×1000;
proportionally ~1.5 s at the decode cap.

### E5 · `nameColors` materializes colors × 5,000 pair objects and sorts them

`lib/color-names.ts:37-43`. For 100 colors that is 500k objects sorted for
a greedy assignment. Per-color partial ranking (keep the best ~k+1 names per
color) makes it `O(k·N)`.

### E6 · Worker is terminated and recreated on every job

`lib/pattern-client.ts:45-63`. `runPatternJob` always calls
`cancelPatternJob`, which terminates the worker, so every Generate pays
worker script fetch/compile and loses the module-level caches
(`color-names` entries, brand OKLab tables). Terminate only when a job is
actually in flight; otherwise reuse. The source `PixelBuffer` is also
structured-cloned into the worker (up to 64 MB); acceptable, but it could
be transferred if a copy is kept for regenerate.

### E7 · `denoiseForQuantization` at 1.5 s for the large case

`lib/denoise.ts:227-236`. The medoid search is 81 distance evaluations per
cell over `Oklab` tuples; with a typed OKLab buffer (E2) and the 9 window
colors read into locals, this is a few hundred ms. Lower priority than E1–E3.

## Architecture

### A1 · `app/workspace.tsx` is a 2,384-line component with ~45 state hooks

Every tool (brush, fill, select, move, pan, zoom, highlight), all export
flows, options persistence, the colors dock, the resize panel, keyboard
shortcuts and the navigator live in one function. Bugs B4 and B5 are direct
consequences: effect dependency lists are hand-tuned with
`eslint-disable-next-line react-hooks/exhaustive-deps` because the
component's closure surface is too large to track. Split by concern:

- hooks: `useWorkspaceOptions`, `usePanZoom`, `useBrushTool`,
  `useSelectTool`, `useMoveTool`, `useKeyboardShortcuts`, `useExports`;
- components: `TopBar`, `OptionsPanel`, `ResizePanel`, `ToolsDock`,
  `ImageWindow`, `ProcessingParams`, `ColorsDock`, `BrandColorPicker`
  (the DMC/Cosmo/Anchor picker is duplicated twice in the JSX already).

The pure edit functions in `lib/pattern-edit.ts` are excellent and well
tested; the interaction glue is what needs structure.

### A2 · `lib/` is 52 flat files with no grouping

Suggested folders: `pipeline/` (downsample, edge-map, pair-edge-evidence,
denoise, quantize, local-optimizer, energy, contour-cleanup, regions,
palette-optimizer, pattern), `crisp/` (the five crisp-* files,
weighted-quantize), `threads/` (dmc/cosmo/anchor data, thread-brands,
dmc-match, floss-estimate), `export/` (render, a4-*, pdf-canvas-adapter,
pattern-keeper-pdf, export-all, stitch-texture), `editor/` (pattern-edit,
pattern-serialize, pattern-import, workspace-storage, use-undo-history,
error-report), `color/`.

### A3 · Pipeline stages take 5–7 positional parameters with `undefined` holes

`fixDiagonalConnections(cells, optimized, rawPalette, importance, undefined,
undefined, evidenceLayer)` in `lib/pattern.ts:151` is the symptom. Introduce
one `PipelineContext` `{ cells, cellOklab, importance, pairEvidence,
evidenceLayer, width, height }` built once in `buildPattern` and passed to
every stage, with per-stage options as a second object. This also delivers
E2 for free and removes the "which optional param is this" reading cost.

### A4 · Dead and opt-in-only modules ship in the library

`simulated-annealing.ts` is never called outside tests; `boundary-chains.ts`
and `contour-refinement.ts` back an opt-in flag that is off by default and
incompatible with Crisp mode; `diagnostics.ts` is test-only. STANDARDS asks
that dead files not accumulate. Either move them to `lib/experimental/`
with a README stating their status, or delete them — git keeps the history
and HANDOVER already records the decisions.

### A5 · Hand-synchronized literal unions

`lib/types.ts:160` declares `threadBrand?: "dmc" | "cosmo" | "anchor"` and
asks maintainers to keep it in sync with `ThreadBrand` by hand, citing a
circular import. `import type` is erased at compile time and cannot create
a runtime cycle; `StitchPattern.threadBrand?: ThreadBrand` and
`edgeMode?: EdgeMode` are safe. Alternatively define the literal unions in
`types.ts` and have `thread-brands.ts`/`pattern.ts` import them.

### A6 · Persistence is the wrong tier

See B1. A document that can exceed 5 MB belongs in IndexedDB, and the
photo bytes should be stored once rather than inside every snapshot.

### A7 · Still missing from the 2026-09-09 review's list

No `.dockerignore` (so `COPY . .` sends `node_modules`, `.next`, `.git`,
`test-results` into the build context), no CI workflow, no CSP header.

## Code style

### S1 · Comments have become the decision log

Comment-line share of the hot files: `denoise.ts` 157/248, `quantize.ts`
209/416, `energy.ts` 102/131, `pair-edge-evidence.ts` 153/324,
`pattern.ts` 121/341, `local-optimizer.ts` 100/232. Most of these are
narratives — which Codex critique flagged what, which HANDOVER entry
reversed which earlier comment, what a previous version of the same comment
wrongly claimed. This makes the actual logic hard to find, and the
narratives go stale: four crisp modules still open with "Not wired into
`buildPattern` yet" (`crisp-evidence-layer.ts:17`,
`crisp-palette-finalization.ts:17`, `crisp-quantization-stage.ts:27`,
`crisp-unary-cost.ts:18`) though all four have been wired in since M4;
`finished-size.ts:1` and `pattern-serialize.ts:73` still cite
`app/page.tsx`, which no longer exists.

Rule to adopt: a comment states the invariant and the one-sentence reason;
history, alternatives and who-said-what go to `HANDOVER.md`/ADRs with a
`See D44` pointer. Target under 30 % comment lines in `lib/`.

### S2 · Naming drift after generalizations

`filteredDmcColors`, `editDmcFilter`, `commitAddDmcColor`,
`commitEditDmcColor`, `addDmcFilter` in `workspace.tsx` now handle any
brand; `DmcColor` is imported there although `ThreadColor` exists.
`runMultiScaleOptimizer` runs two weight schedules on the same grid, not
multiple scales (flagged on 2026-09-09, unchanged).

### S3 · Repeated Tailwind class strings

The pill-button class string (`rounded-full border border-zinc-300 px-3
py-1 text-sm font-medium transition-colors hover:bg-black/[.04] …`) appears
more than 20 times. A `<PillButton>`/`<SegmentedControl>` pair would remove
several hundred lines and make the dark-mode fix from D81 impossible to
miss on one instance.

### S4 · Tuple arrays in hot loops contradict the project's own rule

`new Array<Oklab>(cellCount)` in six modules versus `types.ts`'s explicit
rationale for interleaved typed arrays. Covered by E2/A3.

### S5 · What is good and should be kept

Strict TypeScript, clean lint, consistent Prettier-style formatting,
pure modules with typed-array interfaces, deterministic seeded RNG, one
shared energy function, explicit sentinel handling for `EMPTY_CELL`
throughout `pattern-edit.ts`, descriptive error messages at every user-
facing boundary.

## Logic and design observations

- `contour-cleanup.ts:18`: `costCeiling: 0.02` is compared against a
  **squared** OKLab distance difference while its comment calls it "~1 JND";
  the 2026-09-09 review raised this units question and it is unresolved.
  0.02 as an unsquared distance is 0.0004 squared — 50× tighter.
- `edgeMode` is stored on the pattern but nothing branches on it; fine, but
  the field's doc should say "Regenerate resets it".
- `kMeansQuantizer` (Latest) calls `plainKMeansQuantizer` then re-converts
  cells to OKLab a second time for reinvestment; the reinvestment step also
  discards the first Lloyd run's assignments and re-runs Lloyd from the
  injected centroids, which is correct but is where 9 s of the large case
  goes — a max-iterations cap of 30 on 667k cells × 64 labels is the cost.
  Consider a mini-batch or sampled Lloyd for grids above ~200k cells,
  followed by one full assignment pass.
- Selecting a new photo destroys the previous document (undo stack and
  autosave) without confirmation.

## Development process

### P1 · The handover documents no longer serve their purpose

`HANDOVER.md` is 7,025 lines (446 KB) and `GOALS.md` 4,658 lines (301 KB).
The "Current state" section still opens "As of G-012 (2026-09-10)" /
"As of G-013–G-016", cites 198 and 251 unit tests (actual: 587), references
`app/page.tsx`, and the "Next steps" section lists M6–M9a as remaining and
PNG as the only export. The 2026-09-09 review flagged exactly this
("maintain one accurate present-tense summary"); ~120 commits later it is
unchanged. STANDARDS requires that a newcomer could take over from
`HANDOVER.md` alone; at this size and with a wrong summary they cannot,
and every session that reads it spends >100k tokens to do so.

Recommendation: rewrite "Current state", "How things fit together" and
"Next steps" as one accurate document under ~300 lines; move decisions
D1–D95 to `docs/decisions/` (one ADR per file, append-only as now); move
completed goals to `docs/goals-archive.md`; keep `GOALS.md` to active goals
only. Add a "last verified" date to the summary and a checklist item in the
milestone check-in: "Current state section updated?".

### P2 · A goal was marked DONE with an incomplete, uncommitted deliverable

G-024 is "DONE (2026-09-12)" in `GOALS.md`, but at review time: the delivery
document `docs/reviews/2026-09-12-crisp-edges-acceptance-and-delivery.md`
still contains empty `<!-- BENCHMARK_RESULTS -->` and
`<!-- MEMORY_RESULTS -->` placeholders while its "Known limitations"
section says "see Section 2 above" for performance; it cites
`tests/unit/crisp-benchmark.bench.ts`, a file that does not exist (the
file present was renamed from `.spec.ts` to `.ts` during this review);
the acceptance-matrix spec, the delivery assets and the doc itself are
untracked; the goal's own closing note says "Recommend moving G-024 to
Completed pending Owner sign-off" while the status already reads DONE.
OPERATIONS §5 makes Owner sign-off part of "done". Suggested rule: a goal
cannot flip to DONE while `git status` is dirty for its files or its
deliverable contains placeholders.

### P3 · Two sessions editing one working tree

Files changed under me during the review (`tests/unit/crisp-benchmark.*`,
the delivery doc, HANDOVER/GOALS with +688/−545 uncommitted lines). Two
agents (or an agent and the Owner) in one checkout means neither can trust
`git status`, tests may run against a half-edited tree, and the Playwright
suite cannot start at all while the other session's dev server is up.
Use `git worktree add` per session (the harness has `EnterWorktree`), and
give the e2e config its own port **and** directory-independent dev server,
or run e2e against `next build && next start`.

### P4 · Documentation volume is crowding out engineering hygiene

Across the history, 13.4k lines were added to `HANDOVER.md`+`GOALS.md`
against 16.7k in `lib/`+`app/`; 9 commits exist solely to "Document the Dxx
deploy". Meanwhile the cheap hygiene items from the 09-09 review
(`.dockerignore`, CI, accurate summary) are still open, and the codebase has
no benchmark script despite HANDOVER quoting 8.67 s / 25.9 s / 13.4 s
figures. Rebalance: a one-line deploy log table instead of narrative
entries; a `npm run bench` script checked in (the ad-hoc one used for this
review is ~40 lines); a GitHub Actions workflow running lint, tsc, unit and
e2e so "all green" is a CI badge rather than a sentence in a document.

### P5 · Test suite shape

587 unit tests is a real asset. Gaps: no e2e test mentions Crisp, DMC,
Cosmo or Anchor (grep across `tests/e2e/`), although the delivery doc
states "the G-024 M5 e2e suite" covers the crisp lifecycle; 40 unit
assertions are bare `toBeGreaterThan(0)`; regression fixtures are all
synthetic (the 09-09 review asked for permission-cleared real photos with
salient-detail masks). Add: one e2e per palette mode and for Crisp; a
deserialize fuzz test (would have caught B2/B3); a large-grid brush-drag
timing test in the browser (B7).

### P6 · Optimize the algorithm before adding a language

G-023 proposes a Rust sidecar for the k-means/ICM hot path. The measurements
above show the hot path is dominated by avoidable work (E1–E3): the same
loops in JS with `T − S[c]` scoring, precomputed pair costs, typed OKLab
buffers and integral-image tensors should give most of the win with no new
toolchain, no WASM loading, and no second implementation to keep in sync.
Do that first, measure, and only then decide whether Rust is still needed.

## Prioritized recommendations

1. Fix B1/B6 (persistence) and B2/B3 (deserializer validation) — small,
   contained, high impact; add a fuzz test for the deserializer.
2. Fix B4/B5 (keyboard handler) by moving the shortcut effect into a hook
   that reads live state through refs.
3. Implement E1 + E2 + A3 together as one change (shared context, typed
   OKLab buffer, `T − S[c]` ICM scoring, precomputed pair costs); re-measure
   with a committed `npm run bench`. Then E3 (integral-image tensor) and
   E4 (histogram percentile).
4. Fix B7 by making brush/move/select drags incremental.
5. Split `workspace.tsx` (A1) and regroup `lib/` (A2); prune or quarantine
   dead modules (A4); replace the hand-synced unions (A5).
6. Rewrite the HANDOVER summary sections and archive the decision record
   and completed goals (P1); adopt the "no DONE with a dirty tree or
   placeholders" rule (P2); one worktree per session (P3).
7. Add `.dockerignore`, a CI workflow, and e2e coverage for palette modes
   and Crisp (A7, P5).
8. Trim narrative comments to invariants + pointers (S1); fix the stale
   "not wired yet" and `app/page.tsx` references now.

## Confidence and limits

High confidence: B1–B3, B6, B7, E1–E5 (measured or reproduced). B4/B5 are
from code reading with a traced state sequence, not a browser run. The e2e
suite was not executed here for the reason above; the "587 pass" figure is
from this session's own run. Timings are single runs on one Windows machine
under Node 22 and will vary. The Pattern Keeper PDF, A4 layout and PDF-canvas adapter modules were not
reviewed in depth.
