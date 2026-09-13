# D030 · Scrollable centered containers use grid centering; wheel zoom uses a native non-passive listener
Date: 2026-09-10 · Goal: G-012 follow-up · Status: active (superseded by: —)
Context: The Owner reported that after zooming in you couldn't pan to the top. Wheel zoom also scrolled the container at the same time.
Decision: Center the zoomed canvas with CSS grid place-items-center. Attach the wheel handler with addEventListener("wheel", fn, { passive: false }) in an effect.
Rejected: flex items-center justify-center on an overflow-auto container (unsafe centering makes the start edge unreachable); React's onWheel prop (attached passively, so preventDefault is ignored).
Consequence: Pan/zoom e2e tests must scroll to the true (0, 0) edge and use trusted page.mouse.wheel input, not just check that something changed.
Evidence: tests/e2e/navigation.spec.ts; app/hooks/use-pan-zoom.ts; HANDOVER.md D30 as of commit f7bb51c.
