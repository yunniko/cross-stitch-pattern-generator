# Photo editing: what the Wand and Apply cost on a large photo

Date: 2026-10-07 · Goal: G-124 M1 · Measured in Node (Vitest, V8) on the development machine.

A 4000 × 3000 photo (12 MP, the size the decode caps a side at is 4000 px), two kinds of content:

| Content | Wand, contiguous + diagonal, tolerance 100 | Wand, whole photo | Apply, pixel by pixel (`adjustPixelBuffer`) | Apply, each distinct colour once (`applyPhotoAdjust`) |
|---|---|---|---|---|
| 256 distinct colours | 1,241 ms (floods all 12 M pixels) | 654 ms | 7,220 ms | 137 ms |
| pseudo-random, ~8 M distinct colours | 1,161 ms (the flood reached all of it) | 681 ms | — | 6,452 ms |

Reading:
- Apply pixel by pixel costs about 0.6 µs a pixel; a real photo repeats its colours (a 12 MP JPEG is expected to hold far fewer distinct colours than pixels -- an estimate, not measured here), so adjusting each distinct colour once brings it to well under a second. The pseudo-random case is the worst there can be, and still about 6.5 s.
- The Wand's worst case, a flood over the whole photo, is about 1.2 s.
- Both are long enough to freeze a page in the worst case, so both run off the main thread in the app (D350).
- A step of history is one RGBA photo: 48 MB at 12 MP, 64 MB at 4000 × 4000.

Free memory on the machine at the time: about 2.2 GB of 15.7 GB.
