# D043 · Boundary energy uses an 8-neighbor stencil with 1/√2 diagonal weights
Date: 2026-09-11 · Goal: G-022 M2 · Status: active (superseded by: —)
Context: With 4-neighbor Potts energy a diagonal boundary costs about 41 % more per length, biasing shapes toward axis-aligned edges.
Decision: Weight diagonal pairs by 1/√2 and normalize by 1/(1+√2), so axis-aligned boundaries cost what they did before. Multiply the whole clamped pair potential by the weight, in every optimizer and in component recoloring.
Rejected: a 16-neighbor Cauchy–Crofton stencil (residual bias about 2.8 % instead of 8.2 % at 22.5°, but roughly twice the cost again); weighting only the smoothness term (shifts the zero-cost crossover, repeating D011's double discount).
Consequence: ICM stays exact on one global energy, which an exhaustive 3×3 test checks. Region labeling stays 4-connected. Compactness uses a weighted perimeter. Optimization became about 2× slower until D107.
Evidence: lib/pipeline/energy.ts; tests/unit/energy.spec.ts; tests/unit/shape-regression.spec.ts; HANDOVER.md D43 as of commit f7bb51c.
