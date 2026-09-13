# D010 · Quality diagnostics and a tolerance-band regression suite; no debug-visualization UI
Date: 2026-09-09 · Goal: G-001 M8 · Status: active (superseded by: —)
Context: The spec asked for diagnostic metrics and a multi-canvas developer debug view.
Decision: Compute diagnostics (component counts and sizes, confetti ratio, boundary pairs, perimeter²/area compactness, reconstruction error, edge alignment). Assert them within tolerance bands on golden fixtures.
Rejected: a debug-visualization panel (aimed at algorithm developers, not chart users, and nobody requested it beyond the spec); a jaggy run-length metric (needs contour extraction, so compactness substitutes, coarsely); banding detection (no honest substitute, so not built).
Consequence: Every energy weight stays a named, overridable constant. Byte-identical golden hashes were added later for performance work (D107); they complement the bands.
Evidence: lib/experimental/diagnostics.ts; tests/unit/regression.spec.ts; HANDOVER.md D10 as of commit f7bb51c.
