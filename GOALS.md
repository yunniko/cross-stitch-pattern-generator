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

### G-046 · Larger canvases: remove the walls, then raise the cap — ACTIVE (2026-09-18)
- **What:** the failures and limits that stop the app at 1000 stitches per side are removed, and
  `MAX_STITCHES` (`lib/types.ts`) rises to the largest size the measurements support inside D149's
  3-CPU / 2 GiB processor caps. Four walls, in the order they bite: the Pattern Keeper PDF and Export
  all exhausting the worker heap (D155); ICM scanning every palette label per cell; the generation
  result crossing the wire as a plain JSON number array; and the client's 50 full-pattern undo
  snapshots plus chart drawing.
- **Why:** the Owner asked (2026-09-18) whether moving the algorithms to Rust would fix memory and
  speed for larger canvases. Assessed against the deployed code this session: **no for memory** — the
  measured pipeline peak is 113–234 MB per job and D149 records memory as "no longer a risk", while the
  actual OOM is three pdf-lib operator objects per cell across 154 pages in
  `lib/export/pdf-canvas-adapter.ts`, which no kernel port touches; **partly for speed** — the portable
  kernels are 65 % of Standard and ~92 % of Crisp, but G-035 already made them flat typed arrays with
  no closures or allocation, so a port is worth perhaps 2–3× single-threaded (an inference from the
  code's shape, not a measurement), and Amdahl puts the largest case at ~7.4 s against today's 12.1 s.
  Multicore, Rust's real lever, is bounded by the 3-CPU cap on a box shared with ~20 other sites. So
  this goal takes the cheaper, already-identified work first and measures Rust last, only if needed.
- **Acceptance criteria:**
  1. The Pattern Keeper PDF and Export all complete at the maximum canvas size on the processor, inside
     their deadlines, with the worker heap bounded — proven by re-running the `PROCESSOR_WORKER_HEAP_MB`
     reproduction from D155 rather than by a larger heap.
  2. The largest generation is measurably faster than the 12.1 s Standard / 14.7 s Crisp D149 measured
     in-cap on the host, and stays inside the 45 s job deadline with headroom.
  3. Golden hashes are unchanged (D107) and the m3/m5 equivalence specs pass: every speed-up is
     byte-identical, or an intended output change carries its own decision file.
  4. Three concurrent jobs at the new maximum canvas stay inside the processor's 3-CPU / 2 GiB cap,
     measured by D149's own method, not inferred.
  5. The editor is still usable at the new cap: undo and chart actions measured, with a stated
     client-memory budget.
  6. `MAX_STITCHES` is raised to the measured-safe value and every validator agrees — serialize, OXS,
     resize, blank-chart and workspace storage.
  7. Vitest and Playwright pass, `docs-lint` passes, and `HANDOVER.md` is regenerated.
- **Constraints:** D149's caps are fixed — more CPU or memory for the processor is escalation-tier
  (shared host, spending money). The byte-identical rule (D107) governs every optimisation. No new
  runtime dependency without a decision file. M5 is a measurement only: a library and numbers, never a
  service or a deploy. Standing deploy approval applies to the rest.
- **Owner decisions (2026-09-18):** scope is "unblock, then raise the cap"; the Rust benchmark is a
  gated final milestone rather than the starting point; and the new cap is whatever M1's measurements
  support, not a number chosen in advance.

**Milestones** (M5 conditional — do not start it unless M1–M4 miss the target):
- [ ] M1 — Measure where each wall actually sits, at 1000 stitches and above: pipeline wall time and
  peak RSS by D149's capacity-probe method, export memory, wire payload size and client parse cost, and
  the editor's undo and drawing budget. Produces a dated review under `docs/reviews/` and a candidate
  cap. No production code changes.
- [ ] M2 — The export memory wall: batch same-colour runs in the PDF adapter so operators stay bounded
  (D155's named fix), so the PDF and Export all succeed at 1000 stitches; export parity re-run.
- [ ] M3 — The generation speed win: the ICM candidate-set reduction (neighbour labels plus the
  unary-best label, ~9 candidates instead of up to 100), byte-identical, re-measured against M1.
- [ ] M4 — The scaling walls M1 identifies (result wire format, undo history, chart drawing), then
  raise `MAX_STITCHES` and re-run M1's measurements at the new cap, including three concurrent jobs.
- [ ] M5 — **Only if M1–M4 miss the latency target:** G-023 M2's benchmark — port the quantizer and ICM
  as a standalone Rust library with a harness against the frozen TypeScript on identical inputs,
  single-threaded native and WASM. Numbers decide whether G-023 revives; no service, no deploy.

**Progress log** (newest first):
- 2026-09-18 — Goal created from the Owner's Rust question and this session's assessment of the
  deployed code (`42aab39`). The assessment's figures are quoted from D149,
  `docs/reviews/2026-09-17-server-processing-capacity.md`, D155 and the G-035 stage tables; the 2–3×
  Rust estimate is explicitly an inference, which M5 exists to settle if it is ever reached. Not
  started.

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
