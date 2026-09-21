# D199 · Dithering skips every smoothing pass, and is refused with Crisp
Date: 2026-09-21 · Goal: G-052 M2 · Status: active (superseded by: —)
Context: everything after quantization exists to remove isolated stitches — the denoise, both ICM passes, the cleanup, the merge, the colour recompute, the brand snap's re-optimisation. Dithering deliberately creates them.
Decision: a dithered generation runs none of them and keeps each thread at the colour the quantizer chose; `buildPattern` throws when dithering is asked for with Crisp or Crisp+. The Photo pane clears one when the other is chosen; the processor refuses the pair with a 400.
Force: requirement — measured. With the brand snap's fine-ICM pass left in, every pattern on DMC read 0.97× the undithered error at 0.1 points of added confetti: dithered, then smoothed back out. Skipping it gives 0.90–0.96×.
Rejected: keeping the optimizer and weakening it (nothing separates the optimizer's confetti from the dither's); allowing Crisp with dithering (Crisp exists to stop invented blends, which dithering manufactures).
Consequence: any new post-quantization pass must be gated on the same `smooth` flag in both languages, or it will quietly undo dithering. Off is unaffected and stays byte-identical.
Evidence: docs/reviews/2026-09-21-dithering-comparison.md; tests/unit/dither.spec.ts; lib/pipeline/pattern.ts; rust/cs-core/src/pattern.rs
