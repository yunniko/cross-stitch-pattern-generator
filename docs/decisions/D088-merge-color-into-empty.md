# D088 · Dropping a color on the Empty row merges it into no-stitch
Date: 2026-09-12 · Goal: Owner request · Status: active (superseded by: —)
Context: The Owner asked to merge a color into Empty, emptying its stitches and removing it from the list.
Decision: Make the Empty legend row a drop target calling mergeColors with EMPTY_CELL as the target.
Rejected: a separate delete-to-empty function (mergeColors already passes EMPTY_CELL through, confirmed by new tests).
Consequence: mergeColors documents EMPTY_CELL as a valid target.
Evidence: lib/editor/pattern-edit.ts; tests/unit/pattern-edit.spec.ts; tests/e2e/keyboard-shortcuts.spec.ts; HANDOVER.md D88 as of commit f7bb51c.
