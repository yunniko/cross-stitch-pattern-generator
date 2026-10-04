# D282 · Replacing the open chart is one table of ways in and resets
Date: 2026-10-04 · Goal: G-091 M1 · Status: active (superseded by: —)
Context: eight workspace functions each restated what to reset when the chart is replaced, and the lists had drifted.
Decision: `lib/editor/document-replace.ts` holds one row per way in (photo, open, blank, pixel art, first generate, regenerate, discard) and `document-replace-run.ts` carries a row out through effects the shell supplies.
Force: judgment — the growth-readiness review found the duplication; D217 is the kind of defect it produces. The rows record the behaviour as it was, differences included.
Rejected: a React context (hides the data flow from component tests); fixing the differences while moving them (a refactor that also changes behaviour cannot be checked by an unchanged suite).
Consequence: new state that a new chart must reset is one effect and one column, not eight edits. Known differences left in place are listed in the goal log for the Owner.
Evidence: tests/unit/document-replace.spec.ts
