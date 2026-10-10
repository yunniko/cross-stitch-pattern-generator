# D403 · A repeated try is the kept one; the current try follows the choice
Date: 2026-10-10 · Goal: G-133 M1 · Status: active (superseded by: —)
Context: the current try was the newest whose chart equalled the chart on screen, so of two equal-chart tries the older could never be marked or chosen (Owner, 2026-10-10).
Decision: a Generate whose chart and settings equal a kept try adds nothing and marks that try; the current try is the one last chosen or made while the chart is still its chart, else the newest equal one.
Force: requirement — the Owner asked that tries be "or selectable or not duplicate"; both together cover a same chart from different settings, whose settings still differ.
Rejected: dropping every same-chart try (would lose settings that differ); keeping duplicates and only tracking the choice (the strip fills with identical tries).
Consequence: settings compare by value, key order ignored; a try's recentSince moves when it is made again, and a pinned one stays pinned.
Evidence: tests/unit/tries.spec.ts; tests/e2e/tries.spec.ts