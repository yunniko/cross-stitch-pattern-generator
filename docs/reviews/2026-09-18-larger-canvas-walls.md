# Larger canvases: where each wall sits (G-046 M1, 2026-09-18)

G-046 asks what stops the app at 1000 stitches per side and how far the cap can rise inside D149's processor caps
(3 CPUs, 2 GiB). This measures every wall the goal names, at 1000 stitches and above, before any code changes. It
produces the order the walls bite in, a candidate cap, and what each later milestone must move.

"N stitches" means N on the **longer side**, in the 3:2 shape D149's case 0 used: 1000 stitches is a 1000×667 grid,
the 667,000 cells D155 names. Every chart is generated from `makePhotoLikeBuffer` at 1.5 source pixels per stitch,
64 colours requested, Standard unless stated.

## Summary

| Wall | First size it bites | Evidence below | Owner |
|---|---|---|---|
| Pattern Keeper PDF (and Export all) heap | **today, at 1000** | 2.5 KB of heap per cell, 1.68 GB at 1000 against the container's 1048 MB default | M2 |
| A4 page export inside its 150 s deadline | **~1090 on the server**; 1000 has 15 % headroom | 127.7 s at 1000 and 268.5 s at 1500 on the host | M4 |
| Generation inside the 45 s deadline | 2000 Crisp solo; 2000 Standard under load | 54.7 s and 32.0 s on a quiet host | M3 |
| Realistic preview, native memory | ~1500 beside other jobs; 2000 alone | 1992 MB RSS at 2000 on the host, 56 MB inside the cgroup | M4 |
| OXS export heap | 2000 | 995 MB of heap | M4 |
| Editor zoom | **already at 1000**: 8 px a stitch at most; 5 at 1500; none at 2000 | an 8000 px limit on the zoomed chart | M4 |
| Every size validator | 1001 | seven boundaries refuse, including the browser's deserializer | M4 |
| Full-chart PNG | above ~1500 | refused by design (D026's budget) | not a wall |
| The result on the wire | none measured | 6.4 MB, parsed in under 0.2 s at 2000 | not a wall |
| Undo history and drawing | none measured, to 2000 | 143 MB of history, longest task 91 ms at 2000 | not a wall |

**Candidate cap: 1500 stitches.** It is reachable once M2 fixes the PDF — needed at any size, today's 1000 included —
and M4 lands three things: A4 inside its deadline (on the server it crosses 150 s near 1090 stitches), the editor's
zoom limit (at most 5 px a stitch at 1500), and room for the realistic preview's native memory beside other jobs.
**2000** needs all of that, plus M3's speed-up (2000 Crisp takes 54.7 s against a 45 s deadline) and the OXS string
built in pieces rather than whole.

## Method

- **Generation and wire**: `scripts/capacity-probe.ts`, D149's own probe, with five cases appended above today's cap
  (D149's cases 0–3 keep their indices and meaning) and a wire leg measured after the timed call, so it cannot
  inflate the job's peak. Run on the host exactly as D149 did: bundled with rolldown into one file and run in a
  throwaway `docker run --cpus=3 --memory=2g node:22-alpine`, one case per process; the container reported
  `memory.max=2147483648` and `cpu.max=300000 100000`. Case 0 reproduced D149's laptop figure exactly (3.6 s).
- **Exports**: `scripts/export-probe.ts`. It generates a chart and stores it with v8's structured clone, then runs
  one export per fresh process, so an export's memory is never mixed with the generation that made its chart (the
  app's own deserializer refuses anything above 1000, so it cannot carry the chart). The server's canvas backend
  draws, as in production. On the laptop every export ran under `--max-old-space-size=1792` (a 1840 MB V8 limit),
  modelling one worker inside the 2 GiB container. On the host the same probe ran inside the **production processor
  image** in a throwaway `--cpus=3 --memory=2g` container — the image already carries Node, `@napi-rs/canvas` and the
  export assets, so it draws exactly as production does. Its default V8 heap there is **1048 MB**. Four runs only:
  the A4 runs held the capped container at full load for about seven minutes (host load 1.01 before, 6.79 after), so
  A4 at 2000 was not run on a shared host.
- **Editor**: `scripts/bench-chart.spec.ts`, G-036's interaction bench — brought up to date in this milestone (see
  the tooling notes) and given a second test for the undo budget — run in a throwaway worktree whose only change
  raised `MAX_STITCHES` to 2000. That build was local, never committed, and removed afterwards; it was served with the
  processor and the `PROCESSOR_URL` the app needs. Chromium 153 on the laptop, one run per size.

Three limits of the method, stated rather than hidden:

- **"Peak RSS" in D149's probe is the RSS at the end of the call.** `buildPattern` is synchronous, so the probe's
  10 ms sampler never fires inside it. `maxRSS` is the true peak but also counts building the synthetic source,
  which a real job receives already decoded. The real per-job peak lies between the two; both are reported.
- **The host was quiet** (load 0.53 before, 1.58 after). Case 0 took 8.6 s where D149, under load near 2, measured
  12.1 s — a working-day factor of about 1.4, before D149's further ~15 % for three concurrent jobs.
- **Laptop RSS varies about 20 % between identical runs** (1500 Standard: 424 MB, then 346 MB).

## Generation

Host, capped container, one case per process:

| Case | Wall | CPU | Peak RSS | maxRSS |
|---|---:|---:|---:|---:|
| 1000 Standard | 8.6 s | 10.5 s | 231 MB | 283 MB |
| 1250 Standard | 13.4 s | 16.0 s | 236 MB | 352 MB |
| 1500 Standard | 17.7 s | 20.6 s | 355 MB | 489 MB |
| 1500 Crisp | 28.4 s | 31.9 s | 423 MB | 750 MB |
| 2000 Standard | 32.0 s | 36.9 s | 551 MB | 761 MB |
| 2000 Crisp | **54.7 s** | 60.4 s | 703 MB | 1270 MB |

Laptop (AMD Ryzen 5 5600H, the machine every published benchmark used): 1000 Standard 3.6 s / 260 MB, 1000 Crisp
6.0 s, 1500 Standard 7.5–8.1 s, 1500 Crisp 13.2 s, 2000 Standard 14.0–15.0 s / 805–814 MB, 2000 Crisp 24.1 s.

Against the 45 s job deadline, applying the working-day factor and D149's concurrency cost: **2000 Crisp fails
solo**, 2000 Standard reaches ~45 s under load and passes it with three jobs running, and 1500 Crisp lands near 46 s
with three running — the edge. 1500 Standard (~29 s) and 1250 have room. Memory: three concurrent 2000 Crisp jobs
need about 2.1 GB at the per-job peak, beyond the 2 GiB container; three 1500 jobs need about 1.3 GB.

## The result on the wire

The result crosses to the browser as the editable-JSON document (D151), `cellPalette` as a plain number array.

| Chart | JSON | `JSON.parse`, host | Deserializer |
|---|---:|---:|---|
| 1000 × 667 | 1.4 MB | 41 ms | 69 ms, validation included |
| 1250 × 833 | 2.5 MB | 69 ms | refused: above the cap |
| 1500 × 1000 | 3.2 MB | 82 ms | refused |
| 2000 × 1333 | 6.4 MB | 162–174 ms | refused |

**Not a wall.** The goal listed the wire format among the scaling walls; measured, even 2000 stitches parse in under
0.2 s on the host. The only wall here is the deserializer's size check, which belongs with the other validators.

## Exports

### The Pattern Keeper PDF

Laptop, 1840 MB heap limit, default A4 overlap (5):

| Chart | Cells | Peak heap | maxRSS | Wall |
|---|---:|---:|---:|---:|
| 400 × 267 | 106,800 | 299 MB | 438 MB | 2.9 s |
| 700 × 467 | 326,900 | 857 MB | 1017 MB | 8.5 s |
| 1000 × 667 | 667,000 | **1677 MB** | 1854 MB | 21.2 s |

A steady **2.5–2.8 KB of heap per cell**. This refines D155 rather than contradicting it: D155 saw the 1000-stitch PDF
fail at every heap up to 1536 MB, and it needs about 1.68 GB — it only finished here because 1840 MB were allowed.
The growth is linear, so "unbounded" is better read as "bounded, but far beyond the container". Extrapolating the
fit (an extrapolation, not a measurement): about 3.8 GB at 1500 and 6.7 GB at 2000. **No cap can rise until M2's
operator batching lands, and the same fix repairs today's 1000-stitch failure.**

### Every other kind

Laptop, same limits:

| Kind | 1000 | 1500 | 2000 |
|---|---|---|---|
| A4 page ZIP | 67.9 s, 28 MB, RSS 265 MB | **150.7 s**, 69 MB, RSS 393 MB | **270.0 s**, 144 MB, RSS 561 MB |
| Full-chart PNG | 9.9 s, RSS 488 MB | 5.6 s, RSS 459 MB | refused: "too large to render as a single image" |
| Realistic PNG | 7.6 s, RSS 793 MB | 10.7 s, **RSS 1189 MB** | 15.5 s, **RSS 1998 MB** |
| OXS | 0.3 s, 267 MB heap, 25 MB file | 0.9 s, 430 MB heap, 56 MB file | 1.9 s, **995 MB heap**, 102 MB file |

- **A4** holds its heap flat (19–22 MB: pages are drawn and released one at a time), but its time grows linearly
  with the chart — on the server that crosses the 150 s deadline near 1090 stitches (below) — and the download
  reaches 144 MB at 2000.
- **The realistic preview's memory is native.** Its V8 heap stays at 19 MB while RSS climbs to ~2 GB at 2000 — canvas
  memory that no heap limit bounds. At 1500 it is 1.19 GB: fine alone, a risk beside two other jobs.
- **OXS** builds its XML in one string: 995 MB of heap at 2000.
- **The full-chart PNG** refusing at 2000 is D026's layout budget (40 Mpx, 8,000 px a side) doing its job, with a
  message that points at the A4 export. A product rule, not a failure.

### On the host, in the processor image

| Export | Result |
|---|---|
| A4 at 1000 | ok, **127.7 s**, 30 MB, RSS 263 MB — against a 150 s deadline |
| A4 at 1500 | ok, **268.5 s**, 71 MB, RSS 389 MB — far past it |
| Realistic PNG at 2000 | ok, 31.6 s, **RSS 1992 MB** — 56 MB inside the 2 GiB cgroup, alone |
| PDF at 1000 | **FATAL: JavaScript heap out of memory** (exit 139) — D155, reproduced under the real caps |

**A4 is the wall that binds after the PDF, not generation.** Its time is linear in cells — 0.19 ms a cell at 1000
and 0.18 at 1500, on the server — so a fixed 150 s deadline admits about 790,000 cells: **roughly 1090 stitches**.
Today's own cap has only 15 % headroom, and HANDOVER's "about 70 s" for a 1000-stitch A4 is out of date by nearly
twice. The server runs A4 at about 1.8–1.9× the laptop's time, well under generation's 3.4×: much of its work is
native PNG encoding. And a *fixed* deadline for work that grows with the page count is the wrong shape: M4 should
either make A4 faster or give the paginated deadline a per-page allowance.

## The editor

**Interactions scale with the view, not the chart.** Longest main-thread task, which is G-036's metric, against its
100 ms target:

| Operation | 1000 | 2000 |
|---|---:|---:|
| Chart shown after regenerating | 0 ms | 54 ms |
| Zoom in, first step | 85 ms | **cannot zoom** |
| Views: B&W / Realistic / Original photo / Color | 0 / 0 / 0 / 50 ms | 0 / 0 / 0 / 0 ms |
| View: Grid + photo | 118 ms | 85 ms |
| Scroll, 20 steps (largest frame gap) | 59 ms (50 ms) | 0 ms (17 ms) |
| Isolate on / off | 0 / 0 ms | 0 / 0 ms |
| Select drag | 91 ms | 0 ms |
| Saved project reopened | 0 ms | 91 ms |

The 1000 column reproduces G-036's picture, including Grid + photo's known borderline (101 ms there). These are single
runs rather than G-036's three-run medians. Regenerating took 5.7 s at 1000 and 17.3 s at 2000 end to end, nearly all
of it the job on the laptop's processor.

**The undo history is not a wall.** Painting with the empty brush, so every click changes one cell and pushes one
entry, and measuring after a forced collection:

| Chart | Per edit | 50-step history | After 60 edits | Undo, median / worst |
|---|---:|---:|---:|---:|
| 1000 × 667 | 0.71 MB | 36 MB | 90.0 MB, plateaued | 43 / 70 ms |
| 1500 × 1000 | 1.61 MB | 80 MB | 136.5 MB, plateaued | 59 / 80 ms |
| 2000 × 1333 | 2.86 MB | 143 MB | 201.6 MB, plateaued | 76 / 91 ms |

About 1.07 bytes a cell per edit — the snapshot's `cellPalette` — and the history stops growing at 50 as designed.
Undo stays inside 100 ms, narrowly at 2000. A first reading counted the JS heap alone and showed almost no growth: a
typed array's bytes sit in an ArrayBuffer backing store outside that heap, so the test now reads both.

**Zoom is a wall.** `app/editor-geometry.ts` caps the zoomed chart at `IMAGE_WINDOW_MAX_ZOOMED_CANVAS_PX = 8000`, so a
stitch can be at most ⌊8000 ÷ longer side⌋ px: 8 px at 1000, 5 px at 1500, and at 2000 the 4 px minimum — a
2000-stitch chart cannot be zoomed at all. Confirmed directly by zooming with 30 s allowed: the cell size stayed at
4 px while the Zoom in button stayed enabled, a live-looking control that does nothing. The limit looks older than D135,
which made the drawing canvas view-sized; whether anything still depends on it is M4's first question.

## What each milestone must move

- **M2** — the PDF's heap: batch same-colour runs so operators stay bounded (D155). Required for any cap, and it
  repairs 1000. It must be measured on a real photo as well as this synthetic one: batching's gain depends on run
  length, and a real photo has shorter runs.
- **M3** — generation time: the ICM candidate-set reduction, aimed at the 1500 Crisp margin and at making 2000
  reachable.
- **M4** — A4 first: without it nothing above about 1090 stitches passes the paginated deadline, and a fixed deadline
  for work that grows with the page count wants a per-page allowance. Then the editor's zoom limit, the validators
  together (serialize, OXS, resize, blank chart, workspace storage, the processor's settings check, the generation
  hook), the realistic preview's native memory, and the OXS string. The wire format and the undo history need nothing.

## Tooling found along the way

- **`bench:chart` could not finish at any size.** Its config started no processor (G-034), and three steps reached for
  controls G-045 renamed or moved: Regenerate (now in the Photo tab, which generating leaves), the Highlight tool (now
  Isolate, D158) and "Open pattern…" (gone with the rail's menu, D162). Its first step waited, under a one-hour
  timeout, for a button that no longer appears. Fixed here because M1 needed it: the processor and `PROCESSOR_URL` in
  its config, today's controls, the size as `SIZE` with the size field's `max` following `MAX_STITCHES`, each
  operation logged as it lands, a 20-minute cap, and the undo budget as a second test.
- Its zoom step allows 1 s for the cell size to change and reads a timeout as "at the zoom cap", so a slow zoom and an
  impossible one look alike. At 2000 it was the cap, confirmed with 30 s allowed.
- The other five auxiliary configs (`bench-browser`, `bench-move`, `export-compare`, `export-parity`,
  `screen-compare`) still start no processor though every one of their specs presses Generate; they work only against
  servers started by hand with the right environment, which `reuseExistingServer` adopts. Proposed as M2's first task,
  since M2 needs `export-parity`.

## Confidence and gaps

- The charts are synthetic: 64 colours requested, 26–34 kept, long same-colour runs. The PDF's cost today is per
  cell regardless of colour, so its curve should hold on real photos; OXS and the post-M2 PDF depend on runs and
  should be re-measured on a real photo.
- Exports were measured for Standard charts only.
- The PDF above 1000 is extrapolated from a linear fit over three points; running it would have needed more memory
  than the measuring machine had free.
- Host figures are from one quiet-hour run per case.
- The editor was measured in Chromium on the laptop only, one run per size.
