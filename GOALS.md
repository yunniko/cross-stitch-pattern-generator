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

### G-042 · Selection actions, icon buttons and leaner chrome — ACTIVE (2026-09-16)
- **What:** five changes the Owner asked for (2026-09-16):
  1. A floating selection gains **rotate clockwise**, **rotate anticlockwise**,
     **crop** and **cancel**. Cancel discards everything the selection session
     did; it covers a pasted piece too.
  2. The selection bar's buttons become **icons**, not words.
  3. The colour editor's compare line shows only **number, name, x% darker or
     lighter, y% more or less saturated** — no brand prefix, no colon.
  4. The **photo button moves to the top panel**.
  5. A chart created **without a photo shows no regenerate panel at all**; once a
     photo is chosen, or a pattern that has one is opened, the panel appears as
     it does today.
- **Why:** Owner request. The selection needed a way out that does not apply its
  edits, and rotation and crop are the two obvious gaps beside flip; the rest is
  chrome that reads cluttered.
- **Decided by the Company, open to correction:** "crop" means the **chart** is
  cropped to the selection's rectangle, discarding everything outside, with the
  floating piece merged first — the natural reading beside "Resize canvas…".
- **Acceptance criteria:**
  1. **Rotation.** Clockwise and anticlockwise turn the piece 90°, swapping its
     width and height; four turns return it exactly; it works on a pasted piece;
     like flip, it changes the floating piece only, and merges as one step.
  2. **Crop.** The chart becomes the selection's rectangle: stitches outside are
     gone, the piece is merged in place first, counts are recomputed, the photo
     underlay keeps its alignment, and the whole thing is one undo step.
  3. **Cancel.** The chart returns to exactly how it was when the rectangle was
     drawn, or when the piece was pasted — moves, flips, rotations and crops in
     that session included — as one undo step. The clipboard survives.
  4. **Icons.** Every selection action is an icon button with an accessible name
     and a tooltip; names keep today's words, so existing tests still find them.
  5. **Compare line.** Reads "3865 - Winter White 12% lighter 5% less saturated"
     — number when the colour has one, name, then each difference. No "DMC", no
     colon. A colour with no difference shows just number and name.
  6. **Photo button.** Lives in the top panel, next to Open pattern…; choosing an
     image loads and generates exactly as before.
  7. **Regenerate panel.** Absent for a photo-free chart, present and unchanged
     otherwise. The photo-free note goes away with it.
  8. **Tests and release.** Unit for rotation, crop, cancel and the compare line;
     e2e for the selection actions and for both panel states. Lint, type-check,
     unit, e2e and docs-lint pass, then deploy and a live check.
- **Constraints:**
  - A separate worktree; other sessions share this tree.
  - No new runtime dependencies.
  - Codex is at its usage limit until 2026-09-19; note and skip if still down.
  - Standing deploy approval.

**Milestones:**
- [ ] **M1 — Selection actions.** Rotation both ways, crop, and a cancel that
  restores the session's starting chart, with the pasted-piece case covered.
  Gate: criteria 1–3 with unit and e2e.
- [x] **M2 — The chrome.** Done 2026-09-16 (D147). Icon buttons, the compare line, the photo button in
  the top panel, and the regenerate panel hidden for photo-free charts.
  Gate: criteria 4–7 with e2e for both panel states.
- [x] **M3 — Release.** Done 2026-09-16; deployed as 732c084. Decision file, README and HANDOVER, full suites, deploy,
  live check, then the Owner's sign-off.

**Progress log** (newest first):
- 2026-09-16 — **M3 done: deployed as 732c084; G-042 awaits the Owner's
  sign-off.**
  - Only this container restarted, 39 containers up, 20 of 20 sites 200 after.
  - **Live on production:** the photo input generated a 60 × 45 chart from the
    header; rotate then crop gave "4 × 6, 24 stitches"; the readout read
    "3328 - Salmon - Dark 14% lighter 34% more saturated"; a blank chart showed
    no regenerate panel. No console errors in any of them.
  - **One live test dropped, and why:** the cancel-after-move check never got a
    drag through to the app — the chart's render revision stayed at 2, so no
    gesture frame was ever drawn, while the same helper worked two tests earlier
    in the same file. After four attempts it was my harness, not the deployed
    code, so it was removed rather than retried further. That behaviour is
    covered against this commit by `tests/e2e/selection-actions.spec.ts`, which
    passes 5/5 including both the drawn-and-moved and the pasted-piece cancel.
  - **PENDING APPROVAL: G-042 sign-off** — all five changes are built, verified
    and live. "Crop means the chart is cut to the selection" was the Company's
    reading of the request and is the one point worth confirming.
- 2026-09-16 — **Full suite green before release:** Playwright 313 passed, 0
  failed across all 25 specs, one spec per process, including 84 chart-render
  and 124 viewport-parity cases — the icon buttons, the moved photo input and the
  hidden panel disturbed nothing. README corrected: the selection's operations
  and the photo-free chart's behaviour were both understated.
- 2026-09-16 — **M2 done: icons, a leaner readout, the photo button moved, and no
  panel for a photo-free chart (D147).**
  - Nine icon buttons in the selection bar, each keeping its old words as its
    `aria-label`, so every existing test still finds it.
  - The swatch readout is the thread's code and name, then each difference, with
    no brand word and no colon; `describeSwatchComparison` became
    `swatchComparisonParts`.
  - The photo input lives in the top bar, keeping `id="image-input"` and its
    "Image" label, so everything that uploads still works.
  - `ProcessingParams` is not rendered at all for a photo-free chart; the
    photo-free note went with it, and `blank-chart.spec.ts` now asserts the
    panel's absence instead.
  - **Two defects I introduced and fixed**, both caught by the suite:
    - the readout's parts were spaced by a flex gap alone, so the accessible and
      copied text ran together ("Dark7% lighter"); they now carry real spaces;
    - the relocated photo input lost `isProcessing`, dropping the guard a
      2026-09-09 code review added against swapping the photo mid-generation.
  - **A reporting failure of mine:** I first reported these four specs as "18
    passed, no failures". My loop matched the word "failed" on the summary line,
    but Playwright prints "1 failed" and "4 passed" separately, so two real
    failures went unreported until a test-count discrepancy exposed them. The
    loop now counts each figure on its own line.
  - **Verification:** type-check, lint and docs-lint clean; Vitest 1011 passed,
    8 skipped; colour-editor 5, blank-chart 5, selection-actions 5,
    generate-pattern 5, all passing after the fixes.
  - **Next, M3:** README and HANDOVER, the full suites, deploy and live check.
- 2026-09-16 — Goal planned. The Owner settled two points up front: the colour
  text to trim is the editor's compare line (not the legend row, whose "Dark" is
  part of DMC's own colour name), and cancel undoes the whole selection session
  rather than only dropping the floating piece. `FloatingSelection` already
  carries cells plus width and height, so rotation follows `flipCells`; cancel
  needs a snapshot taken when the session starts, because `paste` merges
  whatever was floating before it.
