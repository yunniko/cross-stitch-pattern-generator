# D168 · Paginated export deadlines grow with the page count
Date: 2026-09-19 · Goal: G-046 M2 · Status: active (superseded by: —)
Context: A4 and PDF exports render page by page, yet shared one fixed 150 s allowance. On the host a 1000-stitch A4 export took 127.7 s of it and a 1500-stitch one needed 268.5 s — about 0.8 s a page, over 152 and 336 pages.
Decision: a paginated export may run 60 s plus 2 s per A4 grid page, and Export all 150 s plus that share for each of its three paginated sets; neither falls below the fixed allowance it replaced. The pool counts the pages when it accepts the job.
Force: requirement — the host measurements above, and the Owner's instruction of 2026-09-19 to bring this into M2.
Rejected: a larger fixed number, which only moves the size that fails; no deadline for paginated work, which lets a wedged job hold one of three workers indefinitely.
Consequence: 2 s a page leaves about 1.7× the busy-host estimate (1.4× slower, 15 % more for three jobs at once) at both measured sizes. Re-measure before changing either number.
Evidence: tests/unit/processor-export-deadlines.spec.ts; docs/reviews/2026-09-18-larger-canvas-walls.md
