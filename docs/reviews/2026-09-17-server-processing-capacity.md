# Server processing capacity, measured inside the caps (G-034 M1, 2026-09-17)

What one generation really costs on the production host when the container is capped, and what that means for the
pool size, queue and deadlines in G-034's plan. The plan's estimate was scaled from laptop benchmarks; these are
measurements.

## Method

`scripts/capacity-probe.ts` calls `buildPattern` on the same synthetic photo-like sources the published benchmarks
use (`docs/reviews/2026-09-15-performance-results.md`), so the figures are directly comparable. It is bundled with
rolldown into one self-contained ESM file, copied to the host, and run there as:

```
docker run --rm --cpus=3 --memory=2g -v /tmp/capacity-probe.mjs:/probe.mjs:ro node:22-alpine node /probe.mjs --case N
```

Nothing is installed on the host and the production checkout is untouched; the file is deleted afterwards. **One case
per process**: a later case's "peak" would otherwise include the previous case's memory, which is the attribution
error this measurement exists to avoid. The container reported `memory.max=2147483648` and `cpu.max=300000 100000`,
confirming the caps were in force.

Peak RSS is sampled every 10 ms during the call, so it catches the peak inside `buildPattern` rather than at its
edges. "maxRSS" is the process maximum, which also includes building the synthetic source — on the server a real job
receives decoded pixels instead, so per-job peak RSS is the figure to size the pool by.

## Results

Host, capped container, 2026-09-17. Laptop is the same bundle run on the machine every published benchmark used
(AMD Ryzen 5 5600H), one case per process.

| Case | Laptop wall | Server wall | Server CPU | Peak RSS | maxRSS |
|---|---:|---:|---:|---:|---:|
| 1000 st / 64 col (1500×1000), Standard | 3.6 s | **12.1 s** | 15.1 s | 228 MB | 285 MB |
| 1000 st / 64 col (1500×1000), Crisp | — | **14.7 s** | 17.6 s | 234 MB | 425 MB |
| 100 st / 16 col (4000×3000), Standard | — | **7.2 s** | 8.6 s | 113 MB | 431 MB |
| 100 st / 16 col (4000×3000), Crisp | — | **15.1 s** | 16.7 s | 122 MB | 431 MB |

The host was not idle: load average rose from 1.94 to 2.37 across the run. These are therefore working-day figures
including real contention from the other sites, not a quiet-hour best case. For capacity planning that is the more
honest number, but a quiet-hour repeat would likely be faster.

## What this changes in the plan

- **The server is ~3.4× slower per core than the benchmark machine, not 2.0×.** The synthetic CPU probe
  (three loops shaped like the hot paths) predicted 2.0×; the real pipeline came out at 12.1 s against 3.6 s. The
  earlier per-job estimates were optimistic by about 70 %, and the plan's table should be replaced by the measured
  column above.
- **Memory is better than inferred, and no longer a risk.** The plan assumed 250–400 MB per job; measured peak RSS
  is **113–234 MB**. Three workers therefore need roughly 700 MB, comfortably inside a 2 GiB cap.
- **CPU time exceeds wall time** (15.1 s against 12.1 s), so the pipeline already uses more than one thread. A pool
  of three single-threaded workers will not behave as three independent cores; the burst test in M2 must measure
  contention rather than assume it.
- **Throughput falls to about 12 large generations a minute** (three workers, ~14 s a job), not the 18 the plan
  estimated. A 12-deep queue implies a worst wait near 60 s rather than 40 s, so the client must show a queue
  position and the `Retry-After` value should be computed from the measured rate.
- **The latency criterion still passes**, but with less headroom than assumed: the largest Standard generation is
  12.1 s against a ≤ 20 s target, and Crisp is 14.7 s against ≤ 30 s.

## Three jobs at once, in one capped container

The solo figures leave open whether a pool of three behaves as three cores. Measured, same container and caps, three
processes started together on the largest Standard case:

| Run | Wall | CPU | Peak RSS |
|---|---:|---:|---:|
| job 1 | 13.9 s | 13.8 s | 209 MB |
| job 2 | 13.8 s | 13.8 s | 235 MB |
| job 3 | 13.8 s | 13.4 s | 213 MB |

Against 12.1 s solo, three at once cost **about 15 % more each** — so three workers inside a 3-CPU cap is sound, and
the three together peak near 650 MB, comfortably inside a 2 GiB cap. CPU per job fell from 15.1 s to ~13.7 s, which
fits the pipeline having less parallel work available once three compete.

(The wrapper also printed "finished in 0 ms": BusyBox's `date +%s%N` does not support nanoseconds, so only the
per-job figures above are trustworthy.)

## Decoder parity: `@napi-rs/canvas` against `sharp`

Both decode the same bytes Chrome does; the reference is Chrome's own `createImageBitmap` path, which is what the
app's worker uses today. Fixtures are generated in-page, reusing the EXIF and ICC builders from
`tests/e2e/decode-parity.spec.ts`. Above about 1 MP a centred 512 px crop is compared, since three full RGBA copies
of a 12 MP image exhaust the Node heap.

| Case | `@napi-rs/canvas` | `sharp` |
|---|---|---|
| plain JPEG 240×160 | exact, 2 ms | mean 0.00, worst 1 level, 0.5 % of pixels, 9 ms |
| JPEG, EXIF orientation 6 | exact, 160×240, 1 ms | **wrong size: 240×160**, 7 ms |
| JPEG, ICC swapped primaries | exact, 1 ms | **mean 71 levels, 100 % of pixels differ**, 6 ms |
| PNG with alpha | exact, 2 ms | exact, 2 ms |
| JPEG 4000×3000 | exact, 54 ms | exact, 25 ms |

**`@napi-rs/canvas` matches Chrome on every case.** `sharp` fails two:

- **EXIF orientation**: `.rotate()` reads orientation from metadata, but the crop was applied to the unrotated frame,
  so the result came back 240×160 where Chrome gives 160×240. Fixable by ordering the pipeline differently — but it
  is a real ordering hazard, and getting it wrong silently changes every generated pattern from a phone photo.
- **ICC**: `toColorspace("srgb")` did not apply the embedded profile the way Chrome does, leaving 100 % of pixels
  different by a mean of 71 levels. This is exactly the "same photo, different pattern" failure the plan's
  architecture item 4 names.

`sharp` is faster on the 12 MP decode (25 ms against 54 ms), which does not outweigh two parity failures; and
`@napi-rs/canvas` also provides the 2D canvas the exports need, where `sharp` would not.

## Still to measure

- Export costs (Pattern Keeper PDF, A4 ZIP, Export all) inside the caps, with the chosen canvas library. These are
  M2 work: the drawing code must take an injected canvas factory before it can run server-side at all.
