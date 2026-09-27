# D243 · The sliders are provisional until a Generate
Date: 2026-09-27 · Goal: G-074 M6 · Status: active (superseded by: —)
Context: D241 made the photo views draw the photo the chart was made from, which left the sliders inert once a chart existed: moving one changed nothing until Generate (Owner).
Decision: on the Photo tab with a photo view up, that view follows the sliders as they move; leaving the tab or the view without generating puts the sliders back to the chart's own. Elsewhere a photo view shows what the chart was made from.
Force: requirement — the Owner asked for both. Without the first the sliders are dead after Generate; without the second a chart sits beside sliders that did not make it.
Rejected: committing a slider move without a Generate (the chart would stop matching its record); letting it stand beside a chart made without it.
Consequence: `slidersToRestore` decides, answering null for a chart with no photo — those sliders belong to the next photo loaded. `photoKey` is gone: a photo view matches a photo to a chart by file alone, since keying it by the sliders made the photo vanish mid-drag.
Evidence: tests/unit/photo-adjust-session.spec.ts; tests/e2e/photo-sliders-generate.spec.ts
