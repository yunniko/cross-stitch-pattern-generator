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

### G-028 · Import and export the OXS (Open Cross Stitch) interchange format — ACTIVE (2026-09-13)
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
  - **Answered 2026-09-13: reject over-cap imports (see progress log).**
    The question was:
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
- [x] M1 -- Pure module (`lib/oxs.ts` or similar): parse real OXS XML
  (via `DOMParser`, main-thread-only like `pattern-import.ts` already
  is -- not the generation Web Worker) into an intermediate structure,
  and serialize a `StitchPattern` into spec-valid OXS XML (proper XML-
  escaping for name/author/title text). Self-authored synthetic
  fixtures only (see licensing constraint). Design sent through a real
  Codex critique exchange first, per standing practice. Unit-tested.
- [x] M2 -- Import integration: wire into `lib/pattern-import.ts` /
  `loadPatternFromFile`'s existing content-sniffing flow (extend past
  ZIP/JSON to also recognize OXS XML), palette mapping (DMC auto-
  detection, EMPTY_CELL for any cell absent from `<fullstitches>`),
  partstitch approximation, and the honest drop/approximation-summary
  UI surface. Over-cap files are rejected (Owner answer, 2026-09-13).
- [x] M3 -- Export integration: new `ExportKind` ("oxs") in
  `app/workspace.tsx`'s export dropdown (top-level, alongside
  "editable" -- it's a data format, not a color/bw render variant), plus
  folded into `lib/export-all.ts`'s `.cspzip` bundle.
- [x] M4 -- Real-world verification: export a generated pattern's
  `.oxs` and open it in a real independent OXS consumer to confirm
  correct reading; import a real-world-shaped sample and confirm
  grid/colors/drop-summary are all correct. Full regression suite,
  commit, deploy.

**Progress log** (newest first):
- 2026-09-13 — **M4 done; all milestones complete. Deployed e52608f.**

  Independent reader: Embroiderly's OXS parser, built locally from its
  open-source repository at 552f658, read two exports from this app
  (60×40, full range 11 colours and DMC 9 colours). Nothing was uploaded.
  - Size, 16-count, title, author, every colour's hex and name, DMC
    brand/number/name, and all 2,400 stitches matched.
  - Symbols came through as the right code points, drawn with that
    program's own font.
  - Stitchmate's online viewer wasn't used: using it means sending a file
    to an outside service.

  Deploy (pre-approved):
  - Only this container restarted, and 7 sites return 200.
  - Live check: the self-authored chart opened with the expected notice,
    name and 18-count, and its OXS re-export was correct; no console
    errors.

  **PENDING APPROVAL: G-028 sign-off.** Open points:
  - symbol glyphs depend on the reading program's font
  - no desktop program (PCStitch, WinStitch) tested
- 2026-09-13 — **M4 progress: real OXS files imported.** All six local
  samples were run through the importer; results are in
  `docs/reviews/2026-09-13-oxs-format-evidence.md`.
  - The five usable files opened as DMC patterns, each with its losses
    reported. Ursa's demo matches its known content: 1,105 backstitch
    lines, 10 knots and 8 beads, plus 55 part stitches approximated.
  - The 237-colour conversion is refused with the cap message.
  - Fix from this run: the credits sentence read "instructions isn't
    kept"; it now lists what isn't kept.
- 2026-09-13 — **M2 and M3 done.**

  Import (M2):
  - `loadPatternFromFile` returns `{ pattern, format, oxsReport }`.
  - It recognises OXS from the first 4 KB, and refuses one over 64 MB
    before reading it all.
  - Inside an archive this app's `.json` wins and `.oxs` is the fallback.
  - The workspace shows the report as a notice (`oxsImportNotice`) and
    applies the file's fabric count when it is 11, 14, 16 or 18.
  - Open pattern accepts `.oxs`.

  Export (M3):
  - An "OXS chart for other programs (.oxs)" option in the Export menu.
  - "Export all" bundles `<name>.oxs`.

  Verified: `tsc` and eslint clean; 795/795 unit tests (import 3 and
  summary 2 new); 60/60 e2e on a fresh production build. The new e2e
  spec `tests/e2e/oxs-interchange.spec.ts` covers:
  - opening a self-authored chart with a part stitch, a backstitch, a knot
    and 18-count: notice text, name and fabric count
  - exporting a generated pattern and reopening it with nothing lost

  Export all asserts the bundled `.oxs`.
- 2026-09-13 — **M1 done.** `lib/editor/oxs-xml.ts` (a dedicated XML reader)
  and `lib/editor/oxs.ts` (`parseOxs`, `serializeOxs`, `looksLikeOxs`), D119.

  Format evidence (`docs/reviews/2026-09-13-oxs-format-evidence.md`):
  - The spec was re-read, and six real files by five writers were studied
    and kept local.
  - Every file uses 0-based coordinates; five of six put the cloth at index
    0.
  - Real files vary: missing sections, `chatTitle`, "DMC    943",
    placeholder elements.
  - Embroiderly's reader was read as a second implementation.

  Changes from the plan:
  - `DOMParser` isn't available in Vitest's Node environment, and a 47 MB
    file would build a 750,000-node DOM, so a dedicated reader replaces it.
  - The cloth entry and palindex offset follow the files.
  - The Anchor table exists (G-029), and import uses it for names.

  Codex critique (20 findings), outcome:
  - **Conceded:**
    - exact element paths
    - XML character rules
    - off-grid full crosses reported as approximated
    - part-stitch fallback only past the cloth
    - hidden vs overlapped part stitches
    - no merging of blends or unresolved colours
    - an empty `number` for custom colours on export, so "cloth" or "DMC 310"
      names can't be misread
    - report additions: completion marks, cloth colour, credits, strand
      counts, unknown elements, colours used only by dropped content
    - `oxs="1.0"` alongside `oxsversion`
  - **Already in the implementation:**
    - file RGB kept (Codex's blocker about Anchor round trips)
    - a separate object decoder
    - final occupancy before the colour cap
  - **Rebutted:**
    - a SAX library: the reader is tested and OXS needs a small subset
    - a worker: the real 47 MB file reads in about 2 s
    - CDATA and text as loss: the spec defines no text content
    - a generic report entry list: typed fields are clearer
  - **Deferred:**
    - loader API returning the report (M2)
    - a byte limit before reading (M2)
    - symbol portability (M4)

  Verified: `tsc` clean; 45 new unit tests (reader 23 incl. adversarial
  inputs and a synthetic 750,000-element document; OXS 22 incl. round
  trips, real-file-shaped input, every loss category and the colour cap).
- 2026-09-13 — **Started on the Owner's direction** ("go to import and
  export format implementing"), which approves this plan. Before M1: check
  constraints written before G-029 and G-031 against the current code
  (Anchor now has a table; import moved under `lib/editor/`). Re-verify the
  spec from its primary source, then the M1 design goes to Codex.

  Owner answers (2026-09-13):
  - Colour cap: reject an import over 100 colours with a clear error naming
    the file's count and the cap.
  - Autonomy: work through M1–M4 without milestone check-ins and deploy
    when verified, without asking. Owner sign-off at the end.
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

### G-033 · Swatch-aware color editor: remembered source, marked current, comparison on hover — DRAFT (2026-09-13)
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
- [ ] **M1 — Swatch source in the data model.** Codex critique of the
      design in items 1–2. `PaletteColor.source`, every mutation,
      `applyBrandPalette`, OXS import, serializer version 7 with
      validation and version-6 inference, fuzz-test update, golden-hash
      handling per criterion 4. Deliverable: green unit suite and an
      old saved file reopening with inferred sources.
- [ ] **M2 — Editor behavior.** Panel under the row, tab from source,
      scrolled and marked current swatch, stay open on pick, live Full
      range preview with one undo step per gesture, Revert, outside-
      click and Escape dismissal, retargeting and close-on-disappear.
      E2E tests for each. Deliverable: the new editing flow usable in
      the browser.
- [ ] **M3 — Comparison readout and release.** `lib/color/okhsl.ts`,
      the readout formatter, hover and focus readout, e2e for the
      readout, README attribution, HANDOVER regenerated, docs-lint,
      deploy after Owner approval, deploy-log row.

**Open questions for the Owner (answer before M2):**
- When the editor is open and the user clicks the chart, should that
  click only close the editor, or close it **and** paint as usual? The
  plan assumes close-and-paint, like the browser's own popover light
  dismiss; an accidental paint is one Ctrl+Z.
- Is a "Revert" button wanted, now that Cancel goes away? The plan
  includes it.

**Progress log** (newest first):
- 2026-09-13 — Goal drafted at the Owner's request ("make plan of
  improving color selection …"). Planned from a read of
  `app/components/colors-dock.tsx`, `lib/editor/pattern-edit.ts`,
  `lib/editor/pattern-serialize.ts`, `lib/threads/brand-match.ts`,
  `lib/threads/thread-brands.ts`, `lib/editor/use-undo-history.ts`, the
  active G-028 OXS code and the e2e suite (no test covers the color
  editor today). Okhsl licence verified at its source. No code written.
