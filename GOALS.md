# Goals — cross-stitch-pattern-generator

Template, numbering, and cross-project conventions live in
`E:\CLAUDE\COMPANY\GOALS.md`. This is a **standalone project** (Owner
decision, 2026-09-09) — not a svc-lab service. Deployed
live at the Owner's direct instruction after M9 (see progress log below)
to `cross-stitch.craftodejnice.cz`; see
`docs/decisions/D013-deployed-to-cross-stitch-craftodejnice.md`, the deploy
log in `HANDOVER.md` and `COMPANY/INFRASTRUCTURE_DEPLOY.md`. Standard
OPERATIONS.md milestone check-in gates apply (not waived, unlike
svc-lab). Completed goals live in `docs/goals-archive.md`.

## Small changes (fast lane, D280)

One line per change; deployed in batches, each batch after one full-suite run.

- 2026-10-08 -- **Change (Owner: make the stamp preview fill almost all of its square).** The preview is one pixel a stitch and was only capped in size, so it showed as a speck; `StampPreview` (`app/components/stamp-face.tsx`) now scales it to fill the square at its own proportions with a 6 px margin, in the account's Stamps and the gallery alike. Checked by `stamps-save.spec.ts` (the preview over 85 % of the square's width).
- 2026-10-06 -- **Fix (Owner: Generation features did not switch in feature sets, "That is not a feature id.").** The admin's server actions accepted lowercase ids only, so every Generation feature but Vivid (`generation.edgeMode`, `ditherMode`, `paletteSet`...) was refused, in sets, for the site and for a person alike. The shape is now `isFeatureIdShape` in `lib/features/features.ts` (either case), and a unit test holds every id in the feature list to it; D305 corrected. Verified: unit 1,182 (1 new); the tier spec now locks `generation.edgeMode` in a set and finds it kept after a reload; full suite 591 pass plus 11 alone, 0 failed, 1 flaky (the fonts, as before). Missed by G-102's specs, which wrote Generation states straight to the database.
- 2026-10-05 -- The keys the Owner agreed and the brush options (D288): S Select, V Move, H Pan, Z Zoom; Ctrl+C, Ctrl+V, Ctrl+D for the piece or backstitch in hand; Ctrl+K opens and closes the command list; brush size and shape shown only with Brush, Line, Rectangle and Oval. Verified: unit 1,048, 4 new browser cases, full suite 558 passed. Ctrl+C and Ctrl+V are pinned by unit tests on the key table; the browser case presses Ctrl+D and reads Paste from the list.
- 2026-10-04 -- The new-chart confirmation has a one-press safe choice, "Export, then start new" (Owner): it downloads the editable file and goes on, and keeps the chart if the file could not be made. Undoable new charts and a kept previous chart are left for later (draft G-097). Verified: one new e2e case, the affected specs, full suite.
- 2026-10-04 -- A new chart opens in the Color view whatever view the last one was left in (Owner, after the G-091 QA pass; D283 updated). Verified: unit rows, one new e2e case, full suite.
- 2026-10-04 -- QA findings 7 and 8, the behaviour chosen by the Owner: choosing another palette mode with colours chosen asks first ("Switch and empty" / "Keep"); Escape in a Crop number puts that number back, a second Escape the whole frame. Verified: affected specs 27 of 27, one new case and one extended.
- 2026-10-04 -- **QA batch** (findings of `docs/qa-review/qa-review-2026-10-04-changed.md`): the custom size is typed freely and limited and rounded on leaving the field (1, 10); the Crop frame waits through a looking-only view and survives choosing Crop again (2, 9); a loaded palette brings its palette mode (3); Fill with predicted colours waits for the current recommendation (4); Crop's Apply and Cancel stay in view in a narrow window (5); Apply waits for unusable text (6); a chart with no colours has no palette to export (11); palette file names keep any script (12); wording, newer-version refusal, duplicates counted once (13); recommendations at once 2 to 4 (processor). Findings 3, 4 and 11 and the processor constant are outside the fast lane's limits and went through the full suite before the deploy. Verified: 255 related unit tests, 10 new e2e cases, two old size specs rewritten for the new behaviour, full suite 540 passed, 0 failed.

## Active goals

**Architecture fit (review of every draft, 2026-10-06; Owner: "ensure they will be implemented fitting to that architecture").** Each draft below carries an **Architecture fit** entry. It is a constraint on that goal's plan, compelled by `docs/architecture.md` (sections 1 to 3, enforced as section 5 says) and by that instruction: the plan names the registry, contract or module each part goes through, and a plan that has to depart from the entry says why in a decision file. **To settle** lists what the review found that only the Owner can answer; it is asked when the goal is planned, never guessed. What the entries say about the code was read on 2026-10-06 at a69dcf5.

**Sequence the review suggests (2026-10-06, written down at the Owner's word; a judgment, the Owner's to change).** Two tracks, because the drafts fall into two groups that barely touch: the editor, which needs nothing from outside, and accounts, where most steps wait on something of the Owner's. When a step of one track waits, work goes on in the other. The prerequisites the review found missing are drafted as G-111, G-113 and G-114 (Owner, 2026-10-06: "draft prerequisites as goals").

Editor track:

1. **G-105** (versions and notes): first, because it is small and from then on every release has a number and notes; done later, everything below ships without them.
2. **G-103** (workspaces as features): it gives the server one list of which request belongs to which workspace, the same requests G-109 limits (the parent relation first named here was replaced in G-103's planning), and removes the "Photo is always there" assumptions from the code the next two build on.
3. **G-110** (the view as switches) and **G-104** (colour picker), in either order: neither needs the other. G-110 first only because it works in the file G-103 has just changed.
4. **G-100** (dithering): independent of the rest, so it can move anywhere. Placed here because its preview request joins G-109's list if that exists by then.
5. **G-112** (the user guide): once 2 to 4 have changed what it pictures. From then on its check keeps it current, so it need not wait for the account track.

Account track:

1. **G-107** (admin and account pages): first, since every later step adds a page, and adds it as an entry in the lists this goal makes. Waits on: mock-ups with the Owner.
2. **G-113** (email): before anything makes an account necessary or worth something. Waits on: the sender's domain; built against the stand-in meanwhile.
3. **G-109** (limits): after G-103 and G-113. It makes generating and exporting need an account, so an account must be recoverable first. Waits on: the values and periods.
4. **G-114** (backups): before the database holds anything a person cannot make again. The schedule on the host and the proven restore wait on nothing; the copy off the host waits on the Owner.
5. **G-108** (saved charts), in two parts if the Owner agrees: saving and reopening (private and unlisted) first; the public gallery with **G-111**'s moderation second, since only the gallery waits on the shape of moderation and on advice about hosting other people's content.
6. **G-106** (subscriptions), split on 2026-10-08 into G-106 (core), G-126 (payment failures), G-127 (admin) and G-128 (ready to sell): last. It prices tiers against limits (G-109), takes money against a confirmed address (G-113), must say what happens to saved charts (G-108), and waits on the most from outside (the Stripe account, terms, VAT).

Outside both: G-111's comments follow G-112; G-097 comes after G-108, whose chart store it uses; G-101 after G-104 and G-110, since it must show a control for every key they add; G-030 stays unplanned.

**Worked one at a time**, the two tracks interleaved so that the Owner's answers are asked for early and the editor work fills the waits: G-105, G-103, G-110, G-104, G-107, G-113, G-109, G-100, G-114, G-108 (saving), G-112, G-108 (gallery) with G-111, G-106; then G-097 and G-101.

**The shortest road to selling**, if that becomes the aim: G-103, G-107, G-113, G-109, G-106, G-126, G-127, G-128. Saved charts, the gallery, the guide and the editor goals can all follow it; tiers would then differ by features and limits only, and G-106's "what happens to saved charts" has nothing to decide until G-108.

### G-133 · Locked layers, every try selectable, and the tries strip without its Edit shortcut — ACTIVE (accepted 2026-10-10)
- **What:** three fixes the Owner asked for on 2026-10-10. (a) A layer can be locked: it stays visible and is drawn and exported as before, but nothing changes its stitches until it is unlocked. (b) Every try in the strip can be chosen: two Generates that end with the same chart no longer leave one of them unselectable. (c) "Continue in Edit →" and the box around it leave the tries strip, which then gives all its width to the tries.
- **Why:** a finished layer (a border, lettering) should be safe while the rest is worked on; a try that cannot be chosen looks broken; the Edit shortcut covered the last try when there were many, and the workspace switch above already does the same.
- **Acceptance criteria:**
  - Each layer in the Layers list has a lock toggle with a visible state; a locked layer stays shown.
  - With a locked layer active, every tool that changes a layer's stitches (Brush, Line, Rectangle, Oval, Fill, Eraser, Select's cut/delete/paste onto it) is refused with a note naming the layer, as a hidden layer is now; the layer cannot be deleted, merged (as source or target) or renamed while locked. Chart-wide edits (Crop, Move the whole design, colour merges and loaded palettes) still apply to it, since they change the chart rather than one layer's drawing — this is the one judgment in the plan, recorded as a decision.
  - The lock is saved in the editable file and survives a reload and undo/redo; a file from an older build opens with every layer unlocked, and an older build opens a file with a locked layer (ignoring the lock).
  - A Generate whose chart and settings equal an existing try does not add a duplicate: that try becomes the current one and moves to the front of the recent ones. Tries that share a chart but were made with different settings are both kept, and each can be chosen and is shown as the current one when chosen.
  - (Added by the Owner 2026-10-10, M4.) The admin Overview's "Active accounts" counts only accounts that exist: deleting an account keeps its generations and exports in the site's totals but no longer tied to it, and the usage already left by deleted accounts is untied the same way.
  - (Added by the Owner 2026-10-10, M4.) The account area opens on Charts: `/account`, where signing in and every account link land, shows the saved charts, Charts is the selected section, and Profile & sign-in moves to its own address.
  - The tries strip has no "Continue in Edit" and no box beside the tries; its note ("Choosing a try generates nothing") and any pin refusal still show; with ten tries the last one is fully visible and clickable after scrolling the strip.
- **Constraints:** none beyond the standing ones (release and deploy per the standing approval of 2026-09-13; e2e only in CI).

**Milestones:**
- [x] M1 — Tries: duplicates not stored (same chart and same settings), the current try tracked by which one was chosen rather than by chart equality, "Continue in Edit" and its box removed. Unit tests on the rule in `lib/editor/tries.ts`; e2e for generating twice with the same settings, choosing between two same-chart tries, and the strip with many tries. Release note (fixed), brief updated.
- [x] M2 — Layer lock: the `locked` flag on a layer (document model, undo, the saved file without a format bump), a lock toggle in the Layers list, the refusal in the tool gate and in delete/merge/rename, the decision on chart-wide edits. Unit tests on the model, the gate and the file round trip; e2e for locking, being refused, unlocking, and a reload. Release note (new), brief updated.
- [x] M3 — Release and deploy (cross-stitch.craftodejnice.cz, standing approval): full checks, CI green, `npm run release`, deploy, live check of the chunks and `/whats-new`; HANDOVER regenerated.
- [ ] M4 — Added by the Owner 2026-10-10: (a) "Active accounts" counts existing accounts only; deleting an account unties its usage events (kept for the totals), a migration unties those already left; (b) Charts is the account area's first page at `/account`, Profile & sign-in at `/account/profile`, `/account/charts` sends to `/account`. Unit and e2e tests, release note (changed), brief and decision.
- [ ] M5 — Release and deploy (cross-stitch.craftodejnice.cz, standing approval), as M3.

**Progress log** (newest first):
- 2026-10-10 — M4 done (code; CI pending, 84f5b45): Charts at `/account`, Profile & sign-in at `/account/profile`, `/account/charts` redirects (D405); deletion clears usage ids in one transaction, migration `20261010110000_untie_deleted_accounts_usage`, Active accounts joins `User` (D406). Unit 1,962; e2e: 1 new @alone case, 9 specs moved to the new addresses (`deleteOwnAccount` helper for 4).
- 2026-10-10 — Owner added M4 and M5 ("add this and also make charts the main tab of account page"), after asking why Active accounts read 4 with 3 users: one deleted account's id was still on 2 usage events (read-only live query).
- 2026-10-10 — M3 done: Owner said "deploy"; rerun detached on the server (nohup) at d00826c. Live: migrate no pending, chunks carry d00826c and the lock strings, `/whats-new` lists 0.27.0, 25 containers (md5 same). Awaiting the Owner's sign-off.
- 2026-10-10 — M3: v0.27.0 cut (d9fb2d1, tag pushed) after CI green on e82e399 (e2e 701 and 40; flaky command-list and admin-stats, unrelated). M2's first CI run failed the new lock e2e (a reload drops the thread in hand; test fixed, e82e399). Deploy NOT done: the local deploy shell was stopped by Claude Code for low memory on this machine; the server's checkout is at d9fb2d1 but its build ended without recreating the containers, so production still runs cc26c0f, v0.26.0 (25 containers, MD5 matches). BLOCKED: rerunning the deploy waits for the Owner's word, since the tool asks that a command it stopped not be restarted unasked.
- 2026-10-10 — M2 done (code; CI pending): `locked` on the layer header, `setLayerLocked`, refusals in rename/delete/merge and the tool gate, `withLayerView` guard, saved only when true (D404). Unit 1,962 (8 new layer, 5 new tries); 1 new e2e case.
- 2026-10-10 — M1 done (aa72b33): `keepTry` and `currentTryId` in `lib/editor/tries.ts` (D403), strip without its Edit box; 2 new e2e cases, 3 specs moved to the Edit tab.
- 2026-10-10 — Owner accepted the plan ("accept"): runs through all milestones, deploy included.
- 2026-10-10 — goal written from the Owner's request; plan presented for acceptance.
### G-106 · Subscriptions, part 1: the billing core (contract, webhook, the subscription's state, what a person gets) — ACTIVE (accepted 2026-10-08)
- **What:** asked by the Owner, 2026-10-06, and split on 2026-10-08 (see above).
  - A signed-in person picks a tier and a period, pays through Stripe Checkout, and manages the card, period and cancellation through Stripe's Customer Portal.
  - The app's record of the subscription is kept current from Stripe's webhooks and by a periodic reconciliation.
  - One pure rule decides what the person gets: the tier's feature set (G-102) and limits (G-108/G-109), or Free.
- **Why:** `Tier` and `Subscription` (with `stripePriceId`, `stripeCustomerId`) have waited since G-075, and G-102 built what a tier unlocks. Read on 2026-10-08 at 98fd6d8, the current rule (`subscriptionLive` in `lib/account/plan.ts`) has two faults:
  - it counts `past_due` as live with no end, so a subscription whose payments keep failing would keep its tier for ever;
  - nothing reads `currentPeriodEnd`.
  Both must be fixed before anything is sold.
- **Acceptance criteria:**
  1. **The contract.** `lib/billing/` holds the contract: start a checkout, open the portal, read and verify an event, fetch a subscription, cancel, list prices. It has a Stripe adapter and a fake one. No route, page or test below the end-to-end ones imports the `stripe` package (a lint rule enforces this, as other import boundaries are).
  2. **Prices.** Prices are rows of their own: a tier has a monthly and a yearly price, and a replaced price is a new row. Checkout is offered only for a price marked current.
  3. **The webhook** (its own route, outside `guardMutation`, Architecture fit (2)):
     - it verifies the signature over the raw body and refuses a bad, missing or stale one;
     - it records each event id once, so a second delivery changes nothing;
     - it never trusts the event's copy of the subscription: it re-fetches the subscription from Stripe and writes that snapshot. The result does not depend on the order events arrive in.
     - Unit tests cover: every relevant event delivered twice, in shuffled order, and with one dropped then recovered by reconciliation.
  4. **Reconciliation.** A scheduled pass re-reads from Stripe every subscription that is not final. It corrects any record that is wrong, and records what it corrected. It is a service of this project's compose file (Architecture fit (4)).
  5. **Entitlement.** "What this person gets" is one pure function of the stored snapshot, the grace setting and the time now. It replaces `subscriptionLive`, and features, limits and the Plan section all read it. Every Stripe status is a named case, and the function is unit-tested over the full table of status × time:
     - `incomplete` and `incomplete_expired` (a first payment that never succeeded) give Free;
     - `trialing` and `active` give the tier until the period's end plus a small allowance for a late webhook;
     - `past_due` is G-126's;
     - `unpaid`, `canceled` and `paused` give Free.
  6. **One live subscription.** A person never has two. Checkout is refused while one is live. A second one created anyway (two tabs) is detected by the webhook and shown to the admin; it is not silently kept charging.
  7. **Account deletion.** Deleting an account cancels its subscription at Stripe first, through the contract, and refuses to delete the account if Stripe cannot be reached.
  8. **Card data.** No card data ever reaches this app's server. Checkout and the Portal are Stripe's pages.
  9. **Browser tests (fake adapter):** subscribe, see the tier's features, cancel at period end, keep the tier until the period ends, then Free. In Stripe's test mode, once keys exist: the same, with a test clock across two renewals.
- **Constraints:**
  - Built and verified in test mode or against the fake adapter only (VALUES: no money without approval).
  - The `stripe` package at the version `listing-studio` pins (stack rule: already in the portfolio), recorded as a decision.
  - Stripe's API version is pinned in the adapter. In the current versions, the period's end is read from the subscription item, not the subscription. To verify in M1 against Stripe's documentation, saved as a reference in `docs/reviews/`.
  - The webhook's route and secret are new production configuration. Keys are set by the Owner (escalation: the Owner's credentials).
  - Personal data, flagged: Stripe holds the name, email, card and address. The app stores only Stripe's ids, the status and dates, and the history of events (ids and types, no payload kept beyond what the rule reads).
- **Architecture fit (review 2026-10-06, kept):**
  1. Everything goes through `lib/billing/`'s contract.
  2. The webhook has its own guard: signature and an event-id table, since `originRejected` refuses Stripe's requests, which carry no Origin.
  3. "Live" is one pure rule in `lib/`.
  4. Prices are rows of their own. History is an append-only `SubscriptionEvent`, as `FeatureChange` is for features.
  5. Account deletion goes through the contract.
  6. Pages are entries in G-107's lists.
  Added 2026-10-08: the reconciliation is a compose service beside `db`, like G-114's backup, scoped to this project and needing no root.
- **To settle (Owner):**
  - (a) Start now against the fake adapter, before G-109's counted limits exist? Tiers would then differ by features and the saved-chart space only.
  - (b) Stripe test keys: a new Stripe account for this project, or `listing-studio`'s (G-128 (1)).
  - (c) G-030 still says the paid-tier plan is withdrawn; its wording is the Owner's to update.
  - Answered earlier, kept: prices, periods, trial and what each tier unlocks are set in the admin area, not in code (Owner, 2026-10-06; built in G-127). The draft prices are the starting values: Personal 10 EUR a month or 100 a year, Professional 20 or 200, Enterprise 50 a month.

**Milestones:**
- [x] M1 — The contract and the rule: `lib/billing/` contract, fake adapter, Stripe adapter (pinned version and API version); schema (`Price` rows, the subscription snapshot with period end, cancel-at-period-end and the first-failure date G-126 reads, `BillingEvent` ids, `SubscriptionEvent` history); the entitlement rule replacing `subscriptionLive`, unit-tested over the status × time table; the import-boundary lint; reference summary of the Stripe behaviour relied on; decisions (stack, snapshot-not-event, the rule).
- [x] M2 — The webhook and reconciliation: the route with signature, dedupe and re-fetch; the reconciliation service; account deletion through the contract; second-subscription detection; unit tests with duplicated, shuffled and dropped events.
- [x] M3 — Buying: the Plans page (prices from the database), Checkout, the Portal, return pages, the Plan section from the rule; buying a hidden feature; browser tests on the fake adapter in CI. Deploys to `cross-stitch.craftodejnice.cz` (existing target) with buying hidden and no Stripe keys, a release like any other.
- [ ] M4 — Proof in Stripe's test mode (waits on (b)): a script drives a test clock through subscribe, two renewals and cancellation, feeding the real events through the same handler, and checks the rule's answer at each step. The run is recorded in `docs/reviews/`.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-10-08 — **M3 done**, released as v0.22.0 (44aee3b) and deployed to cross-stitch.craftodejnice.cz with no Stripe keys, so billing is off. Built: the Plan section from the rule (status line, offered tiers from `Price` rows, Manage billing), Checkout and Portal as server actions, buying behind `billing.buy` seeded HIDDEN by a migration (D372), the fake's Checkout and Portal pages on a local server posting signed events to the real webhook (D373), `BILLING_GATEWAY=fake` in the e2e servers. Verified: tsc, eslint, prettier, docs-lint, brief, release notes, skin ok; Vitest 1,642 (10 new); CI on bab6abd green, e2e 666 and 27 @alone including `billing-buy` (subscribe, tier's feature on, cancel at period end, period ended, Free, history from the webhook), which is the first run of the Postgres store. CI failed twice first: bd156e2 (account-sections read the old Plan wording, fixed f007f14) and f007f14 (admin-features expected every feature on, fixed bab6abd). Live, single GETs and a read-only SELECT: migration applied, `billing.buy` HIDDEN, `/` and `/whats-new` (0.22.0) 200, `/billing/fake-checkout` 404, chunks carry 44aee3b; containers 24 → 25, the new one `billing-reconcile`, logging that reconciliation is off until `BILLING_RECONCILE_TOKEN` is set. Handover: the G-106 paragraph extended, the v0.10.0 row moved out of its deploy table (kept in `docs/deploy-log.md`). Next: M4 BLOCKED: on the Owner's Stripe test keys; G-126 starts now.
- 2026-10-08 — **M2 done** (committed with this entry). One write path for webhook and reconciliation, `lib/billing/sync.ts`: an event only names a subscription, which is fetched under a lock and stored whole; the event id is recorded in the same transaction. Webhook `app/api/billing/webhook/route.ts` (signature, 1 MB cap, 500 so the provider retries when not written); reconciliation `app/api/billing/reconcile/route.ts` called by the new `billing-reconcile` compose service (D371); a second live subscription is cancelled at its period's end and recorded (D370); account deletion cancels at the provider first and is refused if it cannot (`lib/billing/account-end.ts`; the form now shows the refusal). Found by the tests and fixed: a subscription whose events all arrive after it ended was never stored. Verified: tsc, eslint, prettier, docs-lint, brief ok; Vitest 1,632 (21 new: every event twice, five shuffled orders, a dropped failure recovered by reconciliation, failures after two paid periods with the first-failure date kept across retries, unpaid/canceled/past_due-for-ever outcomes, second subscription, unknown price and outage retried). Not yet exercised: the Postgres store (`prisma-store.ts`) — M3's browser tests drive it, once the fake shares state with the server. Production container count becomes 25 at the next deploy. Next: M3.
- 2026-10-08 — **M1 done** (10de476). `lib/billing/`: contract, fake and Stripe adapters, signature check, Stripe objects mapped to a snapshot; the entitlement rule (`hasTier`) replaces `subscriptionLive` at all seven call sites; schema `Price`, snapshot fields, `BillingEvent`, `SubscriptionEvent`, `Tier.stripePriceId` dropped (production: 0 tiers, 0 subscriptions, read-only SELECT). ESLint refuses `stripe` outside the adapter (4 probe files refused). Verified: tsc clean, eslint 0 errors, Vitest 1,611 (51 new billing cases: status × time table, settings, signature, mapping, fake), docs-lint ok. Decisions D366–D369; reference `docs/reviews/2026-10-08-stripe-billing-reference.md`. Note: `npm install` reclassified dev-tool lockfile entries, so `npm audit --omit=dev` lists 4 high (mysql2, deepmerge-ts), not shipped. Handover: nothing removed; one Current state paragraph added. Next: M2.
- 2026-10-08 — Owner accepted the plan ("you can go ahead with 109, 106 and 126 - 128"), to run after G-109 in the order G-106, G-126, G-127, G-128. (a) answered: G-109 first. Until the Owner says otherwise, (b) leaves M4 BLOCKED: on test keys. (The heading read ACTIVE from 60d1537, a replace meant for G-109 alone; corrected by this acceptance.)
- 2026-10-08 — split from the 2026-10-06 draft and planned at the Owner's request.
- 2026-10-06 — goal created.

### G-126 · Subscriptions, part 2: payment failures and recovery at any point in a subscription's life — ACTIVE (accepted 2026-10-08)
- **What:** the Owner's requirement, 2026-10-08: "make sure that payment failures are correctly processed even after some succesfull subscription periods". A renewal can fail in any period, after any number of paid ones. When it does, the app:
  - keeps the person's tier for a grace period that the admin sets;
  - tells them, by email and on the account page, with a way to pay;
  - follows Stripe's retries;
  - restores everything the moment a payment succeeds;
  - moves the person to Free when the grace runs out or Stripe gives up.
  It does all this the same way in the 2nd period and the 20th, and as often as it happens.
- **Why:** the first payment is the easy case: Checkout fails in front of the person. A renewal fails months later with nobody watching: the card expired, was replaced or ran short, or the bank asks for authentication. An app that handles only the first payment either gives away the tier for ever (today's rule would) or cuts off a paying customer over one declined retry.
- **Acceptance criteria:**
  1. **Scenarios.** Each scenario is a unit test driving a sequence of Stripe events, recorded or built from Stripe's shapes, through G-106's handler, checking the entitlement rule's answer and the emails sent at every step. Every scenario is also run with its events delivered twice and in shuffled order. The scenarios:
     1. Three paid periods; the 4th renewal fails, a retry succeeds: the tier is kept throughout, the person is told once, and the recovery is noted.
     2. Three paid periods; the 4th renewal fails and every retry fails. The tier is kept until the earlier of the grace's end and Stripe's last attempt, then Free. The subscription ends `canceled` or `unpaid`, whichever the Stripe setting chooses, and both cases are covered.
     3. As (2), then the person pays the open invoice through the Portal or Stripe's invoice page while `unpaid`: back to the tier at once, with no new subscription.
     4. A failure in period 3 is recovered and a second failure comes in period 6. The grace counts afresh from the new failure: it is not carried over or added up, and the old failure's dates leave no trace in the rule.
     5. A renewal that needs authentication (`invoice.payment_action_required`): the email carries Stripe's link to authenticate, and the tier is kept as for a failure.
     6. The card is replaced in the Portal during the grace and Stripe's retry succeeds: recovery.
     7. Cancellation during the grace: Free at once, or at the period's end, as the Portal set it; no further dunning email.
     8. A yearly subscription failing at its first renewal behaves as a monthly one does. The grace is days, not a share of the period.
     9. A change of plan whose prorated payment fails: the person keeps the old plan, and the change is not applied as if paid.
     10. A dispute or refund after paid periods is shown to the admin. What it does to access is (b) below.
     11. The webhook is down for a day during a failure and its retries. The reconciliation pass alone brings the record and the rule's answer right.
  2. **The grace setting.** The grace is the admin's setting, in days (an entry in the admin's settings, G-107). The rule counts it from the first failed attempt of the invoice now open. It is never derived from the event's arrival time.
  3. **Emails.** They go through G-113's mail contract, each a message in `lib/mail/messages.ts`: payment failed (with the date of the next try and a link to update the card), action needed, last notice before Free, moved to Free, payment recovered. Each is sent once per failure, however many retries or duplicated events arrive.
  4. **On the account page.** While a payment is failing, the Plan section says so and links to the Portal. It is gone after recovery.
  5. **Moving to Free.** Nothing the person made is deleted. Saved charts and stamps over Free's space stay readable and exportable but cannot be added to (D353's space limit refuses new saves, as today). It all comes back with the tier.
  6. **Browser test (fake adapter, CI):** fail, see the notice, recover, notice gone; fail, grace runs out (the clock set by the fake), Free, then pay, and the tier is back.
  7. **In Stripe's test mode, once keys exist** (G-106 M4's script extended): a test clock with three paid monthly periods, then the card swapped for Stripe's always-declining test card, then the clock advanced through every retry. The rule's answer is checked after each step, and the same is done with recovery by a working card. Recorded in `docs/reviews/`.
- **Constraints:**
  - Emails need G-113's sender domain to reach people for real. Until then the mail stand-in proves what would be sent.
  - The retry schedule and the final outcome (`canceled`, `unpaid` or left `past_due`) are Stripe dashboard settings. They are the Owner's to set (their account), and the app must be correct for every choice, not only the default (scenario (2) covers all three).
  - Stripe's own failed-payment emails must be off if ours are on, so nobody gets two (G-128 (1)).
  - Personal data: emails go to the account's address only, and nothing about the card beyond what Stripe's own page shows.
- **Architecture fit:**
  1. All of this lives in G-106's rule, contract and handler; there is no second path. The scenarios are data run through one test driver in `tests/unit/`, so a new scenario is a table entry.
  2. The emails are entries in `MESSAGES`.
  3. The notice is the account page's, through G-107's lists.
  4. The grace is a setting declared where other admin settings are.
  5. Every state change writes a `SubscriptionEvent`, so the admin's history (G-127) shows the whole failure and recovery.
- **To settle (Owner):**
  - (a) The grace's starting value: suggested 14 days, about Stripe's default retry window.
  - (b) After a dispute or a refund: keep access to the period's end, or Free at once?
  - (c) What Free means for saved charts beyond its space: the proposal above (kept, readable, no new saves), or something else.

**Milestones:**
- [x] M1 — The life of a subscription: the scenario driver and all eleven scenarios as unit tests (twice-delivered and shuffled variants generated), the grace setting and the rule's `past_due` case, the first-failure date kept and cleared correctly across periods; decision on the grace's counting.
- [x] M2 — What the person sees: the five messages through the mail contract (sent once per failure), the account page's notice and Portal link, Free without deletion, the admin's form for the grace setting (D374); browser tests on the fake adapter in CI. Deploys to `cross-stitch.craftodejnice.cz` (existing target), buying still hidden.
- [ ] M3 — Proof in Stripe's test mode (waits on G-106 (b)): the test-clock run of scenario (1), (2) and (4) against the real API, recorded.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-10-08 — M2 done and deployed in v0.22.1 (f3569a8, d722330; release ac3fa9d). Five messages queued once per failure and slot in the sync's transaction and delivered after the webhook and hourly (D377); bank confirmation read from the payment's intent, unverified until test mode (D378); Plan page notice with the grace's end, next try and pay link; Free keeps every chart (the space limit refuses new saves, as before); admin Settings page for the grace. Verified: 1,746 unit (the scenarios now check every mail in every delivery order), CI e2e 666 and 29 incl. `billing-failure` (fail, notice and mail, pay, fail again, past the grace to Free, pay back; five mails in order) and `admin-settings`; live read-only checks in the deploy log. Note for the Owner: acceptance 2 says the grace counts from the first failure "of the invoice now open"; D375 keeps the earliest failure while the subscription stays failing, so a new period's invoice does not renew the grace. The fake's browser test moves the failure back instead of setting a clock. Next: G-127.
- 2026-10-08 — M1 done (9ba5cb5, 42e8a0b). The eleven scenarios in `tests/unit/billing-scenarios.spec.ts`, each delivered as sent, twice and shuffled (77 tests); both sync guards checked by mutation (removing either fails 4 and 8 tests); full unit suite 1728/1728. Built: the grace from the first failure, bounded by the period (D375); price changes taken only in good standing (D376); disputes and refunds noted in history; site settings with `billing.graceDays` (D374). The admin's form for the setting moved to M2, with the other things a person sees and their browser tests. Next: M2.
- 2026-10-08 — Owner accepted the plan ("you can go ahead with 109, 106 and 126 - 128"), to run after G-109 in the order G-106, G-126, G-127, G-128. Until the Owner answers, the reversible defaults built are: (a) grace 14 days, as the setting's starting value; (b) a dispute or refund is shown to the admin and changes no access by itself (the admin can take the tier by hand, G-127); (c) charts over Free's space kept, readable and exportable, no new saves. M3 BLOCKED: on test keys.
- 2026-10-08 — goal created and planned at the Owner's request.

### G-128 · Ready to sell: the Stripe account, live mode, VAT, invoices and terms — ACTIVE (accepted 2026-10-08), mostly the Owner's
- **What:** everything that has to be true before the first real payment, and the switch itself. Each item is the Owner's or needs their approval; JulAI's part is the app's side and a checklist.
- **The Owner's (escalation-tier: account, money, terms, credentials):**
  1. **The Stripe account:** the business identity it is held under, its country, and accepting Stripe's terms. Then its dashboard settings:
     - Smart Retries and their window;
     - what happens after the last retry (cancel, mark unpaid, or leave past due);
     - Stripe's own failed-payment and receipt emails off or on (G-126);
     - the Customer Portal's allowed actions.
     Test keys first, live keys at launch. The Owner sets them on the host and in CI's secrets.
  2. **VAT:** EU VAT on digital services to consumers is due at the buyer's country's rate (OSS), so prices are either VAT-included or VAT-added. Either Stripe Tax collects it (it costs a fee) or the Owner handles it otherwise. This may need professional advice.
  3. **Invoices:** Stripe's invoices and receipts, under the business's details and numbering.
  4. **Terms of service and a privacy policy:** the privacy policy names Stripe as processor. They are the Owner's text, and may need professional advice.
  5. **The right of withdrawal:** an EU consumer buying digital content has a 14-day right of withdrawal. It is lost only if they agree to immediate performance and acknowledge losing it. That needs a checkbox before Checkout, whose wording is the Owner's. Labelled an inference to be confirmed by advice, not legal advice.
  6. **Approving the launch:** a feature that charges money (OPERATIONS §4).
  7. **Raising a subscriber's price:** the admin can move people to a tier's current price from their next renewal (D381). The site does not tell them. How far ahead an EU consumer must be told of a higher price, and whether they must agree to it, is the Owner's to settle (an inference, not legal advice).
- **JulAI's:** the terms and privacy pages (the Owner's text) and the withdrawal checkbox. A launch checklist that checks, against production, that:
  - the webhook is reachable and signed;
  - the reconciliation service is running;
  - the keys are live-mode;
  - buying's feature state is set;
  - the test-clock scenarios passed on this release.
  Then one real, small purchase and refund by the Owner, as the final check.
- **Milestones** (JulAI's part; planned 2026-10-09; nothing here charges anyone, buying stays hidden):
- [x] M1 — The documents: terms, privacy policy and the withdrawal wording written by the admin in a new `/admin/legal` section, each published as a new version that never changes afterwards; public `/terms` and `/privacy` showing the version in force and the earlier ones; until the Owner publishes, the pages say none is published yet. Unit and browser tests; a decision file.
- [x] M2 — Consent before Checkout: on the Plan page, agreeing to the terms and the withdrawal acknowledgment (in the Owner's wording); the server refuses Checkout without both, while any of the three documents is unpublished, or when a newer version was published since the page was read; a consent record per purchase, tied to the subscription the webhook brings; a confirmation mail repeating the acknowledgment. Unit and browser tests on the fake. Deploys to `cross-stitch.craftodejnice.cz` (existing target), buying still hidden.
- [x] M3 — The launch checklist as a script (`npm run launch:check`): read-only checks against production of the webhook, the reconciliation service, live-mode keys, buying's feature state, the published documents and the test-clock record for the release; exercised in CI against the test server. Run live only at launch, with the Owner.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-10-09 — Legal finding (inference, not legal advice; sources in the Owner's private drafts): the app is a digital service, so the right of withdrawal is not lost when a subscription starts early. A consumer who withdraws pays a proportionate amount (Directive 2011/83 Art. 14(3), 16(a); CJEU C-641/19). A withdrawal button has been required since 19 June 2026 (Directive 2023/2673 Art. 11a). A link in the confirmation email is not a durable medium (CJEU C-49/11), which answers the D384 question. So M2's checkbox wording (item 5 above) is wrong and is corrected by G-129 (drafted). JulAI drafted the terms, the privacy policy and the withdrawal information, privately, because they hold the Owner's identity. Open with the Owner: a contact email, VAT status, retention, a Czech version and a lawyer's review.
- 2026-10-09 — M1–M3 done and deployed together in v0.22.4 at the Owner's word ("deploy please"), buying still HIDDEN, no database dump; v0.22.3 failed to build on the server (`/register` prerendered the legal links before their migration), fixed in 893e9cc by reading them at request time. M1 (75a3b0b, D383) the documents; M2 (72df6c8, D384) consent before Checkout, CI e2e 666 and 32; M3 (528b157, f71f280, D385) `npm run launch:check` and `/api/billing/launch-status`. M3's CI caught the webhook answering an unsigned event 500, not 400: the fake adapter on `globalThis` threw another module copy's `BillingSignatureError`; both billing errors now carry a brand that `instanceof` reads (unit test loads a second copy). CI on f71f280: e2e 666 and 33; 1,799 unit. The Owner's: publishing the three documents at `/admin/legal`, whether the confirmation mail's link to the terms is enough as a durable medium (D384), and items (1)–(6); `launch:check` can pass only with live keys and a test-clock record (`docs/test-clock/`), so it runs at launch, with the Owner.
- 2026-10-09 — JulAI's part planned as M1–M3 above, under the accepted plan (the entry below: it starts after G-127, the pages built with the missing text named as missing). The text itself is the Owner's: the admin writes it in the app, so no deploy waits on it. Personal data: M2 keeps a record of each buyer's consent (flagged; how long it is kept after an account is deleted is the Owner's, item 4).
- 2026-10-08 — Owner accepted the plan ("you can go ahead with 109, 106 and 126 - 128"), to run after G-109 in the order G-106, G-126, G-127, G-128. Items (1) to (6) are the Owner's and wait on them. JulAI's part starts after G-127: the pages take the Owner's text, so they are built with the missing text named as missing, and the launch checklist as a script.
- 2026-10-08 — drafted from G-106's constraints at the Owner's request.

### G-108 · Charts saved to an account, a gallery, and who can see each (private by default) — DRAFT (part 2; part 1 signed off 2026-10-08)
- **Part 1 (saving to the account, the account's Charts, previews) — DONE, Owner sign-off 2026-10-08;** archived in `docs/goals-archive/G-101-to-G-110.md`. Deployed in v0.15.0, v0.16.0 and v0.17.0.
- **Part 2 (later, not in this plan):** unlisted and public visibility, the gallery and its moderation (G-111).
- **What:** asked by the Owner, 2026-10-06. A signed-in person saves a chart to their account (the versioned document of G-094, with its photo if they choose) and reopens it from any browser; their charts are listed with previews. Each chart has a visibility: **private** (the default), unlisted (anyone with the link), or public (in a gallery). The gallery shows public charts with previews; the owner can change visibility or delete at any time. Account settings hold the defaults.
- **Why:** today a chart lives only in one browser or an exported file; G-097 left "a full chart library" for later.
- **Acceptance criteria (draft):** save, reopen elsewhere, rename, delete; a private chart refused to anyone else by the server, not only hidden by the interface; a new chart is private until its owner changes it; the gallery lists only public charts; storage limits per person (and per tier, through G-102/G-106) enforced and named; saving is a feature in the G-102 list.
- **Constraints:** **personal data:** saved charts and photos are user content stored on the shared host; this needs a retention rule, deletion on account deletion, a backup plan, and the privacy policy G-106 also needs (flagged to the Owner, VALUES). A public gallery hosts content uploaded by users, so a way to report and take down a chart, and whose photos may be shown, are the Owner's decisions. Overlaps G-030 (the social ecosystem) and G-097 (2: the last replaced chart): the gallery is the first piece of G-030 if the Owner wishes.
- **Open questions (the Owner decides later, 2026-10-06):** (1) is the source photo saved with a chart, and shown publicly? (2) storage limits for accounts without a tier? (3) can others copy a public chart into their own account? (4) moderation: report button, admin takedown, or review before publishing?
- **Architecture fit (review, 2026-10-06):** (1) Opening a saved chart is one more way a chart arrives: a row in `REPLACE_PLANS` (`lib/editor/document-replace.ts`, D283) and a function in `app/hooks/use-chart-lifecycle.ts`, not a new path into the editor's state. (2) What is stored is the versioned document. The server checks every upload with the same `lib/editor/pattern-serialize.ts` and `lib/document/migrate.ts` the browser uses, and never trusts a client's file. (3) One chart-store contract, with a browser implementation (`lib/editor/project-store.ts` already has the shape) and an account implementation, so the editor does not know where a chart is kept; G-097's "last replaced chart" becomes a slot of the same contract. (4) Who may read a chart is one pure function in `lib/` (owner, visibility, link token), called by every route that serves a chart or its preview; unlisted needs a random token of its own, not the chart's id. (5) Previews are drawn by the processor's Rust from the stored document, not uploaded by the browser: a client's picture need not match its chart. (6) Saving, the gallery and sharing are features, declared where they are registered; storage limits are G-109's size limits, not counters of this goal's own; the pages are entries in G-107's lists. (7) Reporting and takedown is G-111's.
- **Answered (Owner, 2026-10-06, to the review's questions):** a chart is saved by hand. If the chart on the account was saved again between this browser opening it and its attempt to save, the save asks first and offers saving under another name. So the store's contract carries a version of the saved chart, and the server compares it at the save: a comparison in the browser alone could be overtaken.
- **To settle (found by the review, besides the four above):** the Owner's duties as the host of a public gallery (reports, takedown, whose photos) deserve advice before it opens; the review can say what the app can do, not what the law asks. Backups of what this goal stores are G-114.

### G-111 · What users write and publish, and its moderation: guide comments, gallery reports and takedown — DRAFT (2026-10-06)
- **What:** drafted by the review from the Owner's confirmation of 2026-10-06 that comments leave G-105 and share their moderation with G-108; only what those two goals already said is gathered here. One module for content a user writes or publishes and for its moderation: comments on guide pages (G-112; Owner, 2026-10-06: users comment on a page rather than edit it), and the report and takedown G-108's gallery needs. An admin sees, hides and removes; each removal is logged with who and when, as feature changes are.
- **Why:** comments and a public gallery both put users' content in front of others; built apart, each would get its own storage rules, removal and admin page.
- **Acceptance criteria:** to be set when taken up.
- **Constraints:** **personal data:** comments are user content and need the same handling as accounts, with deletion on account deletion (flagged to the Owner, VALUES). The shape of moderation waits for G-108's open question 4 (a report button, admin takedown, or review before publishing). Admin pages are never exercised against the live site (standing rule). Comments need the pages of G-112; the gallery's side is wanted with G-108.
- **Architecture fit (review, 2026-10-06):** the kinds of content are a declared list (a comment, a public chart), so a new kind is an entry, and the rules (who may post, who may see, what a removal does) are pure functions in `lib/` enforced by the server. The admin page is an entry in G-107's list; commenting is a feature in the G-102 list and its posting route passes `guardMutation`, with a limit in G-109's list if one is wanted. No second removal log beside the one pattern `FeatureChange` set.
- **Jev trial (2026-10-08, Owner's request):** an offline triage trial on 200 synthetic, hand-labelled cases agreed with the labels on 91% of actions, left nothing harmful up and took nothing harmless down, for about $0.007 in total (`docs/reviews/2026-10-08-jev-moderation-trial.md`). Candidate for this goal's triage, as a sorter in front of the admin; adopting it, and the provider's data terms for real comments, are the Owner's call when the goal is planned.

### G-112 · A user guide: how to use every workspace, tool and export, with pictures — DRAFT (2026-10-06)
- **What:** asked by the Owner, 2026-10-06, as part of G-105 and split from it on the same day (confirmed by the Owner). A user documentation wiki: how to use every workspace, tool and export, with pictures. G-105's check is extended, so that a change which alters what a user sees updates the guide in the same commit.
- **Why:** users have no account of how anything works; the design brief (`docs/design-brief/`) describes the app for the developers, not for users.
- **Acceptance criteria (draft):** the guide covers every feature in the G-102 list (a check fails when a feature has no guide page, as `coverage.md` does for the brief); the guide shows every feature to everyone, whatever is switched for the reader (Owner, 2026-10-06); `docs/development-loop.md` and the fast lane (D280) name the step.
- **Constraints:** nothing published elsewhere without the Owner's approval (VALUES): the guide lives in the app itself unless the Owner chooses an outside host. Screenshots are made from the app by a script, so they can be remade when the interface changes. After G-103, G-104 and G-110, which change the interface it pictures, and after G-105, whose check and renderer it uses.
- **Answered (Owner, 2026-10-06):** the guide is part of the site's repository, published as the site's own help pages.
- **Answered (Owner, 2026-10-06):** the guide is in English for now (more languages perhaps later, so its text is kept translatable). Users can comment on guide pages rather than edit them, as the simpler to build; the comments themselves are G-111.
- **Architecture fit (review, 2026-10-06):** (1) The coverage check reads the feature list (`app/features/registry.ts`), as `docs/design-brief/coverage.md` is checked for the brief. The tables a page shows (keys, tools, export kinds, the range of a setting) are generated from the registries and never typed into a page, since a typed table is a second copy that goes stale. (2) Screenshots are made by a script beside `scripts/look.mjs`, from a list declared with the pages. (3) Pages are content files drawn by G-105's renderer, each naming the feature ids it covers; text kept in files per language is all "translatable" needs now.

### G-114 · The database backed up on a schedule, with a restore that is proven — DRAFT (2026-10-06)
- **What:** drafted at the Owner's word (2026-10-06, "draft prerequisites as goals") from the review's finding. The app's database is dumped on a schedule without anyone remembering to, old dumps are removed by a stated rule, a copy is kept somewhere other than the host's own disk, and restoring from a dump is a written procedure that has been run.
- **Why:** today a dump is made by hand before a schema migration (`COMPANY/INFRASTRUCTURE_DEPLOY.md`) and deleted at sign-off, so between deploys there is none. The database holds accounts and the admin's settings now; G-108 adds people's charts, and G-106 the record of who has paid.
- **Acceptance criteria (draft):** a dump appears on schedule on the host with no session's help; dumps older than the retention rule are gone; a restore into an empty database is run from a dump and the app's own checks pass against it, repeated by a script, not done once; a failed or missing backup is visible to the Owner without looking for it; what is backed up is one list that G-108's stored files join.
- **Constraints:** **shared host:** nothing here may touch another site, and anything needing root is handed to the Owner as commands (`COMPANY/INFRASTRUCTURE.md`). **Personal data:** a dump holds account emails, so it is kept with the same file modes as today's, for a stated time, and deleted on that schedule. **Escalation-tier, needs the Owner:** a copy off the host leaves the workspace and may need an account or money; where it goes is the Owner's decision, and until then the goal can deliver the schedule, retention and restore on the host only, which does not survive losing the host.
- **Architecture fit (review, 2026-10-06):** (1) The backup is a service of this project's own `docker-compose.yml` beside `db`, scheduled inside the project, so it is versioned and deployed with the app, needs no root and is scoped to this project's containers; a host-wide job would be shared infrastructure. (2) Dump, prune and restore are one script each in `scripts/`, the same ones a session runs by hand before a migration, so the manual recipe and the schedule cannot drift apart. (3) The restore check runs in CI against a scratch database (verified means run). (4) The failure notice goes out through G-113's mail contract if that has landed, and is shown on the admin's overview (an entry in G-107's list) either way.
- **Answered (Owner, 2026-10-06):** for cross-stitch alone so far, but able to be set up for others. So the scripts and the service take the project's particulars (container, database, user, where dumps go, how long they are kept) as settings and name nothing of cross-stitch inside; another project on the host (`when-we-meet` has a database too) adopts it by settings, in its own compose file, when the Owner asks. Nothing is set up for another project by this goal.
- **To settle (found by the review; Owner, 2026-10-06: not decided yet):** (a) where the copy off the host goes. (b) How long dumps are kept. (c) How much may be lost: is a daily dump enough once people's charts are stored?

### G-120 · The editor's preferences kept with the account — DRAFT (2026-10-07)
- **What:** a signed-in reader's preferences follow them between browsers; a guest's stay in the browser as today.
- **Why:** shown in the Owner's mock-ups for G-107 (2026-10-07) and left out of it, because G-107 builds only sections whose data exists.
- **Constraints:** joins G-107's declared section list as one entry (D346); no placeholder before it is built.
- **Acceptance criteria (draft):** preferences changed on one browser appear on another after signing in; signing out leaves the browser's own; what wins on conflict is stated and tested.

### G-121 · Signing in with Google and Apple — DRAFT (2026-10-07)
- **What:** Google and Apple as sign-in methods beside email and password, listed in Profile & sign-in.
- **Why:** shown in the Owner's mock-ups for G-107 (2026-10-07) and left out of it, because G-107 builds only sections whose data exists.
- **Constraints:** joins G-107's declared section list as one entry (D346); no placeholder before it is built.
- **Acceptance criteria (draft):** a person can sign in with either, link and unlink one from the account, and is never left with no way in. Needs the Owner: provider accounts and their terms (escalation-tier).

### G-122 · Jobs and queue in the admin area — DRAFT (2026-10-07)
- **What:** the admin sees the processor's running and waiting jobs and recent failures.
- **Why:** shown in the Owner's mock-ups for G-107 (2026-10-07) and left out of it, because G-107 builds only sections whose data exists.
- **Constraints:** joins G-107's declared section list as one entry (D346); no placeholder before it is built.
- **Acceptance criteria (draft):** an Admin › Jobs section shows the processor's live state from a status endpoint the processor gains; never exercised live.

### G-123 · Release notes written in the admin area — DRAFT (2026-10-07)
- **What:** the admin writes the "What's new" notes in the admin area instead of files in the repository (G-105).
- **Why:** shown in the Owner's mock-ups for G-107 (2026-10-07) and left out of it, because G-107 builds only sections whose data exists.
- **Constraints:** joins G-107's declared section list as one entry (D346); no placeholder before it is built.
- **Acceptance criteria (draft):** a note written in the admin area appears in the editor's What's new; the existing notes carry over; never exercised live.

### G-101 · A phone layout, and drawing by touch — DRAFT (2026-10-05, for later)
- **What:** the editor usable on a phone: the regions G-095 builds (tools, panel, quick options, view controls, tries) rearranged for a narrow screen, and touch given a meaning on the chart (one finger draws or pans, a pinch zooms), with a visible control for everything a key does.
- **Why:** asked by the Owner on 2026-10-05, who chose to keep it out of G-095.
- **Acceptance criteria:** to be set with the Owner from mock-ups, as G-095's were.
- **Constraints:** after G-095, whose three provisions are what make this a matter of design and touch behaviour, not of restructuring. Needs phone-sized test runs and a check on a real device.
- **Architecture fit (review, 2026-10-06):** (1) Touch is told apart in the editor shell before a tool sees it: one finger reaches the tool in hand through the pointer contract it already has (`ToolRuntime`, `app/tools/types.ts`), two fingers go to the view (the pan and zoom routines the Pan and Zoom tools use), so no tool module learns about touch. (2) "A visible control for everything a key does" is drawn from the command list (`app/commands/registry.ts`), held keys included (Space, and Alt after G-104), not from a second list of buttons. (3) The narrow layout places the same regions by `docs/interface-placement.md`; a component may change where it sits by width, never what it does.

### G-097 · A new chart can be undone, and the replaced chart survives a reload — DRAFT (2026-10-04, left for later by the Owner)
- **What:** (1) starting a new chart is one more step in the undo history instead of a new history, so Undo brings the old chart back with its photo, axes and settings, and the confirmation can go; a notice says so. (2) The browser keeps the one chart that was last replaced, and the start screen offers to reopen it.
- **Why:** today a replaced chart is gone unless it was exported; the confirmation is the only guard.
- **Acceptance criteria:** to be set when taken up. Known work: undo across documents must restore the photo in hand and reset the view as D283 does; history is memory-only and 50 steps deep, which is why (2) exists.
- **Constraints:** changes undo history and browser storage, so a normal goal. A full chart library belongs with G-094.
- **Architecture fit (review, 2026-10-06):** (1) `ReplacePlan` already has `history: "reset" | "push"` (`lib/editor/document-replace.ts`): part 1 is the new-chart rows moving to "push", with a history step that carries the whole document (photo, axes, settings) and is restored through the same replace routine, so D283's resets hold in both directions. (2) The kept chart is a slot of the chart store: `ProjectStore` (`lib/editor/project-store.ts`) if this goal comes before G-108, the contract G-108 introduces if after. Not a second store.

### G-030 · Public launch: a social ecosystem around the app — DRAFT, far future (2026-09-12)
- **What:** Eventually make the app public, built around **a social
  ecosystem** (community/sharing features -- exact shape not yet defined:
  could include public pattern galleries, profiles, following, comments,
  or similar) rather than a plain paywall-on-exports model. Owner
  explicitly corrected an earlier draft of this goal that jumped straight
  to a detailed "server-side generation + paid export tiers" plan --
  **that plan is withdrawn**, not just superseded; the real direction is
  the social ecosystem, and "other details will be defined later"
  (Owner's own words, 2026-09-12).
- **Why:** Owner is exploring making the app public and building a
  business around it, but this is explicitly **a plan for very later**,
  not something to scope or sequence now.
- **Status:** Intentionally not planned in detail -- no acceptance
  criteria, no milestones, per the Owner's own "very later, details
  defined later" framing. This entry exists so the intent isn't lost
  between sessions, not to commit to any architecture yet. Do not expand
  this into a full plan without an explicit Owner go-ahead to start
  planning it for real.
- **Technical note (corrected by the review, 2026-10-06):** an earlier note
  here said the TypeScript pipeline (`buildPattern` in `lib/pattern.ts`)
  could run in a Node server unchanged. That pipeline no longer exists:
  G-068 made Rust the only pipeline, and generation has run on the server
  since (`rust/cs-job`, the processor container).
- **Overlap to resolve (review, 2026-10-06):** G-106 (subscriptions) and
  G-108 (a gallery) were drafted on 2026-10-06. The first reverses the
  "plan is withdrawn" above and the second is a piece of the social
  ecosystem; this entry's wording is the Owner's to update. Nothing here
  is planned by that.
