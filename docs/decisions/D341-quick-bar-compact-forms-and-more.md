# D341 · A compact group is one button opening its whole form; More holds what still does not fit
Date: 2026-10-07 · Goal: G-118 M2–M3 · Status: active (superseded by: —)
Context: `fitBar` (D340) needs a smaller form for each group and somewhere for the groups it moves off the bar.
Decision: a compact option is a button showing its current choice (named "Option: choice") that opens the full control under it; symmetry shows its active axis; BS edit's actions become pictures with mirror and turn folded into one menu, and Crop's labels become letters without the finished size; More lists moved groups whole, under their names.
Force: judgment — keeps every control one press away and its state visible without words on the bar (D339).
Rejected: dropping low-importance groups entirely (a setting would vanish with the window size); a native select per option (cannot show the pictures D339 asks for).
Consequence: a compact form must be the same component as the full one where it holds focusable input, so a change of form keeps the focus; a group that still does not fit scrolls inside the track (D213).
Evidence: app/components/fit-track.tsx; app/components/bar-menu.tsx; tests/e2e/quick-bar-fit.spec.ts
