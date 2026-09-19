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

### G-048 · Generation and exports in Rust, measured against TypeScript — ACTIVE (2026-09-19)
- **What:** the whole generation pipeline (everything `buildPattern` does, every mode) and every export (chart PNGs,
  realistic preview, A4 pages, Pattern Keeper PDF, OXS, editable JSON, Export all) implemented in Rust, in two tiers: an
  exact port, then an optimised build using what Rust offers (threads, SIMD, cheaper memory layouts). Both measured
  against today's TypeScript on the same inputs; whichever parts come out clearly faster are shipped into the processor.
- **Why:** Owner request (2026-09-19): implement the same functionality in Rust with the optimisations available and
  compare the metrics. G-023 and G-046 M5 only ever planned a kernel benchmark; this measures the whole job.
- **Owner decisions (2026-09-19):** scope is generation plus exports; results are compared in two tiers (exact, then
  optimised with tolerances); a part that is clearly faster ships, with TypeScript kept as the reference.
- **Acceptance criteria:**
  1. The exact tier reproduces every golden hash (D107) byte for byte, in every generation mode.
  2. The optimised tier's charts stay within stated tolerances of TypeScript's on the golden fixtures and real photos:
     mean per-cell OKLab error within 2 % of TypeScript's, confetti ratio no more than 0.5 points worse, palette size
     equal; any larger difference is shown and explained, not averaged away.
  3. Exports: the editable JSON and the OXS byte-identical; the PDF with the same page count and the same extracted text
     on every page, symbols as real embedded-font text; raster exports the same size, compared with TypeScript's by mean
     and largest per-channel difference, with differing regions inspected by eye; Export all with the same entries.
  4. A comparison report: wall time and peak memory for every stage and export, TypeScript against both Rust tiers, at
     1000 and 1500 stitches, on the laptop and on the host inside the processor's 3-CPU / 2 GiB cap, one job and three
     at once; native, and WASM for generation.
  5. Ship rule: a part (generation, or an export) ships when it is at least 25 % faster on the host at the cap, uses no
     more memory, and meets its equivalence criterion; each ship gets a decision file, TypeScript stays as the reference
     and fallback, and the golden hashes still hold for anything shipped from the exact tier.
  6. Vitest, Playwright and the Rust tests pass; docs-lint passes; HANDOVER regenerated; anything shipped is deployed
     and verified live.
- **Constraints:** D149's caps are fixed. Rust enters the portfolio through a decision file (a new language, justified by
  this measurement); the processor image builds it in Docker, so the host needs nothing installed. Byte-identity (D107)
  governs the exact tier only.

**Milestones**:
- [x] M1 — Foundations: a Rust workspace in `rust/` (core library, benchmark CLI), a corpus of inputs dumped from
  TypeScript (decoded photos, settings, expected outputs), the comparison harness, and the exact port of the Standard
  pipeline matching its golden hashes. First timing against TypeScript.
- [x] M2 — The rest of generation, exact: Crisp, Crisp+, photo enhancement and thread-brand matching; every golden hash
  matches. Single-thread timing per stage.
- [x] M3 — Generation, optimised: threads and SIMD where they pay, measured stage by stage; the quality metrics of
  criterion 2; WASM build; laptop and host timings.
- [x] M4 — Exports in Rust: PNG writer, chart and A4 rasters with DejaVu text, the streamed preview, the PDF (embedded,
  subset font, text symbols), OXS, JSON and Export all; the equivalence checks of criterion 3; timings.
- [x] M5 — The comparison report and the ship decision per part (criterion 5).
- [ ] M6 — Ship what qualifies: a native addon in the processor's workers, built in the image, with the TypeScript
  fallback; deployed and verified live. Skipped if nothing qualifies.

**Progress log** (newest first):
- 2026-09-20 — **M5 done; awaiting approval of M6.** The comparison report (criterion 4) is
  `docs/reviews/2026-09-20-rust-comparison-report.md`: laptop and host, 1000 and 1500 stitches, one job and three at
  once, wall time and peak RSS for generation and every export, native and WASM. Gaps M3/M4 left are closed --
  WASM at the probe sizes (1.0-1.6x TypeScript, about half native), host memory after the M3 fixes, TypeScript peak
  memory per export, exports at 1500 stitches. Ship decision (criterion 5): Rust ships for generation and every
  server-side export, TypeScript stays reference and fallback (D190); the editable save stays in the browser (D191);
  the 4-5 px chart symbols change (D192). One clause not met: generation at 1500 st uses 42 MB more (Standard) and
  9 MB more (Crisp+) than TypeScript -- Owner directed Rust anyway. One thread per job (pool is 3 on 3 CPUs).
  **Owner approvals:** "go m5"; "we should choose rust over ts"; the editable-save and symbol calls "are ok".
- 2026-09-19 — **Owner approval:** "go m4".
- 2026-09-20 — **M4 done; awaiting approval of M5.** `rust/cs-export` ports every export kind (raster text with
  rustybuzz + tiny-skia, D187; PDF with pdf-writer and a subset Type0 font, D189; references made in the processor
  image, D188). Criterion 3 holds on all 30 cases (3 fixtures x 10 kinds): editable JSON and OXS byte-identical, PDFs
  with the same page count and text, rasters the same size with mean difference 0.14-4.19 and the A4 ZIPs and Export
  all the same entries. Inspected by eye: differences are glyph edges only -- except chart PNGs at 890-1333 stitches,
  where 4-5 px symbols render as blocks in production and as outlines in Rust (open question for M5). Host, at the
  processor's cap, fastest of 3: chart PNGs 2.0-5.4x, OXS 4.7-7.3x, PDF 1.9-3.7x, preview 1.2-2.3x, Export all
  1.3-2.0x (1 thread) / 2.0-4.2x (3), A4 pages 1.0-1.6x / 1.9-4.1x. Two fixes found by the timings (PDF shaping cache,
  OXS writer) and two options measured and rejected (mimalloc, zlib-rs) are in
  `docs/reviews/2026-09-19-rust-m4-exports.md`. Vitest 1096 passed, 8 skipped; cargo test, clippy, rustfmt, tsc,
  eslint and docs-lint clean.
- 2026-09-19 — **M3 done; awaiting approval of M4.** Threads only where results cannot change (D185): 36/36
  fixture cases and 15/15 real-photo cases byte-identical at 3 threads, so criterion 2 holds exactly. Laptop,
  real photos at 1000 st: 4.4-6.4x faster than TypeScript. x86-64-v3 SIMD: 1-8 %. WASM (D186): about half native
  single-thread speed, 30/30 identical. Host (--cpus=3, 2 GiB): 2.5-5.6x for one job, 2.6x three at once; one
  thread per job is best under load. Rust used more memory than TypeScript at 1500 st Crisp/Crisp+ (269 vs
  224-249 MB); two fixes cut the laptop peak to 244 MB, and the host must be re-measured in M5.
  `docs/reviews/2026-09-19-rust-m3-optimised.md`. **Stopped for low laptop memory, not rerun:** the full
  laptop run (WASM at probe sizes) and the first host session; the host script finished on its own.
  Checks: Vitest 1096 passed, tsc, eslint, clippy (native and WASM), cargo test, docs-lint.
- 2026-09-19 — **Owner approval:** "go m3".
- 2026-09-19 — **M2 done; awaiting approval of M3.** Crisp, Crisp+, both quantizers, DMC/Cosmo/Anchor and every
  enhancement mode ported; V8's sin, cos, atan2, log and hypot added (D184; 0 mismatches in 13.6 M vectors).
  `npm run compare:rust`: 36 of 36 byte-identical, all 18 golden hashes included. Single-thread speed-up 2.7-3.3x
  in every mode at 1000 and 1500 stitches; ICM about 10x, quantize about 2x
  (`docs/reviews/2026-09-19-rust-m2-parity.md`). Checks: Vitest, tsc, eslint, clippy, cargo test, docs-lint.
- 2026-09-19 — **Owner approval:** "go ahead" (M2).
- 2026-09-19 — **M1 done; awaiting approval of M2.** The `rust/` workspace (`cs-core`, `cs-bench`), V8-exact maths (D183:
  0 mismatches in 6.5 M vectors, where `libm`'s `pow` missed 94,182), and the exact Standard pipeline (D182).
  `npm run compare:rust`: 13 of 13 cases byte-identical, including all 11 Standard golden hashes. Single-thread speed-up
  2.9× at 1000 and 1500 stitches (3680 → 1279 ms, 7879 → 2732 ms; `docs/reviews/2026-09-19-rust-m1-parity.md`).
  Checks: Vitest 1096 passed, 8 skipped; tsc, eslint, clippy and docs-lint clean; cargo test passes. The corpus is the golden fixtures and probe shapes handed over per run; real photos come in M3.
- 2026-09-19 — **Owner approval:** "go ahead with M1"; language consistency applies only where no better fit exists (STANDARDS, Tech-stack selection).
- 2026-09-19 — goal drafted from the Owner's request and answers.

### G-023 · Rust sidecar for the color-quantization/ICM hot path — DRAFT, possibly relevant to G-030 (2026-09-12)
- **G-046 now holds this goal's M1 and M2 (2026-09-18).** The candidate-set reduction below is G-046
  M3, and the kernel benchmark is G-046 M5, gated on the TypeScript work missing its target. Leave this
  entry parked as the Owner set it; revive it only if G-046 M5's numbers justify a service.
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
