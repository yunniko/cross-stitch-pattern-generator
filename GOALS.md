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
     median of 16 ms or less and a worst of 25 ms or less, in Color, B&W and
     Grid + photo, at 4 px (100% zoom), 6 px (the symbol floor) and 8 px.
     Measured by M1's benchmark, three runs. Amended 2026-09-16 with the
     Owner's approval: 11 px is unreachable at 1000 stitches (the 8000 px chart
     cap), and the Realistic preview and Original photo never edit (D121).
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
- [x] **M1 — A Move benchmark and the baseline.** Done 2026-09-16.
  - `scripts/bench-move.spec.ts` plus its config and an `npm run` script, in
    the shape of `scripts/bench-chart.spec.ts`: a 1000-stitch, 64-colour chart,
    a drag of 15 one-stitch steps, per-step and end-of-drag timings, the long
    tasks, and the top self-time frames.
  - Every case in criterion 1, unthrottled and at 4×.
  - Deliverable: the baseline table in
    `docs/reviews/2026-09-16-move-tool-investigation.md`, replacing the partial
    400-stitch figures.
- [x] **M2 — One paint per frame, the visible window only, and the small fixes
  (options 2, 3, 4).** Done 2026-09-16 (D144).
  - No behaviour change on screen, so this milestone needs no Owner ruling.
  - Gate: measurable improvement against M1, existing suites and parity pass.
  - The Owner's answers to the two questions above are collected at this
    check-in.
- [x] **M3 — Shift the pixels already on screen (option 1).** Done 2026-09-16 (D145).
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
- 2026-09-16 — **M3 done: a Move frame shifts the pixels already drawn (D145).**
  - **The Owner left both open questions to the Company** ("decide what makes
    more sense"), and D145 settles them: grid lines keep travelling with the
    design during a drag, because that keeps a frame a pure translation, which
    is what makes the copy cheap and pixel-exact; pinning them would force a
    content/grid split and a new parity oracle to remove a jump seen only on
    shifts off the 10-stitch grid. Grid + photo frames may be copied, since
    D135's "drawn clean" rule guards against accumulation, which a clean copy
    plus clean strips avoids.
  - **What changed** (`app/hooks/use-chart-renderer.ts`): a Move frame copies the
    canvas onto itself by the stitches moved since the last frame and draws only
    the strips that exposes. A scroll, zoom, view or pattern change, a shift past
    the canvas, or an active symmetry axis falls back to a full paint.
  - **Result** (1000 stitches, 64 colours, 3 runs; tables in the review): every
    case has a 17 ms median — one display frame per stitch — in all three views
    at 4, 6 and 8 px, against M1's 94 / 97 / 79 ms at 6 px and M2's 50 / 50 / 66.
    At 4×: 33 ms at 6 px and 8 px, against M1's 306–369 ms.
  - **Criterion 1, proposed reading:** the median target is met everywhere, and
    378 of 378 steps after each drag's first came in at or under the 25 ms worst
    target. Only the opening frame exceeds it (34–77 ms; 130–275 ms at 4×),
    because nothing exists to shift until a frame has been painted. The Owner is
    asked to read the worst-case target as "worst after the opening frame".
  - **Not improved:** ending a drag is unchanged at 86–132 ms, over the 100 ms
    target at 6 px, since the release redraws the committed chart from the
    pattern; a drag with symmetry on keeps M2's cost by design.
  - **Verification:** type-check and lint clean; Vitest 999 passed, 8 skipped;
    Playwright 307 passed across 24 specs, including 124 of 124 viewport-parity
    cases, so the shifted frame is byte-identical to a full redraw. The suite and
    the throttled benchmark ran in chunks: seven runs were killed by the OS for
    memory during this goal.
  - Codex remains at its usage limit until 2026-09-19, so M3 had no cross-model
    critique.
  - **Next, M4:** the Owner decides on the symbol-free preview (option 5) from
    these numbers, and the release — benchmarks, README, deploy and live check.
    Ending a drag is the remaining candidate over target.
- 2026-09-16 — **M2 done: one paint per frame, the visible view only, and the
  small fixes (D144).**
  - **What changed** (`app/hooks/use-chart-renderer.ts`, `lib/export/render.ts`,
    `lib/editor/pattern-edit.ts`): a Move preview schedules one
    `requestAnimationFrame` paint that later pointer positions replace, and its
    frames paint the visible rectangle with no overscan, which returns on the
    frame that ends the drag. Coalescing is scoped to Move, since a brush
    stroke's mid-stroke pixels are asserted per event. Also: clear the bitmap
    instead of reassigning an unchanged `canvas.width`/`height`, cache
    `opaqueCanvasRgb` per colour, reuse one `drawStitchPixels` scratch canvas and
    buffer per size, and shift stitches by whole rows.
  - **Result** (1000 stitches, 64 colours, 3 runs; full table in the review):
    a step costs 50 / 50 / 66 ms at 6 px (Color / B&W / Grid + photo), down from
    94 / 97 / 79, and 33 / 33 / 48 ms at 8 px, down from 54 / 65 / 50. The worst
    frame gap falls from 100 to 33 ms at 6 px, and the long tasks disappear
    (0 ms where M1 had 63–110 ms). At 4×: 181 / 182 / 248 ms at 6 px, down from
    357 / 369 / 306. Ending a drag is unchanged within noise.
  - **Not yet met:** only the 4 px case meets the 16 ms target, and it did before
    M2. Grid + photo gained least, since it already painted a sixteenth of the
    view as overscan. The target depends on M3.
  - **Verification:** type-check and lint clean; Vitest 999 passed, 8 skipped;
    Playwright 307 passed across three chunks (24 specs), including 124 of 124
    viewport-parity cases, so no pixel changed. The suite was run in chunks at
    one worker because a full parallel run was killed for memory, as five runs
    were during M1.
  - Codex remains at its usage limit until 2026-09-19, so M2 had no cross-model
    critique.
  - **Next, M3:** shift the pixels already on screen and redraw only the strips
    the wrap exposes, with the guides on their own overlay. The Owner's two
    questions (grid lines during a drag; Grid + photo previews by copy) are
    answered at this check-in, before that code is written.
- 2026-09-16 — **Owner approved M1's two amendments** ("1 and 2 yes") and M2.
  Criterion 1 now reads 4, 6 and 8 px across Color, B&W and Grid + photo.
- 2026-09-16 — **M1 done: the Move benchmark and the baseline.**
  - `npm run bench:move` (`scripts/bench-move.spec.ts` + its config) drags one
    stitch diagonally 15 times per case and reports the per-step cost, the frame
    gaps, the longest task, the top self-time frames and the cost of ending the
    drag. `RUNS`, `STITCHES`, `COLORS`, `CPU_THROTTLE`, `PHOTO`, `VIEWS`, `CELLS`
    and `STEPS` select a case, so one row can be rerun on its own.
  - **Baseline** (1000 stitches, 64 colours, 3 runs; full table in
    `docs/reviews/2026-09-16-move-tool-investigation.md`): one stitch of Move
    costs 94 / 97 / 79 ms at a 6 px stitch (Color / B&W / Grid + photo) and
    54 / 65 / 50 ms at 8 px, against the 16 ms target; ending a drag takes
    95–134 ms against the 100 ms target. At 100 % zoom (4 px, no symbols) a step
    is 16–17 ms and already passes. At 4× throttling: 306–369 ms per step at
    6 px, 187–229 ms at 8 px. No page or console errors.
  - **Two findings that change criterion 1, and need the Owner's word before the
    criteria are rewritten:**
    - 11 px per stitch is unreachable at 1000 stitches: `computeCellSize` caps
      the chart at 8000 px, fixing the maximum at 8 px. The reachable sizes are
      4, 6 and 8 px.
    - Only Color, B&W and Grid + photo can be dragged; the Realistic preview and
      Original photo pan and zoom but never edit (D121), so a Move there is a
      no-op. The benchmark now skips them. An earlier report of a "Realistic
      stall" was this no-op, not a defect; it is corrected in the review.
  - **Verification:** type-check and lint clean; the benchmark ran to completion
    unthrottled (3 runs) and at 4×. Four earlier runs were killed by the OS for
    low memory, which is why both waits are now time-boxed and a stalled view is
    recorded rather than fatal. The machine had 0.4–2.4 GB free throughout, so
    the numbers should be re-taken on a quiet machine before they gate anything.
  - Codex remains at its usage limit until 2026-09-19, so M1 had no cross-model
    critique.
  - **Next, M2:** one paint per frame, the visible window only, and the small
    fixes — no visible change, so it needs no ruling; the two questions above and
    the two in the goal are collected at that check-in.
- 2026-09-16 — **Goal planned** from the Owner's report, after a research-only
  investigation (`docs/reviews/2026-09-16-move-tool-investigation.md`). Measured
  with a throwaway benchmark: 35 / 49 ms per stitch of Move at 11 px in Color /
  B&W, 16–17 ms at 4 px, and 41–87 ms to end a drag; symbols are 55–60 % of the
  time, and the commit's stitch shift only 1.7 ms of it. Two 1000-stitch runs
  were killed by the OS for low memory, so the baseline is a 400-stitch chart
  and Realistic and zoomed-in Grid + photo are still unmeasured — M1 closes that
  gap. Codex was unavailable (usage limit until 2026-09-19), so the plan has had
  no cross-model critique.
