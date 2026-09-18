# D167 · The start screen's accent is a selection, not decoration
Date: 2026-09-18 · Goal: G-045 · Status: active (superseded by: —)
Context: 1b draws the photo card accented and badged "01", and keeps it accented while the empty-grid card is open — so two cards read as chosen at once, and one of three equal ways in is numbered as though it came first.
Decision: the badge is removed, and the accent border, wash and icon mark whichever way in is currently chosen: the photo card by default, the empty-grid card while its settings are open. Choosing the photo or the saved-pattern card closes the grid card, so the mark is never on two cards. The Owner's call, 2026-09-18, against the running screen.
Rejected: keeping "01" as a step number, which numbers one of three equal choices; leaving the photo card accented while the grid card is open, which shows two selections and makes the accent meaningless.
Consequence: the accent on these cards is state, so a fourth card would take part in that state rather than painting itself accented. This extends the deliberate departures listed in D161 and D166.
Evidence: app/components/first-run.tsx; tests/e2e/new-chart.spec.ts
