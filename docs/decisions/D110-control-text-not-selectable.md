# D110 · Text on controls is not selectable; text fields stay selectable
Date: 2026-09-13 · Goal: Owner request · Status: active (superseded by: —)
Context: Dragging on the canvas or double-clicking legend names and buttons selected the controls' text, which reads as a web page rather than an application. The Owner asked for UI text to be unselectable.
Decision: One global rule sets user-select: none on buttons, labels, selects, options, summaries, role=button, role=radio and draggable elements, and restores user-select: text on inputs and textareas.
Rejected: per-component Tailwind select-none classes (easy to miss on new controls); user-select: none on the whole body (would block copying the pattern name or error messages).
Consequence: New controls get the behavior automatically. Plain prose and notices stay selectable.
Evidence: app/globals.css
