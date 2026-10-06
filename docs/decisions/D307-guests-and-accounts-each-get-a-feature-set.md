# D307 · Guests and signed-in accounts each get a feature set
Date: 2026-10-06 · Goal: G-102 · Status: active (superseded by: —)
Context: the site's states applied to guests and accounts alike; the plan had assumed visitors follow the site (open question 1).
Decision: an `AudienceSet` row gives every guest, or every signed-in account, one feature set, chosen under "Guests and accounts" on the Features page. It sits between the site and a tier: person > tier's set > guests' or accounts' set > site. A set given to either cannot be deleted.
Force: requirement — Owner, 2026-10-06: "set up features for guests and logged in users".
Rejected: a third switch per feature beside the site's (two parallel lists to keep in step, where sets already exist); putting accounts above the tier (a tier must be able to give more than every account has).
Consequence: what a guest sees is the site's states overlaid by the guests' set; a change reaches open editors within the refresh time (D306). Changes are logged with scope AUDIENCE.
Evidence: tests/unit/features-resolve.spec.ts; tests/e2e/admin-features.spec.ts
