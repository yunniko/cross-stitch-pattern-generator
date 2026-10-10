# D405 · The account area opens on Charts at `/account`; Profile & sign-in moves to `/account/profile`
Date: 2026-10-10 · Goal: G-133 M4 · Status: active (superseded by: —)
Context: the Owner asked for Charts to be the account's main page (2026-10-10); `/account` was Profile, where signing in and every account link land (D346).
Decision: Charts is served at `/account` and is first in the sidebar; Profile & sign-in is `/account/profile`; `/account/charts` sends to `/account`.
Force: requirement — the Owner's instruction of 2026-10-10.
Rejected: sending `/account` on to `/account/charts` (a second hop on every sign-in, and two addresses for one page); changing every link to `/account/charts` (sign-in, confirmation, both headers and the editor's badge would each need it).
Consequence: every link to the account keeps landing on Charts with no change; a test that needs Profile goes to `/account/profile` (`deleteOwnAccount` in the e2e helpers).
Evidence: tests/unit/panel-sections.spec.ts; tests/e2e/panels.spec.ts; tests/e2e/account-charts.spec.ts