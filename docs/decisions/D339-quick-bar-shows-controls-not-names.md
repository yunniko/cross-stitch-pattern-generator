# D339 · The quick bar shows controls, not names; committing controls sit in a slot after its track
Date: 2026-10-07 · Goal: G-118 M1 · Status: active (superseded by: —)
Context: the bar ran out of room for the tools' options at 1440 px and below; much of its width was words naming what the controls already show.
Decision: the tool's name, group headings and thread names leave the bar (kept as accessible names and hover titles); Region choices are pictures; Apply here, Cancel, Crop's pair and Deselect render through `PinnedEnd` into a slot after the scrolling track.
Force: requirement — Owner, 2026-10-07 ("Group names … should go completely", "Also tool name should go", "only about top bar"); the slot itself is judgment: the sticky end inside the track covered options.
Rejected: shorter words (still width, and the Owner asked for none); keeping the sticky end (it hid the wand's Region switches).
Consequence: a new bar control needs an accessible name and a title; panels and tabs keep their headings.
Evidence: tests/e2e/quick-bar-fit.spec.ts; app/components/pinned-end.tsx
