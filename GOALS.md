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
- [x] M1 — Measure where each wall actually sits, at 1000 stitches and above: pipeline wall time and
  peak RSS by D149's capacity-probe method, export memory, wire payload size and client parse cost, and
  the editor's undo and drawing budget. Produces a dated review under `docs/reviews/` and a candidate
  cap. No production code changes. Done 2026-09-18.
- [x] M2 — The export memory wall: batch same-colour runs in the PDF adapter so operators stay bounded
  (D155's named fix), so the PDF and Export all succeed at 1000 stitches; export parity re-run. Done 2026-09-19 — by
  releasing each page as it is drawn rather than batching (D169), plus the A4 per-page deadline the Owner added (D168).
- [x] M3 — The generation speed win: the ICM candidate-set reduction (neighbour labels plus the
  unary-best label, ~9 candidates instead of up to 100), byte-identical, re-measured against M1. Done 2026-09-19 —
  by a bound that skips the scan, since the candidate lists were slower (D170).
- [ ] M4 — The scaling walls M1 identifies (result wire format, undo history, chart drawing), then
  raise `MAX_STITCHES` and re-run M1's measurements at the new cap, including three concurrent jobs.
- [ ] M5 — **Only if M1–M4 miss the latency target:** G-023 M2's benchmark — port the quantizer and ICM
  as a standalone Rust library with a harness against the frozen TypeScript on identical inputs,
  single-threaded native and WASM. Numbers decide whether G-023 revives; no service, no deploy.

**Progress log** (newest first):
- 2026-09-19 — **M3 done: ICM is 14–55 % faster and exact, but generation gains only 0–5 s.** Deployed as c9eea53.
  - **Owner approval (2026-09-19):** "go m3, let's see what it will bring".
  - **Measured first.** About half of ICM's time was the per-label loop; the coarse call makes 5.6 M visits at 2000
    stitches, the fine call 2.75 M, almost all in its first pass.
  - **The milestone's design was slower.** Neighbour labels plus each cell's nine nearest were exact (no fallback in
    20 M visits) but 13–47 % slower up to 64 colours: building the lists cost 1.3 s at 2000 stitches, more than they
    saved. Rejected (D170).
  - **What shipped:** a label no neighbour carries costs at least the cell's total pair cost, so a neighbour label below
    that wins outright and the palette is scanned only otherwise. No precompute, no memory. ICM medians in plain Node:
    811 → 464 ms at 1000 stitches, 3083 → 1838 ms at 2000 (64 colours); 24 colours gains 14 %, 100 gains 55 %.
  - **Against M1, on the host** (old and new alternating per case): 1000 Standard 8.2 → 7.2 s, 1500 Crisp 33.4 → 28.1 s,
    2000 Standard 28.6 → 26.5 s, 2000 Crisp 52.6 → 52.5 s. Real runs end with 14–32 colours, where the bound gains
    least. ICM is now 9–13 % of generation; k-means assignment and Crisp's two-mode fit and worst-fit injection lead.
  - **Checks:** golden hashes and both M5 equivalence specs unchanged; a new spec makes 1,280 comparisons against the
    pre-M5 optimizer. Playwright 318 passed, Vitest 1065 passed (8 skipped); tsc, eslint and docs-lint clean. Live: a
    photo generated at 1000 stitches in 8.1 s.
  - **Next:** Owner check-in, then M4. 2000 Crisp at about 53 s on the host would need the k-means and Crisp stages
    faster before a 2000 cap reads well.
- 2026-09-19 — **M2 done: the PDF's heap is bounded, and paginated deadlines follow the pages.** Deployed as fd174cd.
  - **Owner approval (2026-09-19):** go ahead with M2, including the A4 per-page deadline.
  - **The mechanism changed, and why.** A stitch costs about eleven PDF operators: three for its fill, eight for the
    symbol Pattern Keeper needs as real text in every cell. Batching fills — D155's named fix, and this milestone's text
    — could only trim the three. Instead each finished page's content stream becomes the deflated stream `save()` would
    have written, and its operators are released (D169, superseding D155).
  - **Verified:** byte-identical files (clock frozen, builds a second apart); heap 40–66 MB from 1000 to 2000 stitches
    under a 512 MB limit, where 1000 had needed 1677 MB; Export all at 1000 in 122 MB of heap; D155's reproduction
    through the real worker path (`PROCESSOR_WORKER_HEAP_MB=512`) exports a complete 147-page PDF from a real photo. Live
    on production: the same PDF in 38.5 s, which had failed there since G-034.
  - **A4 deadline (D168):** 60 s plus 2 s a page, never under the old 150 s, calibrated from 152 and 336 pages at 1000
    and 1500 stitches. Live A4 at 1000: 126.0 s.
  - **Tooling:** one shared server pair for every config that starts servers; bench-browser and bench-move had no
    processor. The three compare configs start none by design and now say each build needs one; the M1 review's
    "five configs" wording is corrected.
  - **A mistake worth recording:** the first byte-identity test compared files that embed the wall clock, and passed only
    when both builds landed in the same second. A diff placed the difference in the Info dictionary's compressed object
    stream, not in any page, and the test now freezes the date.
  - **Checks:** Playwright 318 passed, Vitest 1064 passed (8 skipped); tsc, eslint and docs-lint clean.
  - **Next:** Owner check-in, then M3 — the ICM candidate-set reduction.
- 2026-09-18 — **M1 done: every wall measured, candidate cap 1500** (`docs/reviews/2026-09-18-larger-canvas-walls.md`).
  - **The walls, in the order they bite:** the PDF (2.5 KB of heap a cell, 1.68 GB at 1000 — broken today); A4 inside
    its 150 s deadline (127.7 s at 1000 on the server, so about 1090 stitches at most); the editor's zoom (8 px a
    stitch at most at 1000, none at 2000); generation (2000 Crisp 54.7 s against 45 s); the realistic preview's native
    memory (1992 MB at 2000); OXS (995 MB of heap at 2000); and every size validator.
  - **Not walls:** the wire (6.4 MB, under 0.2 s to parse at 2000), the undo history (143 MB, undo within 91 ms at
    2000) and drawing (longest task 91 ms at 2000).
  - **How:** D149's own method on the host in capped containers; exports inside the production processor image; the
    editor in a throwaway build with the cap raised, never committed. Case 0 reproduced D149's laptop figure exactly.
  - **Tooling:** `bench:chart` could not finish at any size since G-034 and G-045; fixed, with the undo budget added.
    The capacity probe gained cases above the cap and a wire leg; a new export probe runs each export in its own
    process. The other five auxiliary Playwright configs still start no processor — proposed as M2's first task.
  - **Next:** Owner check-in, then M2.
- 2026-09-18 — Goal created from the Owner's Rust question and this session's assessment of the
  deployed code (`42aab39`). The assessment's figures are quoted from D149,
  `docs/reviews/2026-09-17-server-processing-capacity.md`, D155 and the G-035 stage tables; the 2–3×
  Rust estimate is explicitly an inference, which M5 exists to settle if it is ever reached. Not
  started.

### G-047 · Faster exports and generation, from the 2026-09-19 algorithm review — ACTIVE (2026-09-19)
- **What:** the review's findings implemented (`docs/reviews/2026-09-19-algorithm-review.md`): a
  plain PNG writer for every raster export, the realistic preview streamed from tile rows instead of a
  96 Mpx canvas, the Pattern Keeper PDF freed of pdf-lib's per-operator bookkeeping, and the Crisp and
  Standard generation stages made cheaper where the output can be proven unchanged.
- **Why:** exports are the walls G-046 met (A4 at 126 s for 1000 stitches live, the preview at
  2 GB of RSS at 2000, the PDF at 38.5 s), and generation at 2000 Crisp is 52 s on the host; the review
  found most of that cost in bookkeeping, encoding and work that a proof shows is unnecessary.
- **Acceptance criteria:**
  1. Every raster export decodes to the same pixels as before (a decode-and-compare test per kind),
     and the A4 export at 1000 stitches takes under 60 s live (was 126.0 s).
  2. The realistic preview PNG is produced without a whole-image canvas; its worker heap and native RSS
     at 2000 stitches are measured by M1's export probe and stay under 512 MB.
  3. The Pattern Keeper PDF is byte-identical to today's file (the M2 harness) and at least 30 % faster.
  4. Every generation change keeps the golden hashes (D107) and the equivalence specs green; 2000 Crisp
     and 2000 Standard are re-measured by the capacity probe on the host against the M3 table.
  5. Vitest and Playwright pass, `docs-lint` passes, `HANDOVER.md` is regenerated, each milestone is
     deployed and verified live.
- **Constraints:** D107 (byte-identical generation) governs every pipeline change. A rendered export
  may change bytes where the review measured it pixel-identical or within ±1 (the Owner accepted ±1 on
  2026-09-19, so the glyph tiles and the tile-composed preview are in). Pattern Keeper's grid detection reads the PDF's
  text, so any change to how symbols are emitted is verified in Pattern Keeper before it ships. No new
  runtime dependency: the PNG writer uses Node's zlib.

**Milestones**:
- [x] M1 — The PNG writer: RGB, Up filter, zlib level 3, over the canvas's raw bytes, used by the A4
  pages, the chart PNGs and the preview; chart symbols drawn from cached glyph tiles (±1); one page
  canvas reused across A4 pages; the export request parsed once. Decode-and-compare test per kind
  (pixel-identical, or ±1 for the symbols); export parity re-run; A4 and Export all re-measured live. Done
  2026-09-19 at zlib level 6, not 3 (D171); the page-canvas reuse was measured and dropped.
- [x] M2 — The realistic preview as streamed tile rows: per-colour tiles composed one stitch row at a
  time straight into the PNG writer, no whole-image canvas. Compared with today's output (within ±1),
  memory measured by the export probe at 1000 and 2000 stitches. Done 2026-09-19 (D173).
- [x] M3 — The PDF: page height cached in the adapter, then each page's content stream written as text
  rather than operator objects, proven byte-identical with the flush harness. Fill runs merged and
  colour state deduplicated only if verified in Pattern Keeper. Done 2026-09-19 (D174); run merging not taken, as
  Pattern Keeper cannot be checked from here.
- [x] M4 — Crisp generation: the exact separation bound before the two-mode fit, and the weighted
  quantizer built on columns with no per-sample objects. Golden hashes and equivalence specs unchanged;
  re-measured on the host. Done 2026-09-19 (D175, D176).
- [ ] M5 — Standard generation: Hamerly bounds in k-means assignment (tie-safe, like D170), the
  interleaved buffer passed through instead of tuples, the symmetric medoid denoise, pair evidence one
  channel at a time, luminance shared between the edge and importance passes. Same proof and
  measurement as M4.

**Progress log** (newest first):
- 2026-09-19 — **Owner approval:** "go ahead with M5".
- 2026-09-19 — **M4 done: Crisp generation a third faster and 40 % leaner, exactly the same charts.** Deployed as e0fe2a5.
  - **Separation bound (D175):** both fitted modes lie inside the samples' OKLab bounding box, so a box whose squared
    diagonal is under `minModeSeparation` (less a 1e-9 margin for a mean's rounding) cannot yield a boundary; the fit
    is skipped. Proven against a frozen copy of the evidence code, every cell, both edge models, five option sets
    including separation 0, on seven sources. Alone: 2000 Crisp 24.2 → 20.6 s.
  - **Column pool (D176):** the Crisp stage writes typed columns directly; the weighted quantizer takes them, cells
    grouped once with a typed lookup. The sample-array functions remain as wrappers. Golden hashes (three Crisp
    photos) and the pre-M5 equivalence specs unchanged.
  - **Measured locally, bundled:** Crisp 1000 5.4 s / 259 MB → 4.0 s / 161 MB; 1500 12.8 s / 438 MB → 8.5 s /
    246 MB; 2000 24.2 s / 717 MB → 15.0 s / 420 MB.
  - **On the host** (capacity probe, old and new alternating, then reversed): the host sat at load 2.6–4.7 from other
    services, so times are noisy — 2000 Crisp 84.1 → 42.6 s and 73.2 → 49.0 s, 1000 Crisp 17.6 → 18.7 s and
    25.1 → 13.7 s. Peak RSS consistently fell: 1000 236 → 154 MB, 1500 422 → 245 MB, 2000 705 → 362 MB.
  - **Checks:** Vitest 1085 passed (8 skipped), Playwright 318 passed; tsc, eslint, docs-lint clean. Live at 1000:
    Crisp 8.0 s, Crisp+ 9.6 s, charts exported and decoded.
  - **Next:** Owner check-in, then M5 — Standard generation.
- 2026-09-19 — **Owner approval:** "go ahead with M4".
- 2026-09-19 — **M3 done: the Pattern Keeper PDF 3.5× faster, byte for byte the same file.** Deployed as 7e0ba86.
  - **How (D174):** the adapter formats each direct fill, text run and line exactly as pdf-lib would, collects a page's
    lines, and hands them to the page as one operator whose name is the whole batch, which pdf-lib writes verbatim;
    anything drawn through pdf-lib itself (translucent fills, outlined rectangles) flushes the batch first. The page
    height is read once. Unrotated text only; rotated text keeps pdf-lib's path.
  - **Proof:** the live builder against frozen copies of the builder and adapter from before M3, clock frozen: colour
    and B&W at overlaps 0, 5 and 10, and a thread-matched chart whose colour key runs onto a second page; every file
    byte-identical. The adapter spec now shows a page that is never finished loses its text.
  - **Measured, like for like against the M2 state:** 1000 stitches 13.3 → 3.8 s; 2000 stitches 52.6 → 14.6 s. Peak
    heap 72 → 97 MB (one page's text held until the page ends), maxRSS lower (264 → 229 MB).
  - **Not taken:** merging same-colour fill runs, which changes the file and needs checking in Pattern Keeper itself.
  - **Checks:** Vitest 1077 passed (8 skipped), Playwright 318 passed; tsc, eslint, docs-lint clean. Live: 147 pages in
    9.4–12.7 s (30.7 s before G-047), page 1 extracting 5416 text items.
  - **Next:** Owner check-in, then M4 — Crisp generation.
- 2026-09-19 — **Owner approval:** "go ahead with M3".
- 2026-09-19 — **M2 done: the realistic preview never exists whole.** Deployed as a2794c5.
  - **How:** each colour's texture is scaled into a stitch tile once; the PNG encoder's strips of rows are copied
    together from the tiles and streamed into the M1 writer (D173). The tile builder moved from the Image window into
    `lib/export/stitch-texture.ts`, so screen and export share it; the viewport-parity specs pass unchanged.
  - **Measured, like for like against the M1 state:** 1000 stitches 4.5 s / 825 MB → 1.7 s / 154 MB; 2000 stitches
    12.0 s / 1993 MB → 1.8 s / 159 MB, inside criterion 2's 512 MB. Export all at 1000: 65.9 s, 851 MB peak (was
    188 s and 1148 MB before G-047).
  - **Equivalence:** within 1 of the old canvas drawing, in a few texels per stitch where the canvas library scales into
    a small tile a little differently than into a big canvas (under 0.01 % of bytes; Owner accepted ±1). Covered at the
    default, 7 px and 4 px cell sizes, with empty stitches, and on the non-streaming fallback.
  - **Checks:** Vitest 1075 passed (8 skipped), Playwright 318 passed; tsc, eslint, docs-lint clean. Live: the preview
    at 1000 in 5.6–8.5 s, decoded whole at 12 000 × 7 500.
  - **Next:** Owner check-in, then M3 — the Pattern Keeper PDF.
- 2026-09-19 — **Owner (2026-09-19):** keep zlib level 6, and accept the live A4 at 62.1 s; go ahead with M2.
- 2026-09-19 — **M1 done: raster exports 2–3× faster, same pixels, smaller files.** Deployed as 6b5be11 and 291c719.
  - **PNG writer (D171):** `getImageData` strips, Up filter four bytes at a time, zlib on its own thread; 54 ms a page
    against the library's 313 ms at level 3. Level 6 was chosen over the plan's 3: level 3 made every file 40 % larger
    than before, level 6 makes them smaller (A4 zip 28.0 → 22.3 MB) at 2.5× the old speed. A4 pages are drawn while the
    previous one compresses.
  - **Symbol stamps (D172):** chart PNG 8.8 → 4.5 s; every one of the 100 symbols within 1 of `fillText`.
  - **Memory:** finished canvases held native memory V8 could not see, so Export all piled them up (1513 MB with the
    new writer). Each export canvas is now released once encoded: Export all peaks at 1038 MB, below its old 1148 MB.
    The chart PNG alone rose 483 → 642 MB, inside the canvas library's rasteriser. Reusing one A4 page canvas was
    measured (274 → 757 MB) and dropped.
  - **Equivalence:** every raster export at 1000 stitches, old code against new, decoded and compared: the preview
    pixel-identical, both chart PNGs and all 310 A4 pages within 1 per byte (0.3–1.6 % of bytes differ).
  - **Local at 1000:** Export all 188 → 70 s, A4 70.6 → 21.5 s, chart PNG 8.8 → 4.5 s, preview 6.8 → 4.4 s.
  - **Live at 1000:** A4 126.0 → 62.1 s; Export all 201.1 s (78.1 MB). Criterion 1's "under 60 s" is missed by 2 s;
    level 3 would meet it with files 40 % larger than before. Owner's call.
  - **Also:** the export request's chart is parsed once on the server and serialised once in the editor.
  - **Checks:** Vitest 1073 passed (8 skipped), Playwright 318 passed; tsc, eslint, docs-lint clean.
  - **Next:** Owner check-in, then M2 — the realistic preview streamed from tile rows.
- 2026-09-19 — **Owner approval:** "start implementing g-047"; M1 started.
- 2026-09-19 — goal drafted from the review. Owner (2026-09-19): ±1 pixel is acceptable.

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
