# D340 · The quick bar fits by compacting the least important group first, then moving groups to More
Date: 2026-10-07 · Goal: G-118 M1b · Status: active (superseded by: —)
Context: at 1024–1440 px some tools' options do not fit the bar (`docs/reviews/2026-10-07-quick-bar-fit.md`); something must decide what gives way.
Decision: `fitBar` in `lib/editor/bar-fit.ts`: every group whole; else compact by rising importance (later group first among equals); else move to More the same way; then restore whole forms while they fit. Groups keep their order.
Force: judgment — the order (the tool's controls for what it holds last, then its options, colours, symmetry and lock) was proposed in the accepted plan and the Owner left it standing.
Rejected: wrapping to two rows (changed the bar's height and moved the chart, G-116 M4); one fixed per-width layout per tool (every new option would need four edits).
Consequence: a group declares its importance and, when it has one, a compact form; the bar measures and asks `fitBar`, never decides itself.
Evidence: tests/unit/bar-fit.spec.ts; lib/editor/bar-fit.ts
