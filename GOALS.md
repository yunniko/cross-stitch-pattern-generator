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

### G-068 · Rust becomes the only pipeline — ACTIVE (2026-09-24)
- **What:** the TypeScript generation pipeline stops shipping and is deleted. Rust runs every job, with no fallback.
- **Why:** the Owner's decision, 2026-09-24: the sidecar has proven reliable, and carrying two implementations at
  bit-exactness taxes every pipeline feature (G-061 alone took five Rust files to mirror one TypeScript change).
  See `docs/reviews/2026-09-24-two-implementations-cost.md` for what it buys and costs.
- **The one thing that must not be got wrong:** today the TypeScript is not really a fallback, it is the
  *specification* — `compare:rust` proves Rust correct by comparing it against TypeScript, and Rust has **3 tests of
  its own across 8,991 lines**. Delete TypeScript first and the gate built in G-067 M1 has nothing left to compare
  against. The regression floor has to move to Rust **before** anything is deleted, not after.
- **Acceptance criteria:**
  1. **The golden hashes run against Rust.** `tests/unit/golden-hashes.spec.ts` (37 cases, D107) is computed from
     `cs-bench` output, and still fails when generation output changes — proved by changing it on purpose.
  2. **Nothing in production can run the TypeScript pipeline**, and `CS_JOB=0` no longer offers it.
  3. **The duplicated modules are gone**, not merely unused: the 15 `lib/pipeline` modules with no browser importer,
     plus `lib/crisp`, plus whatever of `lib/export` Rust already covers.
  4. **What the browser still needs is types and settings, not algorithms.** The 8 shared pipeline modules are
     checked one by one; any algorithm the editor genuinely runs stays and is named in HANDOVER as deliberately
     single-implementation.
  5. **CI is green on Rust alone**, and the live site generates, exports and opens a chart afterwards.
- **Constraints:** no output change. The golden hashes recorded under D107 keep their values through the whole
  goal — if a hash has to move, that is a bug in the migration, not a licence to re-record.

**Milestones**:
- [x] M1 — **Move the regression floor to Rust** (criterion 1): goldens from `cs-bench`, proved by deliberate
  breakage, before a line of TypeScript is deleted.
- [x] M2 — **Stop shipping the fallback** (criterion 2): the processor always uses the sidecar, `CS_JOB=0` retired,
  Dockerfile, HANDOVER and `COMPANY/INFRASTRUCTURE_DEPLOY.md` updated, and a decision file reversing D190/D193's
  "TypeScript stays the fallback".
- [x] M3 — **Delete the duplication** (criteria 3 and 4), module by module, suites green at each step.
- [x] M4 — **Grow Rust's own tests where the goldens do not reach**, since after M3 they are the whole safety net.
- [x] M5 — README, HANDOVER, deploy and verify live.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-24 — **M5 done; G-068 is complete and live at `082e8ad`.** The whole Rust-only migration shipped in
  one deploy, 33 commits ahead of what production had been running since 2026-09-23.
  **Verified on the deployed build, in a browser, not by a health check**: a 640x420 photo generated a 100x66
  chart of 6,600 stitches and 15 DMC threads — through the sidecar that, since M2, has nothing behind it if it
  fails. The enhancement preview rendered (the TypeScript copy M4 now gates); regenerating with Vivid came back
  with a different palette, so the mode reaches the chart through Rust; a Pattern Keeper PDF exported at 69,796
  bytes through `cs-export`; a reload restored the chart from autosave; the console stayed clean throughout.
  Checked `082e8ad` is baked into the shipped chunks, so crash reports name the right commit (the plain deploy
  command would have left it "unknown").
  **Neighbours untouched**: 23 containers before and after with an identical name set, only this project's two
  restarted; nine sites on the host returned 200 both before and after.
  **README caught up with the goal**, which mattered more than expected: it still documented `npm run bench`,
  `compare:rust` and `compare:rust-exports` — all three deleted in M3, so every command it named for checking
  the pipeline was one that no longer existed. It now lists the four Rust suites, and a check confirms every
  command it names is in `package.json` and every script file it names exists. That check also found
  `shapes:hand-drawn` pointing at a deleted file; removed.
  **HANDOVER**: `Last verified` and the production paragraph now name `082e8ad` and say the sidecar has no
  fallback rather than "with TypeScript as the fallback"; a deploy row added and the table's two rows put in
  the newest-first order the text claims. Added the **Decisions** section STANDARDS.md requires and this file
  never had — a pre-existing gap `docs-lint` does not check for. Net +8 lines.
  **Worktrees removed** (Owner approved): `cross-stitch-g034m2` was named for a goal archived weeks ago while
  carrying G-064 to G-068, and `cs-g038` sat in another session's temp directory — both branches confirmed
  merged into master first, so nothing was lost. The project directory is fast-forwarded to `082e8ad`, so a
  newcomer sent there by the charter now reads current code (OPERATIONS.md §3).
  **PENDING SIGN-OFF**: nothing is left to build.
- 2026-09-24 — **M4 done.** The floor is three layers now, not one (D222).
  **1. The goldens reach the whole option surface.** 18 cases → 38. Not one of the original eighteen named
  enhancement, dither, Vivid or Crisp+ — every recorded hash was an Off, undithered, non-Vivid chart, so all
  four enhancement modes, all thirteen dither modes, Vivid's sampling and Crisp+ could change output silently.
  Cases also assert what the chart *records* (`ditherMode`, `vivid`), which `hashPattern` does not cover and
  which is what reopens a saved file in the state it was saved. **None of the 18 recorded hashes moved** — the
  goal's constraint is now enforced by the tool: `GOLDEN_RECORD=1` only ever *adds*, and fails on a hash that
  changed rather than regenerating it (verified by tampering with one).
  **2. Rust has property tests** (`rust/cs-core/tests/pattern_invariants.rs`, Rust's own count 3 → 8): every
  cell names a colour that exists, palette counts add up, no two colours share a symbol, a brand chart's
  colours all have threads behind them, generation is deterministic, and a chart survives inputs no golden has
  — 1x1, one-column, 200x3, fully transparent, single-colour, more colours requested than the photo holds.
  **3. The D118 release gates are back** (`scripts/rust-enhancement-gates.ts`), driving `cs-bench` instead of
  the deleted `buildPattern`. Measurements unchanged; only what is measured moved. All four released modes
  pass; thinnest margin is do-no-harm 0.919 against a gate of 0.90, and recovery still falls short on every
  mode exactly as it did in G-032 (reported, ungated, D115).
  **Also: the one duplication M3 left is now checked.** `lib/pipeline/enhance.ts` still ships as the photo
  pane's preview while Rust builds the chart (D221), and nothing compared them. A new `cs-bench enhance`
  subcommand exposes the stage alone; `scripts/rust-enhance-parity.ts` finds them byte-identical across 5
  fixtures x 5 modes, and asserts enhancement *acted* (68-75% of bytes change) so the comparison cannot
  quietly become two untouched copies.
  **Proved each layer bites, by breaking things on purpose**: a changed Floyd-Steinberg weight failed exactly
  the 2 Floyd-Steinberg assertions; dropping palette compaction failed the invariant suite; tightening
  do-no-harm to 0.95 failed all 4 modes naming the fixture. The one that justifies the whole milestone:
  **breaking transparency handling entirely left all 73 golden assertions passing**, and only the new Rust
  property test caught it. A hash per input never generalises.
  Verified: 732 unit, 123 in the Rust config (73 goldens + 5 gates + 25 parity + 20 processor, was 57), 8
  cargo tests, 380 e2e, tsc, eslint, prettier, rustfmt on the new file, docs-lint.
  **HANDOVER**: four claims replaced, none added as a new bullet — the Tests bullet named two specs deleted in
  M3, the golden-hash rule named `UPDATE_GOLDEN_HASHES=1` which no longer exists, the enhancement rule said
  the gates were gone, and the coverage note apologised for a hole this milestone filled. Net +5 lines.
  **M5 next, and it is the only thing left: production is still on `42b4397`** — none of M1-M4 has shipped.
- 2026-09-24 — **M3 done.** 122 files and 22,185 lines gone: `lib/crisp` (9), `lib/experimental` (5), ten
  `lib/pipeline` modules, `threads/brand-match`, and the 73 unit specs, 13 scripts and 2 vitest configs that
  existed to exercise them. Nothing in `app/` or `processor/` broke — the only thing holding the whole pipeline
  on the shipped import graph was **one type-only import**: `job-protocol.ts` borrowing three string unions from
  `pattern.ts`. Splitting that vocabulary into `generation-modes.ts` is what made the rest fall out.
  **What stays, and why** (criterion 4, checked one by one): `dither.ts` and `dither-hand-drawn.ts` — the
  browser draws the dither preview itself; `regions.ts` — the Fill tool's flood fill; `downsample.ts` — the
  grid maths the UI shows before generating; `enhance.ts` — still running in the Next API route that serves the
  enhancement preview, which is the one duplication this goal did **not** remove and is now named in HANDOVER.
  Retired with the pipeline: `compare:rust`, `compare:rust-exports` and the benches, which compared against a
  thing that no longer exists; the golden hashes from M1 are the gate now.
  **The cost, stated plainly: 528 unit tests went** (1315 → 787 across all runs). Crisp behaviour, denoise, the
  local optimiser, thread matching and the enhancement safety gates D118 requires are now covered only by 37
  golden hashes, 380 e2e and 3 Rust tests. That is M4, and HANDOVER says so where the rules used to point at
  specs that no longer exist. One test was saved from the cull: `pdf-text-content.spec.ts` pins PDF bytes
  (D174) and only borrowed `buildPattern` for a fixture, so it now builds the chart by hand.
  Verified: 732 unit, 37 goldens, 20 processor, 380 e2e against the sidecar, tsc, eslint, prettier, docs-lint.
- 2026-09-24 — **M2 done.** The processor runs `cs-job` and nothing else (D221). `rustJobsAvailable` became
  `requireRustJobs`, the silent `logFallback` became a thrown error, and `pool-worker.ts` lost both TypeScript
  branches — removing the `if (rust)` guards alone would have left the old code running *after* the Rust result
  was posted, so the bodies went too. `CS_JOB=0` and `CS_JOB_REQUIRED` are gone: with one engine there is
  nothing to switch between and nothing to demand. CI changed with it — the `check` job no longer runs e2e,
  because without a binary there is no engine to generate with; the whole suite runs in the `rust` job.
  Verified: 380 e2e against the sidecar, 1315 unit tests, and the negative case — pointed at a binary that does
  not exist, the app says "Couldn't generate a pattern from that image" instead of quietly generating in
  TypeScript. Dockerfile, README and HANDOVER no longer promise a fallback. M3 next: delete the duplication.
- 2026-09-24 — **M1 done.** The recorded golden hashes now stand on Rust alone: `scripts/rust-goldens.ts` runs
  all 37 cases through `cs-bench` and asserts the bytes D107 recorded, with no TypeScript in the loop.
  `compare:rust` only ever asserted the *TypeScript* hash against the record — Rust matched it transitively,
  which is worth nothing once one side is deleted. **Proved it still bites**: changing one constant in
  `rust/cs-core/src/denoise.rs` turned it to 10 failed / 27 passed, and reverting returned 37/37. The case list
  moved to `tests/unit/fixtures/golden-cases.ts` so both suites run the same cases from one place and cannot
  drift; it names the quantizer as a string rather than importing a TypeScript function, so it survives M3.
  A missing binary throws rather than skipping. Runs in CI beside the parity harness. M2 next.
- 2026-09-24 — goal created from the Owner's decision. Scoped before planning: **15 `lib/pipeline` modules have no
  browser importer** (`quantize`, `pattern`, `denoise`, `regions`, `hue-reserve`, `contour-cleanup`, `edge-map`,
  `energy`, `local-optimizer`, `pair-edge-evidence`, `palette-optimizer`, `pipeline-context`, `dither-matrices`,
  `photo-upload`, `enhance-preview`) and are the real duplication; **8 are imported by the browser** (`enhance`,
  `dither`, `dither-hand-drawn`, `downsample`, `generation-mode`, `server-errors`, `pattern-server`,
  `enhance-preview-server`), mostly for types, mode lists and the texture editor rather than for maths — each needs
  checking in M3. Ordering is M1 first for the reason in the goal: deleting the specification before moving the
  regression floor would leave nothing watching the only implementation.

### G-069 · The workspace stops being the only thing that knows how everything connects — DRAFT (2026-09-24)
- **What:** the changes `docs/reviews/2026-09-24-workspace-shape.md` recommends: a `useEditorDocument` hook owning
  what it means to replace the open chart, then grouped props for the panes that take 31 and 30 of them.
- **Why:** `app/workspace.tsx` is 754 lines of which 465 are logic and 289 are wiring, and not one of its 19
  functions is longer than 18 lines. It is not complex, it is wide — and the eight functions that replace a chart
  each have to remember the same list of state to reset. That is the shape of mistake that produced D217.
- **Acceptance criteria:** replacing the open chart is decided in one place; adding a tool touches one hook and one
  component; no behaviour change, suites green.
- **Constraints:** not a line-count exercise. G-067's "under 300 lines" was a bad proxy and is not inherited; a shell
  component taking 38 props would meet it and improve nothing.

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
