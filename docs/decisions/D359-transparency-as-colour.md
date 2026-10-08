# D359 · Transparency as colour: a piece's empty stitches cover only when the switch is on, and it starts off
Date: 2026-10-08 · Goal: G-119 M1 · Status: active (superseded by: —)
Context: The Owner asked for a switch on the selection tools: on, a piece's empty stitches rewrite any colour; off, they leave the stitches beneath on a move or a turn. D037 had them always overwrite.
Decision: `FloatingSelection.emptyCovers` carries the switch; `stampsCell` is the one rule the merge, the full preview and the incremental preview read; the selection tools stamp the switch's current value onto the piece in hand. The switch starts Off.
Force: requirement — the Owner's instruction of 2026-10-08, and the Owner's answer that it starts Off.
Rejected: a parameter on every stamping function (each caller, the renderer included, would have to be handed the switch); applying it to backstitch (a piece never removed lines beneath it, either way).
Consequence: the place a piece was lifted from is emptied whatever the switch; a piece made outside the tools is transparent until a tool holds it.
Evidence: tests/unit/empty-as-colour.spec.ts; tests/e2e/transparency-as-colour.spec.ts; lib/editor/floating-selection.ts
