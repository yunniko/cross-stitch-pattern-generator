# D080 · Export controls sit in the top bar as pills, with the label kept as an accessible name
Date: 2026-09-12 · Goal: G-027 follow-up · Status: active (superseded by: —)
Context: The Owner asked to drop the visible Export label, restyle the dropdown to the page design, and move the controls next to Open pattern and Resize canvas.
Decision: Place the dropdown, Export and Export all after Resize canvas behind a thin divider, styled as rounded-full pills. The select carries aria-label="Export". Export notices become strips under the header, and the footer is removed.
Rejected: removing the accessible name with the visible label (breaks screen readers and getByLabel tests); a rectangular settings-style select in a pill toolbar.
Consequence: Tests locate controls by role and accessible name, which restyles must preserve.
Evidence: app/components/top-bar.tsx; app/components/panels.tsx; tests/e2e/generate-pattern.spec.ts; HANDOVER.md D80 as of commit f7bb51c.
