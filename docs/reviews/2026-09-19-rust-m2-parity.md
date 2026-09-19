# G-048 M2 · Rust exact tier: every generation mode, parity and stage timing

Measured 2026-09-19 on the laptop. The setup matches `2026-09-19-rust-m1-parity.md`: AMD Ryzen 5 5600H, Node v22.20.0,
rustc 1.96.0 with release settings, and one thread on each side.

## Scope

The Rust port now covers everything `buildPattern` does except the experimental contour refinement and custom
quantizers:

- the Standard, Crisp and Crisp+ edge modes;
- the Original and Latest quantizers, with and without `optimize`;
- the DMC, Cosmo and Anchor thread palettes;
- every photo-enhancement mode.

The thread tables and colour names are compiled in from files written by `scripts/rust-tables.mjs`, so both languages
read the same lists.

`jsmath` gained V8's `sin`, `cos`, `atan2`, `log` and `hypot` (D184). All ten maths functions now return V8's exact
doubles on 13,600,424 vectors.

## Parity

`npm run compare:rust` built each case in both languages and compared the output hashes. All 36 cases are
byte-identical:

- **The 18 golden cases.** Every recorded hash matches (D107).
- **12 cases with no recorded hash.** These cover Crisp+ with both quantizers and a brand, Crisp without `optimize`,
  and Crisp with Anchor. They also cover every enhancement mode, on the photo fixture and on a dimmed, tinted copy of
  it. For each enhancement case, the harness confirmed that enhancement changed the pixels, so none of these cases is
  a copy of Off.
- **Six probe cases.** These are the capacity probe's shapes at 1000 and 1500 stitches, in each edge mode.

## Timing, whole job (fastest of three runs)

| Case | Grid | TypeScript ms | Rust ms | Speed-up |
|---|---|---|---|---|
| 1000 st / 64 col, Standard | 1000×667 | 4017 | 1218 | 3.3× |
| 1000 st / 64 col, Crisp | 1000×667 | 5857 | 2144 | 2.7× |
| 1000 st / 64 col, Crisp+ | 1000×667 | 6055 | 1984 | 3.1× |
| 1500 st / 64 col, Standard | 1500×1000 | 7982 | 2756 | 2.9× |
| 1500 st / 64 col, Crisp | 1500×1000 | 12126 | 4230 | 2.9× |
| 1500 st / 64 col, Crisp+ | 1500×1000 | 12054 | 4449 | 2.7× |
| photo 150 st, Standard + DMC | 150×100 | 191 | 42 | 4.5× |
| photo 150 st, Crisp + Vivid | 150×100 | 550 | 195 | 2.8× |
| photo 150 st, Crisp+ + Portrait + DMC | 150×100 | 554 | 189 | 2.9× |

## Timing, stage by stage at 1000 st / 64 col (1500×1000 source)

The TypeScript column comes from `npm run bench`, one run, so it includes JIT warm-up. The Rust column is its fastest
run. The stage boundaries match: Rust "importance" is TypeScript's edge magnitude plus cell importance, and Rust
"cleanup" covers both passes.

| Stage | TypeScript ms | Rust ms, Standard | Rust ms, Crisp |
|---|---|---|---|
| downsample | 329 | 170 | 251 |
| importance | 104 | 47 | 72 |
| pair evidence | 558 | 299 | 396 |
| Crisp evidence layer | 726 | — | 451 |
| denoise | 287 | 127 | 147 |
| quantize (Standard k-means / Crisp stage) | 853 / 1478 | 399 | 595 |
| ICM, both passes | 1449 | 143 | 175 |
| cleanup | 125 | 21 | 40 |

## Reading

- **Every mode is 2.7–3.3× faster in the exact tier, on one thread.** Arithmetic order and results are unchanged.
- **The gains are uneven across stages.** ICM gains the most, about 10×: its inner loops over small typed arrays
  compile to tight native code. Stages that read the whole source photo gain about 2×: downsample, pair evidence and the
  Crisp evidence layer. Quantize gains about 2× and is now Rust's largest stage.
- **M3's targets follow from this.** Quantize, pair evidence and the evidence layer are independent per cell or per
  point, so they can use threads without changing results. That makes them the first candidates.

## Confidence and gaps

- **The results are exact for the fixtures listed.** Real photos are not in the corpus yet; they come with M3's
  quality metrics.
- **The timings come from one laptop on one day.** The TypeScript stage figures are single runs.
- **Memory is not measured yet.**
