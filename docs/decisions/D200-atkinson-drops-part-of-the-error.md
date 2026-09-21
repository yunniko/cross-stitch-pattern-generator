# D200 · Atkinson is a second kernel that drops part of the error, and runs serpentine
Date: 2026-09-21 · Goal: G-053 M2 · Status: active (superseded by: —)
Context: the Owner's screenshot holds ends that stay in one thread far longer than Floyd–Steinberg leaves them, and stitches that clump. Of six kernels measured against that ramp, only Atkinson does that: it passes on six eighths of the error and drops the rest.
Decision: error diffusion becomes a table of `(dx, dy, weight)` taps holding Floyd–Steinberg and Atkinson, in both languages; Atkinson scans serpentine, as Floyd–Steinberg does.
Force: requirement for the kernel, tie-break for the scan order. Measured: Atkinson leaves 30 of 120 ramp rows in one thread against Floyd–Steinberg's 5, and 95.1% of its light stitches have a light neighbour against 82.8%. Serpentine moved its run ratio by at most 0.01 across three ramps, not consistently toward isotropic, so it matches Floyd–Steinberg for consistency only — never a rule.
Rejected: Jarvis, Stucki, Burkes, Sierra — all keep the whole error, so none give the flat ends.
Consequence: taps are all a new kernel adds. Floyd–Steinberg is unchanged, checked cell for cell against a frozen copy.
Evidence: tests/unit/dither.spec.ts; lib/pipeline/dither.ts; rust/cs-core/src/dither.rs
