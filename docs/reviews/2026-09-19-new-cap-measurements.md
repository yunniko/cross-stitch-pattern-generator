# The new cap: M1's measurements re-run for G-046 M4 (2026-09-19)

G-046 M4 raised `MAX_STITCHES` to the largest size the measurements support (Owner decision, 2026-09-18). This records
the measurements that chose it, re-running M1's (`docs/reviews/2026-09-18-larger-canvas-walls.md`) after G-046 M2–M3
and all of G-047. Decision: D181.

## Method

- **Generation**: `scripts/capacity-probe.ts`, bundled, on the host in a throwaway `docker run --cpus=3 --memory=2g
  node:22-alpine`; each case solo, then three processes started together in the one container (D149's own method).
  M4 appended Crisp+ cases, the heaviest mode (cases 9 and 10). The host sat at load 1.3–4.9 from other services
  throughout; every figure below is from those conditions, not a quiet host.
- **Exports**: `scripts/export-probe.ts` on the host, inside the production processor image (its canvas library,
  assets and 1048 MB default worker heap), one export per process, on a 1500 × 1000, 26-colour chart.
- **D155's reproduction**: a local processor with `PROCESSOR_WORKER_HEAP_MB=512`, the app in front of it, a real photo
  generated at 1500 stitches through the page and exported.
- **Editor**: `scripts/bench-chart.spec.ts` with `SIZE=1500`, one run, Chromium on the laptop, against a production
  build with the cap raised.

## Generation on the host

| Case | Solo | Three at once, each | Peak RSS each (maxRSS) |
|---|---:|---:|---:|
| 1500 Standard | 15.1 s | 16.5–17.1 s | 298–306 MB |
| 1500 Crisp | 21.3 s | 26.1–26.6 s | 326–343 MB |
| 1500 Crisp+ | 21.9 s | **30.0–31.0 s** | 332–349 MB |
| 2000 Standard | 23.1 s | 30.4–30.9 s | 387 MB |
| 2000 Crisp | 44.5 s | **43.6–44.7 s** | 513–514 MB |
| 2000 Crisp+ | 42.5 s | **61.3–63.7 s** | 515–519 MB |

The job deadline is 45 s. At 1500 the worst case, three Crisp+ jobs at once, takes 69 % of it at host load 3–4; at
2000 three Crisp jobs sit at the deadline and three Crisp+ jobs pass it by 16–19 s. Three jobs' memory stays under
1.1 GB at 1500 and under 1.6 GB at 2000.

## Exports at 1500 on the host

| Export | Time | Deadline | Peak RSS | File |
|---|---:|---:|---:|---:|
| OXS | 1.3 s | 45 s | 261 MB | 56 MB |
| Colour chart PNG | 12.0 s | 45 s | 496 MB | 1 MB |
| Realistic preview | 12.5 s | 45 s | 137 MB | 2 MB |
| Pattern Keeper PDF | 30.4 s | 732 s | 174 MB | 11 MB |
| A4 colour | 167.6 s | 732 s | 297 MB | 56 MB |
| Export all | 371.3 s | 2346 s | 792 MB | 185 MB |

**Three Export alls at once**, the heaviest mix the pool can hold (exports and generations share its three workers), in
one capped container: at 1000, 273.0–274.9 s each, peaks 731–735 MB; at 1500, 508.5–513.0 s each at host load 7.4,
peaks 782–796 MB. All six completed inside the 2 GiB cap.

M1 measured the A4 export at 1500 at 268.5 s on the host, past the fixed 150 s deadline of the time; the per-page
deadline (D168) and the PNG writer (D171) now leave it at a quarter of its allowance.

**The full-chart PNG bounds the cap.** Its layout budget (D026: 40 Mpx, 8000 px a side, 4 px a stitch at least)
refuses a square chart above about 1550 stitches and a 3:2 chart above about 1990, and Export all includes that PNG,
so at 2000 Export all failed outright ("This pattern is too large to render as a single image"). At 1500 the PNG fits
every shape: a square chart comes to about 38.5 Mpx.

## D155's reproduction at 1500

Workers capped at 512 MB of heap, a real photo generated at 1500 stitches (1500 × 938) through the app:

- Pattern Keeper PDF: 309 pages, 10.5 MB, in 10.7 s — a complete file, its symbols extractable as text.
- Export all: 166.5 MB, in 131.0 s. No heap failure in the processor's log.

## OXS memory

The OXS export, now built a row at a time (D180), at 1500: peak RSS 650 → 289 MB; at 2000: 1339 → 404 MB and heap
1021 → 157 MB, where the worker's default heap is 1048 MB.

## The editor at 1500

Longest main-thread task per operation, against G-036's 100 ms target (single run):

| Operation | Longest task | Latency |
|---|---:|---:|
| Chart shown after regenerating | 0 ms | 9.7 s, the job included |
| Zoom in, steps 1–3 | 89 / 55 / 0 ms | 181 / 129 / 107 ms |
| Views: B&W, Realistic, Original photo, Color | 0 ms | 94–105 ms |
| View: Grid + photo | **105 ms** | 259 ms |
| Scroll, 20 steps (and in Grid + photo) | 0 ms | 496 ms (666 ms) |
| Isolate on / off | 0 / 0 ms | 158 / 166 ms |
| Select drag | 66 ms | 361 ms |
| Saved project reopened | 85 ms | 519 ms |

Zoom now works at 1500 (D179): three steps, each changing the stitch size, where M1 found at most 5 px. Grid + photo's
105 ms is G-036's known borderline (101–118 ms at 1000), not new.

**Client memory budget.** After 60 edits at 1500, with the 50-step undo history full, the page holds 136.5 MB of
ArrayBuffer storage (54.5 MB before any edit, 1.6 MB per snapshot) and 6.4 MB of JS heap, measured after a forced
collection; the browser's own canvas memory is on top and was not measured. Undo completes in 60 ms median, 67 ms
worst. The budget at the cap is therefore about 145 MB of script memory.

## The latency target

G-046's criterion 2 compares the largest generation with D149's 12.1 s Standard and 14.7 s Crisp, both measured at 1000
stitches, then the cap. Like for like, on the host at load 2.9–4.0: 1000 Standard 5.6–5.7 s, 1000 Crisp 9.6–11.3 s, and
three Crisp jobs at once 10.9–11.1 s each. At the new cap the worst mix uses 69 % of the 45 s deadline. The target is
met, so G-046 M5 (the Rust benchmark) is not triggered.

## Confidence and gaps

- The host was loaded by other services throughout (load 1.3–7.4); every timing carries that noise, which makes the
  deadline margins conservative rather than optimistic.
- The editor figures are single runs on one laptop in Chromium; other browsers were not measured.
- Exports were measured on a synthetic 26-colour chart and, for the PDF and Export all, one real photo.
