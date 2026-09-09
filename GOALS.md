# Goals — cross-stitch-pattern-generator

Template, numbering, and cross-project conventions live in
`E:\CLAUDE\COMPANY\GOALS.md`. This is a **standalone project** (Owner
decision, 2026-09-09) — not a svc-lab service: no deployment, no
monetization, no public subdomain unless the Owner asks for that later.
Standard OPERATIONS.md milestone check-in gates apply (not waived, unlike
svc-lab).

## Active goals

### G-001 · Image → cross-stitch pattern generator — ACTIVE
- **What:** A client-side web tool that takes a user-uploaded image and
  produces a printable cross-stitch chart: the image is divided into a
  grid of stitches at a chosen size, reduced to a chosen number of
  representative colors, each color assigned a distinct symbol. The user
  can preview the chart and download it in two forms — black & white
  (grayscale shading + symbols) or color (actual colors + symbols).
- **Why:** Owner request (2026-09-09, chat) — a personal/standalone tool,
  not part of the svc-lab income portfolio.
- **Acceptance criteria:**
  1. User uploads an image (common formats: JPEG/PNG/WebP).
  2. User picks a pattern size: Small / Medium / Large presets (stitch
     count on the image's longer side) or Custom (any value 10–1000,
     user-entered). See Decision D1 for the proposed preset values.
  3. User picks a color count from 2 to 64.
  4. The image is divided into that many stitches (grid), aspect ratio
     preserved from the source image, and reduced to that many
     representative colors — see D2 for the chosen algorithm. Each
     resulting color gets a unique, legible symbol (D3).
  5. A live preview of the chart is shown before download.
  6. Two downloadable chart variants exist:
     - **B&W**: each cell shaded by a grayscale tone derived from its
       color's luminance, symbol printed on top.
     - **Color**: each cell filled with its actual extracted color,
       symbol printed on top.
  7. The chart grid shows a line around every stitch cell; every 5th
     cross-stitch boundary is a heavier line; every 10th is heavier
     still (standard Aida-fabric count markings).
  8. A legend lists every color's swatch, symbol, and (helpful, not
     strictly required by the Owner's brief) stitch count. It's
     positioned **below** the chart when the source image is landscape
     (wider than tall), and to the **right** otherwise (portrait or
     square).
  9. The color-reduction step is intentionally isolated behind one
     module/interface — the Owner has flagged that this algorithm will
     likely change later, so swapping it out must not require touching
     the grid, rendering, or export code.
- **Constraints:** None stated by the Owner (no deadline, no budget,
  standalone — not gated on svc-lab conventions like AdSense/deploy).
  Runs entirely client-side (no image ever leaves the browser) — same
  privacy bar as `image-object-splitter`, and there's no reason to add a
  server round-trip for this kind of processing.

**Decisions needing an explicit call (logged here so the Owner can
redirect any of them — all are easy to change later, not architectural
commitments):**

- **D1 — Size preset stitch counts.** The Owner's brief left these as
  literal placeholders (X/Y/Z). Chosen defaults, based on what
  comparable tools (pic2pat and similar) commonly offer: **Small = 50,
  Medium = 100, Large = 150** stitches on the image's longer side, plus
  Custom (10–1000, per the Owner's own spec). Trivial to change — these
  are just three numbers in one config object.
- **D2 — Color-reduction algorithm.** Researched real approaches (see
  HANDOVER.md D1 for sources/citations). Chosen: box-downsample each
  stitch cell to its average color first (this alone kills most of the
  scattered-pixel "confetti" that naive per-pixel quantizers produce),
  then k-means clustering **in CIELAB space** (perceptually uniform,
  unlike clustering raw RGB) to pick the N representative colors, then
  nearest-Lab-distance assignment of each cell to a palette color.
  Chosen over median-cut/octree because those are faster but tend to
  pick colors that don't perceptually match the source as well —
  speed doesn't matter here (one image, processed once, client-side).
  Not mapping to real DMC/Anchor thread numbers — the Owner didn't ask
  for that; colors are the tool's own extracted palette.
- **D3 — Symbol set.** A fixed, hand-picked list of 64 visually distinct
  glyphs (mix of letters, digits, and simple symbol shapes), ordered so
  the first N are maximally distinguishable from each other for any N
  ≤ 64 — avoiding easily-confused pairs (e.g. not assigning both "O" and
  "0" adjacently) at small print sizes.

**Milestones**:
- [x] M1 — Project scaffold (Next.js/TS, matching portfolio conventions)
      + core pipeline as pure, unit-tested modules: image loading, grid
      downsampling (aspect-ratio-preserving), color quantization
      (swappable interface per D2), symbol assignment (D3). ✔ 2026-09-09.
- [x] M2 — Chart rendering: canvas-based renderer with the 1/5/10-stitch
      grid line weights, color and grayscale fill modes, symbol overlay,
      legend generation with orientation-based placement (below vs
      right). ✔ 2026-09-09.
- [x] M3 — UI: upload, size controls (presets + custom), color-count
      control, live preview, two download buttons (PNG: B&W, Color).
      ✔ 2026-09-09.
- [ ] M4 — Domain-expert review (real cross-stitch chart conventions —
      grid marking conventions, symbol legibility at print size, whether
      the color-matching approach is sound for this craft) + fix any
      findings; automated tests (Vitest unit + Playwright e2e) green.
- [ ] M5 — README/HANDOVER finalized, final end-to-end verification
      (real image through the whole flow, both downloads inspected),
      done.

**Progress log** (newest first):
- 2026-09-09 — M1–M3 built and verified in one session (bundled rather
  than stopping at each individual boundary, since they're tightly
  coupled and each depends on the last being in place to test against —
  checking in now, at the first point with a real reviewable
  deliverable, rather than after each internal step). Built: pure
  pipeline modules (`lib/downsample.ts`, `lib/color.ts`,
  `lib/quantize.ts`, `lib/symbols.ts`, `lib/pattern.ts`) with 24 passing
  Vitest unit tests; canvas-based renderer (`lib/render.ts`) with the
  1/5/10-stitch grid weights and orientation-aware legend; the upload/
  controls/preview/download UI (`app/page.tsx`). Verified for real, not
  just written: ESLint clean, `tsc --noEmit` clean, production build
  clean, 2 Playwright e2e tests green (real upload → generate → both
  downloads), plus a manual headless-Chromium pass that saved the actual
  rendered UI and the actual downloaded PNGs to disk and visually
  inspected them — confirmed for both a landscape fixture (legend below,
  as specified) and a portrait fixture (legend to the right) that grid
  lines, colors, symbols, and legend counts are all correct. Git repo
  initialized, 5 commits. Next: M4's domain-expert review, then M5.
- 2026-09-09 — Goal created. Owner confirmed standalone project (not
  svc-lab) via AskUserQuestion. Researched color-quantization approaches
  used by real image-to-cross-stitch tools (median cut, octree, k-means,
  perceptual/CIEDE2000 matching, cell-averaging to reduce "confetti") —
  see HANDOVER.md D1 for sources. Decisions D1–D3 above made and logged;
  none are escalation-tier (all easily reversible), so proceeding to M1
  rather than blocking on further questions.
