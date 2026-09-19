# G-048 M5 · The comparison report: TypeScript against Rust, and what qualifies to ship

Measured 2026-09-19 and 2026-09-20. This is criterion 4's report and the evidence for criterion 5's ship rule. It
gathers what M1–M4 measured, adds what they left open (host memory after the M3 fixes, WASM at the probe sizes, export
memory on both sides, exports at 1500 stitches) and reads the ship rule against the result.

- **Laptop**: AMD Ryzen 5 5600H, 6 cores, Windows.
- **Host**: the production VPS (AMD EPYC, 6 vCPUs), in throwaway containers of the processor image capped as the
  processor is (`--cpus=3 --memory=2g`). Rust is a static musl binary built in `rust:1.96-alpine`.
- **The ship rule (criterion 5)**: a part ships when it is at least 25 % faster on the host at the cap, uses no more
  memory, and meets its equivalence criterion.

Equivalence is settled and not repeated here: generation is byte-identical in every mode at any thread count
(`2026-09-19-rust-m2-parity.md`, `2026-09-19-rust-m3-optimised.md`), and the exports meet criterion 3 on all 30 cases
(`2026-09-19-rust-m4-exports.md`).

## Generation, laptop

One process per case, `makePhotoLikeBuffer` sources, 64 colours. Every case's pattern hash is identical across all four
columns.

| Case | TypeScript | Rust, 1 thread | Rust, 3 threads | WASM (1 thread) |
|---|---|---|---|---|
| 1000 st Standard | 2495 | 1270 (2.0×) | 643 (3.9×) | 2206 |
| 1500 st Standard | 5000 | 2727 (1.8×) | 1449 (3.5×) | 4829 |
| 1000 st Crisp | 3777 | 1835 (2.1×) | 931 (4.1×) | 2930 |
| 1500 st Crisp | 7582 | 3981 (1.9×) | 2060 (3.7×) | 6392 |
| 1000 st Crisp+ | 5008 | 1991 (2.5×) | 1095 (4.6×) | 3220 |
| 1500 st Crisp+ | 9065 | 4313 (2.1×) | 2182 (4.2×) | 6801 |

**WASM** (D186, single-threaded) runs at 1.0–1.6× TypeScript and about half of native at one thread — the figure M3
could not finish. It is not a shipping candidate: native in the processor beats it on every case.

Peak memory is not comparable on the laptop: the probe reads `VmHWM`, which Linux has and Windows does not. The host
table below carries the memory comparison.

## The host, one job at a time

One process per case, so no case's peak includes another's. Two timing columns, because they answer different
questions: **warm** is the fastest of three runs in one process (M4's method — what a processor worker that has already
served a job does), **cold** is a single run in a fresh process (what the first job after a restart does, including
V8's warm-up). Rust barely differs between the two; TypeScript does. The cold numbers are below; the warm export
numbers are in `2026-09-19-rust-m4-exports.md`.

### Generation (peak RSS after the M3 memory fixes)

| Case | TS ms | Rust 1t | Rust 3t | Peak RSS TS / Rust |
|---|---|---|---|---|
| 1000 st Standard | 6481 | 2928 (2.2×) | 2094 (3.1×) | 156 / 100 |
| 1500 st Standard | 12494 | 5925 (2.1×) | 3239 (3.9×) | 180 / 222 |
| 1000 st Crisp | 8034 | 5108 (1.6×) | 2885 (2.8×) | 151 / 108 |
| 1500 st Crisp | 15771 | 8813 (1.8×) | 4842 (3.3×) | 249 / 241 |
| 1000 st Crisp+ | 10609 | 5766 (1.8×) | 2777 (3.8×) | 144 / 108 |
| 1500 st Crisp+ | 19446 | 9743 (2.0×) | 5655 (3.4×) | 232 / 241 |

**Memory, the question M3 left open.** At 1000 stitches Rust holds 100–108 MB against TypeScript's 144–156 MB. At 1500
it holds 222–241 MB in every mode, against TypeScript's 180 MB (Standard), 249 MB (Crisp) and 232 MB (Crisp+): Rust is
**42 MB above TypeScript in Standard and 9 MB above in Crisp+**. Rust's peak is flat across modes because the buffers
are sized by the source, not the mode. Three concurrent 1500-stitch jobs would hold about 723 MB of the 2 GiB cap.

### Exports, cold runs (ms)

| Export | 1000 st: TS / Rust 1t / Rust 3t | 1500 st: TS / Rust 1t / Rust 3t | Peak RSS at 1500, TS / Rust 1t |
|---|---|---|---|
| Editable JSON | 177 / 68 / 85 | 244 / 108 / 195 | 162 / 109 |
| OXS | 911 / 136 / 409 | 1293 / 193 / 142 | 383 / 109 |
| Chart PNG colour | 15563 / 4377 / 2379 | 10522 / 3092 / 3555 | 512 / 160 |
| Chart PNG bw | 10235 / 2247 / 2581 | 9408 / 2847 / 3194 | 510 / 160 |
| Preview | 5409 / 1873 / 1892 | 4621 / 1765 / 1964 | 146 / 109 |
| PDF colour | 10647 / 4959 / 6102 | 21405 / 9132 / 18779 | 194 / 109 |
| PDF bw | 9870 / 4262 / 4616 | 25383 / 10558 / 10852 | 206 / 109 |
| A4 colour | 63966 / 44139 / 15652 | 171676 / 99699 / 47209 | 343 / 109 |
| A4 bw | 66691 / 48090 / 16833 | 150663 / 92680 / 40622 | 333 / 109 |
| Export all | 186401 / 98712 / 51003 | 326267 / 206335 / 106644 | 943 / 220 |

A 1500-stitch chart PNG is *faster* than a 1000-stitch one on both sides: the chart dimension cap shrinks the cell, so
the canvas is smaller. **Rust uses less memory on every export**, by the widest margin where it matters most: Export
all at 1500 stitches peaks at 943 MB in TypeScript — half the container's cap — against 220 MB in Rust.

### Three jobs at once, in one capped container

| Case | TypeScript (each) | Rust, 1 thread each | Peak RSS each, TS / Rust |
|---|---|---|---|
| 1500 st Crisp+ generation | 28982 / 29133 / 29189 | 9806 / 9897 / 10035 (2.9–3.0×) | 227–232 / 241 |
| Export all at 1000 st | 232332 / 233285 / 235766 | 100306 / 100566 / 100736 (2.3×) | 730–738 / 165 |

Three TypeScript Export-all jobs hold about 2.2 GB between them — over the cap, and survivable only because the peaks
do not coincide exactly. Three Rust ones hold 495 MB.

## Reading the ship rule

The processor runs a **pool of 3 workers on 3 CPUs** (`processor/job-protocol.ts`), so a job gets one core when the
service is busy. Every part is therefore judged at **one thread**; the 3-thread columns only show what an idle service
could do (A4 pages and Export all gain 2.5–4× there, and M3 found that extra threads only contend under load).

| Part | Host, 1 thread | ≥ 25 % faster? | Peak memory, Rust against TS | Equivalence | Ships |
|---|---|---|---|---|---|
| Generation | 1.6–2.2× | yes | lower at 1000; +42 MB at 1500 Standard, +9 MB at 1500 Crisp+ | byte-identical (criterion 1) | yes (D190) |
| Chart PNGs | 2.0–4.6× | yes | 138–160 MB against 510–665 | criterion 3, with the 4–5 px symbol change (D192) | yes |
| Realistic preview | 1.2–2.9× | on three of four fixtures; the 120-stitch chart is 1.2× on a 288 ms job | 4–109 against 110–146 | criterion 3 | yes |
| A4 page ZIPs | 1.4–1.9× | yes | 38–109 against 215–343 | criterion 3 | yes |
| Pattern Keeper PDF | 2.1–13.0× | yes | 4–109 against 118–206 | criterion 3 | yes |
| OXS | 6.7–8.0× | yes | 2–109 against 94–383 | byte-identical | yes |
| Export all | 1.6–2.3× | yes | 41–220 against 238–943 | criterion 3 | yes |
| Editable JSON | 2.0–2.6× | yes, on 1–244 ms jobs | lower | byte-identical | **no** — it is written in the browser so a save works when the server cannot be reached (D191) |

**The one clause not met** is criterion 5's "uses no more memory", for generation at 1500 stitches in Standard
(222 MB against 180) and Crisp+ (241 against 232). The Owner directed Rust regardless (2026-09-20); D190 records it,
and the headroom above holds: three concurrent 1500-stitch jobs stay near 723 MB of the 2 GiB cap.

## What M6 has to carry

- One thread per job by default; the pool is already sized to the cores.
- TypeScript stays in the tree as the reference and the fallback, and the parity harnesses (`npm run compare:rust`,
  `npm run compare:rust-exports`) stay the check that the two agree.
- The chart PNG symbol change (D192) is visible to users on charts between about 890 and 1333 stitches.
