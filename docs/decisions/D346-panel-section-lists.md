# D346 · The account and admin areas draw their sidebars from declared section lists

Date: 2026-10-07 · Goal: G-107 M1 · Status: active (superseded by: —)
Context: both areas grow a page at a time, and each page needs a menu entry, an open-section mark and a guard.
Decision: each area declares its sections once (`lib/account/sections.ts`, `lib/admin/sections.ts`); one header and one `SectionNav` render them, and `sectionAt` picks the open one by the longest matching address.
Force: judgment — a new section becomes one entry, and only built sections are listed, so the menu cannot offer a page that does not exist.
Rejected: a sidebar written out in each layout (two copies to keep in step); listing planned sections as disabled entries (the Owner chose real sections only).
Consequence: Profile & sign-in stays at `/account`, where signing in lands and which the e2e helpers expect; new account sections go below it (`/account/<id>`).
Evidence: tests/unit/panel-sections.spec.ts; tests/e2e/panels.spec.ts
