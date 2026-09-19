# D177 · k-means works on the OKLab buffer and skips provably unchanged assignments
Date: 2026-09-19 · Goal: G-047 M5 · Status: active (superseded by: —)
Context: Standard's k-means rebuilt 2.7 M OKLab tuples twice per generation at 2000 stitches and scanned all 64 centroids for every point on every Lloyd pass; assignment was its largest stage.
Decision: the quantizers pass the interleaved OKLab buffer through, and Lloyd keeps Hamerly's bounds, shrinking a point's lower bound by the largest move among other centroids and testing half the gap to its centroid's nearest neighbour; a point is scanned unless both bounds prove every other centroid farther by a 1e-9 margin.
Force: judgment — assignments and centroids bit-identical, 83–93 % of points skip their scan after the first pass, and the tuple arrays were most of Standard's memory.
Rejected: plain Hamerly with one shared lower-bound decay (only 1–62 % skipped in the 2–3 passes Lloyd needs, no net gain); Elkan's per-centroid bounds (a bound per point and centroid, 1.3 GB at 2000 stitches).
Consequence: the skip never decides a tie; any tie goes to the full scan's first-minimum rule. The tuple-taking `runLloyd` and `injectWorstFitClusters` remain as wrappers.
Evidence: tests/unit/kmeans-bounds.spec.ts; tests/unit/m5-equivalence.spec.ts; tests/unit/golden-hashes.spec.ts
