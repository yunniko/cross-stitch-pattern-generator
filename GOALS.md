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

### G-038 · Crisp+ edge mode: soft edges without in-between colours — ACTIVE (2026-09-16)
- **What:** a third Edge option, **Crisp+**, next to Standard and Crisp. It
  applies the recommendations of
  `docs/reviews/2026-09-15-in-between-colours-research.md` on top of Crisp:
  1. **A blurred-step edge model** in the evidence layer, so slightly soft
     real edges count as boundaries. The plateau colours on each side are
     the two modes.
  2. **A transition-strip snapping pass** that moves thin blend strips to
     one side. It is guarded against real thin lines and gradients.
  3. **Greedy label-cost palette pruning**, only if blend colours still use
     palette slots after 1 and 2.
- **Why:** Owner request (2026-09-16), after the research found that Crisp's
  hard-step sharpness test rejects edges blurred by a quarter of a cell or
  more.
- **Acceptance criteria:**
  1. **Standard and Crisp are unchanged.** Golden hashes, the Crisp evidence
     equivalence test and the Crisp acceptance matrix pass untouched.
  2. **Blends are removed on the research blur series** (8 source px per
     cell, 8 and 16 colours). The figure below is the number of boundary
     cells in a blend colour, out of 198:
     - blur 0.25 cell: 12 or fewer, down from 77–89 with Crisp;
     - blur 0.5 cell: 25 or fewer, down from 107–112;
     - blur 1 cell: 60 or fewer, down from 134–141, with at most 5 interior
       cells in a blend colour;
     - blur 0 and 0.1 cell: no worse than Crisp.
     Every run has at most 2 cells assigned to a region that isn't in their
     footprint.
  3. **Controls are not damaged:**
     - (a) Thin lines 1 and 2 cells wide, whose colour lies between the
       colours on either side: Crisp+ keeps at least as many line cells as
       Crisp. Amended in M1: at 16 colours Crisp itself loses 38 of the 80
       cells of the 1-cell line, so "every cell" was unmeasurable against
       this fixture.
     - (b) Smooth gradients (the research ramp, a radial and a sky-like
       one): at most 1 % of cells differ from Crisp, and no fewer distinct
       colours are used.
     - (c) Noise and texture: the confetti ratio stays within Crisp's + 0.02.
     - (d) Every row of the Crisp acceptance matrix also passes for Crisp+.
  4. **The colour count is respected.** The requested count is never
     exceeded. Where the pass frees palette slots, the number of slots
     reinvested or left free is reported.
  5. **Thread palettes work.** DMC, Cosmo and Anchor behave as they do with
     Crisp, including thread-collision handling.
  6. **Performance.** Crisp+ takes at most 1.3× Crisp's median time for a
     12 MP photo at 100 stitches and at 1500×1000 → 1000 stitches.
  7. **Real photos.** On the calibration photos without people, Crisp and
     Crisp+ are compared by confident-cell share and snapped cells. The
     Owner judges the result visually on the live site.
  8. **UI and files.**
     - Edge handling offers Standard, Crisp and Crisp+ with tooltips, and
       the choice persists.
     - A Crisp+ pattern records `edgeMode: "crisp-plus"` in files and
       autosave.
     - An older file keeps its current behaviour.
  9. **Tests and release.**
     - Unit tests cover the model, the snapping pass and any pruning.
     - An e2e test generates with Crisp+.
     - Lint, type-check, unit, e2e and docs-lint pass.
     - Deployed and smoke-tested.
- **Constraints:**
  - No new runtime dependencies.
  - A Codex critique comes before the M1 and M2 code.
  - Code is written in a separate git worktree, because other sessions share
    this tree.
  - The calibration photos are never committed.
  - Standing deploy approval.

**Milestones:**
- [x] **M1 — Blurred-step evidence, Crisp+ in the pipeline, no UI.** Done
  2026-09-16 (D139).
  - `BoundaryEvidenceOptions` gains an edge model:
    - `"step"`: today's model, the default, bit-identical;
    - `"blurred-step"`: fits `c(t) = α + β·s((t − t0)/w)` along the boundary
      direction over a small set of widths, and compares it with the affine
      ramp. The plateau colours become the modes, and coverage splits at
      `t0`.
  - `EdgeMode` gains `"crisp-plus"` in `buildPattern`.
  - The research fixtures become `tests/unit/crisp-plus-acceptance.spec.ts`,
    with the blur series and the controls from criterion 3.
  - Calibrate the confidence threshold and neighbourhood on the series and
    the controls together.
  - Gate: criterion 1 and controls 3a–3c pass; the blur series is measured
    and reported.
- [x] **M2 — Transition-strip snapping.** Done 2026-09-16 (D140).
  - A Crisp+ pass after cleanup and the palette merge, before compaction
    and finalization, so the palette recompute and brand snapping see its
    result.
  - A source-evidence guard keeps real thin lines.
  - Freed slots are reinvested or left free, per a decision file.
  - Gate: criteria 2–5.
- [x] **M3 — Label-cost pruning (conditional).** Done 2026-09-16 (D141).
  - Measure blend palette entries after M2.
  - If any fixture still keeps a blend colour, add greedy pruning with
    reinvestment; otherwise record that it isn't needed.
  - Gate: the measurement is recorded, and criteria 2–5 still pass.
- [ ] **M4 — UI, files, performance and release.**
  - The Edge option, workspace storage, serialization and types.
  - Benchmarks (criterion 6) and the real-photo comparison (criterion 7).
  - The e2e test; README, HANDOVER and decisions.
  - Deploy, then the Owner's visual check and sign-off.
- [x] **M5 — Refill the colour slots Crisp+ frees (Owner, 2026-09-16).** Done
  2026-09-16 (D142).
  - Real photos end under the requested colour count, for example
    road-mountains at 14 of 24, because snapping and pruning empty colours
    and nothing refills them.
  - After the Crisp+ passes, split the colour whose cells vary most, ignoring
    the cells those passes moved (training on them would bring the blends
    back), until the requested count is reached or no colour is worth
    splitting.
  - Crisp+ only: Standard and Crisp output stays byte-identical.
  - Gate: on the fixtures, blends stay at criterion 2's levels and the
    controls are unchanged; the real photos reach their requested counts;
    timing stays within criterion 6.
  - Rejected at the Owner's decision: re-running colour selection on the
    cleaned chart (option 2). Measured from the stage benchmark, it adds
    about 3.3 s at 1000 stitches (6.9 s → 10.2 s, about 1.7× Crisp), though
    only about 50 ms for a 12 MP photo at 100 stitches.

**Progress log** (newest first):
- 2026-09-16 — **Deployed bf594f5** (M3–M5), on the Owner's "deploy when tests
  pass".
  - Gates: Playwright 302/302 on a production build, Vitest 984 passed with 8
    opt-in skips, type-check, lint and docs-lint clean, GitHub CI green.
  - Only this container restarted; every other container's uptime was
    unchanged. Four sites that returned 000 in one snapshot each answered 200
    on recheck, so those were curl timeouts, not deploy damage.
  - Live check: the Edge control offers Standard, Crisp and Crisp+; Crisp+
    generated a 50 × 31 chart, recorded `crisp-plus` in the saved file and
    stayed selected after a reload, with no console errors. It used 14
    colours where Crisp used 16 on the sample photo.
  - **PENDING APPROVAL: G-038 sign-off** — the Owner's visual judgement of
    Crisp+ on real photos.
- 2026-09-16 — **M5 built** (D142), after the Owner chose refilling by
  splitting over a second colour-selection pass.
  - `lib/crisp/palette-refill.ts` fills only the slots snapping and pruning
    freed. A split learns from cells well inside their own colour, and is
    refused when either new colour sits between two palette colours.
  - **Two rejected versions, both measured:** refilling up to the requested
    count gave gradients colours Crisp never had (481 and 724 cells changed);
    letting moved cells join a split rebuilt the blends (blur 0.5 at 8
    colours went from 0 to 41 blend cells).
  - **Fixtures:** blur 0.25 and 0.5 stay at 0 blends, blur 1 at 8 colours
    improves to 2 + 1 (from 4 + 3), thin lines and gradients match Crisp.
  - **Real photos:** the refill recovers 1–2 colours on some photos
    (lake-summer 20 → 22, fog-sailboat 23 → 24, tree-under 19 → 20) and none
    on the busiest: road-mountains still keeps 14 of 24, because a detailed
    chart has few cells that are well inside a colour. Recorded as a known
    limitation.
  - **Timing:** 1.048× Crisp at 12 MP / 100 stitches, 1.137× at 1000
    stitches; criterion 6 holds.
  - **Verification:** full unit suite 984 passed, 8 skipped; type-check and
    lint clean.
  - Owner: "deploy when tests pass", so the browser tests decide the deploy
    without a further check-in.
- 2026-09-16 — Owner approved M4 ("go ahead with M4").
- 2026-09-16 — **M3 done; check-in with the Owner before M4.**
  - **What was built:** `lib/crisp/blend-label-pruning.ts` (D141), after
    snapping. A thin palette colour whose colour mixes two or three nearby
    distinct regions is pruned when the photo ramps inside nearly all of its
    cells (at most 25 % flat, deviation threshold 0.1). Its cells join their
    largest constituent, and freed slots stay free.
  - **Sweep** (`docs/reviews/2026-09-16-crisp-plus-calibration.md`): the 0.1
    threshold is the only one that helps without damage. At 0.06, both thin
    lines were erased and up to 249 gradient cells reassigned; at 0.15,
    nothing was pruned.
  - **Results at blur 1 cell:**
    - Full range: 8 colours 4 + 3 → 2 + 1 (blend palette entries 4 → 1);
      16 colours 28 + 30 → 28 + 29.
    - DMC and Anchor: 8 colours 128 + 204 → 123 + 181; 16 colours
      145 + 231 → 145 + 209.
    - Blurs of 0.5 cell or less are unchanged at 0 blends. Controls: no
      line cell lost, 0 gradient cells reassigned.
  - **Criterion 2 at blur 1:** the interior ceiling of 5 is met at 8 colours
    (1) but not at 16 (29), where the blends mix three regions and aren't
    thin bands.
  - **Still open:** the DMC and Anchor band thread at half-cell blur (3820
    rather than 725).
  - **Verification** (worktree): Crisp+ specs 26/26; full unit suite 975
    passed, 6 skipped, 0 failed; type-check clean; the one lint error
    (`const`) fixed.
  - **Next, M4:** the UI option, files, benchmarks, the real-photo
    comparison, e2e and release.
- 2026-09-16 — **Deployed c044c45** (M1–M2; Crisp+ has no UI yet).
  - Only this container restarted, and every site kept its pre-deploy status.
  - Live smoke test: Standard and Crisp buttons present, Crisp+ absent; both
    generated 50 × 31 and recorded their edge mode; no console errors.
  - The deploy key is `~/.ssh/claude_contabo`, as `INFRASTRUCTURE.md` already
    states (Owner confirmed).
- 2026-09-16 — Owner: "deploy and go m3". Deploying master at c044c45, with
  Crisp+ still invisible to users, then starting M3. Criterion changes from
  M2 were reported at the check-in with no objection.
- 2026-09-16 — **M2 done; check-in with the Owner before M3.**
  - **What was built:** `lib/crisp/transition-snap.ts` (D140), a Crisp+
    pass after the palette merge.
    - It snaps a run of up to 5 in-between cells between two 3-cell side
      runs.
    - The photo must confirm a blurred edge: a logistic fits better than a
      ramp, and three flat levels don't fit much better.
    - Each cell takes the side of the fitted edge centre it lies on.
    - In the palette recompute, snapped cells count as their side's colour.
    - Freed palette slots stay free.
  - **Results** (`docs/reviews/2026-09-16-crisp-plus-calibration.md`):
    - Full-range blend boundary + interior cells, Crisp → Crisp+:
      - blur 0.25: 91 + 0 → 0 + 0 at 8 colours, 94 + 0 → 0 + 0 at 16;
      - blur 0.5: 110 + 0 → 0 + 0, and 107 + 8 → 0 + 0;
      - blur 1: 95 + 132 → 4 + 3, and 121 + 145 → 28 + 30.
    - Controls: no thin-line cell lost, 0 gradient cells reassigned outside
      the ramp seam, confetti 0.
    - Thread palettes:
      - blur 0.25: 0 blends for DMC, Cosmo and Anchor;
      - Cosmo is better than Crisp at every blur;
      - DMC and Anchor at blur 0.5 with 8 colours stitch the yellow band in
        3820 instead of 725, a one-step thread choice that Crisp also makes
        at 16 colours.
  - **Criterion changes:**
    - Criterion 3b is measured as reassigned cells, with palette shifts of at
      most 8/255 allowed and the ramp scene's real seam excluded, instead of
      raw RGB differences.
    - Wrong-region cells at blur 1 may be up to 8: the rectangle's corners
      are rounded in the blurred photo itself.
  - **Not met, carried to M3:**
    - blur 1 at 16 colours has 30 interior blend cells (target 5), on
      palette colours mixing three regions;
    - the DMC/Anchor band thread choice above.
  - **Rejected:** a tighter plateau level for M1's modes (0.05). It cut
    confident cells, from 59 to 0 at blur 0.5, and added about 20
    wrong-region cells.
  - **Verification** (all in the worktree, with the final settings):
    - Crisp+ specs 21/21. The full unit suite, run on the final code after
      the plateau experiment was reverted: 970 passed, 5 skipped, 0 failed.
    - Golden hashes and the Crisp tests are unchanged; type-check and lint
      are clean.
  - Codex is still unavailable.
  - **Next, M3:** decide label-cost pruning from the remaining blend palette
    entries.
- 2026-09-16 — Owner approved M2 ("go ahead with M2"). GitHub CI passed for
  the M1 commit a634f7c. Codex is still unavailable, so M2 proceeds without
  its critique, as for M1.
- 2026-09-16 — **M1 done; check-in with the Owner before M2.**
  - **What was built:**
    - `edgeModel: "blurred-step"` in the Crisp evidence, used only by the new
      `edgeMode: "crisp-plus"`. It fits a logistic step (5 widths × 9 centre
      offsets over 48 projection bins) and keeps whichever explanation is
      more confident, with plateau means as the modes.
    - Crisp+ is recorded on patterns and in saved files; there is no UI yet.
  - **Calibration** (`docs/reviews/2026-09-16-crisp-plus-calibration.md`):
    - margin 0.75 and threshold 0.7 are kept;
    - wider margins changed 4,238–4,707 gradient cells and erased the 1-cell
      line;
    - lower thresholds cost 8 line cells.
  - **Results on the blur series** (blend boundary cells, Crisp → Crisp+):
    - blur 0.25: 91 → 6 at 8 colours, 94 → 6 at 16, which meets criterion
      2's target of 12 or fewer;
    - blur 0.5: 110 → 52 and 107 → 53, still above the target of 25 (M2);
    - blur 1: unchanged at 95 and 121 (M2).
    - Controls: gradients have 0 changed cells, thin lines keep at least as
      many cells as Crisp, and confetti stays at 0.
  - **Verification:**
    - Full unit suite in the worktree: 960 passed, 3 skipped, 1 failed. The
      failing new test counted the ramp fixture's real seam as a gradient;
      after that test-only fix, the Crisp+ specs pass 12/12.
    - Golden hashes, the Crisp evidence equivalence test and the Crisp
      acceptance matrix are unchanged (criterion 1).
    - Type-check and lint are clean.
  - **Deviations:**
    - Codex was unavailable: usage limit until 2026-09-19. Per STANDARDS.md
      the goal proceeds without it, and the M1 design was self-reviewed
      against the sweep.
    - Criterion 3a was amended to "no fewer line cells than Crisp".
  - **Next, M2:** transition-strip snapping for blurs of 0.5–1 cell, guarded
    against thin lines.
- 2026-09-16 — Goal planned from the 2026-09-15 research; M1 started with a
  Codex critique of the M1 and M2 designs. Crisp+ stays invisible to users
  until M4, so there is no deploy before then.

### G-039 · The Move tool previews only what changed — ACTIVE (2026-09-16)
- **What:** dragging with the Move tool stays smooth on a large chart. All five
  options from `docs/reviews/2026-09-16-move-tool-investigation.md` are carried
  out:
  1. **Shift the pixels already on screen.** Each frame copies the previous
     bitmap by the stitch step and redraws only the strip the wrap-around
     exposes, instead of redrawing the whole view from the pattern. The red
     symmetry guides move to their own overlay, so a copy cannot drag them
     along.
  2. **A drag paints only the visible window**, leaving the surrounding margin
     to be painted when the drag ends.
  3. **At most one paint per screen frame**, from the latest pointer position,
     so several pointer events in one frame cannot queue several repaints.
  4. **Small fixes:** no canvas resize when the size is unchanged; the scratch
     canvas and the parsed canvas colour are kept instead of rebuilt per paint;
     the commit shifts stitches by whole rows.
  5. **An optional symbol-free drag preview**, built only if the Owner wants it
     once options 1–4 are measured, since it changes what the user sees.
- **Why:** Owner report, 2026-09-16: "the movement tool is still slow", after
  G-036 brought every other chart action under 100 ms. Measured on a 400-stitch
  chart at 64 colours: one stitch of Move costs 35 ms (Color) and 49 ms (B&W)
  at an 11 px stitch, against 63 ms for a whole Select drag. Symbols are 55–60 %
  of that time. Every step repaints the view plus its margin from the pattern,
  although a Move only shifts pixels that are already drawn.
- **Acceptance criteria:**
  1. **Speed.** At 1000 stitches and 64 colours, one stitch of Move takes a
     median of 16 ms or less and a worst of 25 ms or less, in Color, B&W,
     Grid + photo and Realistic, at 6 px (the symbol floor), at 11 px, and at
     the size that fits the window. Measured by M1's benchmark, three runs.
  2. **Ending a drag** stays under 100 ms, including the redraw and the save.
  3. **4× throttled timings are reported** for the same cases, as G-036 did.
     They are reported, not asserted.
  4. **Pixels.** The preview and the committed chart look as they do today,
     except where the Owner approves a change (the two questions below). The
     parity suite covers the Move preview, a wrapped Move, a scroll during a
     drag and a zoom during a drag.
  5. **Nothing else regresses.** Brush, Select, highlight, scroll and zoom keep
     their G-036 timings, and every existing suite passes.
  6. **Release.** Unit and e2e tests cover the new drawing path; lint,
     type-check and docs-lint pass; deployed and checked live with no console
     errors.
- **Open questions for the Owner** (answered at the M2 check-in, before the
  drawing path changes in M3):
  - **Grid lines during a drag.** They currently travel with the design and
    snap back on release, so the heavy 5th/10th lines jump unless the shift is
    a multiple of 10. Keeping them fixed would look steadier and would let the
    release reuse the last preview frame. Changing this changes what is on
    screen mid-drag.
  - **Grid + photo previews.** D135 records that they are "drawn clean" every
    frame. Option 1 copies a clean frame and patches clean strips; the pixels
    should match, but it is no longer a full redraw per frame.
  - **Option 5**, decided at M4 on M3's numbers: leave symbols on while
    dragging, or drop them for speed.
- **Constraints:**
  - Code is written in a separate git worktree, because other sessions share
    this tree.
  - No new runtime dependencies.
  - Codex is at its usage limit until 2026-09-19. If it is still unavailable,
    the critique step is noted and skipped, per STANDARDS.md.
  - Standing deploy approval.

**Milestones:**
- [ ] **M1 — A Move benchmark and the baseline.**
  - `scripts/bench-move.spec.ts` plus its config and an `npm run` script, in
    the shape of `scripts/bench-chart.spec.ts`: a 1000-stitch, 64-colour chart,
    a drag of 15 one-stitch steps, per-step and end-of-drag timings, the long
    tasks, and the top self-time frames.
  - Every case in criterion 1, unthrottled and at 4×.
  - Deliverable: the baseline table in
    `docs/reviews/2026-09-16-move-tool-investigation.md`, replacing the partial
    400-stitch figures.
- [ ] **M2 — One paint per frame, the visible window only, and the small fixes
  (options 2, 3, 4).**
  - No behaviour change on screen, so this milestone needs no Owner ruling.
  - Gate: measurable improvement against M1, existing suites and parity pass.
  - The Owner's answers to the two questions above are collected at this
    check-in.
- [ ] **M3 — Shift the pixels already on screen (option 1).**
  - The gesture keeps an offscreen base frame; guides and the selection
    outline draw on their own overlay.
  - Wrap-around, a scroll during a drag and a zoom during a drag keep working.
  - Gate: criteria 1, 2, 4 and 5.
- [ ] **M4 — Option 5, then release.**
  - The Owner decides on the symbol-free preview from M3's numbers; it is built
    only if wanted.
  - Benchmarks rerun, decisions written, README and HANDOVER updated, deploy
    and live check.

**Progress log** (newest first):
- 2026-09-16 — **Goal planned** from the Owner's report, after a research-only
  investigation (`docs/reviews/2026-09-16-move-tool-investigation.md`). Measured
  with a throwaway benchmark: 35 / 49 ms per stitch of Move at 11 px in Color /
  B&W, 16–17 ms at 4 px, and 41–87 ms to end a drag; symbols are 55–60 % of the
  time, and the commit's stitch shift only 1.7 ms of it. Two 1000-stitch runs
  were killed by the OS for low memory, so the baseline is a 400-stitch chart
  and Realistic and zoomed-in Grid + photo are still unmeasured — M1 closes that
  gap. Codex was unavailable (usage limit until 2026-09-19), so the plan has had
  no cross-model critique.
