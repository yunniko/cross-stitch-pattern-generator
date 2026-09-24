# D220 · Latest-value refs update before paint, not after
Date: 2026-09-24 · Goal: G-067 follow-up · Status: active (superseded by: —)
Context: two e2e tests failed intermittently, and both were keyboard tests. The cause was not the suite: `useLatest` and the keyboard hook's context ref refreshed in a passive `useEffect`, which runs *after* paint. A key pressed in that window is read against the previous render — for a chart that had just appeared, `hasPattern` was still false, so the keystroke was silently dropped.
Decision: both refs refresh in `useLayoutEffect`, which runs before paint, so any input a person could have sent in response to a frame is read against the state that produced it.
Force: requirement — a measured input-dropping race, not a preference. 2 failures in 15 runs before; 0 in 45 after, plus 80 keyboard-spec runs clean.
Rejected: raising the test's timeout (hides a real dropped keystroke); writing the ref during render (React discourages it, and the layout effect closes the same window).
Consequence: anything mirroring state into a ref for an event handler uses `useLatest` or a layout effect. A passive effect is wrong for state a handler reads, however harmless it looks.
Evidence: app/hooks/use-latest.ts; app/hooks/use-keyboard-shortcuts.ts; tests/e2e/viewport-canvas.spec.ts
