# D306 · The browser asks for its feature states again when they expire
Date: 2026-10-06 · Goal: G-102 · Status: active (superseded by: —)
Context: the states travelled with the page alone, so an admin's change reached an open editor only on its next load (G-102 QA note 4).
Decision: the page is given the states and a time, `FEATURES_REFRESH_SECONDS` on the server (300 when unset, held between 5 seconds and a day; `lib/features/refresh.ts`). The browser asks `GET /api/features` again on that timer while the tab is in view, and at once when the tab returns after that time. A failed ask keeps what is held; an unchanged reply changes nothing on screen.
Force: requirement — Owner, 2026-10-06: "set timeout when the feature list in browser expired and gets asked again".
Rejected: a push from the server (a socket for a change made a few times a month); asking on every action (a request per press).
Consequence: a change reaches everyone within the time set, plus a tab's absence. A tool that becomes locked in hand gives way to the first usable one. The suite's servers use 5 seconds.
Evidence: tests/unit/features-refresh.spec.ts; tests/e2e/features.spec.ts
