# D321 · The status bar names the colour the Picker would take
Date: 2026-10-06 · Goal: G-110 (at the Owner's live review) · Status: active (superseded by: —)
Context: the Owner asked for the hovered colour's name and swatch beside the pointer's stitch numbers.
Decision: the readout shows the result of `colorAt`, the Picker's own lookup: a backstitch line's thread with the pointer on the line, else the stitch, an empty stitch as "Empty (no stitch)".
Force: judgment — the request names the colour under the pointer; reusing the Picker's lookup makes the readout say what a press would take.
Rejected: the cell's stitch only (would disagree with the Picker over a line); a React state per move (re-renders on every pointer move, against G-078's direct writes).
Consequence: a change to what the Picker takes changes the readout with it. The readout is read again on an edit under a still pointer.
Evidence: tests/e2e/color-picker.spec.ts; tests/unit/pick-color.spec.ts
