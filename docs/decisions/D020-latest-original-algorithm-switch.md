# D020 · Users choose between the Latest and Original color-picking algorithms
Date: 2026-09-09 · Goal: G-006 · Status: active (superseded by: —)
Context: The Owner noted real, opposite trade-offs: Original is population-driven and can miss small regions; Latest (D018) finds them but can look busier on noisy photos.
Decision: Export plainKMeansQuantizer as its own quantizer, with kMeansQuantizer layering the merge-and-reinvest step on top. The worker picks between them from a plain GenerationMode string, and the default stays Latest.
Rejected: shipping one "correct" algorithm (the trade-off is real); passing quantizer objects to the worker (functions can't cross postMessage).
Consequence: Worker options stay structured-clone-safe strings. Both modes are covered by golden hashes (D107).
Evidence: lib/pipeline/quantize.ts; lib/pipeline/pattern.worker.ts; tests/unit/quantize.spec.ts; HANDOVER.md D20 as of commit f7bb51c.
