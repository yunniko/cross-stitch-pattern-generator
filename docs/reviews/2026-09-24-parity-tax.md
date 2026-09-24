# What byte-identity with V8 actually costs — G-070 M1

**Date:** 2026-09-24 · **Tree:** `2200ed0` · **Machine:** Windows 11, MSVC toolchain, Rust 1.96, release profile
(`lto = "fat"`, one codegen unit) · **Method:** `cs-bench generate`, three repeats inside one process, five trials,
minimum reported, `threads: 1`.

## The question

G-068 deleted the TypeScript pipeline, but `rust/cs-core` still carries 1,153 lines whose only stated purpose is to
reproduce V8's floating-point bit for bit: `jsmath.rs` (478) and `fdlibm.rs` (675). The goal asked what that costs,
before anything is changed.

## Headline: the premise is wrong

**Replacing the V8 maths port makes generation 13–25% slower, not faster.** Two replacements were measured — Rust's
`std` (which calls the platform's C library) and the pure-Rust `libm` crate — against the shipped port, on the same
photos and options, with the binaries differing in nothing else.

| Case | V8 port (ships) | std | `libm` crate |
|---|---|---|---|
| 1200×800 → 150 st, 24 col, standard | **126.6 ms** | 151.4 ms (19.6% slower) | 148.0 ms (16.9% slower) |
| 1200×800 → 150 st, 24 col, crisp | **251.2 ms** | 314.0 ms (25.0% slower) | 306.1 ms (21.8% slower) |
| 2400×1600 → 300 st, 64 col, standard | **505.4 ms** | 600.7 ms (18.9% slower) | 580.9 ms (14.9% slower) |
| 1200×800 → 150 st, 24 col, DMC | **125.2 ms** | 149.7 ms (19.6% slower) | 146.4 ms (16.9% slower) |
| 1200×800 → 150 st, 24 col, auto enhance | **348.5 ms** | 391.3 ms (13.0% slower) | 402.4 ms (16.2% slower) |

Every case, both replacements, well outside run-to-run noise at minimum-of-fifteen. The likeliest reason is that the
port is ordinary Rust in the same crate, so LLVM inlines it into the per-pixel loops; `std` lowers to a non-inlinable
C call, and `libm`'s cross-crate calls do not recover the difference even under fat LTO.

The maths is hot enough for this to matter: `color.rs` runs three `cbrt` per pixel in `rgbToOklab` and a `pow` per
channel in the sRGB transfer, on every pixel of the source photo.

## And the output does not change anyway

**Zero cells differed** — 0 out of 15,000, and 0 out of 60,000 on the large case — for both replacements, in all five
cases, with identical palette sizes. Last-bit differences in the colour maths do not survive quantisation to a few
dozen threads. So the bit-exactness is not protecting the chart at these settings; but removing it costs 13–25%, and
buys nothing back.

## A risk that was not on the list: `std` makes output platform-dependent

`jsmath.rs` says the `libm` crate's `cbrt` "differs from V8's in the last bit for about one input in fifty thousand."
Measured against the recorded V8 vectors (2.7 M records from Node 22 / V8 12.4):

| Function | `libm` crate vs V8 | `std` vs V8 (MSVC CRT here) |
|---|---|---|
| `cbrt` | 18,381 / 220,000 = **8.4%** | 66,729 / 220,000 = **30.3%** |
| `pow` | 18,879 / 440,256 = 4.3% | 41,991 / 440,256 = 9.5% |
| `atan2` | 14 / 220,008 = 0.006% | 36,349 / 220,008 = 16.5% |
| `sin` | 1,934 / 220,072 = 0.88% | 4,863 / 220,072 = 2.2% |
| `cos` | 1,981 / 220,072 = 0.90% | 5,284 / 220,072 = 2.4% |
| `log` | 0 (shares fdlibm) | 16,919 / 220,000 = 7.7% |

Two things follow. The existing comment understates `libm`'s divergence by roughly 4,000× and should be corrected.
More importantly, `std`'s figures are a property of *this* platform's C library: on Alpine (musl, where production
runs) they would differ again. Moving to `std` would make a chart depend on which operating system generated it —
a failure mode the port currently rules out, and one the golden hashes would catch only on the CI platform.

## The other two claims, checked

**The crate-wide clippy `allow`s suppress 19 warnings** across 13,574 lines — about ten `needless_range_loop`, two
clamp patterns, two partial-ord comparisons, and a handful of others. The claim at G-068's close that "idiomatic Rust
is switched off crate-wide" overstated it: the attribute is crate-wide, what it hides is nineteen sites.

**There is real SIMD headroom, and it is free.** Rebuilding the unchanged code with `-C target-cpu=native`:

| Case | baseline | `target-cpu=native` | |
|---|---|---|---|
| 1200×800 → 150 st, 24 col, standard | 123.9 ms | 118.0 ms | 4.8% faster |
| 1200×800 → 150 st, 24 col, crisp | 253.1 ms | 241.0 ms | 4.8% faster |
| 2400×1600 → 300 st, 64 col, standard | 504.8 ms | 474.1 ms | 6.1% faster |

**Output byte-identical in all three** (0 cells differing). This needs no maths change, no hash change and no
decision about parity — only a build-flag choice. `native` itself is not portable; `x86-64-v2`/`v3` would capture
most of it while still running on any modern server.

## `f32`

Not measured. The transcendental swap moved total time by 13–25%, which bounds how much the per-pixel colour path
costs overall, but says nothing about what narrowing `f64` to `f32` would save — that cannot be measured without
doing the work, and the pipeline's accumulators would need checking case by case. Recorded as unknown.

## Recommendation

**Do not replace the V8 maths port.** It is not a tax: it is the faster implementation, it costs nothing in output
fidelity, and it guarantees the same chart on every platform. G-070's M3 and M4 as drafted should not proceed.

Worth doing instead, separately and cheaply: correct the `cbrt` comment in `jsmath.rs`, and consider a
`target-cpu` baseline for the production image for ~5% with byte-identical output.

## Reproducing

Add a temporary `std-math` / `libm-math` feature to `cs-core` that swaps the bodies of `cbrt`, `pow`, `exp`, `sin`,
`cos`, `atan2` and `log`, build `cs-bench` three ways, and run the same case through each. Two notes for whoever
repeats it: an `#[cfg]` on a block *inside* a function body makes that block a statement whose value is discarded,
so the variants must be paired function definitions; and check the flag really took effect by running
`cargo test -p cs-core --features "std-math json" --test jsmath_vectors`, which must fail. A first attempt here
measured two identical binaries and reported a plausible-looking result.
