# D018 · K-means merges redundant colors and reinvests freed slots in the worst-represented cell
Date: 2026-09-09 · Goal: G-004 · Status: active (superseded by: —)
Context: A gray cat with yellow eyes got only grays at low color counts. Minimizing population-weighted SSE splits large shaded areas before isolating a small, distant color.
Decision: Run plain k-means, merge colors closer than REINVEST_MERGE_THRESHOLD (0.012), give each freed slot to the currently worst-fit cell (Linde–Buzo–Gray splitting), then run a final Lloyd pass.
Rejected: an OKLab hue/lightness seeding lattice (deployed, then reverted the same day after the Owner's real photo regressed); over-clustering then diversity reselection (scale-dependent, or up to 4× more confetti); lightness-dependent space compression (worse on every fixture, including the target case).
Consequence: An image with no redundant colors takes exactly the old code path. Changes are measured at several scales and on the full regression fixture set, not only the motivating case.
Evidence: lib/pipeline/quantize.ts; tests/unit/quantize.spec.ts; HANDOVER.md D18 as of commit f7bb51c.
