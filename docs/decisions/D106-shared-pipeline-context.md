# D106 · Pipeline stages share one `PipelineContext`
Date: 2026-09-13 · Goal: G-031 M3 · Status: historical (the TypeScript pipeline it describes was deleted in G-068 M3; see D221)
Context: stages took five to seven positional parameters with `undefined` holes, and nine stages each re-derived OKLab for every cell as tuple arrays (review A3, E2).
Decision: `buildPattern` builds `lib/pipeline/pipeline-context.ts`'s context once (true cells, interleaved Float64 `cellOklab`, importance, pair evidence, crisp layer); ICM, contour cleanup, denoise, crisp finalization and brand re-optimization take it as their first argument, with per-stage options after. Denoise returns its own OKLab for the quantizer, which accepts an optional precomputed buffer.
Rejected: Float32 OKLab — rounding the operands changes near-tie argmin decisions and breaks byte-identity; a context class with methods — a plain readonly object is enough and keeps stages pure.
Consequence: a new stage reads cell colors from the context, never `rgbToOklab(cellRgb(...))` in a loop. The quantizer and crisp quantization must be given the DENOISED buffer's OKLab, not the context's.
Evidence: as of commit bf726db, before the deletion — lib/pipeline/pipeline-context.ts; tests/unit/golden-hashes.spec.ts; tests/unit/denoise.spec.ts.
