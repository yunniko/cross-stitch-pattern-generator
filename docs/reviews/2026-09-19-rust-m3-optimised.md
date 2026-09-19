# G-048 M3 · Rust optimised tier: threads, SIMD, WASM, real photos and the host

Measured 2026-09-19. The laptop is the AMD Ryzen 5 5600H (6 cores) from M1 and M2. The host is the production VPS (AMD
EPYC, 6 vCPUs, AVX2 and FMA). Host runs used throwaway `node:22-alpine` containers capped like the processor
(`--cpus=3 --memory=2g`), with static musl binaries built in `rust:1.96-alpine`.

## What changed

Every stage whose outputs depend only on their own inputs now runs on rayon threads. That covers downsampling, the
edge map and cell importance, pair evidence (blur passes and pair windows), the Crisp evidence layer, the denoise, the
per-cell OKLab conversion and enhancement's pixel pass. In both k-means, it covers the per-point assignment,
seeding-distance and injection work. Crisp+ strip snapping also runs in parallel.

Each value keeps the TypeScript's arithmetic order, and every floating-point sum stays sequential. So **any thread count
gives byte-identical output (D185)**. ICM, the reductions and blend pruning stay sequential.

Three changes cut work without changing a value:
- The blurred-step and chain-profile regressions evaluate each logistic once per bin, where TypeScript evaluates it twice.
- The evidence layer keeps confident cells only.
- The weighted quantizer's indices are four bytes, as TypeScript's `Int32Array`s are.

## Equivalence (criterion 2)

- **Fixtures.** At `RUST_THREADS=3`, all 36 cases are byte-identical to TypeScript, including the 18 golden hashes.
  The WASM build matched on all 30 fixture cases it ran.
- **Real photos.** Five CC0 Wikimedia Commons photos with no people, from the G-032 calibration set
  (`docs/reviews/2026-09-13-photo-enhancement-calibration.md`), were decoded at 3840 px and run in three edge modes.
  All 15 cases are byte-identical. The criterion-2 metrics are therefore equal. The table gives TypeScript's values,
  which Rust's match to the last digit:

| Photo | Mode | Mean per-cell OKLab error | Confetti ratio | Colours |
|---|---|---|---|---|
| backlit-tower | Standard / Crisp / Crisp+ | 0.0146 / 0.0162 / 0.0173 | 0.043 / 0.045 / 0.043 | 23 / 25 / 24 |
| fog-sailboat | Standard / Crisp / Crisp+ | 0.0101 / 0.0113 / 0.0132 | 0.041 / 0.041 / 0.030 | 51 / 52 / 40 |
| lake-summer | Standard / Crisp / Crisp+ | 0.0212 / 0.0215 / 0.0218 | 0.258 / 0.257 / 0.256 | 64 / 63 / 63 |
| road-mountains | Standard / Crisp / Crisp+ | 0.0107 / 0.0111 / 0.0133 | 0.065 / 0.065 / 0.065 | 64 / 63 / 62 |
| tree-panels | Standard / Crisp / Crisp+ | 0.0206 / 0.0209 / 0.0224 | 0.222 / 0.221 / 0.216 | 64 / 64 / 63 |

## Laptop timings

Real photos at 1000 stitches and 64 colours: TypeScript once, Rust fastest of three on three threads, in ms.

| Photo | Standard TS / Rust | Crisp TS / Rust | Crisp+ TS / Rust |
|---|---|---|---|
| backlit-tower | 6870 / 1213 | 13190 / 2476 | 32592 / 5074 |
| fog-sailboat | 6889 / 1421 | 12095 / 2320 | 23076 / 3745 |
| lake-summer | 8420 / 1690 | 16662 / 3660 | 50437 / 7833 |
| road-mountains | 6003 / 1101 | 9900 / 2253 | 20490 / 3909 |
| tree-panels | 5274 / 1013 | 8378 / 1736 | 26622 / 4371 |

Rust is 4.4–6.4× faster in every mode. Crisp+ on real photos spends most of its Rust time in the blurred-step evidence
(1.6–4.9 s), which runs on three threads already.

At 1500 stitches (2250×1500 photo-like source), fastest of three, in ms. Baseline is the default x86-64 build; v3 is
`-C target-cpu=x86-64-v3` (AVX2). Output is byte-identical across all six variants.

| Mode | 1 thread | 3 threads | v3, 1 thread | v3, 3 threads |
|---|---|---|---|---|
| Standard | 2755 | 1429 | 2656 | 1412 |
| Crisp | 4110 | 2062 | 3952 | 1987 |
| Crisp+ | 4606 | 2330 | 4240 | 2172 |

- **Three threads roughly halve the time rather than cutting it to a third.** ICM and the sequential sums don't scale.
- **SIMD pays 1–8 %.** The hot loops are reductions whose order is fixed for exactness, so the compiler cannot
  vectorise them much. Hand-written SIMD would reorder them (D185).
- **WASM runs at about half the speed of native on one thread.** It is single-threaded (D186). Photo fixture at 64
  colours: TypeScript 471 ms, native on three threads 70 ms, WASM 204 ms; the M2 native single-thread figure was 106
  ms. Crisp+ at 24 colours: 416, 47 and 134 ms.

## Host timings (one job per capped container)

Times in ms, peak RSS in MB. The binaries include the Crisp+ speed-ups but predate the two memory fixes, so the Crisp
peaks are the old ones.

| Case | TS | Rust, 1 thread | Rust, 3 threads | Rust v3, 3 threads | Peak RSS TS / Rust |
|---|---|---|---|---|---|
| 1000 st Standard | 5962 | 2514 | 1727 | 1561 | 155 / 64 |
| 1500 st Standard | 18767 | 6603 | 3353 | 3129 | 186 / 142 |
| 1000 st Crisp | 8482 | 4610 | 2852 | 3364 | 156 / 121 |
| 1500 st Crisp | 18216 | 9586 | 5252 | 4733 | 249 / 269 |
| 1000 st Crisp+ | 11919 | 5241 | 4461 | 3209 | 143 / 120 |
| 1500 st Crisp+ | 18480 | 10765 | 7479 | 9219 | 224 / 269 |

Three jobs at once in one capped container, each job's time in ms:

| Case | TypeScript | Rust, 1 thread each | Rust, 3 threads each |
|---|---|---|---|
| 1500 st Crisp+ | 26871–27196 | 10286–10410 | 13707–14120 |
| 1500 st Standard | 13175–13521 | — | 7045–7232 |

- **Rust is 2.5–5.6× faster on the host for one job, and 2.6× faster three at once.** It gains less than on the laptop.
  Two candidate causes are untested: musl's allocator (the laptop binary uses Windows') and the host's slower cores.
- **With three jobs sharing three CPUs, one thread per job is fastest.** Extra threads only contend.
- **The host is shared, so single runs are noisy.** TypeScript's 1500-stitch Standard took 18.8 s alone but 13.2 s as
  one of three.
- **Memory.** Rust used less than TypeScript except at 1500 stitches in Crisp and Crisp+. After the two memory fixes,
  the laptop peak working set at 1500 stitches is 146 MB (Standard), 244 MB (Crisp) and 245 MB (Crisp+). The host
  figures must be re-measured in M5, because Windows working set and Linux RSS are not the same measure.

## Gaps

- **Two runs were stopped.** Claude Code stopped the full laptop run (every case on three threads with WASM) and the
  first host session because the laptop ran low on memory. The host script finished on its own. Not measured as a
  result: WASM at the 1000- and 1500-stitch probe sizes, and one all-mode laptop table at three threads with the
  final binary. The probe figures above come from the runs listed.
- **Open questions for M5:** the musl allocator question, and host memory after the fixes.
