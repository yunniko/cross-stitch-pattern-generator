# D154 · Export all gets a fifteen-minute deadline
Date: 2026-09-18 · Goal: G-034 M5 · Status: active (superseded by: —)
Context: Export all renders nine files for one chart, four of them paginated. At 1000 stitches it took 149 s and produced 81.8 MB, so the 150 s allowance killed it by a hair — a case that worked in the browser, where nothing imposed a deadline.
Decision: `exportAllDeadlineMs` rises from 150 s to 900 s, and the goal's 150 s acceptance figure for the bundle is withdrawn (Owner, 2026-09-18).
Rejected: refusing an oversized bundle up front, which fails fast and protects the pool but drops the feature at large sizes; dropping the A4 kinds, which are the dominant cost but also what the bundle is mostly for; optimising paginated rendering first, which is a milestone of its own.
Consequence: one bundle can hold a worker for up to fifteen minutes of the pool's three, so concurrent use can starve the queue. Its stream stays open only because the processor sends a keepalive every 15 s; the clients must keep skipping those comment frames.
Evidence: tests/unit/processor-export-deadlines.spec.ts; GOALS.md G-034 progress log, 2026-09-18
