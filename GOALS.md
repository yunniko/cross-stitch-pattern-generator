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

### G-034 · Photo processing and every export move to the server — DRAFT, re-planned (2026-09-17)
- **What:** photo decoding, enhancement and its preview, pattern generation and
  every export run on the server. The browser keeps what is interactive — the
  editor, the on-screen chart, undo, IndexedDB autosave — and keeps its own
  editable-JSON save, so work can always be saved when the server is busy or
  down (Owner, 2026-09-14).
- **Why:** to monetize access (Owner, 2026-09-14). The algorithms stop shipping
  to every visitor as JavaScript, weak phones stop doing seconds of CPU work,
  and it lays the groundwork for G-030's accounts.

**Owner decisions already recorded**
- **Privacy is not a requirement** (2026-09-17): uploading photos is acceptable,
  and the in-memory photo cache is fine. No privacy notice is required.
- The browser may shrink or compress a photo before uploading it.
- Editable JSON and OXS may run on either side; the browser keeps its own save.
- "Optimise the current timings first" (2026-09-14) is **done**: G-035 cut the
  largest generation from 13.4 s to 4.9 s, and G-036 and G-039 took every chart
  interaction under 100 ms.

**Capacity, measured on the production host 2026-09-17**
- The box: 6 vCPU (AMD EPYC), 11 GiB RAM with **7.6 GiB available**, 2 GiB swap,
  130 GB disk free. Load average 1.20 — about **83 % of the CPU is idle**. All
  ~40 existing containers together use **1.7 GiB**.
- **Measured 2026-09-17 inside the caps** (M1,
  `docs/reviews/2026-09-17-server-processing-capacity.md`): the real pipeline runs
  **about 3.4× slower per core** than the benchmark machine — 12.1 s against 3.6 s
  for the largest Standard generation. A synthetic probe had predicted 2.0×, so the
  first estimates were optimistic by roughly 70 %.
- Per job, one core — **measured** on the host, earlier estimate in brackets:
  (`docs/reviews/2026-09-15-performance-results.md`):

  | Job | Server, measured | Peak RSS | (estimate) |
  |---|---:|---:|---:|
  | Generate, 12 MP → 100 st, Standard | 7.2 s | 113 MB | (~6 s) |
  | Generate, 12 MP → 100 st, Crisp | 15.1 s | 122 MB | (~15 s) |
  | Generate, 1.5 MP → 1000 st, Standard | 12.1 s | 228 MB | (~10 s) |
  | Generate, 1.5 MP → 1000 st, Crisp | 14.7 s | 234 MB | (~14 s) |
  | Pattern Keeper PDF, 1000 st | not yet measured | — | (~22 s) |
  | Export all, 1000 st | not yet measured | — | (~76 s) |

- **This supersedes the 2026-09-13 estimate of "2–3 heavy jobs".** That used
  pre-G-035 timings and is stale by roughly 3×.

**The caps this plan is sized to** (the app container has none today:
`NanoCpus=0`, `Memory=0` — verified live)

| Service | `cpus` | `mem_limit` | Why |
|---|---:|---:|---|
| `processor` (new) | 3.0 | 2g | 3 pool workers, one core each |
| `app` (existing) | 1.0 | 768m | Next.js serving pages and routing |
| left for the other ~20 sites | ~2.0 | ~5 GiB | they use 1.7 GiB and little CPU today |

- **Pool of 3**, one job per worker, so a full pool never exceeds the cap.
- **Queue of 12**; when full, 503 with `Retry-After` immediately. At ~10 s a job
  that is a worst wait of about 40 s, which the client shows as a queue position.
- **Deadlines:** 45 s for a generation or a single export, 150 s for Export all.
  A job over its deadline is killed and its worker replaced.
- **Memory, measured (D149):** 113–234 MB per job, better than the 250–400 MB the
  plan inferred. Three concurrent jobs peaked at 209–235 MB each, ~650 MB together,
  well inside the 2 GiB cap.
- **Contention, measured:** three jobs at once cost about 15 % more each (13.8–13.9 s
  against 12.1 s solo), so a pool of three inside a 3-CPU cap holds up.
- **Throughput at these caps:** about **12–13 large generations a minute**, not the 18
  first estimated, so the client shows a queue position. A 12-deep queue implies a
  worst wait near 60 s.

**Consequences that remain** (privacy is no longer one of them)
- **Two site claims become false and must change with the behaviour:**
  `README.md` ("no image is ever uploaded") and the
  `COMPANY/INFRASTRUCTURE_DEPLOY.md` row ("all image processing runs
  client-side").
- **Online-only.** A loaded page generates and exports offline today; afterwards
  a server outage or a slow connection blocks both. The browser keeps its
  editable-JSON save so work is never trapped.
- **Abuse surface.** A public endpoint doing seconds of CPU work per request is
  an easy denial-of-service target on a shared host. The caps above bound the
  damage; the Origin check, per-IP token bucket and nginx `limit_req` block the
  cheap cases.
- **If measured capacity falls short**, that is a cost decision for the Owner,
  not something to solve by taking more of the shared box.

**Architecture** (unchanged in shape from the 2026-09-13 draft, now sized to the
caps)
1. Two containers from this repo: the existing `app`, and a `processor` with a
   bounded `worker_threads` pool, reachable only on the internal Docker network
   with no published port, both carrying the caps above.
2. The pure pipeline runs unchanged: `buildPattern` and `lib/pipeline/enhance.ts`
   are already free of browser APIs, so the golden hashes (D107) prove parity.
3. `POST /api/photos` streams the upload, enforces a size cap while reading,
   checks the header's dimensions before decoding, and keeps the decoded buffer
   in memory keyed by SHA-256 with a 30-minute idle TTL and LRU eviction inside
   the memory cap.
4. Decoding must match Chrome's (EXIF orientation, ICC to sRGB) or the same photo
   yields a different pattern. **Settled in M1 (D150): `@napi-rs/canvas`**, which
   matched Chrome exactly on every case measured; `sharp` failed EXIF orientation
   and an embedded ICC profile.
5. `POST /api/jobs` returns a job id; `GET /api/jobs/:id/events` streams
   progress; `DELETE /api/jobs/:id` cancels. Results are a versioned binary
   payload.
6. `POST /api/photos/:hash/preview?mode=` returns a ≤ 1200 px WebP, cached per
   photo and mode.
7. `POST /api/exports/:kind` streams the file back. The shared drawing code
   takes an injected canvas factory, so the on-screen chart is untouched.
8. Protection: Origin check, per-IP token bucket, streaming size limits, and the
   nginx directives the Owner applies (`client_max_body_size`,
   `proxy_read_timeout`, `proxy_buffering off`, `limit_req`).
9. A `NEXT_PUBLIC_PROCESSING` flag runs both paths during M2–M4; M5 deletes the
   browser workers, keeping the browser's editable-JSON save.

- **Acceptance criteria:**
  1. **Byte-identical pipeline.** The golden hashes pass unchanged through the
     processor's pool.
  2. **Decode parity, measured.** Against Chrome on a committed synthetic set
     (all 8 EXIF orientations, PNG with alpha, grayscale, CMYK JPEG) plus real
     photos: identical orientation and dimensions, mean absolute difference ≤ 1
     level per channel. Exceptions get a decision file with the measured effect.
  3. **Latency on the production host**, single job, inside the caps: the
     largest generation (1500×1000 → 1000 stitches, Standard) ≤ 20 s; Crisp
     ≤ 30 s; an enhancement preview ≤ 2 s excluding upload; each export ≤ 10 s
     for a 250-stitch pattern; Export all at 1000 stitches ≤ 150 s.
  4. **The caps hold under load**, tested on the local compose stack with the
     production caps set:
     - 20 simultaneous generations: 3 run, the queue holds 12, the rest get 503
       with `Retry-After` within 1 s;
     - the `processor` container never exceeds its `cpus` or `mem_limit`,
       measured with `docker stats` through the burst;
     - a job over its deadline is killed and its memory released;
     - `app` page responses stay under 500 ms p95 throughout.
  5. **The other sites are unaffected**, measured on the production host during
     a burst: a sample of three other sites keeps its response time within 20 %
     of its quiet-hour baseline, and the host's load average stays below 5.
  6. **Security:** an over-limit upload is rejected before it is fully read; a
     bomb header is rejected before decoding; malformed pattern payloads are
     rejected; cross-origin requests are refused; no image or pixel data reaches
     the logs.
  7. **Export parity** against today's browser exports: editable JSON and OXS
     byte-identical; PDFs identical in page count, text and legend; PNGs and A4
     pages identical in dimensions with only anti-aliasing differences, measured
     and logged; the Export all bundle has the same file list.
  8. **Truthful documentation:** the README line and the
     `INFRASTRUCTURE_DEPLOY.md` row are corrected in the same release that ships
     the behaviour.
  9. **Wrap-up:** full unit and e2e suites pass in server mode against a
     production build with the processor running; CI starts the processor; the
     browser workers and the flag are removed while the browser keeps its
     editable-JSON save; docs-lint passes; deployed with the other sites checked
     and host load watched; Owner sign-off logged.
- **Constraints:**
  - Code is written in a separate worktree; other sessions share this tree.
  - The Owner runs anything needing root (nginx directives, `limit_req`) from an
    exact command list.
  - No accounts, paid services or extra servers inside this goal.
  - New dependencies: the chosen decoder and canvas library only, each with a
    decision file. No job-queue library.
  - Codex critique of the architecture and the security design before the code
    they cover ships, if it is available (usage limit until 2026-09-19).
  - Standing deploy approval; OPERATIONS.md check-in at every milestone.

**Milestones:**
- [x] **M1 — Measure inside the caps, then decide.** Done 2026-09-17 (D149, D150). Stand the caps up on the
  production host with a throwaway container: measure real per-job CPU and
  **peak RSS** for the largest generation, a Crisp run, a Pattern Keeper PDF and
  Export all, and set the pool size, queue length and deadlines from what is
  measured rather than from this estimate. Decode-parity spike comparing
  `@napi-rs/canvas` and `sharp`. Deliverables: decision files for the container
  layout, decoder and limits, plus
  `docs/reviews/<date>-server-processing-capacity.md`.
- [x] **M2 — Processor, photo store and generation.** Done 2026-09-17 (D151). The `processor` container
  with its caps, pool, bounded queue and deadlines; the in-memory photo store;
  `/api/photos` and `/api/jobs` with progress and cancel; Origin check, rate
  limit, logging. Golden hashes through the pool; overload, cap and security
  tests. Client generation behind the flag.
- [x] **M3 — Preview and client cutover.** Done 2026-09-17 (D152). Server enhancement preview; client
  upload with re-upload on 410; clear messages for a busy server, a network
  failure and an expired photo. Full e2e green in server mode.
- [ ] **M4 — Exports.** Canvas-factory injection in the shared drawing code with
  the on-screen chart unchanged; server font and texture loading; all export
  kinds as endpoints; parity tests.
- [ ] **M5 — Cleanup and release.** Delete the browser workers and the flag,
  keeping the browser's editable-JSON save. Correct the README and the
  `INFRASTRUCTURE_DEPLOY.md` row. The Owner applies the nginx changes. Deploy,
  verify the other sites and host load, run the production latency check, add a
  deploy-log row.

**Progress log** (newest first):
- 2026-09-17 — **M3 done: the whole e2e suite passes against a server-processing build (D152).**
  - **Server preview:** its own worker, queue and deadline (D152, mirroring D116), WebP cached per photo and
    mode — 461 ms cold, 1 ms cached, ~6 KB. Its output is byte-for-byte what the in-process pipeline produces.
  - **Client cutover:** one shared upload keyed by content hash, re-upload and retry on a 410, and separate
    messages for a busy server, an unreachable one and an expired photo.
  - **E2E in server mode: 313 passed across all 25 specs**, matching the 313 the config collects — run one spec
    per process, since the 6-worker default was killed for memory. The processor served **81 jobs and 3
    previews** during the run, so the specs really did use the server path.
  - **Checks:** Vitest 1047 passed, 8 skipped; `tsc` clean; `npm run lint` 0 errors.
  - **Four defects found, three of them mine from earlier milestones:**
    1. The processor validated `paletteMode` as "free" when the type says "full", so **every default generation
       was rejected** with a 400 the editor reported as a bad photo. Validation now derives from the type unions;
       `tests/unit/processor-settings-validation.spec.ts` fails against the old list.
    2. A terminated worker still emits `exit`, which was charged to whichever job took its slot — in both the pool
       and the preview runner. My first recovery test hid it by using a fresh pool; it now reuses the same one.
    3. **CI was broken since M2:** it ran `test:unit` without `build:processor`, and `dist/` is git-ignored
       (reproduced: 14 failed without the bundle, 18 with it).
    4. M2's "eslint clean" was scoped wrong — I linted explicit paths and skipped `scripts/`, where a `require()`
       from M1 was failing `npm run lint`.
  - **Also:** rate-limit capacities are now env-overridable (production defaults unchanged, nonsensical values
    ignored), because the suite generates far more often than a person does.
  - **Not done here:** nothing deployed; the default build still generates in the browser.
  - **Next (M4):** exports — canvas-factory injection, server fonts and textures, every export kind, parity tests.
- 2026-09-17 — **M2 done: the processor generates patterns behind the app, inside its caps (D151).**
  - **Built:** a `processor` container — pool of 3, queue of 12, 45 s deadlines, and a SHA-256-keyed
    photo store with a 30-minute idle TTL and LRU eviction inside 512 MB — publishing no port, so the
    app's Route Handlers (`app/api/photos`, `app/api/jobs`, progress over SSE, cancel) are its only
    caller. They carry an Origin check and a per-address token bucket. Generation runs on either side
    behind `NEXT_PUBLIC_PROCESSING`, which still defaults to the browser.
  - **Parity:** golden hashes pass through the real worker pool, and again after the
    serialize/deserialize round trip the result endpoint performs. Proven falsifiable: corrupting the
    expected hash failed all five cases, so the comparison is real.
  - **Overload, measured on the capped container:** 20 simultaneous 1000-stitch generations gave
    15 accepted (3 running, 12 queued) and 5 refused with `Retry-After: 23` in 116 ms — never queued
    indefinitely. CPU ~250 % of the 300 % cap; memory peaked at 684 MiB of 2 GiB. Docker applied the
    caps (`NanoCpus=3e9`, `Memory=2 GiB`).
  - **Result format:** the processor returns the project's own editable-JSON save format rather than a
    second encoding, because `cellPalette` is a `Uint8Array` that `JSON.stringify` would corrupt.
  - **Checks:** Vitest 1031 passed, 8 skipped; `tsc --noEmit` and eslint clean; `next build` green with
    all five `/api` routes. Playwright not re-run this milestone.
  - **Not done here:** nothing deployed, and the default build still generates in the browser, so the
    README and `INFRASTRUCTURE_DEPLOY.md` claims about client-side processing remain true for now.
  - **Next (M3):** server enhancement preview, the client cutover with its error messages, and e2e in
    server mode.
- 2026-09-17 — **M1 done: measured inside the caps; the estimates were wrong in both
  directions (D149, D150).**
  - **Speed:** ~3.4× slower per core than the benchmark machine, not the 2.0× a
    synthetic probe predicted — 12.1 s for the largest Standard generation, 14.7 s
    Crisp, 7.2 s for a 12 MP photo at 100 stitches.
  - **Memory:** better than inferred — 113–234 MB per job against an assumed
    250–400 MB.
  - **Contention:** three jobs at once cost ~15 % more each, so a pool of three in a
    3-CPU cap holds up (D149); throughput is ~12–13 large generations a minute.
  - **Decoder:** `@napi-rs/canvas` matched Chrome exactly on all five cases; `sharp`
    returned the wrong size for EXIF orientation 6 and left 100 % of pixels differing
    on an embedded ICC profile, so it is rejected (D150) despite a faster 12 MP
    decode.
  - **Method:** the pipeline was bundled into one file and run on the host in a
    throwaway `--cpus=3 --memory=2g` container, one case per process. Nothing was
    installed there and the production checkout was untouched. The host was not idle
    (load 1.9→2.4), so these are working-day figures.
  - **Still unmeasured:** export costs, which need the canvas-factory change and so
    belong to M2. No production code written and no dependency added to the repo yet.
- 2026-09-17 — **Re-planned at the Owner's request**, after they confirmed
  privacy was never a requirement.
  - Privacy drops out of the blockers and out of the acceptance criteria; what
    remains is factual: two site claims about client-side processing become
    false and must change with the behaviour.
  - Capacity re-measured on the host today (6 vCPU, 7.6 GiB available, 83 %
    idle, other containers 1.7 GiB) and against a like-for-like CPU probe: the
    server is 2.0× slower per core on a synthetic probe — **corrected to ~3.4× by
    M1's real-pipeline measurement**. The plan now
    carries per-job server estimates and **4 concurrent heavy jobs**, replacing
    the stale "2–3".
  - The plan is sized to explicit caps — `processor` 3 CPU / 2 GiB, `app` 1 CPU
    / 768 MiB, ~2 CPU left for the other sites — with the pool, queue and
    deadlines derived from them, and M1 re-scoped to measure inside those caps
    (especially peak RSS, the one number here that is inferred).
  - Not started: no code, no dependencies added.
- 2026-09-14 — Owner answers to the open questions. Still a plan, not started.
  - Reason for the move: monetizing access.
  - Privacy is not a big concern; the in-memory photo cache is fine.
  - The browser may shrink or compress the photo before uploading it.
  - Editable JSON and OXS may run on either side. Keep or duplicate the
    editable JSON save in the browser, so work can be saved when the server has
    problems.
  - The Owner redirected effort to investigating and optimizing the current
    processes' timings first.
- 2026-09-13 — Goal drafted at the Owner's request ("make plan to move export
  and all photo processing functions to server side"). Planned from the export,
  pipeline, enhancement-preview and generation hooks; `Dockerfile`,
  `docker-compose.yml` and `next.config.ts`; G-023's critique exchange; and a
  live read-only check of the host. No code written.
