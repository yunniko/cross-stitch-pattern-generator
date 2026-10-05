# D295 · The interface is drawn from named colours, one icon set and an arrangement of tools
Date: 2026-10-05 · Goal: G-095 M2 · Status: active (superseded by: —)
Context: the Owner wants skins later; 34 colours and 22 icons were written into components.
Decision: every colour is a named value of `app/globals.css` listed in `lib/skin/skin.ts`; every icon comes from `app/skin/icons.tsx` or is supplied by its tool and may be replaced by the skin; the order and grouping of tools is `arrangeTools`. `scripts/check-skin.mjs` fails CI on a colour or icon written in place.
Force: requirement — Owner, 2026-10-05: add the three skin-readiness rules; a tool supplies its icon and a skin can replace it; only official skins so far.
Rejected: choosing between skins now (not asked for); a skin as a data file (its icons are components); naming the colours drawn on the chart (they must read on any chart).
Consequence: a new colour is added to the stylesheet and to `SKIN_COLOURS` together (a test compares them); a new icon goes into the set. One skin is shipped.
Evidence: tests/unit/skin.spec.ts; tests/unit/fixtures/paper-skin.ts; scripts/check-skin.mjs
