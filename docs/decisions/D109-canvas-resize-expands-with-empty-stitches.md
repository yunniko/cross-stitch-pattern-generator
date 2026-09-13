# D109 · Canvas resize expands with empty stitches, never a new color
Date: 2026-09-13 · Goal: Owner request · Status: active (superseded by: —)
Context: Resize asked for a fill color and added it to the palette when new. That added a non-thread color to DMC, Cosmo and Anchor patterns and could hit MAX_COLORS. The Owner asked to remove the color and leave new cells empty.
Decision: resizeCanvas takes only the edge deltas. Newly exposed cells are EMPTY_CELL and the palette is unchanged.
Rejected: keeping the picker with empty as the default (the Owner asked to remove it); a thread-only picker for brand patterns (still adds colors nobody asked for).
Consequence: Resize can't fail on the color cap. Users fill new space with the brush or fill tool. Supersedes D028's user-picked fill color.
Evidence: lib/editor/pattern-edit.ts; tests/unit/pattern-edit.spec.ts; tests/e2e/resize-canvas.spec.ts
