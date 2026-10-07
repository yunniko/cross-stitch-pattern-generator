# D353 · Limits are set per layer, not inside feature sets, and resolve as feature states do
Date: 2026-10-08 · Goal: G-108 M1 · Status: active (superseded by: —)
Context: The Owner asked for the space for saved charts to be set in the admin "for different tiers (guests, logged in, subscriptions, personal)". G-109 will add counted limits to the same list.
Decision: Each limit is an entry of `ACCOUNT_LIMITS`; its value is stored per layer (`SiteLimit`, `AudienceLimit`, `TierLimit`, `UserLimit`, null meaning unlimited, no row meaning the layer below) and resolved by the one `resolveLayers` that feature states use.
Force: judgment — the Owner named the layers; storing them directly, rather than in sets, is what the admin edits most plainly.
Rejected: limit values inside feature sets (one set shared by a tier and accounts would tie their limits together, and the admin edits a limit through a set); the unused `Tier.limits` JSON column (no place for the other layers; removed).
Consequence: a limit that cannot be read refuses the request (G-109 answer). A value for guests has no effect while every limited action needs an account.
Evidence: lib/limits/limits.ts; tests/unit/limits.spec.ts; tests/e2e/admin-limits.spec.ts
