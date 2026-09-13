# Goals — cross-stitch-pattern-generator

Template, numbering, and cross-project conventions live in
`E:\CLAUDE\COMPANY\GOALS.md`. This is a **standalone project** (Owner
decision, 2026-09-09) — not a svc-lab service: no monetization. Deployed
live at the Owner's direct instruction after M9 (see progress log below)
to `cross-stitch.craftodejnice.cz`; see
`docs/decisions/D013-deployed-to-cross-stitch-craftodejnice.md`, the deploy
log in `HANDOVER.md` and `COMPANY/INFRASTRUCTURE_DEPLOY.md`. Standard
OPERATIONS.md milestone check-in gates apply (not waived, unlike
svc-lab). Completed goals live in `docs/goals-archive.md`.

## Active goals

### G-023 · Rust sidecar for the color-quantization/ICM hot path — DRAFT, possibly relevant to G-030 (2026-09-12)
- **Not superseded -- correcting an earlier overreach.** An earlier pass
  at this file marked this goal "superseded by G-030" on the assumption
  that G-030 would definitely move the entire generation pipeline server-
  side. G-030 has since been pulled back to a vague, far-future "social
  ecosystem" placeholder with no defined architecture yet (see its own
  entry) -- it's no longer safe to assume this goal is subsumed by
  anything. Left as its own independent DRAFT/backlog item, exactly as
  the Owner originally parked it ("maybe one day"). If G-030 eventually
  does involve server-side generation, this goal's own engineering
  guidance (versioned binary payload, Route Handler not Server Action,
  bounded worker pool, internal-network-only container, observability)
  and its Codex-critique findings (the candidate-set reduction is real
  and language-agnostic regardless of where it runs) are directly
  reusable -- but that's a "when we get there" note, not a decided plan.
- **Measured 2026-09-13 (G-031 M3) -- recommendation: not needed.** The
  JS pipeline now generates the largest supported case (1500×1000 source
  → 1000 stitches / 64 colors, Standard) in 14.6 s, down from 280.8 s,
  with byte-identical output; Crisp takes 27.4 s. ICM is 8.5 s of that,
  k-means 3.4 s. Both are under the <30 s target without a second
  toolchain. Revisit only if a concrete latency requirement below that
  appears (G-030). See `docs/reviews/2026-09-13-pipeline-performance.md`.
- **What:** Move the compute-heavy stage
  of the pattern pipeline (k-means
  in OKLab + the ICM/Potts local optimizer, `lib/quantize.ts` +
  `lib/local-optimizer.ts`) out of the browser and into a separate Rust
  HTTP service (Axum + `rayon`), called server-to-server from Next.js.
  Backlog item -- Owner explicitly parked this as "maybe one day," not
  scheduled. Do not start without an explicit Owner go-ahead.
- **Why:** The pipeline's worst-case latency is real (HANDOVER.md
  performance history, though the figures disagree with each other --
  ~13.4s, ~22s, and 9.5s recorded at different sizes/settings, meaning
  there's no solid current baseline yet). Originally scoped as "turn the
  app into a desktop app," narrowed across the conversation to "keep it a
  website, move the heavy compute server-side, use Rust" once the Owner
  confirmed browser-only processing isn't a hard requirement.
- **Acceptance criteria:** Not yet set for the full migration -- per the
  critique exchange below, M1's own acceptance criteria (a defined
  latency target) must exist before M2+ are even attempted, since
  whether this goal is needed at all depends on M1's result.
- **Constraints:** Sequencing is load-bearing, not optional -- see the
  critique exchange below. Do not jump straight to M3 (building the
  service) without M1 (and, if M1 misses target, M2) first. If Rust is
  ultimately adopted, the TS implementation becomes a frozen migration
  oracle, not a second permanently-maintained implementation.

**Codex critique exchange (2026-09-11, `codex-rescue`, read-only/
diagnosis-only, no files changed)** -- put the originally-proposed
architecture (sidecar Rust service, only the downsampled color grid sent
to the server, `rayon` for parallelism) to Codex for a real critique per
STANDARDS.md's "important decision" protocol, not a rubber-stamp
second opinion. Its findings, verified rather than taken on faith:
- **The 13.4s baseline is stale and internally inconsistent** with later
  HANDOVER.md entries (~22s at the same 1000-stitch/64-color case, 9.5s
  at 300-stitch/24-color) -- no real current baseline exists yet.
- **The "just a small abstracted grid, not the photo" framing was
  wrong.** `longerSideStitches` sets the *longer* dimension, so a
  1000-stitch pattern is up to ~667,000 cells, not ~1,000. The optimizer
  also needs the Sobel-derived importance map and directional pair-
  evidence computed from the *original* image, not just downsampled
  color -- recomputing them server-side from the grid alone would be an
  algorithm change, not a faithful port. Total payload at typical max
  settings: ~15-23MB, and a downsampled RGB grid at that resolution is
  itself a reconstructible low-resolution image. Corrected framing: the
  server receives "a reduced-resolution image and derived features," not
  an anonymized abstraction -- the README/HANDOVER's current "your photo
  never leaves your browser" claim would need updating if this is built.
- **A genuine, independently-verified algorithmic finding, language-
  agnostic:** the current energy function's Potts-style boundary term
  (`lib/energy.ts`) means only a cell's unary-best color plus its
  neighbors' current labels can ever be the ICM optimum -- any candidate
  matching none of the neighbors is provably dominated (re-derived and
  confirmed correct, not taken on faith). Cuts the per-cell candidate
  scan from up to 100 to ~9, in whichever language this runs. Worth
  doing regardless of the Rust/sidecar question.
- **Naive per-cell `rayon` parallelism would silently change ICM's
  result** (it updates assignments in scan order within a pass; later
  cells see earlier updates from the same pass). A four-color
  checkerboard scheduling scheme (partitioning on `(x mod 2, y mod 2)`)
  is the correct way to parallelize this specific 8-neighbor stencil
  without changing which local optimum it converges to -- flagged as a
  later optimization, not part of an initial port.
- **Two evolving implementations of the same algorithm is a real risk.**
  If Rust is adopted, it should become the authoritative implementation;
  TS gets frozen as a migration oracle (compared against identical
  serialized inputs/intermediate outputs, not just the existing
  regression suite, which checks diagnostic tolerance bands rather than
  exact port equivalence) and eventually retired from production use,
  not maintained indefinitely alongside Rust.
- **Concrete service-engineering guidance for if/when M3 happens:**
  versioned binary payload (not JSON) with protocol/algorithm versions
  separated; an explicit Next.js Route Handler rather than a Server
  Action (whose default body-size limit is smaller than even the
  RGB-only portion of this payload); CPU work kept off Axum/Tokio's
  async executor via a bounded worker pool, not unrestricted
  `spawn_blocking`; one end-to-end deadline with cooperative cancellation
  checkpoints in the kernel; a bounded admission queue that fails fast
  under overload; the Rust container reachable only over the internal
  Docker network, never a published host port (consistent with
  `INFRASTRUCTURE.md`'s existing safety invariant); and real
  observability (per-stage timings, queue time, algorithm version,
  cancellation/failure counts, no logging of image buffers/derived
  feature arrays).
- **Overall verdict: the bottleneck is real and worth investigating, but
  doesn't yet justify the full Rust sidecar architecture** -- the
  smallest responsible first step is a current baseline plus an
  equivalence-tested optimization spike in TypeScript, deciding on real
  numbers whether Rust is even needed. No rebuttal was raised against
  this critique -- its central technical claim was independently
  re-derived and confirmed correct, and its corrections (stale baseline,
  payload/privacy framing) were factual, not matters of judgment to
  contest.

**Milestones** (M2-M4 conditional -- do not start until the prior
milestone's own result justifies continuing):
- [ ] M1 — Re-establish a real current baseline (both generation modes,
  several sizes, the historical worst case) since existing numbers
  disagree with each other; set a concrete user-facing latency target
  before judging anything against it. Implement the candidate-set
  reduction (neighbor labels + unary-best color only, ~9 candidates
  instead of up to 100) and the identified loop waste (rebuilt neighbor
  objects, repeated fixed edge calculations per candidate, recomputed
  color distances across passes) in TypeScript. Validate against the
  existing regression suite plus real rendered-pattern spot checks (the
  suite alone checks tolerance bands, not exact preservation).
- [ ] M2 (only if M1 misses the latency target) — Port just the
  optimizer/quantization kernel to a standalone Rust library with a
  benchmark harness (no service yet). Compare single-threaded native and
  single-threaded WASM against the identical frozen TS revision on
  identical inputs before deciding anything about parallelism or
  deployment shape.
- [ ] M3 (only if M2's numbers justify a production build) — Build the
  Axum sidecar per the engineering guidance above; Rust becomes
  authoritative, TS frozen as oracle. Deploy per
  `COMPANY/INFRASTRUCTURE_DEPLOY.md` conventions (internal-network-only,
  no published host port).
- [ ] M4 — Side-by-side validation against real patterns, a domain-expert
  re-review of any numerically-changed behavior, corrected privacy
  framing in README/HANDOVER, then retire the TS engine to oracle-only
  status.

**Progress log** (newest first):
- 2026-09-11 — Goal created as backlog/DRAFT per Owner request ("write it
  as a backlog goal (maybe one day)") after a full architecture
  discussion (desktop app -> server-side -> Rust sidecar) and a real
  Codex critique exchange (see above). Not started; no Owner go-ahead to
  begin M1.

### G-028 · Import and export the OXS (Open Cross Stitch) interchange format — DRAFT (2026-09-12)
- **What:** Read and write `.oxs` files -- the open, XML-based chart
  interchange format (developed by Ursa Software, used by PCStitch,
  WinStitch/MacStitch, KXStitch, FlossCross, Xstitchify, and others) --
  so a pattern can move between this app and any of those programs.
  Export produces a valid `.oxs` from the current `StitchPattern`; import
  reads a real `.oxs` file (from any of the programs above, not just
  self-round-tripped files) into a working `StitchPattern`.
- **Why:** Directly follows a gap identified in the 2026-09-12 competitive
  analysis (`docs/reviews/2026-09-12-competitive-analysis.md`, Part 3
  item 5): several real competitors (Xstitchify, FlossCross) export
  `.oxs` specifically so a pattern isn't locked to one program; we
  currently only interchange via our own `.cspzip`/JSON, which nothing
  else can read. This is a genuine interoperability feature, not
  cosmetic -- it lets a pattern made here be finished/tracked in
  whatever desktop software the Owner or another user already uses.
- **Format grounding (verified before planning, not assumed):** Primary
  source is Ursa Software's own spec page
  (https://www.ursasoftware.com/OXSFormat/, retrieved 2026-09-12),
  cross-checked against a real, independently-hosted `.oxs` file
  (`Mickey1992/stitch-pdf2oxs`'s `test.oxs` on GitHub, retrieved
  2026-09-12) and a real generator script (a public gist producing the
  exact same file FlossCross itself ships). All three agree: root
  `<chart>` element containing `<properties>` (size, title, author,
  `stitchesperinch`/`stitchesperinch_y`), `<palette>` of `<palette_item
  index number name color strands symbol .../>` (color = 6-hex RRGGBB,
  no `#`; `number` is typically `"DMC ####"` but any brand/free text is
  valid), `<fullstitches>` of `<stitch x y palindex marked/>`,
  `<partstitches>` (half/quarter stitches, two palette indices +
  direction), `<backstitches>` (line segments `x1 y1 x2 y2 palindex`),
  `<ornaments_inc_knots_and_beads>` (French knots/beads/buttons/etc.),
  and `<commentboxes>` -- the last four are "mandatory even if empty"
  per the spec's own wording. **Only `.oxs` is in scope** -- PCStitch's
  own `.pat`/`.xsd` formats are a different, proprietary, far-less-
  documented format family (some possibly binary) and are explicitly
  out of scope for this goal.
- **Acceptance criteria:**
  1. `buildPatternKeeperPdf`-style pure module producing a spec-valid
     `.oxs` from any `StitchPattern` (DMC-mode or full-range), verified
     both by self-round-trip (our own parser reads back what our own
     writer wrote, losslessly for grid+palette) and by actually opening
     the exported file in at least one independent real OXS consumer
     (candidate: stitchmate.app's free "Open OXS files online" tool, or
     a desktop program if the Owner has one) -- not just eyeballing the
     XML, matching this project's own standing "verify against the real
     thing" bar (see G-026 M4).
  2. Import reads a real `.oxs` file (self-authored small synthetic
     fixtures for automated tests -- see licensing note below -- plus at
     least one real-world-shaped sample for manual verification) into a
     `StitchPattern`: grid dimensions, per-cell colors, and palette
     (with DMC auto-detection when `number` parses as a real DMC code
     matching our own `DMC_COLORS` table) all correct.
  3. Content the app cannot represent (backstitch, French knots,
     beads/buttons/sequins, comment boxes) is **never silently dropped**
     -- import surfaces an honest, specific summary of what wasn't
     carried over (counts per category), per VALUES.md Honesty ("never
     smoothed over to look like success"). Half/quarter partstitches are
     approximated as a full stitch of their primary color (documented as
     an approximation, not silently treated as exact).
  4. Existing export/import paths (PNG, A4, Pattern Keeper PDF, `.cspzip`,
     editable JSON) are unaffected -- this is additive. OXS export is
     folded into the "Export all" `.cspzip` bundle alongside the other
     formats, consistent with G-027's own "every export format" intent.
  5. Full regression suite green, real deploy, following this project's
     standing practice of shipping real shippable behavior mid-goal
     rather than batching it all to the end.
- **Constraints / deliberate scope decisions (flagged for Owner review
  at plan approval, not assumed unilaterally):**
  - **Open question -- needs an Owner answer before M2 (not before M1):**
    real OXS files can carry far more than our `MAX_COLORS = 100` cap
    (the verified real sample above has 237 colors). Proposed default:
    **reject import with a clear, honest error naming the file's actual
    color count and our cap**, rather than building a lossy palette-
    reduction algorithm on import (a much larger, separate feature this
    goal's brief didn't ask for). If the Owner wants auto-reduction
    instead, that changes M2's scope materially -- say so before M2
    starts.
  - Never commit a real third-party designer's `.oxs` file as a test
    fixture (the verified sample above is a copyrighted commercial
    pattern, "Aimee Stewart 2015 ") -- automated-test fixtures are
    self-authored synthetic files only (STANDARDS.md "Integrity of
    work"); any real-world sample used for manual verification stays
    local, never committed.
  - Anchor/Madeira/other-brand `number` values on import are treated as
    plain custom colors (hex + free-text name), not converted to DMC --
    we have no Anchor color table, and building one is a separate
    concern (already logged as its own competitive-analysis gap, not
    folded into this goal).
  - Symbol values on import are ignored in favor of our own auto-
    assignment (`lib/symbols.ts`) -- an incoming numeric/font-specific
    symbol code means nothing without the source program's own symbol
    font, so reinterpreting it would be guesswork, not a real mapping.
    Symbols on export carry our real Unicode symbol character in the
    `symbol` attribute (best-effort; other programs' own fonts may not
    render the same glyph -- an industry-wide OXS limitation, not one of
    ours, per the spec's live-and-let-live design for exactly this).
  - `stitchesperinch`/`stitchesperinch_y` maps to our existing
    `aidaCount` field; if the two differ (non-square weave) on import,
    use `stitchesperinch` and note the mismatch rather than averaging or
    guessing.
  - No domain-expert review needed (this is a file-interoperability/
    software-engineering concern, not a physical/chemical/craft-science
    one per STANDARDS.md's own scoping for that step).
  - Per this project's standing practice for consequential design
    decisions, M1's actual parser/serializer design goes through a real
    Codex critique exchange before being written, not just this plan.

**Milestones:**
- [ ] M1 -- Pure module (`lib/oxs.ts` or similar): parse real OXS XML
  (via `DOMParser`, main-thread-only like `pattern-import.ts` already
  is -- not the generation Web Worker) into an intermediate structure,
  and serialize a `StitchPattern` into spec-valid OXS XML (proper XML-
  escaping for name/author/title text). Self-authored synthetic
  fixtures only (see licensing constraint). Design sent through a real
  Codex critique exchange first, per standing practice. Unit-tested.
- [ ] M2 -- Import integration: wire into `lib/pattern-import.ts` /
  `loadPatternFromFile`'s existing content-sniffing flow (extend past
  ZIP/JSON to also recognize OXS XML), palette mapping (DMC auto-
  detection, EMPTY_CELL for any cell absent from `<fullstitches>`),
  partstitch approximation, and the honest drop/approximation-summary
  UI surface. **Blocked on the Owner's color-cap-behavior answer above
  before this milestone starts.**
- [ ] M3 -- Export integration: new `ExportKind` ("oxs") in
  `app/workspace.tsx`'s export dropdown (top-level, alongside
  "editable" -- it's a data format, not a color/bw render variant), plus
  folded into `lib/export-all.ts`'s `.cspzip` bundle.
- [ ] M4 -- Real-world verification: export a generated pattern's
  `.oxs` and open it in a real independent OXS consumer to confirm
  correct reading; import a real-world-shaped sample and confirm
  grid/colors/drop-summary are all correct. Full regression suite,
  commit, deploy.

**Progress log** (newest first):
- 2026-09-12 -- Goal drafted from the 2026-09-12 competitive-analysis
  review's Part 3 gap #5. Format verified against three independent
  sources (Ursa's own spec, a real hosted sample file, a real generator
  script) before writing any acceptance criteria, per this project's
  own standing practice of reproducing/verifying before planning
  against a claim. One open question flagged for the Owner (color-count-
  over-100 handling) rather than assumed. Not yet promoted to ACTIVE --
  awaiting Owner review of this plan.

### G-030 · Public launch: a social ecosystem around the app — DRAFT, far future (2026-09-12)
- **What:** Eventually make the app public, built around **a social
  ecosystem** (community/sharing features -- exact shape not yet defined:
  could include public pattern galleries, profiles, following, comments,
  or similar) rather than a plain paywall-on-exports model. Owner
  explicitly corrected an earlier draft of this goal that jumped straight
  to a detailed "server-side generation + paid export tiers" plan --
  **that plan is withdrawn**, not just superseded; the real direction is
  the social ecosystem, and "other details will be defined later"
  (Owner's own words, 2026-09-12).
- **Why:** Owner is exploring making the app public and building a
  business around it, but this is explicitly **a plan for very later**,
  not something to scope or sequence now.
- **Status:** Intentionally not planned in detail -- no acceptance
  criteria, no milestones, per the Owner's own "very later, details
  defined later" framing. This entry exists so the intent isn't lost
  between sessions, not to commit to any architecture yet. Do not expand
  this into a full plan without an explicit Owner go-ahead to start
  planning it for real.
- **One durable technical fact worth keeping regardless of eventual
  shape** (verified while a fuller version of this goal was briefly
  drafted, then withdrawn): `buildPattern` (`lib/pattern.ts`) and
  everything it calls already take/return plain typed-array buffers with
  zero DOM dependency (`lib/pattern.worker.ts` is just a thin
  `postMessage` shim around it) -- so if a future version of this goal
  ever does need server-side generation, the existing TypeScript pipeline
  can run in a Node server context unmodified, without needing G-023's
  Rust work first. Not a decision, just a fact worth not re-deriving
  later.

### G-031 · Act on the 2026-09-12 architecture/code/process review — ACTIVE (2026-09-12)
- **What:** Fix every confirmed bug, take the measured pipeline
  speed-ups, restructure the UI/library, and repair the documentation
  and process gaps found by the independent review in
  [`docs/reviews/2026-09-12-architecture-and-code-review.md`](docs/reviews/2026-09-12-architecture-and-code-review.md)
  (the review's finding IDs — B1–B9, E1–E7, A1–A7, S1–S5, P1–P6 — are
  used below; read that document in full before starting; it carries
  the line references, the reproduction probes and the measured
  numbers, none of which are repeated here).
- **Why:** The review found (a) two silent data-loss paths reachable by
  an ordinary user (autosave dies above the localStorage quota; the
  file loader accepts palettes that corrupt cell indices), (b) the
  largest supported generation takes ~170 s, not the 13.4 s the
  handover claims, with ~91 % of that in avoidable ICM work, (c) a
  2,384-line UI component whose hand-pruned effect dependencies are
  already producing bugs, and (d) a 7,000-line handover whose "current
  state" is wrong — the same defect the 2026-09-09 review flagged.
  Fixing these now is cheaper than carrying them under G-023/G-028/
  G-030, and M3 decides whether G-023 (Rust sidecar) is needed at all.
- **Acceptance criteria:**
  1. Bugs B1–B7 fixed with a unit or e2e test each that fails on the
     pre-fix code; B8–B9 fixed or explicitly declined with a logged
     reason.
  2. `buildPattern` at 1500×1000 source → 1000 stitches / 64 colors
     (Standard, Latest, Full range) completes in **under 30 s** on the
     Owner's machine via a committed `npm run bench`, and Standard-mode
     output is **byte-identical** to the pre-M3 pipeline on every
     existing golden/regression fixture (the existing `regression.spec.ts`,
     `shape-regression.spec.ts`, `pattern.spec.ts` and `pattern-crisp.spec.ts`
     suites pass unmodified; add an explicit old-vs-new equivalence test
     for the ICM rewrite).
  3. `app/workspace.tsx` under 600 lines, no
     `eslint-disable-next-line react-hooks/exhaustive-deps` left in
     `app/`; `lib/` grouped into subfolders; no module in `lib/` that is
     imported only by tests (moved to `lib/experimental/` with a status
     note, or deleted).
  4. Comment-line share under 30 % in every `lib/` file; no comment
     that says "not wired in yet" about something that is wired in; no
     reference to `app/page.tsx`.
  5. `HANDOVER.md` "Current state" / "How things fit together" / "Next
     steps" rewritten accurately in under 300 lines with a
     "last verified" date; decision record moved to `docs/decisions/`
     (one file per decision, append-only); completed goals moved to
     `docs/goals-archive.md`; `.dockerignore` present; a CI workflow
     runs lint, `tsc`, unit and e2e on push; e2e coverage exists for
     each palette mode (DMC, Cosmo, Anchor) and for Crisp.
  6. Every milestone verified by running (tests, bench, browser), not by
     reading; results logged with numbers in the progress log.
- **Constraints:**
  - **One session per worktree.** The review found two sessions editing
    this checkout at once (files renamed mid-review; Playwright unable
    to start because another `next dev` held the directory). Before
    starting any milestone: `git status` must be clean or every dirty
    file must be yours; if not, stop and log `BLOCKED:`. Use
    `git worktree add` if another session is active.
  - No goal or milestone may be reported complete while its files are
    uncommitted or a deliverable contains placeholder markers (the
    G-024 delivery doc's empty `<!-- BENCHMARK_RESULTS -->` sections are
    the precedent to avoid — fill them in M3 from the new bench).
  - Standard-mode generation output must not change in M3. Any measured
    quality change is a bug, not a trade-off, for this goal.
  - Codex critique exchange (STANDARDS.md) for the M3 ICM redesign and
    the M4 component split, if the plugin is working; otherwise note it
    and proceed.
  - No new runtime dependencies without logging why. IndexedDB access
    is a small hand-written wrapper, not a library, unless one is
    already in the portfolio.
  - Standard OPERATIONS.md check-in at every milestone boundary; M1 and
    M2 may be presented together at one check-in since both are small.

**Milestones:**
- [x] **M1 — Data safety (B1, B2, B3, B6).** Move the autosaved project
      to IndexedDB via a small async wrapper (`lib/editor/project-store.ts`),
      store `cellPalette` as base64, store the source photo once keyed by
      a content hash (one entry shared by autosave and undo snapshots),
      debounce saves (~500 ms), keep `localStorage` only for
      `WorkspaceOptions`, and surface a visible "autosave unavailable"
      state on write failure. Wrap the remaining unguarded
      `localStorage.getItem`. In `deserializePattern`: reject
      `palette.length > MAX_COLORS`, validate each entry (`rgb` = three
      integers 0–255, `symbol` non-empty string, `name` string, symbols
      unique), and add a fuzz test (seeded, ~200 mutated files) proving
      it either returns a valid pattern or throws — never a pattern that
      later crashes render. Deliverable: tests + a manual check that a
      pattern generated from a >4 MB photo survives a reload.
- [x] **M2 — Interaction correctness (B4, B5, B7, B8).** Extract the
      keyboard shortcuts into `useKeyboardShortcuts` reading live state
      through refs (no stale `selection`/`pattern`); claim Space only
      when focus is on `body` or the canvas scroller; add Ctrl+Shift+Z
      → redo. Make brush/move/select drags incremental: one working
      `Uint8Array` per gesture, draw only changed cells during the
      gesture, build the pattern and recount once on pointer-up. Add a
      Playwright test that paints a 50-cell stroke on a 1000-stitch
      pattern and asserts the gesture completes within a bounded time,
      and e2e tests for Space-while-selecting and Space-on-focused-button.
- [x] **M3 — Pipeline performance (E1–E7, A3), byte-identical.**
      (1) Commit `scripts/bench.mjs` + `npm run bench` (the review's
      ad-hoc stage timer, ~40 lines: per-stage ms at 300/24 and 1000/64)
      and record the baseline. (2) Introduce a `PipelineContext`
      (`cells`, `cellOklab: Float32Array(3n)`, `importance`,
      `pairEvidence`, `evidenceLayer`, `width`, `height`) built once in
      `buildPattern` and passed to every stage; delete the nine per-stage
      `rgbToOklab(cellRgb(...))` loops and the `Array<Oklab>` tuples.
      (3) Rewrite the ICM loop: precompute `w·q(edge)` per directed pair
      once per call into a `Float32Array(8n)`, score labels as
      `color·d(c) + T − S[c]`, replace the per-cell `neighbors` object
      array with index/weight typed arrays; keep the crisp admissible-
      label branch and its tie-break rule intact. (4) Replace the
      per-window derivative scan in `computePairEdgeEvidence` with
      per-pixel structure-tensor terms + summed-area tables. (5)
      Histogram percentile in `computeEdgeMagnitude`; per-color partial
      ranking in `nameColors`; reuse the worker between jobs. (6) Only
      if still needed for the <30 s target: sampled/mini-batch Lloyd for
      grids above ~200k cells with one full assignment pass. Gate:
      existing regression suites unmodified and green, plus a new
      equivalence test that runs the pre-M3 `runLocalOptimizer` (kept
      temporarily as a test-only reference) and the new one on the
      golden fixtures and asserts identical output. Then fill the
      G-024 delivery doc's benchmark placeholders from the new bench,
      update G-023's entry with the measured result and a
      recommendation (proceed / not needed).
- [x] **M4 — Structure (A1, A2, A4, A5, S1–S3).** Split
      `app/workspace.tsx` into hooks (`useWorkspaceOptions`, `usePanZoom`,
      `useBrushTool`, `useSelectTool`, `useMoveTool`,
      `useKeyboardShortcuts` from M2, `useExports`) and components
      (`TopBar`, `OptionsPanel`, `ResizePanel`, `ToolsDock`, `ImageWindow`,
      `ProcessingParams`, `ColorsDock`, `BrandColorPicker`, `PillButton`,
      `SegmentedControl`). Regroup `lib/` into `pipeline/`, `crisp/`,
      `threads/`, `export/`, `editor/`, `color/`; move
      `simulated-annealing`, `boundary-chains`, `contour-refinement`,
      `diagnostics` to `lib/experimental/` (or delete) with a status
      note. Replace the hand-synced `threadBrand`/`edgeMode` unions with
      type-only imports. Rename `*Dmc*` identifiers that handle any brand.
      Trim comments to invariant + one-line reason + `See Dxx` pointer;
      delete every stale "not wired in yet" and `app/page.tsx` reference.
      Gate: all tests green, `tsc`/eslint clean, every e2e test passes
      unchanged (the split must not change behavior or accessible names).
- [x] **M5 — Documentation and process (P1–P5, A7).** Rewrite the three
      HANDOVER summary sections (accurate, <300 lines, "last verified"
      date); move D1–D95 to `docs/decisions/Dxx-<slug>.md` with an index;
      move completed goals to `docs/goals-archive.md`; add a one-line
      deploy-log table replacing narrative deploy entries going forward.
      Add `.dockerignore` (`node_modules`, `.next`, `.git`,
      `test-results`, `playwright-report`, `docs/reviews/*assets*`).
      Add `.github/workflows/ci.yml` (lint, `tsc --noEmit`, `vitest run`,
      Playwright against `next build && next start`, Node 22). Change
      `playwright.config.ts` to run against a production build on its own
      port so a running dev server never blocks it. Add e2e tests for
      DMC, Cosmo, Anchor and Crisp generation (legend naming, no console
      errors). Follow the handover format now in `COMPANY/STANDARDS.md`
      → Documentation (300-line snapshot with a `Last verified` line,
      one `docs/decisions/Dnnn-<slug>.md` per existing `Dnn` entry using
      the template, deploy-log table, `docs/goals-archive.md`) and
      finish with `node E:\CLAUDE\COMPANY\scripts\docs-lint.mjs .`
      passing (it currently reports the 7,138-line handover, the missing
      `Last verified` line, and a stale reference to
      `tests/e2e/pattern-editor.spec.ts`). The "no DONE with a dirty
      tree or placeholders" and "one session per worktree" rules are now
      company-wide (`COMPANY/OPERATIONS.md` §3/§5); list them under the
      handover's "Rules in force".

**Progress log** (newest first):
- 2026-09-13 — **Pushed and deployed** (Owner: "push and deploy").
  `1380bd3` live: only the cross-stitch container restarted (31 containers,
  diff before/after), 5 sites HTTP 200. Live checks on production: 1000 ×
  667 stitches / 26 colors generated in 8.5 s with no console errors; the
  50-cell brush stroke on a 1000-stitch pattern took 1,248 ms; the >4 MB
  photo autosave, palette-mode and generation e2e tests passed against the
  live site (9/9). The first CI run failed at `tsc` (generated `LayoutProps`
  missing on a fresh checkout); fixed by `npx next typegen` before `tsc`,
  reproduced and verified in a fresh clone. Owner follow-ups in the same
  session: canvas resize expands with empty stitches (D109) and control text
  is unselectable (D110). Owner sign-off on G-031 still outstanding.
- 2026-09-13 — **M5 done; all milestones complete. PENDING APPROVAL: Owner
  sign-off on G-031, and approval to push `master` and deploy — nothing
  leaves the workspace without it — logged 2026-09-13.** `HANDOVER.md`
  rewritten from 7,138 to 200 lines (current state, architecture, rules in
  force incl. one-session-per-worktree and no-DONE-without-sign-off, next
  steps, a 34-row deploy log). Removed from it: every narrative decision
  entry (now files), the stale G-012-era state and M6–M9a next steps, the
  obsolete 13.4 s perf note, the stale Codex-credit Owner actions, and the
  review/research summaries (now links only). D1–D98 migrated to
  `docs/decisions/D001`–`D098` in the template (D060 was never assigned) with
  a generated index. 27 completed goals moved to `docs/goals-archive.md`
  (`GOALS.md` 5,148 → 812 lines). Added `.dockerignore` (local
  `docker build` succeeds, context 2.96 MB), `.github/workflows/ci.yml`
  (lint, tsc, unit, Playwright on a build, Node 22; YAML parses, never run
  since nothing is pushed), and `tests/e2e/palette-modes.spec.ts` (DMC,
  Cosmo, Anchor legend naming, Anchor disclosure, Crisp, Crisp + DMC, no
  console errors). README rewritten. Verified: `tsc`/eslint clean; 653/653
  unit; 55/55 e2e on a fresh production build; `docs-lint` ok. No Codex
  exchange for M5 (documentation only).
- 2026-09-13 — **M4 done.** `lib/` grouped into `pipeline/`, `crisp/`,
  `threads/`, `export/`, `editor/`, `color/`; the four test-only modules
  moved to `lib/experimental/` with a status README (`75c91bb`). Comments
  trimmed to invariant + reason + `See Dxx`; every `lib/` file under 30 %
  comment lines; no "not wired" or `app/page.tsx` references (`e316f39`).
  `app/workspace.tsx` 2,448 → 319 lines: ten hook files in `app/hooks/`, seven
  component files in `app/components/` (D108); no `exhaustive-deps`
  disable left in `app/`. Brand unions are type-only imports; the shared
  thread-color shape is `ThreadColor` (`lib/threads/thread-color.ts`), and
  `dmc-match` became `brand-match`. Decision files renumbered D099–D108
  because `HANDOVER.md` already used D97/D98. Codex critique of the split
  hit its usage limit after a partial answer (palette-editor state across
  loads, resize panel resetting on re-click); both handled. One e2e race
  fixed: the corrupt-autosave test seeds from a page without the workspace,
  since the page's own restore could consume the record first (25/25 on
  `--repeat-each=5`). Verified: `tsc`/eslint clean; 653/653 unit; 49/49
  e2e unchanged on a fresh production build. Next: M5.
- 2026-09-13 — **M3 done.** `npm run bench` committed (D105); baseline
  on `8f0b78f`: 1000 st / 64 col Standard 280.8 s (ICM 277.4 s). Shared
  `PipelineContext` (D106); ICM O(8+k) per cell, row-cached pair-evidence
  derivatives, histogram percentile, k+1-nearest color naming, typed Lloyd
  buffers, worker reuse -- all byte-identical (D107). After: Standard
  **14.6 s** (target <30 s), Crisp 27.4 s, Standard+DMC 18.5 s; 300 st /
  24 col Standard 11.1 s → 1.7 s. Gates: 18 golden hashes recorded from
  the pre-M3 code all unchanged; old-vs-new optimizer equivalence spec
  against a verbatim reference copy; regression/shape-regression/pattern/
  pattern-crisp suites unmodified and green. Codex critique exchange: the
  first design critique launched but its result couldn't be retrieved
  from this session (plugin status/result commands are user-only); a
  second, foreground review of the implemented diff confirmed the ICM/
  denoise/pair-evidence/finalization rewrites bit-identical and found
  three edge cases (`selectKth` with NaN/−0, `nameColors` with a NaN
  color, a natively-errored worker being reused) -- all conceded, fixed
  and tested; its `stamp` overflow note is outside the supported grid
  size (≤8 M visits) and left as is. Verified: `tsc`/eslint clean; 653/653
  unit; 49/49 e2e on a fresh production build. G-024 delivery doc points
  to the new numbers; G-023 marked "not needed" with the measurement.
  Numbers: `docs/reviews/2026-09-13-pipeline-performance.md`. Next: M4.
- 2026-09-13 — **M2 done.** B4/B5/B8: shortcuts extracted to
  `app/hooks/use-keyboard-shortcuts.ts`, reading live state through a ref
  (D103); Space claimed only with focus on body/canvas scroller;
  Ctrl+Shift+Z = redo; Escape merge moved into the hook; no
  `exhaustive-deps` disable left for shortcuts. B7: brush strokes paint a
  working `Uint8Array` and redraw one cell via new `drawCell`; Move/Select
  blit a pointer-down snapshot per event (D104). Verified: `tsc`/eslint
  clean; 623/623 unit (+4 `drawCell` geometry/weight tests); 49/49 e2e
  (+5 in `tests/e2e/interaction-correctness.spec.ts`; on the pre-fix build
  B4 and B8 fail and the 50-cell stroke on a 1000×625 pattern took
  21,126 ms — now 1,261 ms, bound 5 s). Next: M3.
- 2026-09-13 — **M1 done** (Owner instruction this session: work through
  the milestones without check-ins unless a decision needs them).
  Started from a clean tree after committing the earlier sessions'
  carry-over (`3553795`). B1/B6: autosave moved to IndexedDB via
  `lib/editor/project-store.ts` (photo stored once by SHA-256, typed-array
  cells, 500 ms debounce, `pagehide` flush, one-time migration off the
  localStorage slot, every localStorage access wrapped) with a visible
  "Autosave unavailable" status (D100). B2/B3: `deserializePattern`
  validates every palette field, `MAX_COLORS`, integer dimensions/indices
  and unique symbols (D099). B9: corrupt autosave → banner with an
  on-demand "Download error report" button, no page-load download (D101).
  Pulled M5's Playwright change forward: e2e now runs against
  `next build && next start` (D102) because a stale `next dev` from
  2026-09-12 (PID 17476) still holds this directory. Verified: `tsc`
  and eslint clean; 619/619 unit tests (was 587; +32: store, fuzz with 200
  seeded mutations, validation cases — 14 of them fail on the pre-fix
  deserializer, checked by swapping the old file in); 44/44 e2e including
  five new autosave tests (edited pattern + photo survive a reload, a
  >4 MB noise photo survives a reload, corrupt autosave banner/report,
  legacy-slot migration, throwing `localStorage` getter). `docs-lint`
  reports only the pre-existing HANDOVER.md items (M5). Next: M2.
- 2026-09-12 — Goal created from the review's "Prioritized
  recommendations" section at the Owner's instruction ("make a plan
  according to your recommendations and put it into a new goal for other
  agent execution"). Review verification state at creation: tsc/eslint
  clean, 587/587 unit tests, e2e not runnable (another session's dev
  server held the directory), measured 1000-stitch/64-color generation
  ≈170 s (ICM 154.6 s). Working tree was dirty with another session's
  uncommitted G-024 M6 work at creation time — the executing agent must
  resolve that (commit or worktree) before M1, per the constraints above.

### G-032 · Optional photo enhancement (predefined, content-adaptive modes) — ACTIVE (2026-09-13)
- **What:** An optional pre-processing stage that corrects a source
  photo's exposure, tonal range, local contrast, colour cast and
  saturation *before* the pattern pipeline sees it. In the processing
  params it is a fourth segmented control next to Algorithm / Palette /
  Edges — **Photo: Off | Auto | Vivid | Portrait** — with Off the
  default and byte-identical to today. A mode is a *policy*, not a fixed
  filter: every adjustment is measured from the photo itself (histogram
  percentiles, median lightness, illuminant estimate, mean chroma) and
  capped, so a well-exposed photo passes through almost unchanged while
  a dark, flat, colour-cast one gets the full correction. Before
  Generate, the Image window shows the chosen mode applied to the photo
  (with a way to compare against the original); the mode used is
  recorded on the pattern (like `edgeMode`) so a reopened file reports
  how it was built, and remembered as a preference for the next
  Generate (like `WorkspaceOptions.edgeMode`).
- **Why:** Phone photos are routinely underexposed, flat (backlit,
  overcast, hazy) or colour-cast. The pipeline then spends its palette
  budget on a compressed tonal range and the chart comes out muddy, and
  `docs/domain-reference.md`'s A4 finding already documents that a
  low-contrast source weakens the importance map and therefore confetti
  suppression across the whole image. Fixing the photo once, upstream,
  improves every later stage consistently, and does so with one click
  rather than asking stitchers to learn a photo editor first.

**The universal adjustments (design).** Applied in this order, all in
OKLab/OKLch (`lib/color.ts`) so tone changes don't shift hue and colour
changes don't shift lightness; alpha is carried through untouched and
fully transparent pixels are excluded from every statistic.
1. **Auto white balance** — estimate the illuminant (gray-world blended
   with a robust bright-neutral "white patch" estimate), correct by a
   von Kries diagonal scaling in the OKLab LMS cone space, with the
   per-channel gain **capped** (≈ ≤1.3×) so a legitimately dominant
   colour (a sunset, a red flower on green) is not neutralised away. A
   grayscale photo stays gray by construction (neutral estimate →
   identity).
2. **Auto levels (exposure / black & white point)** — stretch OKLab L
   so robust low/high percentiles (≈0.5th / 99.5th) map to the full
   range; an already full-range photo is a near no-op. Guarded against
   degenerate histograms (flat/near-flat image → identity).
3. **Midtone gamma** — a single power curve on L pulling the median
   towards a target midtone (≈ L 0.45–0.5), capped both ways (lifts a
   dark photo, tames an overexposed one, leaves a normal one alone).
4. **Local contrast (CLAHE on L)** — contrast-limited adaptive
   histogram equalisation with a **conservative clip limit**: this is
   the one adjustment that genuinely rescues fog/backlight/flat
   lighting, and also the one that amplifies flat-region noise, which
   is exactly what `lib/denoise.ts` and the contour-cleanup passes fight.
   The clip limit is therefore calibrated against the existing noisy
   golden fixture's confetti ratio (M2/M4), not chosen by eye. Skipped
   in Portrait (blotchy skin) and on images too small for a sensible
   tile grid.
5. **Vibrance** — chroma boost in OKLch weighted towards low-chroma
   pixels (already-saturated colours barely move), with a skin-hue band
   (orange hues at moderate chroma) protected, then gamut-mapped back to
   sRGB by *reducing chroma at constant hue and lightness*, never by
   per-channel RGB clipping (which shifts hue). Moderate on purpose:
   over-saturation pushes colours outside what real thread can match,
   so a brand palette mode (DMC/Anchor/Cosmo) would then *lose* distinct
   colours at the snap (guarded by an explicit acceptance test).

Deliberately **excluded** from v1, each with a reason to be recorded in
its decision file: *sharpening / unsharp mask* (halos are manufactured
edge colours — precisely what Crisp mode exists to prevent, and box
downsampling averages fine detail away anyway); *noise reduction*
(already exists, quantizer-only, `lib/denoise.ts`); *dehaze* (largely
covered by CLAHE + levels, and a real dehaze model is a different-sized
problem); *highlight/shadow recovery* (nothing to recover in clipped
8-bit input); *manual sliders* (Owner scope: predefined modes only).

**Modes** (initial presets — one data-driven `EnhancementPreset` record
each, so adding/tuning a mode is a data change, not code):

| Mode | WB | Levels + gamma | CLAHE | Vibrance | Intended for |
|---|---|---|---|---|---|
| Off | — | — | — | — | Default; today's exact output |
| Auto | capped | yes | mild | +≈10 % | Any photo; the safe default fix |
| Vivid | capped | yes | stronger | +≈25 % | Landscapes, objects, pets, faded/old prints |
| Portrait | more conservative | yes, gentler curve | off | skin-protected, +≈10 % | Faces (no blotching, natural skin) |

The percentages are starting points to be calibrated in M4, not
commitments; each calibrated constant gets a decision file with its
measurement linked.

**Placement decision (to be confirmed by the M1 critique exchange):**
enhancement runs on the *source* `PixelBuffer` before `buildPattern`
(inside the worker job), never on the downsampled cell grid — because
`computeEdgeMagnitude`/`computeCellImportance`, `computePairEdgeEvidence`
and the Crisp evidence layer all read source pixels, not cells; enhancing
cells alone would leave those stages (and Crisp's supporting-mode
colours) seeing un-enhanced colours, an inconsistency no later stage can
repair. Cost: one extra pass over up to 16 MP (`MAX_DECODE_DIMENSION_PX`
4000²); statistics are gathered on a subsampled grid (≤ ~1 M samples)
and the per-pixel pass is typed-array only, with a measured budget
(criterion 7). The `pixelBuffer` held by the workspace stays the
*original* decode, so switching modes and pressing Regenerate needs no
second buffer; `sourceImage.dataUrl` (the photo underlay / Move tool /
saved-file embed) also stays the original bytes.

- **Acceptance criteria:**
  1. Photo = Off produces output **byte-identical** to the pre-G-032
     pipeline on every existing golden/regression fixture (the
     `regression`, `shape-regression`, `pattern`, `pattern-crisp` and
     `crisp-edges-acceptance-matrix` suites pass unmodified) and the
     worker/serializer round-trip of a pre-G-032 save file is unchanged.
  2. **Recovery test, with numbers:** for each of at least three golden
     fixtures, a *degraded* copy (contrast reduced to ~40 %, −1 EV
     darker, warm cast applied) generated with Auto agrees with the
     undegraded original's Off pattern on **≥ 85 % of cells** (per-cell
     palette-colour ΔE tolerance defined in the test), while the same
     degraded copy with Off agrees on measurably fewer — the test asserts
     the improvement, not just the absolute number. Target to be
     re-tuned in M4 if evidence shows it is set wrong, with the reason
     logged.
  3. **Do-no-harm tests:** (a) on a well-exposed fixture, Auto changes
     the mean OKLab ΔE by less than a small tolerance (near-identity);
     (b) enhance(enhance(x)) ≈ enhance(x) (idempotence within tolerance);
     (c) a grayscale image stays grayscale under every mode; (d) alpha is
     unchanged and transparent pixels don't influence statistics; (e)
     on the amplitude-50 noisy golden fixture, Auto's confetti ratio
     rises by no more than a bounded amount over Off, and the Crisp
     acceptance matrix's noise/JPEG negative controls still pass with
     Auto on; (f) with the DMC palette mode, Vivid keeps at least 90 %
     of Off's distinct-thread count on the fixture set.
  4. UI: the Photo control in processing params (accessible names,
     keyboard-operable like the existing segmented controls); the Image
     window shows the enhanced preview before Generate whenever the mode
     is not Off, with a compare-to-original affordance; the preference
     persists across reloads; `StitchPattern.enhancementMode` survives
     save → reopen and the .cspzip/Export-all path; e2e tests cover
     each of these.
  5. Every op has unit tests on synthetic images (monotonic tonal
     mapping preserves lightness order; WB neutralises a known cast on a
     gray card within tolerance and respects the gain cap; gamut mapping
     preserves hue within tolerance; degenerate inputs — 1×1, all-black,
     all-white, flat colour — return without throwing).
  6. Calibrated on **real photographs** (Owner-supplied preferred;
     otherwise public-domain/CC0 images with source and licence recorded
     under `docs/`) across the mode matrix, with before/after
     measurements in a `docs/reviews/` document — never by eye alone.
  7. Performance: enhancement of a 4000×3000 buffer completes in under
     **1.5 s** in the worker on the Owner's machine (measured via
     `npm run bench` from G-031 M3, extended with an enhancement row),
     and the Image-window preview updates in under 300 ms for a
     ≤ 1200 px preview.
  8. Domain-expert review (photographic image processing / colour
     science) at M1 and again at M4, and a Codex critique exchange on
     the placement decision and the mode set, both logged with outcome.
  9. README, HANDOVER, decision files, docs-lint green, everything
     committed, Owner sign-off.
- **Constraints:**
  - **Sequence after G-031 M4** (the `workspace.tsx` split and `lib/`
    regrouping): this goal adds a control to the processing-params
    component and a module under `lib/pipeline/`; starting earlier
    would edit a 2,400-line file another goal is actively splitting.
    If G-031 stalls, the Owner decides whether to start on a worktree.
  - Off stays the default and stays byte-identical; any measured change
    with Off is a bug.
  - Pure, DOM-free enhancement module (unit-testable in Node like every
    other pipeline stage); browser-only code limited to the preview
    plumbing.
  - No new runtime dependencies (CLAHE, percentiles and colour maths are
    a few hundred lines on typed arrays; a library would bring its own
    colour space and gamut handling that don't match `lib/color.ts`).
  - Save-file format: add the optional `enhancementMode` field the same
    way `edgeMode` was added (bump the format version, validate the
    value against the preset registry on read, old files still open).
  - Standard OPERATIONS.md check-in at every milestone boundary.

**Milestones:**
- [ ] **M1 — Design gate + pure core.** Codex critique exchange on the
      placement decision (source pixels vs cell grid), the adjustment
      set and the mode matrix; domain-expert review of the same design
      against photographic image-processing practice (illuminant
      estimation, CLAHE limits, vibrance/skin protection, gamut
      mapping). Outcomes → decision files. Then implement
      `lib/pipeline/enhance.ts` (`lib/enhance.ts` if the regrouping
      hasn't landed): image statistics on a subsampled grid, the preset
      registry (`EnhancementModeId`, `ENHANCEMENT_PRESETS`), and the five
      ops above as pure functions over `PixelBuffer`, plus an
      `oklabToRgbGamutMapped` helper in `lib/color.ts`. Unit tests per
      criterion 5 and the do-no-harm tests 3(a)–(d). Deliverable: green
      unit suite, a first timing at 4000×3000.
- [ ] **M2 — Pipeline integration and evidence.** `enhancementMode` on
      `BuildPatternOptions`/`StartMessage`/`RunPatternJobOptions`,
      applied before `gridDimensionsFor`/`downsampleToGrid`; recorded on
      `StitchPattern`; serializer version bump + fuzz-test coverage;
      `WorkspaceOptions.enhancementMode`. Add the degraded-fixture
      recovery test (criterion 2), the noise/Crisp negative controls
      (3e) and the DMC distinct-colour test (3f); calibrate the Auto
      CLAHE clip limit from those numbers (decision file). Off
      byte-identity test on every existing fixture (criterion 1). Bench
      row for enhancement (criterion 7).
- [ ] **M3 — UI and preview.** Photo segmented control in processing
      params; a preview job (same worker script, new `"enhance-preview"`
      message, its own supersede-on-new-request semantics, run on a
      ≤ 1200 px copy) feeding the Image window when no pattern exists
      yet, with a compare-to-original affordance; persisted preference;
      save/reopen/Export-all carry the mode. Playwright e2e per
      criterion 4, run against the production build. Deliverable: the
      feature usable end-to-end in the browser.
- [ ] **M4 — Real-photo calibration, docs, deploy.** Assemble the
      real-photo set (licences recorded), run the mode matrix, measure
      (criteria 2, 3, 7) and tune preset constants — one decision file
      per calibrated constant, measurements in
      `docs/reviews/<date>-photo-enhancement-calibration.md`. Re-invoke
      the domain expert on the calibrated result. README (one paragraph
      + the mode table), HANDOVER regenerated, docs-lint green, deploy
      after Owner approval (per `COMPANY/INFRASTRUCTURE_DEPLOY.md`),
      deploy-log row.

**Open questions for the Owner (answer before M1 starts):**
- Three modes (Auto / Vivid / Portrait) plus Off, or start with Auto
  only and add the others once Auto is calibrated? The plan is written
  for three; cutting to one removes nothing structural.
- Should the "Grid + photo" underlay after generation show the enhanced
  photo (matches the pattern's colours) or the original (today's
  behaviour, the Move tool's reference)? Plan assumes the original.
- Are there Owner photos that can serve as the M4 calibration set?
  Otherwise public-domain images will be used and their licences
  recorded.

**Progress log** (newest first):
- 2026-09-13 — **Owner authorization:** "proceed g-032 through all
  milestones including deploy without confirmation". Milestone check-ins
  are waived for this goal, and the M4 production deploy is pre-approved.
  Owner sign-off on the finished goal is still required before it reads DONE.
- 2026-09-13 — **Started** (Owner: "proceed to picture enhancement goal",
  standing instruction to work through milestones without check-ins unless
  input is required). The open questions were not answered, so the plan's
  own defaults apply, each reversible later: all three modes (Auto, Vivid,
  Portrait) plus Off; the "Grid + photo" underlay keeps showing the original
  photo; M4 calibration uses public-domain/CC0 photos with sources and
  licences recorded, unless the Owner supplies photos first. G-031 M4
  prerequisite is met (committed 2026-09-13).
- 2026-09-13 — goal created at the Owner's request ("make plan of new
  feature: optional picture enhancement … universal adjustments … one or
  more predefined enhancement modes"). Planned from a read of
  `lib/pattern.ts`, `lib/pattern.worker.ts`, `lib/pattern-client.ts`,
  `lib/load-image.ts`, `lib/workspace-storage.ts`, `lib/types.ts`, the
  processing-params UI in `app/workspace.tsx` and the domain reference's
  A4 (low-contrast) finding. No code written. Working tree at creation
  held another session's uncommitted G-031 M1 work (project-store /
  serializer files); this entry is the only change of this session.

## Completed goals

Moved to `docs/goals-archive.md`.
