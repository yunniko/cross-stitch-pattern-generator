# D235 · Each section of the thread list lights its own layer
Date: 2026-09-25 · Goal: G-073 · Status: active (superseded by: —)
Context: M4 gave the backstitch section a light, but both sections shared one set of lit threads, so lighting a thread's backstitch lit its stitches too.
Decision: two sets. The cross row's eye lights a thread's **stitches**, the backstitch row's lights its **lines**, and a thread used for both has an eye in each. Isolate dims what is not lit in **both** layers as soon as anything is lit anywhere.
Force: requirement — the Owner asked that highlighting backstitch highlight only that colour's backstitch (2026-09-25).
Rejected: one set with the backstitch row merely reading it (the ask); letting an empty backstitch set mean "leave all lines bright" — the first version did that, and lighting a thread's stitches then left every outline at full strength over a dimmed chart, which its own test caught.
Consequence: lighting a thread's stitches no longer brings its outline up with it; to see both, light both rows. `litColorIndices` and `litBackstitchIndices` travel together through the renderer, and Isolate goes out only when both are empty.
Evidence: tests/e2e/backstitch-threads.spec.ts
