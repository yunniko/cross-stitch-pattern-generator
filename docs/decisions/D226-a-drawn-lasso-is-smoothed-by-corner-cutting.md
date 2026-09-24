# D226 · A drawn lasso is smoothed by corner cutting, and short paths are left alone
Date: 2026-09-24 · Goal: G-072 M4 · Status: active (superseded by: —)
Context: the Owner asked for the whole freehand outline to be smoothed, not just the closing gap, allowing a straight close if curves proved expensive.
Decision: two passes of Chaikin's corner cutting over the closed path, for paths of 8 points or more; the live preview draws the smoothed shape too.
Force: requirement — measured. It costs **+0.5 ms** on the 200-point gesture a hand actually draws, and 59 ms against 18 ms on a 5,000-point lasso around a 1500-stitch chart. It runs once on release, not per frame, so the fallback the Owner allowed is not needed.
Rejected: a fitted curve (Catmull-Rom and kin bulge outside the drawn shape, selecting stitches never enclosed); smoothing only the closing gap (not what was asked); smoothing every path (under 8 points is deliberate placement).
Consequence: the drawn path is no longer exactly the selected boundary, so anything asserting cell-exact lasso geometry passes `smooth: false`. Cost is guarded by a bound in the spec below.
Evidence: tests/unit/lasso-smoothing.spec.ts; lib/editor/lasso.ts
