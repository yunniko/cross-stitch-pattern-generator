# D081 · The root declares color-scheme: light dark so native controls follow the theme
Date: 2026-09-12 · Goal: Owner report · Status: active (superseded by: —)
Context: In dark mode, native select options turned white on white on hover. The page styled text light while the browser drew the popup light.
Decision: Set color-scheme: light dark on :root.
Rejected: styling option elements directly (native popups ignore most CSS, inconsistently across browsers).
Consequence: Native popups can't be screenshotted, so this is verified through the computed colorScheme value.
Evidence: app/globals.css; HANDOVER.md D81 as of commit f7bb51c.
