# D044 · Per-pair color structure-tensor edge evidence replaces per-cell max(importance)
Date: 2026-09-11 · Goal: G-022 M3 · Status: active (superseded by: —)
Context: A per-cell scalar edge score is luminance-only and undirected. It misses same-luminance hue boundaries and gentle shading, and a strong edge anywhere protects every side of a cell.
Decision: For each canonical cell pair, project box-blurred (radius 2) OKLab derivatives onto the pair direction over a window at the pair's midpoint, then map through 1 − exp(−s/2τ²) with τ = 0.01. Store 4 slots per cell and resolve direction with a precomputed lookup table.
Rejected: a grayscale directional gradient (blind to isoluminant hue edges); fusing with endpoint OKLab difference (correlated signals, D011-style drift); differentiating unblurred channels (noise bias survives averaging; confetti rose to 0.309); closure-based slot lookup (3× slower).
Consequence: Per-cell importance still gates protection thresholds. Omitting pair evidence reproduces the old behavior. D107 later cached derivatives per row, byte-identically.
Evidence: lib/pipeline/pair-edge-evidence.ts; tests/unit/pair-edge-evidence.spec.ts; HANDOVER.md D44 as of commit f7bb51c.
