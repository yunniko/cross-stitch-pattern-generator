# D213 · The editing bar's tool options scroll inside their own track
Date: 2026-09-23 · Goal: G-064 M2 · Status: active (superseded by: —)
Context: adding the Brush size and shape controls pushed the context bar 59px past its container at a 1440px window. `main` clips its overflow but is still scrollable, so focusing the Photo button scrolled the whole chart column sideways and left it there — the chart frame sat 59px off, with no way back.
Decision: the bar's tool options (colours, brush, file name, symmetry) live in one `min-w-0 flex-1 overflow-x-auto` track; the view controls after it are `shrink-0` and stay put.
Force: requirement — the bar keeps growing through G-064 (line, rectangle, oval), and any bar wider than the window reproduces the displacement.
Rejected: trimming controls until they fit (the next milestone re-breaks it); scrolling the whole bar (scrolls the view controls out of reach); letting `main` clip and lose the overflowing controls (unreachable at narrow widths).
Consequence: a control added to the bar goes inside the track unless it belongs to the view, and `main` must never become scrollable — `tests/e2e/navigation.spec.ts` asserts both.
Evidence: tests/e2e/navigation.spec.ts; app/components/context-bar.tsx; app/globals.css
