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
- **Re-measured 2026-09-15 (G-035 M6) -- still not needed.** Same case,
  median of 5: Standard 4.9 s and Crisp 6.8 s, with ICM 1.7 s and k-means
  1.5 s, output byte-identical. See
  `docs/reviews/2026-09-15-performance-results.md`.
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

### G-033 · Swatch-aware color editor: remembered source, marked current, comparison on hover — ACTIVE (2026-09-13)
- **What:** Every legend color remembers which thread swatch it was
  picked from (brand + code), or that it is a custom color. Opening that
  color's editor opens the matching swatch tab, scrolls the swatch grid
  to the color and marks it as current. Hovering or focusing any other
  swatch shows how it compares with the current color: "X% lighter" or
  "X% darker", and "X% more saturated" or "X% less saturated", each part
  omitted when there is no difference. Picking a color applies it
  immediately and leaves the editor open. The editor closes only when
  the user clicks somewhere outside it (or presses Escape).
- **Why:** Adjusting a thread today means reopening the editor, finding
  the tab by hand, searching for the current code, and judging "one
  shade lighter" by eye, and the editor closes after every pick. Stitchers
  constantly swap a thread for its neighbor in the same family; the
  remembered source, the marked current swatch and the numeric
  comparison make that a one-glance, repeatable action.

**Design.**
1. **Data model.** `PaletteColor.source?: { brand: ThreadBrand; code: string }`.
   Absent means a custom color. It is set by `applyBrandPalette`
   (generation with a brand), `editColorToBrandColor`, `addBrandColor`,
   and OXS import when a brand is detected (after G-028 lands). It is
   cleared by `editColorRgb`. `mergeColors`, `renameColor` and
   `setColorSymbol` keep the surviving color's source, since they spread
   the existing entry. The swatch is looked up **by code, never by RGB**:
   Anchor entries carry the nearest DMC thread's RGB, not the Anchor
   table's approximate RGB (`lib/threads/brand-match.ts`).
2. **Saved files.** Format version 7 adds an optional `source` per
   palette entry. A malformed `source` rejects the file, consistent with
   D099. A well-formed source naming a code that is no longer in the
   thread table is dropped and the color keeps its RGB and name. Files
   from version 6 and earlier infer the source on load: with
   `threadBrand` set, match the name against that brand's
   `formatThreadName`; without it, infer only when the name matches
   exactly one thread across all brands **and** the RGB equals that
   thread's RGB. Otherwise the color stays custom. The IndexedDB
   autosave path is checked to go through the same code.
3. **Which tab opens.** The color's `source.brand`; otherwise the
   pattern's `threadBrand`; otherwise Full range. A brand-locked pattern
   still shows only its own brand.
4. **Scroll and mark.** The editor panel renders directly under the row
   being edited, not at the bottom of a list of up to 100 rows. On open,
   the search is cleared and the grid's own scroll container is scrolled
   so the current swatch is centred. This sets `scrollTop` on the grid,
   not `scrollIntoView`, which would also scroll the dock. The current
   swatch gets a visible ring and a check mark, plus `aria-pressed`. On
   another brand's tab, or when the search hides it, nothing is marked.
5. **Comparison readout.** A fixed line inside the panel, not a native
   `title` tooltip, which is delayed and invisible to keyboard users.
   It is shown on hover and on keyboard focus, for example
   "DMC 3865 - Winter White: 12% lighter, 5% less saturated". The
   metric is **Okhsl** lightness and saturation (Ottosson 2021, both
   0–1), and the difference is shown in percentage points, rounded to
   a whole number. A part rounding to 0 is omitted. When both round to
   0, only the name is shown. Okhsl rather than HSL, because HSL calls
   pure yellow and pure blue equally light and near-black colors fully
   saturated. Percentage points rather than a ratio, because a ratio
   explodes near black (L 2 → 4 would read "100% lighter"). Hue is not
   compared (not requested). Touch devices have no hover and a tap picks
   immediately, so there the comparison isn't available before choosing;
   this limitation is documented rather than solved with long-press.
   New module `lib/color/okhsl.ts`, ported from Ottosson's reference
   code (MIT, "Copyright (c) 2021 Björn Ottosson", retrieved
   2026-09-13 from https://bottosson.github.io/posts/colorpicker/),
   with the notice kept in the file and the attribution recorded in the
   README. It reuses the OKLab maths already in `lib/color/color.ts`.
6. **Stay open, close on outside click.** A swatch click commits one
   undo step and the panel stays open with the new swatch marked; the
   readout then compares against the new current color. On the Full
   range tab, the chart previews the draft live while dragging, and
   one undo step is committed per gesture (pointer-up, or the end of a
   keyboard adjustment), since `useUndoHistory` only has `set` and
   would otherwise record 50 steps per drag. Done and Cancel buttons are
   removed; a "Revert" button restores the color it had when the panel
   opened, as one undo step. A small `useDismissOnOutsidePointer` hook
   listens for `pointerdown` in the capture phase on `document` and
   closes the panel when the target is outside it. Clicking another
   row's swatch button retargets the editor to that color rather than
   closing it. Escape also closes, for keyboard users. The panel also
   closes when the edited color disappears (a merge, an undo past its
   creation, a new document), because palette indices shift.
7. **Out of scope:** the "+ Add" and symbol panels keep today's
   behavior. "+ Add" reuses the upgraded swatch grid, with no current
   color and no readout.

- **Acceptance criteria:**
  1. Unit tests: `source` is set, kept or cleared correctly by every
     mutation in `lib/editor/pattern-edit.ts` and by brand generation;
     version-7 round-trip; version-6 inference, including the ambiguous
     cases that must stay custom; the fuzz test still passes with the
     new field.
  2. `lib/color/okhsl.ts` matches Ottosson's reference implementation to
     within 1e-4 on a fixed set of colors, including black, white,
     grays, sRGB primaries and several thread colors. The readout
     formatter is tested at rounding boundaries (0.49 → omitted, 0.5 →
     "1%") and for each wording branch.
  3. Playwright e2e against the production build:
     - a DMC pattern's color opens on the DMC tab with its swatch marked
       and inside the grid's visible scroll area;
     - hovering and focusing another swatch shows the expected readout;
     - clicking a swatch changes the legend row and leaves the panel
       open with the new swatch marked;
     - clicking outside closes it, and so does Escape;
     - clicking another row's swatch retargets the panel;
     - a Full range drag produces exactly one undo step;
     - Revert restores the original color;
     - a custom color opens on Full range;
     - a saved file reopens with the same tab behavior.
  4. Generation output is unchanged except for the new `source` field.
     If `tests/unit/fixtures/golden-hashes.json` covers palette entries,
     it is regenerated once with a decision file (D107), and a test shows
     the grid and RGB values are identical.
  5. `tsc`, eslint, all unit and e2e tests green; README, HANDOVER and
     decision files updated; docs-lint green; committed; deployed after
     Owner approval; Owner sign-off logged.
- **Constraints:**
  - **Starts after G-028 is committed.** G-028 is active in this working
    tree with uncommitted files in `lib/editor/`, and this goal edits
    `lib/editor/pattern-serialize.ts`, `lib/editor/pattern-edit.ts` and
    OXS import. Starting earlier needs a separate worktree and the
    Owner's go-ahead (OPERATIONS.md §3, one session per working tree).
  - No new runtime dependencies. The Okhsl port is a few dozen lines.
  - Codex critique exchange on the data model and the version-6
    inference rules before M1 code is written; outcome logged in a
    decision file. No domain-expert review: the readout compares the
    catalogue sRGB values shown on screen, which is a colour-space
    question the Okhsl source settles, not a real-thread physical
    claim. The panel says "on screen" in its help text so the numbers
    aren't read as a statement about the physical floss.
  - Standard OPERATIONS.md check-in at every milestone boundary.

**Milestones:**
- [x] **M1 — Swatch source in the data model.** Codex critique of the
      design in items 1–2. `PaletteColor.source`, every mutation,
      `applyBrandPalette`, OXS import, serializer version 7 with
      validation and version-6 inference, fuzz-test update, golden-hash
      handling per criterion 4. Deliverable: green unit suite and an
      old saved file reopening with inferred sources.
- [x] **M2 — Editor behavior.** Panel under the row, tab from source,
      scrolled and marked current swatch, stay open on pick, live Full
      range preview with one undo step per gesture, Revert, outside-
      click and Escape dismissal, retargeting and close-on-disappear.
      E2E tests for each. Deliverable: the new editing flow usable in
      the browser.
- [x] **M3 — Comparison readout and release.** `lib/color/okhsl.ts`,
      the readout formatter, hover and focus readout, e2e for the
      readout, README attribution, HANDOVER regenerated, docs-lint,
      deploy after Owner approval, deploy-log row.

**Owner answers (2026-09-13), replacing design item 6's buttons:**
- A chart click while the editor is open closes it **and** acts as a normal
  click (close and paint).
- **Done and Cancel stay; no Revert button.** Picks still apply
  immediately and the editor stays open. Done closes and keeps the current
  colour. Cancel closes and returns the colour to what it was when the
  editor opened, as one undo step. Clicking outside closes like Done.
  Escape acts as Cancel, as dialogs conventionally do.
- No milestone check-ins; deploy when verified under the standing
  approval; Owner sign-off at the end.

**Progress log** (newest first):
- 2026-09-13 — **M2 and M3 done; all milestones complete.**

  Editor (M2), in `app/components/colors-dock.tsx`:
  - The panel opens under its legend row. The tab comes from the colour's
    source, then the pattern's lock, then Full range.
  - The current swatch is marked with a ring, a check, `aria-pressed` and
    `data-current`. On opening, the grid's own scroll area centres it.
  - A thread pick applies as one undo step and the editor stays open.
    Re-picking the current thread does nothing.
  - Full range previews the draft live on the chart through a workspace
    preview keyed to its base pattern, and commits once per drag or key
    press.
  - Done keeps the colour. Cancel and Escape restore its RGB, name and
    source as one step.
  - A click outside closes the editor like Done, and the click still acts
    (`app/hooks/use-dismiss-on-outside-pointer.ts`).
  - Clicking another colour's swatch button retargets the editor. A new
    document, a generation or a change in palette size closes it.

  Readout (M3):
  - A fixed line shows the Okhsl comparison on hover and keyboard focus
    ("DMC 3865 - Winter White: 12% lighter, 5% less saturated"), with
    "on screen" help text (D123).
  - The README credits Ottosson's MIT code.

  Found by e2e and fixed: swatches reported `aria-pressed` only when a
  current swatch existed, so a custom colour switched to a brand tab
  exposed no state. Every editor swatch now reports it.

  Verified: `tsc` and eslint clean; 850/850 unit; 67/67 e2e on a
  production build, one worker, including `tests/e2e/color-editor.spec.ts`
  (5 tests covering criterion 3). The first full e2e run was killed by low
  memory on this machine and was re-run with one worker.

  Out of scope, as planned: "+ Add" keeps today's flow, and on touch
  screens a tap picks without a comparison.

  **PENDING APPROVAL: G-033 sign-off.**
- 2026-09-13 — **M1 done.** `PaletteColor.source` (D122).
  - Set by brand generation (DMC, Cosmo, Anchor), thread picks, adding a
    thread, and OXS import for every resolved entry. Dropped by a manual
    RGB edit. Kept by rename, symbol change, merge and compaction.
  - `restoreColor` is ready for M2's Cancel.
  - Custom or cross-brand edits on a locked pattern throw.
  - Saved files are format 7. Autosave records carry `formatVersion`
    (store version still 1). Legacy data infers within its lock by exact
    name; version 7 never infers. A malformed or unknown source is dropped;
    a lock that can't be established is cleared.
  - OXS numbers and A4/PDF printed codes come from `source`.
  - The copy clipboard is cleared on document replacement and after a
    merge.
  - Existing tests that locked patterns of custom colours now use real
    threads with sources. The format-version expectations moved from 6 to
    7.

  Verified: `tsc` and eslint clean; 850/850 unit tests, including the new
  `tests/unit/thread-source.spec.ts` and a fuzz test extended with sources;
  62/62 e2e on a production build.
- 2026-09-13 — **Codex critique of the M1 data model, and its outcome (D122).**
  Conceded:
  - Autosave records couldn't tell legacy data from a deliberately custom
    colour, so records and files carry `formatVersion`, and version 7
    never infers.
  - Cross-brand inference by name and RGB is dropped. Legacy data infers
    only within its `threadBrand`, by exact thread name, as best effort.
  - The brand lock is an invariant: custom or cross-brand edits on a
    locked pattern throw, and a load that can't establish it clears the
    lock.
  - OXS export takes numbers only from `source`, and import sets canonical
    sources in both branches.
  - Sources are immutable.
  - The fuzz test covers sources, and generation gets per-brand source
    assertions.
  - A4 and PDF print codes from `source`.
  - The copy clipboard is cleared when its palette indices go stale.

  Rebutted: rejecting a file with a malformed `source`, because the
  autosave loader deletes unreadable records and optional metadata already
  falls back to absence. Such a source is dropped instead.

  Carried into M2:
  - Comparisons use the palette's actual RGB.
  - Picking the swatch that is already current is a no-op.
  - Cancel restores RGB, name and source together.

  Also done ahead of M3: `lib/color/okhsl.ts` matches `ok_color.h`
  (compiled locally) within 1e-4 on 18 colours, and
  `lib/color/swatch-comparison.ts` is tested at its rounding boundaries
  (33 tests).
- 2026-09-13 — **Started on the Owner's direction** ("proceed to goal 33").
  - G-028 is archived, so the start gate is met.
  - The Owner's answers are recorded above: close and paint, Done and
    Cancel kept, no check-ins.
  - `tests/unit/fixtures/golden-hashes.json` hashes each colour's index,
    RGB, symbol, name and count, not `source`, so criterion 4 needs no
    regeneration as long as those stay identical.
- 2026-09-13 — Goal drafted at the Owner's request ("make plan of
  improving color selection …"). Planned from a read of
  `app/components/colors-dock.tsx`, `lib/editor/pattern-edit.ts`,
  `lib/editor/pattern-serialize.ts`, `lib/threads/brand-match.ts`,
  `lib/threads/thread-brands.ts`, `lib/editor/use-undo-history.ts`, the
  active G-028 OXS code and the e2e suite (no test covers the color
  editor today). Okhsl licence verified at its source. No code written.

### G-034 · Move photo processing and every export to the server — DRAFT (2026-09-13)
- **What:** Photo decoding, photo enhancement and its preview, pattern
  generation, and every export (Color, B&W and realistic PNG, A4 ZIPs,
  Pattern Keeper PDFs, editable JSON, OXS, Export all) run on the
  server instead of in the browser. The browser keeps what is
  interactive: the editor and its tools, on-screen chart views, undo, and
  IndexedDB autosave. It uploads the photo once, then asks the server to
  preview, generate and export.
- **Why:** Owner request (2026-09-13). The motivation isn't recorded
  yet, and it matters for the design (see the open questions). Likely
  benefits: weak phones stop doing 15–30 s of CPU work; the algorithms
  stop shipping to every visitor as JavaScript; exports stop freezing
  the tab (D079); and it lays groundwork for G-030's account-based
  features.

**Consequences the Owner must accept before M1** (why this is
escalation-tier, not a routine refactor):
- **Privacy promise reversed.** README, the live site and
  `COMPANY/INFRASTRUCTURE_DEPLOY.md` all say no image is ever uploaded.
  Photos commonly show identifiable people. The server would then
  process personal data from EU visitors, so the site needs a privacy
  notice and a retention rule (VALUES.md → Integrity of work). This
  plan is not legal advice. The wording is the Owner's call.
- **Shared-host capacity.** Production is one VPS with 6 shared vCPUs
  (AMD EPYC, 1 thread per core) and about 8 GiB free memory, hosting
  about 30 other containers (checked live 2026-09-13). One largest
  generation takes 14.6 s Standard and 27.4 s Crisp of one core on the
  Owner's machine. So only 2–3 heavy jobs can run at once without
  slowing other sites. Busy periods mean queueing, and more capacity
  means spending money.
- **Online-only.** Today a loaded page generates and exports offline.
  Afterwards, a server outage or a slow connection blocks those actions.
- **Abuse surface.** A public, unauthenticated endpoint doing seconds of
  CPU work per request is an easy denial-of-service target on a host
  shared with other sites.

**Architecture (proposal, to be critiqued in M1).**
1. **Two containers from this repo.** The existing `app` container
   (Next.js, `127.0.0.1:30150`) serves the UI and Route Handlers under
   `app/api/`. A new `processor` container runs a small Node HTTP
   server with a bounded `worker_threads` pool. It is reachable only
   on the internal Docker network with no published port, and has
   `cpus` and `mem_limit` caps in `docker-compose.yml`. The separate
   container means CPU-heavy work can neither stall page responses nor
   exceed its CPU share on the shared host. Route Handlers forward
   streams to it. Server Actions are not used, because of their body-size
   limits (G-023 critique).
2. **The pure pipeline runs unchanged.** `buildPattern` and
   `lib/pipeline/enhance.ts` are already free of browser APIs, so the
   pool workers call them directly. Same buffer in, same pattern out,
   proven by the existing golden hashes (D107).
3. **Photo store.** `POST /api/photos` streams the upload, enforces a
   size cap while reading, checks the image header's dimensions before
   decoding (decompression-bomb guard), and decodes with the existing
   4000 px cap. The decoded buffer is kept **in memory only**, keyed by
   SHA-256, with an idle TTL (proposed 30 min) and a total-memory cap
   with least-recently-used eviction. It is never written to disk or
   logs. `HEAD /api/photos/:hash` lets a restored project skip
   re-uploading. An expired photo returns 410, and the client re-uploads
   from its IndexedDB copy without troubling the user.
4. **Decoding must match the browser.** Chrome applies EXIF orientation
   and converts embedded ICC profiles (such as iPhone Display P3) to
   sRGB when decoding. A server decoder that skips either produces
   different pixels, and so different patterns, for the same photo.
   Candidates: `@napi-rs/canvas` (Skia, prebuilt for Alpine/musl, and
   also gives the 2D canvas the exports need) or `sharp` (libvips, strong
   ICC and EXIF handling, but a second native dependency). M1 measures
   both on a photo set before choosing. Either is new to the portfolio,
   which needs a decision file.
5. **Generation jobs.** `POST /api/jobs` with photo hash and settings
   returns a job id. `GET /api/jobs/:id/events` streams progress with
   server-sent events. `DELETE /api/jobs/:id` cancels by terminating
   that pool worker, the same blunt cancellation the browser worker uses
   today. The result is a versioned binary payload: header, palette,
   then cell bytes. The queue is bounded: when full, the server answers
   503 with `Retry-After` immediately. Each job has a hard deadline
   (proposed 90 s), after which its worker is killed.
6. **Enhancement preview.** `POST /api/photos/:hash/preview?mode=` returns
   a ≤ 1200 px WebP, cached per photo and mode. This replaces
   `lib/pipeline/enhance-preview.worker.ts`.
7. **Exports.** `POST /api/exports/:kind` takes the edited pattern (the
   D099 deserializer validates it), export options and the photo hash
   where needed, and streams the file back. The drawing code in
   `lib/export/render.ts` and `lib/export/a4-render.ts` is also used by
   the on-screen chart (`app/hooks/use-chart-renderer.ts`). So it
   becomes environment-neutral: callers inject a canvas factory (DOM
   canvas in the browser, server canvas on the server) instead of calling
   `document.createElement`. Text needs the bundled DejaVu font
   registered on the server, and the stitch texture loads from the
   file system. Download helpers stay in the browser.
8. **Protection.** Origin check on every API route. A per-IP token
   bucket in the app, plus nginx `limit_req` if the Owner agrees (root
   change). Streaming size limits on every body. nginx
   `client_max_body_size` is unset for this vhost today, so nginx's
   1 MB default would reject photos. The Owner must raise it, plus
   `proxy_read_timeout` and `proxy_buffering off` for the progress
   stream. Logs hold per-stage timings, queue wait, rejections and
   errors, never pixels, photos or pattern contents.
9. **Client.** `use-source-image` uploads and keeps the local original
   for display, the photo underlay and autosave. `use-generation`,
   `use-enhance-preview` and `use-exports` call the API with today's
   cancel and progress semantics. A `NEXT_PUBLIC_PROCESSING` flag
   (`client` or `server`) runs both paths during M2–M4 for comparison.
   M5 deletes the browser workers and the flag, so two implementations
   are not maintained.

- **Acceptance criteria:**
  1. **Byte-identical pipeline.** `tests/unit/fixtures/golden-hashes.json`
     passes unchanged when every configuration runs through the
     processor's worker pool.
  2. **Decode parity, measured.** On a committed synthetic set (all 8
     EXIF orientations, PNG with alpha, grayscale, CMYK JPEG) plus local,
     uncommitted real photos (including a Display P3 iPhone photo), the
     server-decoded buffer matches Chrome's decode: identical orientation
     and dimensions, and mean absolute difference ≤ 1 level per channel.
     Any case that can't meet this has a decision file with the measured
     difference and its effect on the generated pattern.
  3. **Latency on the production host**, one job at a time, measured and
     logged:
     - largest generation (1500×1000 source, 1000 stitches, 64 colors,
       Standard) ≤ 30 s of server time;
     - enhancement preview ≤ 1 s, excluding the one-time upload;
     - each export ≤ 10 s for a 250-stitch pattern.
     Every measurement run on the shared host is short, single-job, at a
     quiet hour, and noted in the progress log.
  4. **Overload behavior**, tested on the local compose stack with the
     production CPU and memory caps:
     - a burst of 20 generation requests fills the queue, and the rest
       get 503 with `Retry-After` within 1 s;
     - a job over its deadline is killed and its memory is released;
     - page requests to the `app` container stay under 500 ms p95
       throughout.
  5. **Security tests:**
     - an over-limit upload is rejected before it is fully read;
     - a bomb header (for example 50 000 × 50 000) is rejected before
       decoding;
     - malformed pattern payloads are rejected;
     - a cross-origin request is refused;
     - a log-capture test finds no image or pixel data.
  6. **Privacy:**
     - photos live only in memory and are evicted by TTL or the memory
       cap, verified by a test that inspects the store and the
       container's writable paths;
     - a notice shows before the first upload;
     - README, HANDOVER and the `INFRASTRUCTURE_DEPLOY.md` row are
       updated;
     - the Owner approves the notice wording.
  7. **Export parity** against today's browser exports on the fixture
     patterns:
     - editable JSON and OXS are byte-identical;
     - PDFs have identical page count, text and legend (read with
       `pdfjs-dist`), and the Owner re-confirms a Pattern Keeper import
       if the PDF bytes differ;
     - PNGs and A4 pages have identical dimensions, and at most a
       measured, logged share of pixels differs, from text anti-aliasing
       only;
     - the Export all bundle has the same file list.
  8. **Wrap-up:**
     - full unit and e2e suites pass in server mode against the
       production build with the processor running, and CI starts the
       processor;
     - the browser workers and the flag are removed;
     - docs-lint passes and everything is committed;
     - it is deployed after Owner approval, with other sites checked for
       200 responses and host load watched;
     - Owner sign-off is logged.
- **Constraints:**
  - **Do not start without explicit Owner answers to the questions
    below.** Reversing a public privacy promise and processing personal
    data are escalation items (OPERATIONS.md §4).
  - Starts after G-033 is signed off and this working tree is clean (one
    session per working tree).
  - The Owner runs anything needing root (the nginx vhost directives,
    `limit_req`) from an exact command list. The new container follows
    `COMPANY/INFRASTRUCTURE_DEPLOY.md`, which is read in full before M5,
    with ports and containers re-verified live.
  - No accounts, paid services or extra servers. If measured capacity
    isn't enough, that goes to the Owner as a cost decision.
  - New dependencies: the chosen decoder and canvas library only, each
    with a decision file. No job-queue library: the pool and queue are
    a few hundred lines on `worker_threads`.
  - Rust stays out of scope. G-023's measurement still holds, and its
    service-engineering guidance is reused here.
  - Codex critique exchange on the architecture (items 1–5 and 7) in
    M1, and on the security design before M2 ships. No domain-expert
    review, because no domain logic changes.
  - Standard OPERATIONS.md check-in at every milestone boundary.

**Milestones:**
- [ ] **M1 — Decision gate and measurements.** Record the Owner's
      answers. Codex critique of the architecture. A decode-parity spike
      comparing `@napi-rs/canvas` and `sharp` against Chrome (criterion
      2). Single-job timings inside a CPU-capped container on the
      production host, to set the pool size, queue length and deadline.
      Deliverable: decision files for container layout, decoder and
      canvas library, protocol and limits, with measured numbers in
      `docs/reviews/<date>-server-processing-capacity.md`.
- [ ] **M2 — Processor, photo store and generation.** `processor`
      container, worker pool, bounded queue, deadlines, in-memory photo
      store, `/api/photos`, `/api/jobs` with progress stream and cancel,
      binary result payload, Origin check, rate limit, logging. Golden
      hashes through the pool (criterion 1), overload and security tests
      (criteria 4–5). Client generation behind the flag.
- [ ] **M3 — Preview and client cutover.** Server enhancement preview.
      Client upload, re-upload on 410, and clear messages for busy
      server, network failure and expired photo. Privacy notice. Full
      e2e suite green in server mode. Deliverable: generate and preview
      working end to end against the local compose stack.
- [ ] **M4 — Exports.** Canvas-factory injection in the shared drawing
      code, with the on-screen chart unchanged and its e2e tests
      passing. Server font and texture loading. All nine export kinds
      and Export all as endpoints. Parity tests (criterion 7).
- [ ] **M5 — Cleanup and release.** Delete the browser workers, the
      client export paths and the flag. README, HANDOVER, decision index
      and `INFRASTRUCTURE_DEPLOY.md` row updated. The Owner applies the
      nginx changes. Deploy after approval, verify other sites and host
      load, run a production latency check (criterion 3), add a
      deploy-log row.

**Open questions for the Owner (answered 2026-09-14, see the progress log):**
- **What is the main reason for the move?** If it's weak devices or tab
  freezes, a hybrid might be enough: the browser by default, the server
  for large jobs or on request. That keeps the privacy promise for
  most users but means two code paths. If it's protecting the
  algorithms, or accounts under G-030, then everything moves, as
  planned here.
- Do you accept reversing "no image is ever uploaded", with a privacy
  notice? Is a 30-minute in-memory retention acceptable?
- Should editable JSON and OXS also move? They are plain serialization
  with no image processing, and the editable JSON embeds the original
  photo. The plan moves them, as requested. Keeping them in the browser
  would save a round trip and an upload.
- Is it acceptable that generation and export stop working when the
  server is down or busy, with no browser fallback? The plan assumes
  yes.

**Progress log** (newest first):
- 2026-09-14 — Owner answers to the open questions. Still a plan, not
  started.
  - Reason for the move: monetizing access.
  - Privacy is not a big concern; the in-memory photo cache is fine.
  - The browser may shrink or compress the photo before uploading it.
  - Editable JSON and OXS may run on either side. Keep or duplicate the
    editable JSON save in the browser, so work can be saved when the
    server has problems.
  - The Owner redirected effort to investigating and optimizing the
    current processes' timings first.
- 2026-09-13 — Goal drafted at the Owner's request ("make plan to move
  export and all photo processing functions to server side"). Planned
  from:
  - the export, pipeline, enhancement-preview and generation hooks;
  - `Dockerfile`, `docker-compose.yml` and `next.config.ts`;
  - G-023's critique exchange;
  - a live read-only check of the host: 6 vCPU AMD EPYC, 8 GiB memory
    available, about 30 containers, load average 1.3, and no
    `client_max_body_size` in any nginx config.
  No code written.

### G-036 · Large charts draw without freezing the page — ACTIVE (2026-09-15)
- **What:** Showing, reopening, zooming, scrolling and switching views on a
  large chart no longer blocks the page for a noticeable time. The on-screen
  chart looks exactly as it does today, and every export is unchanged.
- **Why:** Owner request (2026-09-15), after the G-035 sign-off. The
  investigation (`docs/reviews/2026-09-15-chart-freeze-investigation.md`)
  found that the Image window redraws the whole chart in one main-thread task,
  with one `fillRect` per stitch and one `fillText` per stitch once symbols are
  shown. Measured on the Owner's machine at 1000 stitches, production build,
  one run each:

  | Action | Longest main-thread task |
  |---|---:|
  | Chart shown after generating | 589 ms |
  | Saved project reopened | 595 ms |
  | Zoom in to 6 px per stitch (symbols appear) | 1,479 ms |
  | Zoom in to 8 px per stitch | 1,673 ms |
  | Switch to Grid + photo, then back to Color | 1,560 ms, 1,432 ms |

  The zoomed-in canvas is 8000 × 6000, a 192 MB backing store.

- **Acceptance criteria** (Owner's machine, pinned production build, Chromium,
  repeated runs; the maximum main-thread task is timed from the action until
  the last render it triggers has finished, and autosave is reported
  separately):

  | Operation at 1000 stitches | Target |
  |---|---:|
  | Chart shown after generating; saved project reopened | ≤ 100 ms longest task |
  | One zoom step, at every cell size up to the canvas cap | ≤ 100 ms longest task |
  | Switching between all five view modes | ≤ 100 ms longest task |
  | Turning highlight on or off with one or several colours | ≤ 100 ms longest task |
  | Scrolling or panning across the chart | no frame gap over 100 ms |

  Further criteria:
  1. Every row also reports p95 latency and frame gaps, unthrottled and under a
     documented Chromium CPU-throttling profile. Results are recorded with the
     browser version, build and hardware.
  2. On-screen pixels are identical to today's rendering. A browser parity test
     compares full-render crops from a frozen copy of today's renderer against
     the new output with zero differing bytes, within each tested browser. It
     covers:
     - cell sizes 1–112 px, including the 5 → 6 px symbol transition;
     - all five view modes, EMPTY cells and several canvas colours;
     - highlights on none, one or several colours;
     - region and viewport boundaries, and repeated brush edits;
     - screenshots at device pixel ratios 1, 1.25, 1.5 and 2, and at
       fractional scroll offsets.
  3. Exports are unchanged. PNG and A4 bytes and PDF text and pages match the
     current output, and the shared `ChartDrawingContext` used for vector PDF
     drawing is not changed.
  4. Existing interactions keep working: zoom to the pointer (D124), brush,
     fill, move, select and paste, highlight, Space-pan, touch, keyboard
     shortcuts and undo. Their e2e suites pass, updated only where a test
     encodes the old full-size canvas.
  5. Unit, e2e and golden-hash suites pass, docs-lint passes, decisions are
     recorded, and each milestone is deployed and logged.
- **Constraints:**
  - No new runtime dependencies.
  - Codex critique before M3 and M4 code (STANDARDS.md).
  - Chromium is the gate. Playwright Firefox and WebKit parity runs are
    reported where supported, and Safari itself is claimed only if it is tested
    in Safari.
  - Raster comparisons stay outside timed windows, so measuring doesn't cause
    its own freeze.
  - Standing deploy approval per milestone; deploys follow
    `COMPANY/INFRASTRUCTURE_DEPLOY.md`.

**Milestones:**
- [x] **M1 — Measurement and parity oracle, no behaviour change.** Oracle and
  `npm run bench:chart` in place; baseline and remaining gaps in the progress log.
  - Keep verbatim copies of today's renderer and its helpers under
    `tests/unit/reference/` as the parity oracle.
  - Build the browser parity harness from criterion 2 by bundling the real
    modules into the page, as `tests/e2e/decode-parity.spec.ts` does.
  - Extend `npm run bench:browser` with the operations from the acceptance
    table. Use timestamped windows, repeated runs, frame-gap sampling and a
    throttled profile. Report timing as unsupported rather than zero when the
    browser lacks the API.
  - Also measure what the investigation didn't: the status bar's full stitch
    count on each render, realistic-preview generation, the selection preview
    that copies the whole chart, and autosave.
  - Gate: baseline numbers for every row, and the harness passing against
    today's renderer.
- [x] **M2 — Fast opaque fills on screen.** Gate met unthrottled (D134).
  - When no symbols are drawn (under 6 px), write one pixel per stitch for the
    visible region and scale it with nearest-neighbour `drawImage`. Draw grid
    lines as today, and follow the exact B&W and EMPTY-cell colour rules.
  - Cache each palette entry's fill style.
  - The translucent highlight mask is a separate parity gate. It is uploaded to
    a scratch canvas and composited after the grid, keeping black at 0.6 alpha
    and highlighted cells transparent. It is never written straight into the
    visible canvas.
  - The fast path is region-aware so M4 can reuse it. Exports keep today's
    drawing.
  - Gate: generating and reopening at 1000 stitches meet the 100 ms target,
    with zero-byte parity.
- [x] **M3 — Viewport canvas: coordinates, anchoring and input.** Done (D135).
  - Codex critique first.
  - The Image window keeps a native scroll container with a spacer at full
    chart size. A persistent canvas the size of the view is clipped and placed
    at the scroll offset.
  - Zoom anchoring works in global chart coordinates. The order is: update the
    extent, apply the anchor and clamp, work out the visible region, then draw.
    Centring, padding and rapid wheel input behave as today.
  - Pointer hit-testing, pointer capture, `touch-none` and the Space-pan focus
    rules work in chart coordinates.
  - Selection outlines and the chart border stay at chart positions and are
    clipped, not redrawn around the visible part.
  - Moved from M4 (Owner, 2026-09-15), because a view-sized canvas can't hold
    the whole chart: every view mode draws only the visible region, and brush,
    Move and Select previews draw into the viewport canvas.
  - A decision file supersedes D121's full-size canvas.
  - Every frame clears and resets its drawing state; a redraw during a brush
    stroke draws the stroke's working cells, and Move renders revealed and
    wrapped content from the pattern, matching today's shifted appearance.
  - Gate: the navigation, keyboard-shortcut and interaction suites pass, the
    zoom-anchor e2e checks hold on the new structure, viewport parity holds,
    and the 192 MB canvas is gone.
- [ ] **M4 — Viewport canvas: bounded rendering for every mode and gesture.**
  - Codex critique first.
  - Visible-region drawing for every mode and the gesture previews moved to
    M3. M4 tunes the overscan and redraw scheduling.
  - Realistic-preview generation no longer draws the whole chart on the main
    thread: it is bounded to the view or moved to a worker.
  - The selection preview (`compositeSelectionPreview`) and the status-bar
    stitch count stop costing a whole-chart pass per redraw.
  - Stale renders are cancelled, and caches are invalidated on palette,
    document, zoom and highlight changes.
  - Gate: the zoom, view-switch, highlight and scroll targets are met; parity
    and interaction suites pass.
- [ ] **M5 — Results and release.**
  - Rerun every benchmark row and the parity suites. Check exports for
    regressions.
  - Write `docs/reviews/<date>-chart-rendering-results.md` with before and
    after tables.
  - Update HANDOVER; final deploy with a production spot check.

**Progress log** (newest first):
- 2026-09-15 — **Owner decisions at the M3 check-in:**
  - The deploy key is `~/.ssh/claude_contabo`, renamed for consistency by
    another agent at the Owner's request. The M3 deploy is unblocked.
  - The fractional-DPR screen differences (up to 10 levels on grid-line edge
    pixels, about 1% of pixels) are accepted. They amend criterion 2 at
    fractional device pixel ratios; the canvas bytes still match.
  - M4 approved ("go to m4").
  - Codex is at its usage limit until 2026-09-19, so M4's critique step can't
    run. Per STANDARDS.md, M4 proceeds without it.
- 2026-09-15 — **M3: viewport canvas; zoom, views, highlight and select no longer freeze.**
  - `app/chart-scene.ts` draws any chart rectangle from the scene plus the
    active gesture. `app/hooks/use-chart-renderer.ts` sizes, places and repaints
    one canvas inside the chart frame: the visible part plus a quarter of the
    view per side, aligned to device pixels. It applies the zoom anchor before
    measuring, and repaints on scroll and resize only when coverage runs low.
  - Tools hit-test and capture on the frame. The benchmark and e2e tests wait
    on the frame's `data-cell-size` and `data-render-revision`.
  - Checks:
    - tsc and eslint clean; Vitest 906 passed plus 1 opt-in skip;
    - Playwright 288/288 on a production build, including 84 render-parity
      cases, 124 viewport-parity cases (gestures included) and 5 new
      viewport-canvas tests;
    - docs-lint passes.
  - `npm run bench:chart`, 1000 st / 64 col, longest main-thread task:

    | Operation | After M2 | After M3 | M3, 4× throttled |
    |---|---:|---:|---:|
    | Zoom in, step 1 / step 2 | 1,528 / 1,548 ms | 72 / 0 ms | 367 / 229 ms |
    | View: B&W / Color | 1,334 / 1,654 ms | 0 / 0 ms | 176 / 174 ms |
    | View: Grid + photo | 1,942 ms | 115 ms | 574 ms |
    | View: Realistic | 2,466 ms | 2,274 ms | 11,752 ms |
    | Highlight on / off | 1,303 / 1,560 ms | 0 / 0 ms | 186 / 184 ms |
    | Select drag | 1,675 ms | 65 ms | 339 ms |
    | Scroll, 20 steps | 82 ms | 50 ms (max frame gap 50 ms) | 225 ms |
    | Saved project reopened | 70 ms | 53 ms | 176 ms |

    Unthrottled (3 runs), the 100 ms targets are met except Grid + photo
    (115 ms) and Realistic, whose preview generation is M4 work. Throttled
    rows are single runs.
  - Pushed to master as ad8a1c6.
  - ~~BLOCKED~~ (resolved below): deploy of M3. The deploy key `~/.ssh/claude_canis_lunaris` is
    missing: the `.ssh` folder was changed at 13:39 today, after this morning's
    deploys used the key. ssh gets `Permission denied (publickey)`. The only
    other key, `claude_contabo`, isn't documented for this host, so it wasn't
    tried. Production still runs b201c9a. Logged 2026-09-15.
  - Open for the Owner: screen differences at fractional device pixel ratios
    (entry below). Next: M4, awaiting approval.
- 2026-09-15 — **M3 in progress: Codex critique, parity limits and Owner decisions.**
  - Codex critique, two rounds (read-only). Round 1 found 5 blockers and 7
    majors in the draft; all were conceded:
    - a paint guard sized from measured symbol, halo and stroke overhang;
    - Move previews rendered from source coordinates, not `shiftPattern`;
    - one scene description that includes the active gesture;
    - a full clear on every frame, and integer bitmap bounds;
    - one extent → anchor → measure → draw step;
    - snapshots keyed to the whole scene;
    - parity checked against crops of the full-size render;
    - benchmark waits on a render revision;
    - one content-box coordinate system.
    Round 2 found that brush replay used each stitch's final colour and that
    select-piece frames scanned the whole piece. Both are fixed; the other
    responses were judged sound.
  - Measured in Chromium 153 (scratchpad primitive experiments):
    - stroked grid lines anti-alias differently on a smaller canvas even without
      translation: 92–280 pixels per 1043×793 crop differ, by up to 9 levels;
    - smoothed image scaling differs at some offsets, up to 14 levels, with three
      drawing variants;
    - the dashed selection outline differs by 1 level;
    - fills, nearest-neighbour images and text match exactly.
    Grid lines drawn as filled rectangles match exactly at every offset.
  - Correction, reported to the Owner: the "404 of 4.2 million pixels, up to 9
    levels" given when the Owner chose filled rectangles was measured over a
    single-colour background. Over varied cell colours, anti-aliased rectangles
    also differ by 1 level on many pixels, and they drift by 1 level with canvas
    size, which broke exact parity (run 2). The shipped bands fill whole pixels
    and draw odd widths' half pixels at alpha 127/255, with no anti-aliasing.
    Against today's strokes on a 2380×1764 chart, 2.6% (28 px) to 18% (4 px) of
    pixels differ, almost all by 1 level. At 4 and 28 px a few thousand pixels
    differ by up to 13 levels, at every 595th column, where today's long strokes
    carry their own artefacts.
  - Screen comparison: `npm run compare:screen` takes the same actions on the
    pre-M3 build (b201c9a) and the M3 build, and compares screenshots of the
    Image window at device pixel ratios 1, 1.25, 1.5 and 2. There are 8 states:
    fitted, zoomed and scrolled to (137.5, 91.25), B&W, Grid + photo, Original
    photo, Realistic, highlight, and the far corner.
    - At ratios 1 and 2, every state is within 2 levels. Grid-band pixels differ
      by 1 level (up to 4.2% of pixels), Grid + photo by at most 2, and the photo
      views are identical.
    - At 1.25 and 1.5, every state is within 2 levels except the far corner,
      where the canvas starts away from the chart origin. There, grid-line edge
      pixels differ by up to 10 levels (11,076 of 1.0 million device pixels at
      1.25, 1.1%) and by up to 9 at 1.5 (1,712 pixels, in the left 60 CSS px).
    - Positioning the canvas with left/top, a transform or `will-change` gave
      identical results, so this is Chromium's compositor resampling a canvas
      layer offset from the chart origin.
    - The canvas bytes still match. This deviates from criterion 2's zero-byte
      screenshots at fractional ratios and goes to the Owner at the M3 check-in.
      The gate allows 16 levels and 2% of pixels at fractional ratios, and stays
      strict at whole ones.
  - A third Codex pass, reviewing the finished branch diff, failed after 1 m 21 s:
    Codex reported its usage limit, available again 2026-09-19. Per
    STANDARDS.md, M3 went ahead without it. The final review of effect ordering,
    gesture lifecycles, geometry and export callers was JulAI's own.
  - **Owner decisions (2026-09-15):**
    1. on-screen grid lines are drawn as filled rectangles, and the parity
       reference follows; exports keep strokes;
    2. image pixels in Realistic, Grid + photo and Original photo may differ by
       up to 16 levels, and the dashed selection outline by 1; everything else
       matches exactly;
    3. Grid + photo drag previews are drawn clean each frame (today they build
       up over an uncleared canvas);
    4. a zoom during a Move or Select drag redraws the preview at the new zoom.
- 2026-09-15 — **Owner approved M3** ("go to m3") and moving visible-region
  drawing for every mode and gesture from M4 into M3 ("split is fine").
  M4–M5 still need approval.
  M3 is built on branch `g036-m3` in a separate worktree, because another
  session is committing G-037 plans in the main working tree.
- 2026-09-15 — **M2: fast on-screen fills and highlight mask; generate and reopen meet 100 ms.**
  - Deployed b201c9a with M1: only this container restarted, 20 of 20 sites
    200 before and after; live check drew a chart, zoomed, toggled highlight
    and switched views with no console errors. Next: M3, awaiting approval.
  - `drawChartOnScreen` (`lib/export/render.ts`) fills stitches below the 6 px
    symbol floor from one pixel per stitch, scaled with nearest-neighbour
    `drawImage`, when the empty-stitch colour is opaque. Otherwise it calls
    `drawChart` unchanged.
  - `drawHighlightOverlayRaster` composites the dimming mask the same way at
    every size.
  - `drawChart` caches each palette entry's fill and text colour strings.
    Exports keep `drawChart` (D134).
  - Parity: 84/84 cases byte-identical to the frozen renderer on both the
    export path and the screen path. The raster highlight mask differed by 0
    bytes in all 18 highlight cases (1–112 px; 0, 1, 4 and 16 of 16 colours;
    1000×750), so it is used on screen.
  - Checks: tsc and eslint clean; unit tests 891 passed plus 1 opt-in skip.
    e2e: 158 passed plus 1 flaky (the Space-pan keyboard test, passing on
    retry); the keyboard suite then passed 18/18 with 3 repeats and no retries.
  - `npm run bench:chart`, 1000 st / 64 col, longest main-thread task:

    | Operation | Before M2 | After M2 | 4× throttled, before → after |
    |---|---:|---:|---:|
    | Chart shown after regenerating | 427 ms | no task over 50 ms | 2,099 → 252 ms |
    | Saved project reopened | 448 ms | 70 ms | 2,165 → 251 ms |
    | Zoom in to 6 px / 8 px | 1,479 / 1,520 ms | 1,528 / 1,548 ms | 7,651 / 8,049 → 8,934 / 9,363 ms |
    | Highlight on / off (zoomed in) | 1,637 / 1,430 ms | 1,303 / 1,560 ms | 8,666 / 7,605 → 8,693 / 9,032 ms |

    Zoomed-in rows still redraw every symbol, which is M3–M4 work. The 4×
    throttled rows are single runs, and their zoomed-in increase is within
    what one run varies.
- 2026-09-15 — **M1: parity oracle and baseline measured.**
  - Oracle: `tests/unit/reference/render-pre-g036.ts` is a verbatim copy of
    `lib/export/render.ts`. `tests/e2e/chart-render-parity.spec.ts` bundles it
    and the live renderer into a blank page and compares canvas bytes for 84
    cases. Against today's renderer: 84/84 identical. The cases cover:
    - cell sizes 1–112 px, colour and B&W, and outline;
    - highlight and single-cell edits, canvas colours and regions;
    - 1000×750 and 1000×1000 charts with 100 colours.
  - Benchmark: `npm run bench:chart` (`scripts/bench-chart.spec.ts`) times each
    operation from the action to the render it triggers. It reports the
    longest task, median and worst latency, frame gaps and trailing long
    tasks; `CPU_THROTTLE` and `PROFILE` are optional.
  - Baseline, 1000 st / 64 col, Chromium 153, longest main-thread task (3 runs
    unthrottled; 1 run at 4× CPU throttling):

    | Operation | Unthrottled | 4× throttled |
    |---|---:|---:|
    | Chart shown after regenerating (4 px) | 427 ms | 2,099 ms |
    | Saved project reopened | 448 ms | 2,165 ms |
    | Zoom in to 6 px / 8 px | 1,479 / 1,520 ms | 7,651 / 8,049 ms |
    | View: B&W / Realistic / Grid + photo / Color | 1,416 / 2,241 / 1,949 / 1,723 ms | 7,490 / 11,773 / 9,911 / 7,613 ms |
    | View: Original photo | 144 ms | 678 ms |
    | Highlight on / off | 1,637 / 1,430 ms | 8,666 / 7,605 ms |
    | Select drag | 1,547 ms | 8,695 ms |
    | Scroll, 20 steps | 83 ms (max frame gap 67 ms) | 400 ms |

    View, highlight and select rows ran zoomed in, with symbols. The third zoom
    step is at the canvas cap; its 60 s latency was the wait for a size change
    that never comes, now detected as a no-op.
  - Process slip: a dry-run check of the M2 patch wrote it into the tree at
    12:52 while the baseline chain ran. The parity baseline (finished 12:51)
    and the unthrottled benchmark's server (built 12:51) predate it. The files
    were restored at 12:53, before the throttled run rebuilt, and M2 was
    re-applied only after the chain ended. Both baselines measure pre-M2 code.
  - Not yet covered, carried to M3–M5: parity for the Realistic and photo
    views, device-pixel-ratio screenshots and fractional scroll offsets;
    Firefox and WebKit runs; separate timings for the status-bar count,
    realistic-preview generation, the selection preview and autosave (only
    inside the view and select rows). The benchmark is a new script rather
    than an extension of `bench:browser`, which times photo processing.
- 2026-09-15 — **Owner approved M1 and M2** ("start m1 and m2"). M3–M5 still
  need approval.
- 2026-09-15 — **Goal planned; DRAFT until the Owner approves.**
  - Investigation and measurements in
    `docs/reviews/2026-09-15-chart-freeze-investigation.md`.
  - Codex critique (read-only) of the first draft, all points accepted:
    - freeze today's renderer and helpers as the parity oracle, cover cell
      sizes to 112 px and the 5 → 6 px transition, and test crops and
      repeated brush edits;
    - keep exports and the vector-capable `ChartDrawingContext` untouched,
      and treat the highlight mask as its own parity gate;
    - split the viewport work into coordinates and anchoring (M3) and
      bounded rendering for every mode and gesture (M4);
    - bound realistic-preview generation too;
    - handle the brush working state, revealed content for Move, clearing
      and resetting each frame, crop seams, stale work and bounded caches;
    - measure with timestamped windows, repeated and throttled runs, frame
      gaps and unsupported-timing reporting;
    - claim Safari only when it is tested in Safari.
    Codex agreed that a small M2 before the viewport work is worth
    delivering, and that it stays useful after M4 at small cell sizes.

### G-037 · Symmetry drawing and quick mirror — DRAFT (2026-09-15)
- **What:** two new editing aids in the Tools dock.
  - **Symmetry:** four on/off toggle buttons — Vertical, Horizontal,
    Diagonal ↘ (top-left to bottom-right) and Diagonal ↙ (top-right to
    bottom-left). They can be on in any combination. While a toggle is on,
    painting places the same colour at every mirrored cell. Each active axis
    is drawn on the canvas as a red line. The lines appear in no export.
  - **Quick mirror:** four one-click actions.
    - *Left half:* mirrors the left half onto the right half.
    - *Upper half:* mirrors the upper half down.
    - *Upper-left corner:* mirrors the top-left quarter to the right, down,
      and down-right.
    - *Upper-left half corner:* mirrors the triangle between the left edge
      and the diagonal onto the triangle next to the top edge. It then
      mirrors the whole quarter as *Upper-left corner* does, for 8-fold
      symmetry.
  - Every axis passes through the canvas centre. The diagonals run from the
    centre to the corners.
- **Why:** Owner request (2026-09-15). Symmetric motifs such as mandalas,
  borders and snowflakes are common in cross stitch, and are slow to draw by
  hand.
- **Acceptance criteria:**
  1. The symmetry toggles are `aria-pressed` buttons and work in all 16
     on/off combinations.
     - **Saved with the document (Owner, 2026-09-15).** The JSON file carries
       an optional `symmetry` field, and so do autosave and the `.cspzip`
       bundle, which embeds the JSON.
     - **Opening a document sets the toggles from the document.** This covers
       opening a JSON, ZIP or `.cspzip` file and restoring the autosaved
       project on reload. If the field is present, it is restored. If it is
       missing, as in older files, or unreadable, symmetry is off and
       nothing is reported.
     - A new photo, an `.oxs` import or a first Generate starts with every
       toggle off.
     - A toggle is not an undo step, and undo and redo leave the toggles as
       they are.
     - The field is ignored by rendered exports (PNG, A4, PDF, OXS).
     - Whether it needs a format-version bump follows the parser's rules for
       an optional field, decided in M2 with a unit test.
  2. With symmetry on, the Brush, Fill tool, brush double-click fill,
     dropping a colour onto the canvas, and EMPTY painting all affect every
     cell in the mirror set of the cell they act on. The mirror set is the
     full symmetry group the active axes generate:
     - one axis: a group of 2;
     - both straight axes, or both diagonals: a group of 4 (the 180° copy is
       included);
     - a straight axis with a diagonal: a group of 8 (it includes 90°
       rotations).
     These are the most cells one action can touch. A cell lying on an axis,
     or at the centre, has fewer distinct copies, and squares of size 1–3
     never reach 8. Without the full group the result would not stay
     symmetric.
     - A brush stroke stays one undo step.
     - **A brush double-click fill becomes one undo step (Owner,
       2026-09-15)**, with or without symmetry. Today it leaves 3 (D086).
       - One undo returns to the pattern as it was before the first click,
         and one redo brings the fill back.
       - If the history no longer holds that pattern, for example because it
         was trimmed at 50 entries or an unrelated edit came in between, the
         fill is recorded as an ordinary extra step and nothing is lost.
     - A symmetric fill floods each mirrored cell's region as it was before
       the fill, keeping each tool's connectivity (8-connected for the Fill
       tool and double-click, 4-connected for drop-to-fill), and then paints
       the union.
     - On a pattern that isn't already symmetric, the filled regions differ,
       so the result can be asymmetric. For example, filling `[a,a,b,a]`
       from cell 0 with a vertical axis gives `[c,c,b,c]`. This is expected
       behaviour and is tested.
  3. Exact cell mirroring: `x → W−1−x` and `y → H−1−y`. On an odd size the
     middle column or row is the axis and keeps its cells; on an even size
     the axis falls between two columns or rows. On a square canvas the
     diagonals map `(x, y) → (y, x)` and `(x, y) → (N−1−y, N−1−x)`.
     On a non-square canvas both diagonal toggles and *Upper-left half
     corner* are disabled, with a tooltip saying they need a square canvas.
     Opening a saved file with a diagonal on a non-square canvas, or
     resizing to a non-square canvas, turns the diagonal toggles off. They
     don't stay on invisibly. The same applies when undo or redo makes the
     canvas non-square, and undoing back to a square doesn't turn them on
     again. The geometry never rounds or clamps an off-canvas result; it
     applies the square-only rule itself instead of trusting the UI state.
  4. Red guide lines are drawn on the axes at chart positions in every view
     mode. They follow a canvas resize and zoom, are not drawn in the
     navigator, and don't change any rendered export. A test compares the
     PNG, A4, PDF and OXS exports with symmetry on and off. The JSON differs
     only by its `symmetry` field.
  5. Each quick mirror is one undo step. It overwrites only the target part,
     copying EMPTY cells as they are. A floating selection is merged into
     the same step: the merge and the mirror are computed together and
     committed once.
     Stitch counts are recomputed, the palette is kept (colours are not
     removed if they become unused), and the photo underlay isn't mirrored.
     Running the same mirror twice gives the same result as running it once.
  6. Select, Move, paste and flip ignore symmetry. Their tooltips don't claim
     otherwise.
  7. Unit tests cover the geometry:
     - the four reflections are involutions;
     - group closure, inverses and group orders for all 16 combinations
       (1, 2, 4 or 8); rotations are not involutions;
     - every element keeps cells on the canvas;
     - orbit sizes at the centre, on axes and diagonals, on odd, even and
       mixed-parity rectangles, and on squares of size 1–3;
     - quick-mirror results are symmetric and idempotent, EMPTY cells are
       copied, and unused palette entries are kept;
     - the asymmetric-fill case from criterion 2, and rejected invalid input.
     E2e tests cover painting with several combinations, the red lines in
     canvas pixels, unchanged exports, and each quick mirror followed by
     undo. Lint, type-check, the unit and e2e suites and docs-lint pass.
     The change is deployed and smoke-tested live.
- **Constraints:** no new dependencies. A Codex critique of the geometry
  module happens before its code. Standing deploy approval applies.
  - **Relationship to G-036:** G-036 (DRAFT) replaces the full-size canvas.
    The guide lines are one overlay drawn in chart coordinates, so they move
    over with G-036 M3 whichever goal runs first. The lines are off by
    default, so G-036's parity oracle is unaffected.
- **Owner decisions (2026-09-15):**
  1. *Diagonals on a non-square canvas:* option (a). Diagonals work only on
     square canvases, so the pixels stay exact. Rejected: (b) a proportional
     stretch, which distorts shapes and leaves gaps or doubled cells in
     brush lines; (c) 45° lines, which miss the corners and drop cells that
     land off the canvas.
  2. *Combinations:* the full symmetry group the active axes generate, as in
     criterion 2.
  3. *Upper-left half corner:* the source is the triangle next to the left
     edge, bounded by the left edge, the horizontal centre line and the
     diagonal.

**Milestones:**
- [ ] **M1 — Symmetry geometry, pure and unit-tested.**
  - Codex critique first.
  - `lib/editor/symmetry.ts`:
    - the axis set type;
    - closure of the group the active axes generate;
    - `symmetryOrbit(cell, width, height, axes)`, which applies the
      square-only rule itself;
    - reflections as signed permutation matrices in doubled centred
      coordinates (`u = 2x − (W−1)`), with groups cached by axis mask;
    - `applyQuickMirror(pattern, kind)`: reads the original buffer, writes a
      fresh one, and commits it with `withCellPalette`, which recounts;
    - `fillSymmetric(pattern, orbitSeeds, paletteIndex, connectivity)`: the
      seeds must be a complete orbit. Regions are labelled once for
      4-connected fills, and 8-connected floods share one mask, so a large
      region is traversed once.
    - Input is validated: dimensions, buffer length, integer seeds on the
      canvas, and a destination that is a palette index or EMPTY.
  - One decision file for the geometry and group-closure rule.
  - Gate: the unit tests in criterion 7 pass.
- [ ] **M2 — Symmetry toggles, guide lines and symmetric painting.**
  - A Symmetry group in the Tools dock: four toggles with axis icons, laid
    out 2 × 2 so the dock doesn't grow by four rows. Checked at a 768 px
    viewport height.
  - The renderer draws the red axis overlay after the chart content, in
    every view mode.
  - Brush strokes, their incremental drawing, the Fill tool, double-click
    fill and drop-to-fill use the orbit.
  - A stroke captures its axes, dimensions and colour at pointer-down. Each
    pointer cell writes its whole orbit, which is then drawn with one batched
    redraw rather than one per cell (Grid + photo redraws fully), with the
    guide lines restored.
  - The double-click snapshot is dropped when the document, the dimensions,
    the axes or the colour change between the two clicks. Every mirrored seed
    floods against that one snapshot.
  - Double-click fill as one undo step:
    - `lib/editor/use-undo-history.ts` gains `replaceSince(anchor, next)`.
      It finds `anchor` by identity at or before the current position. If
      only this gesture's two click commits follow it, it drops them and
      pushes `next`; otherwise it acts like `set`.
    - Unit tests cover the rewind, a trimmed anchor, an intervening edit and
      redo after undo. The keyboard-shortcuts e2e test checks one undo and
      one redo.
    - A new decision supersedes D086's "3 undo steps", and HANDOVER's known
      limitation is removed.
  - Live axes are kept outside the undoable pattern snapshots. The saved
    value is the current axes, with the square-only rule applied.
  - Symmetry state is saved in the JSON file and autosave, and restored on
    open or reload, or reset to off when absent.
    - Tests: a serialize round trip, a file without the field, a malformed
      field, and project-store restore.
  - Gate:
    - e2e tests pass for painting, canvas pixels, unchanged rendered
      exports, and the toggles after save, reopen and reload;
    - deployed, with a live smoke test.
- [ ] **M3 — Quick mirror actions and release.**
  - A Mirror group of four action buttons with icons that shade the source
    part.
  - Each action computes `mergeSelection` (not the display-only
    `compositeSelectionPreview`) and then the mirror, and commits once.
  - E2e tests for each action and its undo.
  - Update the README, HANDOVER and decision index; run docs-lint.
  - Gate: deployed, live smoke test, and the goal awaits Owner sign-off.

**Progress log** (newest first):
- 2026-09-15 — Owner: a double-click fill should be one undo step. This
  reverses the rebuttal below. Criterion 2 and M2 are updated: a history
  rewind to the pre-first-click pattern, found by identity, not the
  deferred commit D086 rejected. Plan only; still DRAFT.
- 2026-09-15 — Codex critique of the geometry design (read-only).
  - It confirmed:
    - the doubled-coordinate matrices and closure (group orders 1/2/4/8
      across the 16 combinations);
    - all four quick-mirror formulas, including the left-edge triangle
      `0 ≤ x ≤ y`;
    - turning diagonals off, rather than keeping them hidden.
  - Accepted into the plan:
    - test only the reflections as involutions, since the full group
      includes 90° rotations;
    - 2/4/8 are group orders, and orbits on axes are smaller;
    - the square-only rule applies inside the geometry;
    - diagonals are cleared when undo or redo makes the canvas non-square;
    - asymmetric fills are documented and tested;
    - regions are labelled once and floods share one mask;
    - input is validated;
    - selection merge and mirror form one step;
    - strokes capture their settings and draw each orbit in one batch;
    - the double-click snapshot is invalidated.
  - Rebutted in part:
    - the critique asked to merge double-click fill into one undo step. That
      is D086's existing 3-step behaviour, now out of scope, and criterion 2
      no longer claims one step.
    - It noted that sequential fills with one colour would give the same
      result as the union. Base regions are kept because they are simpler
      to reason about, and the plan no longer says a fill could "feed"
      another.
- 2026-09-15 — Owner answered all three open questions: 1a (square only),
  2 yes (full group), 3 yes (left-edge triangle); recorded under Owner
  decisions. A diagonal toggle turns off on a non-square canvas rather than
  staying on invisibly (criterion 3). **Plan only, as the Owner asked; stays
  DRAFT until the Owner says to start.**
- 2026-09-15 — Owner: symmetry is off when a document opens, stays in the
  JSON file, is restored if present and skipped if not. Criterion 1 and M2
  are updated to match. Open questions 1–3 are still unanswered. Resolving
  question 1 also has to settle what happens when a file with a diagonal on
  opens on, or is resized to, a non-square canvas.
- 2026-09-15 — **Goal planned; DRAFT until the Owner answers the open
  questions and approves.** The brush has no between-event interpolation
  today (`app/hooks/use-canvas-tools.ts`), so mirrored strokes inherit that
  behaviour; changing it is out of scope.
