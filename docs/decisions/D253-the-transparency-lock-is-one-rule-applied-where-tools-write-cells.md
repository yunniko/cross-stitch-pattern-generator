# D253 · The transparency lock is one rule, applied where each tool writes its cells
Date: 2026-09-30 · Goal: G-079 M2 · Status: active (superseded by: —)
Context: the Owner wants a lock so drawing and filling cannot turn empty stitches into colour or the reverse, with selection, moving and dragging left alone, and Fill selected painting only non-empty stitches.
Decision: `flipsTransparency`/`lockTransparency` in `lib/editor/pattern-edit.ts` are the rule; the brush, the shape tools, Fill, double-click fill and Lasso fill apply it as they write cells (so live previews agree with the commit), and `fillSelection` takes an `onlyFilled` flag. A gesture the lock leaves with no change costs no undo step.
Force: requirement — Owner instruction, 2026-09-30.
Rejected: filtering every commit in `history.set` (a preview would show paint that then snaps back, and it would also restrict selection, move and paste, which the Owner excluded).
Consequence: a new drawing tool must apply the rule where it writes cells. Quick mirror, paste, duplicate, flip, rotate and crop stay unlocked, as selection and move are. The lock is a remembered browser option, not part of a chart file.
Evidence: tests/unit/transparency-lock.spec.ts; tests/e2e/small-fixes.spec.ts
