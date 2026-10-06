# D304 · Feature states resolve person > tier > site, and the server refuses by name
Date: 2026-10-06 · Goal: G-102 M2 · Status: active (superseded by: —)
Context: the states live in Postgres (`FeatureState`, `UserFeature`, `FeatureSet`, `Tier.featureSetId`) and must reach the page and the two server-run requests.
Decision: `lib/features/server.ts` reads the three layers and `resolve.ts` merges them, the person's row over the tier's set over the site's; an explicit `on` lifts a lock. The tier's set counts while the subscription is live (`active`, `trialing`, `past_due`). The generate and export routes answer 403 with the feature's name to a request for one not usable; a setting at its "asks for nothing" value passes. A database fault means everything on.
Force: judgment — the order is the accepted plan's; failing open keeps the editor up.
Rejected: failing closed (a fault would lock everyone out of everything); checking in the processor (it knows no accounts).
Consequence: the interface never sends a refused request (`in-force.ts`); a 403 means a request made by hand. A row naming a feature that no longer exists is ignored.
Evidence: tests/unit/features-resolve.spec.ts; tests/e2e/features.spec.ts
