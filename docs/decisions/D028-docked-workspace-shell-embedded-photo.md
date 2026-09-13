# D028 · One docked workspace with a single undo history; saved files embed the source photo
Date: 2026-09-10 · Goal: G-012 · Status: partly superseded (superseded by: D109 for the resize fill color)
Context: The Owner asked for an application-like workspace instead of separate upload and editor pages.
Decision: The workspace owns one undo history covering Regenerate and every edit. Patterns carry an optional sourceImage, saved in the file, so Move, Regenerate and the photo underlay survive reopening. Move is a cyclic shift. Zoom re-renders within a canvas budget. EMPTY_CELL is the sentinel 255, never a palette entry. Resize fills with a user-picked real color.
Rejected: stripping the photo from saves (Owner chose capability over file size; ask before changing); CSS-scaled zoom (symbols never become legible); Highlight in the realistic preview (a separate async render path).
Consequence: Every function touching cellPalette must pass EMPTY_CELL through. E2E tests use a 1440×900 viewport and scope canvas locators to main.
Evidence: app/workspace.tsx; lib/editor/pattern-edit.ts; tests/e2e/empty-stitch.spec.ts; HANDOVER.md D28 as of commit f7bb51c.
