# D333 · The selection's actions live in a Selection tab; Apply here and Cancel stay on the bar too
Date: 2026-10-07 · Goal: G-116 M4 · Status: active (superseded by: —)
Context: with the Magic wand's switches added, the quick bar needed 1574 px against a 924 px track at 1440 px, so every selection action was out of sight (`docs/qa-review/qa-review-2026-10-07-g116.md`).
Decision: Select, Lasso and the Magic wand declare one tab, "Selection" (D296's tool tab), holding every action in themed groups; the bar keeps the mode switch and the Apply here / Cancel pair. Both are drawn from one declaration in `app/components/selection-actions.tsx`.
Force: requirement — Owner, 2026-10-07: "move selection operations to the right panel; group them by themes … apply and cancel should be on top bar and right panel both … for all selection tools".
Rejected: a wrapping bar (its height changed with the tool and moved the chart); actions floating over the canvas (covers the chart).
Consequence: specs reach the actions through `tests/e2e/helpers/selection.ts`; a new selection action is added to the groups in `selection-actions.tsx`, never to the bar.
Evidence: tests/e2e/selection-modes.spec.ts; tests/e2e/helpers/selection.ts
