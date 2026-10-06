# D322 · Fill finds its region by colour and stitch type, with two switches; the double-press fill is gone
Date: 2026-10-06 · Goal: G-115 M1 · Status: active (superseded by: —)
Context: Fill spread from whole stitches into half stitches of the same colour, and the Brush's double press filled a region by accident.
Decision: a Fill region is the touching stitches of the pressed one's colour and stitch type; "Color only" fills by colour alone and keeps each stitch's type; "Diagonal neighbours" off joins only edge neighbours; the Brush's double press and its preference are removed.
Force: requirement — the Owner's instructions of 2026-10-06.
Rejected: keeping the double press as an option (the Owner asked for it and its option to go); colour only also setting the type (it would no longer be colour only).
Consequence: defaults (colour and type, diagonal on) fill a chart of whole stitches as before. An empty stitch is whole, so it joins only whole empty stitches. Drop-to-fill is unchanged: 4-connected, by colour.
Evidence: tests/unit/stitch-kind.spec.ts; tests/e2e/fill-rules.spec.ts
