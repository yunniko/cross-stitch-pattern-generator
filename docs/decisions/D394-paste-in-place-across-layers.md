# D394 · A cut piece, or a copy taken to another layer, is pasted in place
Date: 2026-10-10 · Goal: none (Owner request: Cut, paste onto the active layer) · Status: active (superseded by: —)
Context: the Owner asked for Cut and for Paste to land on the layer being worked on; a paste used to arrive offset beside the original, which suits a copy beside itself but not stitches carried between layers.
Decision: Paste puts the piece onto the active layer; a cut piece, or a copy pasted on a layer other than the one it was taken from, arrives where it was taken from; a copy pasted on its own layer arrives offset, as Duplicate does.
Force: judgment — the in-place half follows from moving stitches between layers without shifting them; the offset is kept so a copy is not hidden under its original.
Rejected: always in place (a same-layer paste vanishes under the original); always offset (a layer move would shift the stitches).
Consequence: the clipboard remembers the layer it came from and whether it was cut (pp/tools/select.tsx, pastedPiece).
Evidence: tests/unit/selection-cut.spec.ts; tests/e2e/selection-cut.spec.ts