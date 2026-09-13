# D055 · Contour refinement is not adopted: it fragments real photos without improving real shapes
Date: 2026-09-11 · Goal: G-022 M5.6 · Status: active (superseded by: —)
Context: A broad sweep compared contourRefinement off and on across golden fixtures, both quantizers, shape fixtures and detail fixtures.
Decision: Keep contourRefinement opt-in and off, with no UI control, and lock the negative result into a regression test.
Rejected: enabling it by default (confetti rose up to 15× on golden fixtures while close-color IoU gained at most 0.0006); raising discrepancyThreshold to 0.7 (removes the regression and the intended benefit together); the planned three-way comparison (only one mechanism was built).
Consequence: A self-referential window can't separate systematic mis-pacing from ordinary photo noise. Any retry should smooth the discrepancy signal first or score whole chain segments. The module moved to lib/experimental/ in G-031 M4.
Evidence: tests/unit/contour-refinement.spec.ts; lib/experimental/contour-refinement.ts; HANDOVER.md D55 as of commit f7bb51c.
