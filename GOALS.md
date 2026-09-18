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

### G-045 · The Atelier redesign (direction 1b) — ACTIVE
- **What:** the workspace shell is rebuilt to direction 1b "Atelier": a 64px tool rail, a 44px context
  bar that changes with what you are doing, a 36px status bar, and a 360px right inspector with Photo,
  Chart and Threads tabs. Generate moves into the Photo tab and the exports into the Threads tab, so the
  four stacked horizontal bars above the chart are gone. Highlight stops being a tool and becomes
  Isolate: a view mode that stays on while another tool is active, with its own light on each thread.
- **Why:** Owner instruction (2026-09-18), implementing the 1b direction from the Claude Design project
  "App redesign directions". Today the shell stacks a top bar, a notice strip, a view bar and a params
  dock above the chart, and splits settings across a top bar, a params dock and an options panel.
- **Owner decisions (2026-09-18)**, for the four things 1b draws no home for:
  Undo and Redo go in the context bar; Open pattern, New blank chart and Choose a photo live in a menu
  on the rail's brand mark; the navigator is dropped; and the controls 1b omits are kept and placed —
  Algorithm on the Photo tab, author name and A4 overlap on the Chart tab, photo-only as a second press
  of the Photo toggle.
- **Acceptance criteria:**
  1. Every 1b screen is reproduced: chart editing, first run, before generate and select tool, plus the
     generating, colour-editor and chart-tab inspector states.
  2. Nothing that works today is lost: every control above still reaches its behaviour.
  3. Isolate is independent of the active tool, reports how many threads are lit, and each thread lights
     on its own.
  4. Vitest and the whole Playwright suite pass, with specs updated where 1b renames a control.
- **Constraints:** the chart pixels do not change — the design pins them to the app's own drawing rules,
  and the golden hashes and viewport-parity specs hold them there. Accessible names are preserved
  wherever a control survives, so the e2e suite only moves where the product really moved. Standing
  deploy approval applies.

**Milestones:**
- [x] M1 — Atelier tokens, fonts and shared primitives, with no layout change. Done 2026-09-18.
- [x] M2 — The shell: rail, context bar, canvas, status bar and the inspector frame. Done 2026-09-18.
- [ ] M3 — The three inspector tabs, and the generating and colour-editor states.
- [ ] M4 — Highlight becomes Isolate, with a light on every thread.
- [ ] M5 — Specs, documentation and deploy.

**Progress log** (newest first):
- 2026-09-18 — **M2 done: the shell is 1b’s. The panes still hold the old panels.**
  - **Gone:** the top bar and the view bar, and with them the four stacked strips above the chart.
    `top-bar.tsx` and `tools-dock.tsx` are deleted.
  - **New:** `tool-rail.tsx` (the mark, the file menu behind it, tools, symmetry, mirror), `context-bar.tsx`
    (undo/redo, the state of the document, the chart views and the photo toggle), `status-bar.tsx` (name,
    size, counts, finished size, autosave, zoom), `inspector.tsx` (the three-tab frame) and
    `export-controls.tsx` (lifted out of the top bar before it went).
  - **Where things went:** file actions to the menu on the rail’s mark, undo and redo to the context bar,
    name and autosave to the status bar and the Chart tab, the exports to the Threads tab footer, the
    settings to the Photo tab.
  - **Kept deliberately:** the scroller keeps its `overflow-auto` class and the frame its six data
    attributes, because the renderer measures them and the suite selects by them (D135). The name field,
    Options and Resize canvas keep their names on the Chart tab rather than disappearing with the top bar.
  - **Checks:** build and lint clean; Vitest 1061 passed, 8 skipped; the shell shot from a production
    server that confirmed its own readiness, no failed requests. **The Playwright suite has not been run
    against the moved shell** — M5 owns the spec updates, so the damage there is still unmeasured.
  - **Next:** M3, the three panes as 1b draws them, with the generating and colour-editor states.
- 2026-09-18 — **M1 done: the palette, type and skin are in place; the layout is untouched.**
  - **Tokens:** the colours of direction 1b are CSS variables in `app/globals.css`, mapped into Tailwind theme
    names, so M2 and M3 can write `bg-surface` and `border-line` rather than carrying zinc/dark pairs around.
  - **Type:** Archivo and IBM Plex Mono replace Geist. The numbers a reader compares — counts, dimensions,
    percentages — are the reason for a mono face at all.
  - **Skin:** 147 class replacements across the six shell components, leaving no zinc, dark:, bg-white or
    text-black anywhere in `app/`. The diff is 81 insertions against 81 deletions: one-for-one, nothing moved.
  - **Atelier is dark only.** 1b draws no light variant, so the prefers-color-scheme light theme is gone. Put
    to the Owner at this check-in.
  - **Checks:** Vitest 1061 passed, 8 skipped; lint and the production build clean; the page shot from a
    production server that confirmed its own readiness first, with no failed requests.
  - **Next:** M2, the shell — rail, context bar, canvas, status bar and the inspector frame.
- 2026-09-18 — goal created at the Owner's instruction, with the four decisions above. Direction 1b was
  read from the design project, whose `github.md` maps each screen to the repo files it comes from; the
  project's support.js is the canvas renderer only and constrains nothing here.

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
