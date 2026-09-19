# G-048 M1 · Rust exact tier: Standard generation, parity and first timing

Measured 2026-09-19 on the laptop: AMD Ryzen 5 5600H, Windows 11, Node v22.20.0 (V8 12.4.254.21), rustc 1.96.0 with
release settings from `rust/Cargo.toml` (fat LTO, one codegen unit). Both sides run on one thread.

## Method

`npm run compare:rust` (`scripts/rust-parity.ts`) builds each case with TypeScript's `buildPattern` and passes the same
RGBA bytes and options to `rust/target/release/cs-bench`. It hashes the Rust pattern with the golden regression's
`hashPattern` and requires it to equal the TypeScript hash. For golden cases it also requires the recorded hash (D107).
Each side's time is the fastest of three runs. The Rust time is measured inside the process, so it excludes process
start-up and reading the file. The TypeScript time is `buildPattern` alone.

Scope: Standard mode, full palette, enhancement off, both quantizers, with and without `optimize`. These are the 11
Standard golden cases, plus the capacity probe's two Standard shapes (`scripts/capacity-probe.ts`, photo-like fixture).

## Results

Every case is byte-identical: 13 of 13, including all 11 recorded golden hashes.

| Case | Grid | TypeScript ms | Rust ms | Speed-up |
|---|---|---|---|---|
| two-region/standard/latest/8 | 60×40 | 30 | 3 | 9.5× |
| two-region/standard/original/8 | 60×40 | 14 | 3 | 4.9× |
| two-region/standard/latest/12/no-optimize | 60×40 | 11 | 2 | 5.9× |
| realistic-ratio/standard/latest/16 | 100×67 | 47 | 12 | 3.8× |
| gradient/standard/latest/8 | 40×40 | 7 | 2 | 4.2× |
| circle/standard/latest/3 | 30×30 | 5 | 1 | 5.5× |
| hard-split/standard/latest/3 | 16×16 | 4 | 1 | 6.9× |
| photo/standard/latest/24 | 150×100 | 128 | 42 | 3.1× |
| photo/standard/original/24 | 150×100 | 114 | 38 | 3.0× |
| photo/standard/latest/64 | 300×200 | 364 | 106 | 3.4× |
| photo/standard/latest/100 | 120×80 | 122 | 40 | 3.0× |
| probe 1000 st / 64 col, 1500×1000 source | 1000×667 | 3680 | 1279 | 2.9× |
| probe 1500 st / 64 col, 2250×1500 source | 1500×1000 | 7879 | 2732 | 2.9× |

Rust stage times for the fastest run, in ms, at the two probe sizes:

| Stage | 1000 st | 1500 st |
|---|---|---|
| downsample | 176 | 387 |
| importance (luminance, Sobel, cell importance) | 56 | 106 |
| pair evidence | 323 | 667 |
| denoise | 128 | 273 |
| quantize | 408 | 885 |
| ICM, both passes | 152 | 336 |
| cleanup | 23 | 54 |
| finalize (merge, recompute, names) | 11 | 22 |

## Reading

- **The exact port is about 2.9× faster at the sizes that matter.** It uses no threads and no SIMD, and it keeps the
  TypeScript arithmetic order. The small cases gain more, but TypeScript's times there include warm-up that three runs
  do not remove.
- **Quantize and pair evidence together take over half of the Rust time.** They are M3's first targets. Downsample is
  dominated by one V8-exact `pow` per channel per cell.
- **Not yet measured:** peak memory, the host, three jobs at once, and real photos. These are M3 and M5 work, under
  criterion 4.

## Confidence and gaps

The results are exact for the fixtures listed. Crisp, Crisp+, enhancement and brand modes are not ported yet (M2). The
timings come from one laptop on one day. The M5 report repeats them on the host inside the container caps.
