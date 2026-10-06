# D324 · The Zoom tool has a direction, and a right press zooms the other way
Date: 2026-10-06 · Goal: G-115 M2 · Status: active (superseded by: —)
Context: the Zoom tool only zoomed in on a click; zooming out needed Shift or Alt, and a right click did the same as a left one.
Decision: a Zoom option "Zoom direction" is In (default) or Out; a right press zooms the other way, and Shift or Alt still turn a press round, so a right press with Shift zooms the chosen way.
Force: requirement — the Owner's instruction of 2026-10-06; Shift and Alt are kept by judgment, since readers already use them.
Rejected: Shift changing the option itself (a held key should not change a saved setting).
Consequence: the pointer over the chart is the zoom-out cursor while the option is Out. The option is kept in the browser like other tool options.
Evidence: tests/e2e/zoom-direction.spec.ts
