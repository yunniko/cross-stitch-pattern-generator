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

### G-124 · Editing the photo in Photo: a Wand that deletes with hard edges, and adjustments that are applied — ACTIVE (accepted 2026-10-07, widened by the Owner the same day)
- **What:** asked by the Owner, 2026-10-07: "We need to introduce Wand tool to photo mode. It should chose color on the photo and allow to delete it; it should have the same modes as select in edit mode (select, + and -); but also a threshold of sensitivity and button delete; Delete deletes with hard edges." Widened the same day: "The color adjustment now should be applied to photo on press new button Apply. Adjustment sliders should be reset after applying and photo should be saved in changed version; after pressing new button cancel or switching from tab or workspace it is reseted but adjustments are not applied. Both background remove and adjustments should be undoable; if adjustments happen when selection is active only selected area is affected."
- **Why:** to prepare the photo before a chart is made: remove a background or an unwanted area so it becomes empty stitches, and correct colour in all of the photo or part of it.
- **Acceptance criteria (restated):**
  1. The Photo workspace has a Wand tool, declared as the feature `tool.photo-wand` like every tool. While it is in hand the well shows the photo itself, also when a chart exists.
  2. A click selects the pixels whose colour is within the sensitivity of the clicked one (OKLab distance; a slider in the quick options). By default only the connected area is selected; a Contiguous switch turned off selects every similar pixel in the photo. A Diagonal switch decides whether corner-touching pixels connect.
  3. The modes Select, Select + and Select − behave as the edit-mode Wand's (replace, add, subtract), with the same keys. The selection is outlined on the photo.
  4. Delete makes the selected pixels fully transparent: alpha 0 or 255 only, no feathered or half-transparent edge.
  5. The four adjustment sliders preview live and change nothing until **Apply**. Apply writes them into the photo and puts the sliders back to neutral. **Cancel**, leaving their tab or leaving the Photo workspace puts the sliders back without applying them. With a selection active, Apply changes only the selected pixels.
  6. Delete and Apply are steps on a photo history: Undo and Redo in the Photo workspace step through them, and the original photo can be restored.
  7. Generate always uses the photo as applied. While sliders are moved and not applied, a note by Generate says so. Deleted areas become empty stitches (transparency is honoured end to end, D196). The edited photo is kept with the chart and its tries; a chart or try made before this goal, with sliders stored in it, still regenerates as before.
  8. Unit tests for the threshold flood, the mode arithmetic, the hard-edge delete, the masked adjustment and the history. Browser tests for select, add, subtract, delete, apply, cancel and reset on leaving, undo and redo, and the generated chart's empty cells.
- **Constraints:** never exercised live on admin pages; the deploy is a release (`npm run release`). Sending an edited photo departs from D150 (the original file bytes, never re-encoded): the edited photo is sent as a lossless PNG with alpha and gets its own hash, so tries made from it stay apart from the original's (D349). The history holds full photos of up to 4000 px a side, so its size is bounded by memory and the bound is recorded with its measurement (free memory on this machine was 2.2 GB of 15.7 GB on 2026-10-07).
- **Architecture fit:** the tool is a module in `app/tools/registry.ts` with `workspace: "photo"`. Its pure logic lives in `lib/photo/` (flood, masks, delete, masked adjustment, history), reusing `combineAreas`, the OKLab helpers in `lib/color/color.ts` and `adjustPixelBuffer` in `lib/pipeline/photo-adjust.ts`. The photo gets a small API of its own (pixels, pointer-to-pixel, history) rather than stretching the chart-centred `EditorApi`.

**Milestones:**
- [x] M1 — Pure logic and the decisions: in `lib/photo/`, the threshold flood on an RGBA buffer (contiguous or global, diagonal optional; transparent pixels never selected), the three modes, the hard-edge delete, adjustment applied through a mask, a bounded photo history; unit tests; D349 (edited photo as PNG), D350 (history and its bound).
- [x] M2 — The Wand on the photo: a photo stage in the well with pointer-to-pixel mapping, the `photo-wand` tool and feature, quick options (mode, sensitivity, Contiguous, Diagonal, Delete), the outline; browser tests for select, add and subtract.
- [x] M3 — Edits for real: Delete and Apply/Cancel on the photo history, Undo and Redo in Photo, Restore original, sliders reset on leaving their tab or the workspace, the "not applied" note; the edited photo encoded, uploaded and used by Generate, kept with the chart and tries; browser tests including empty cells in a generated chart.
- [x] M4 — Records and release: HANDOVER, coverage rows, release notes, docs-lint; `npm run release`, push, deploy to `cross-stitch.craftodejnice.cz` (its existing target), live check with single GET requests.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-10-08 — M4 done: v0.14.0 released (7861700) and deployed to cross-stitch.craftodejnice.cz. M3's CI on 391ce9b failed only the new photo-wand spec (4 of 644: it waited on a wrapper that is always empty, since the bar's buttons render into the pinned end); fixed in bf374bf (e2e 644/644), plus an internal release note (5454041). Verified: CI green on 7861700; live single GETs, no admin pages: chunks carry 7861700 and the Wand, / and /whats-new 200 with 0.14.0, migrate exit 0, 24 containers before and after, only the app restarted, 16 neighbour sites as before. Deploy row added to HANDOVER and docs/deploy-log.md. Removed from HANDOVER: the stale production line (v0.11.0), replaced. Awaiting the Owner's sign-off.
- 2026-10-08 — M3 done: Apply and Cancel under the sliders (Apply to selection with a Wand selection), Undo, Redo and Restore original in the Picture tab and the bar while the photo is up; the sliders given up on Cancel, another tab or another workspace, no longer on a view change; the "not applied" note by Generate; a generation or a try that lands puts a Photo tool down for Pan, so the new chart shows. Generate, tries and the colour hint read the applied photo, a legacy chart keeping its sliders for its own photo (D352); opening a chart sets the sliders neutral. D351 recorded (edited PNG capped at 16 MB). Verified: tsc, eslint (4 older warnings elsewhere), 1,464 unit, check:fast, docs-lint; e2e rewritten or new (`photo-sliders-generate`, `photo-wand` incl. deleted area → empty stitches, `helpers/photo.ts`), run in CI (memory guard). M2's CI (04d97ce) failed 7 of 641: six in the M2-era `photo-sliders-generate` (rewritten here) and `workspaces` expecting no Photo wand (updated). Removed from HANDOVER: the D243 "provisional until a Generate" wording, replaced. Known limits: tries from an edited photo do not survive a reload; Generate while sliders move keeps the photo up until Cancel. Next: M4.
- 2026-10-07 — M2 done (04d97ce): the photo stage, the `photo-wand` tool and feature, its bar (mode, sensitivity, Touching/All, Diagonal, Delete), the outline; the photo editor in a worker. Verified: tsc, lint, 1,448+ unit, check:fast; e2e in CI. Next: M3.
- 2026-10-07 — M1 done: `lib/photo/photo-mask.ts` (Wand mask, joined or whole photo, diagonal optional, absent pixels never taken; the three modes), `photo-edit.ts` (hard-edge Delete; Apply, into the selection only when there is one, adjusting each distinct colour once), `photo-history.ts` (undo, redo, restore original, 256 MB budget). D349 (an edited photo goes as a PNG of its pixels; D239 narrowed), D350 (history by bytes; Wand and Apply in a worker). Verified: 20 new unit tests, all 1,448 unit pass, check:fast, docs-lint. Measured on 12 MP (`docs/reviews/2026-10-07-photo-edit-cost.md`): Apply 7.2 s pixel by pixel, 137 ms by distinct colour, 6.5 s worst case; Wand worst 1.2 s. Removed from HANDOVER: nothing; one Next steps line added. Next: M2.
- 2026-10-07 — Owner widened the goal: adjustments applied with Apply, reset by Cancel or by leaving, undoable together with Delete, limited to the selection. Answer: Generate uses the photo as applied; unapplied sliders get a note. Plan rewritten; still to run through all milestones.
- 2026-10-07 — Owner accepted the plan, to run through all milestones. Answers: a click selects the connected area by default, with a Contiguous switch to select every similar pixel; the tool works any time in Photo, also once a chart exists (the next Generate makes a new try from the edited photo).
- 2026-10-07 — goal created from the Owner's request; plan written.

**Subscriptions and Stripe, planned 2026-10-08 (Owner: "build subscription and stripe integration goals. make sure that payment failures are correctly processed even after some succesfull subscription periods").** The draft G-106 of 2026-10-06 is split four ways, because selling has four separable parts and each waits on something different:

- **G-106**: the billing core. The contract, the webhook, the subscription's state and the one rule for "what this person gets". It can be built now, against a fake adapter.
- **G-126**: payment failures and recovery at any point in a subscription's life. This is the Owner's explicit requirement, so it is a goal of its own with its own acceptance, not a line inside G-106.
- **G-127**: the admin's controls.
- **G-128**: what has to be true before real money is taken. This is mostly the Owner's: the account, live mode, VAT, terms.

Order: G-106, G-126, G-127, then G-128 to launch. G-126 builds on G-106's state, and G-127 on both.

What everything depends on is stated once here:
- **Test mode**: runs in Stripe's test mode need a Stripe account and its test keys, which are the Owner's (G-128 (1)). Until then each goal is built and verified against the fake adapter and recorded Stripe events, and its test-mode milestone is `BLOCKED:`.
- **Charging**: no live-mode key ever reaches the app before G-128 is signed off.
- **Keys**: keys are set by the Owner on the host. JulAI never enters them.
- **Visibility**: buying stays a hidden feature (G-102) in production until then.

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
- [ ] M1 — The contract and the rule: `lib/billing/` contract, fake adapter, Stripe adapter (pinned version and API version); schema (`Price` rows, the subscription snapshot with period end, cancel-at-period-end and the first-failure date G-126 reads, `BillingEvent` ids, `SubscriptionEvent` history); the entitlement rule replacing `subscriptionLive`, unit-tested over the status × time table; the import-boundary lint; reference summary of the Stripe behaviour relied on; decisions (stack, snapshot-not-event, the rule).
- [ ] M2 — The webhook and reconciliation: the route with signature, dedupe and re-fetch; the reconciliation service; account deletion through the contract; second-subscription detection; unit tests with duplicated, shuffled and dropped events.
- [ ] M3 — Buying: the Plans page (prices from the database), Checkout, the Portal, return pages, the Plan section from the rule; buying a hidden feature; browser tests on the fake adapter in CI. Deploys to `cross-stitch.craftodejnice.cz` (existing target) with buying hidden and no Stripe keys, a release like any other.
- [ ] M4 — Proof in Stripe's test mode (waits on (b)): a script drives a test clock through subscribe, two renewals and cancellation, feeding the real events through the same handler, and checks the rule's answer at each step. The run is recorded in `docs/reviews/`.

**Progress log** (newest first; The Company appends at every stopping point):
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
- [ ] M1 — The life of a subscription: the scenario driver and all eleven scenarios as unit tests (twice-delivered and shuffled variants generated), the grace setting and the rule's `past_due` case, the first-failure date kept and cleared correctly across periods; decision on the grace's counting.
- [ ] M2 — What the person sees: the five messages through the mail contract (sent once per failure), the account page's notice and Portal link, Free without deletion; browser tests on the fake adapter in CI. Deploys to `cross-stitch.craftodejnice.cz` (existing target), buying still hidden.
- [ ] M3 — Proof in Stripe's test mode (waits on G-106 (b)): the test-clock run of scenario (1), (2) and (4) against the real API, recorded.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-10-08 — Owner accepted the plan ("you can go ahead with 109, 106 and 126 - 128"), to run after G-109 in the order G-106, G-126, G-127, G-128. Until the Owner answers, the reversible defaults built are: (a) grace 14 days, as the setting's starting value; (b) a dispute or refund is shown to the admin and changes no access by itself (the admin can take the tier by hand, G-127); (c) charts over Free's space kept, readable and exportable, no new saves. M3 BLOCKED: on test keys.
- 2026-10-08 — goal created and planned at the Owner's request.

### G-127 · Subscriptions, part 3: the admin's controls (tiers, prices, people's subscriptions, grants by hand, revenue) — ACTIVE (accepted 2026-10-08)
- **What:** from the 2026-10-06 draft. The admin:
  - makes tiers and prices them;
  - sees each person's subscription and its whole history, including failures and recoveries (G-126);
  - sees who is in a failing payment now;
  - gives or takes a tier by hand (a free month, a comp), with an end date that the rule honours;
  - refunds through Stripe;
  - sees revenue and counts.
- **Why:** the Owner set prices, periods, trial and what each tier unlocks as the admin's to change (2026-10-06), not code's.
- **Acceptance criteria:**
  1. **Prices.** A price is made through the contract (Stripe creates it; the app keeps the row). Changing a price makes a new one and leaves existing subscribers on theirs, unless the admin moves them.
  2. **Grants by hand** are a subscription of their own kind, with no Stripe id and an end date. The rule gives the tier until that date, and the grant ends by itself.
  3. **The log.** Every admin action is logged with who and when, as feature changes are, and appears in the person's history.
  4. **What the admin sees:** the failing-payments list and the second-subscription warning (G-106 (6)). Revenue and counts are read from Stripe through the contract, not added up from webhooks.
  5. **Tests.** Unit tests for the grant rule and price replacement, and browser tests on the fake adapter. Admin pages are never exercised live (standing rule).
- **Architecture fit:**
  - The pages are entries in G-107's admin lists.
  - The log is `FeatureChange`'s pattern with a billing scope, not a second log.
  - Prices go through G-106's contract.
- **To settle:** (a) does the admin issue refunds here, or in Stripe's dashboard only? (b) Is a trial offered, and how long?

**Milestones:**
- [ ] M1 — Tiers and prices in the admin area (make, replace, mark current), grants by hand with an end date honoured by the rule, logging.
- [ ] M2 — People's subscriptions: list, history, failing payments, second-subscription warnings, refunds if (a) says so, revenue and counts; tests; deploys to `cross-stitch.craftodejnice.cz` (existing target).

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-10-08 — Owner accepted the plan ("you can go ahead with 109, 106 and 126 - 128"), to run after G-109 in the order G-106, G-126, G-127, G-128. Until the Owner answers: (a) refunds through the contract from the admin page, since Stripe's dashboard remains available either way; (b) no trial unless the admin sets one, a setting defaulting to none.
- 2026-10-08 — split from G-106's draft and planned.

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
- **JulAI's:** the terms and privacy pages (the Owner's text) and the withdrawal checkbox. A launch checklist that checks, against production, that:
  - the webhook is reachable and signed;
  - the reconciliation service is running;
  - the keys are live-mode;
  - buying's feature state is set;
  - the test-clock scenarios passed on this release.
  Then one real, small purchase and refund by the Owner, as the final check.
- **Milestones:** planned when the Owner takes it up. None of it starts without (1).

**Progress log** (newest first; The Company appends at every stopping point):
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

### G-109 · Limits on server-side actions, set like feature states and given to tiers — ACTIVE (accepted 2026-10-08)
- **What:** asked by the Owner, 2026-10-06. Every action the server does work for (generating a chart, a colour recommendation, an export, a photo upload, and later saving a chart, G-108) gets limits the admin sets, the way G-102 sets feature states: a value for the site, for guests and for accounts, in a **limit set** a tier points at, and for one person, resolved person > tier's set > guests' or accounts' set > site. A limit is a count over a period (e.g. 20 generations a day, 200 exports a month) or a size (e.g. the largest chart in stitches, the largest photo, saved charts kept), and "unlimited" is a value. An action is declared with its limits where it is handled, so a new one appears in the admin list without the admin page being edited, as features do. A person sees what they have used and what is left, and a refusal says which limit was reached, when it resets, and which tier lifts it.
- **Why:** today the server's only limits are per-address bursts against abuse (`lib/server/request-guard.ts`: jobs, sign-in and predictions per minute, set by environment variables), the same for everyone; `Tier.limits` has been an unused JSON column since G-075. Tiers (G-106) need to differ by how much a person may do, not only by which features they have.
- **Acceptance criteria (draft):** (1) `/admin/features` (or its successor from G-107) lists every limited action with its limits and the value each layer gives; (2) a limit set is made, filled and attached to a tier, as a feature set is; (3) a request over a person's limit is refused by the server with the limit named, never only hidden in the interface; counts survive a restart and are shared by every instance (kept in the database, not memory); (4) the person's account page shows used and left for the current period; (5) an action added with a declared limit appears in the admin list with no admin code touched, proven by a temporary one; (6) with every limit unlimited, the browser suite passes unchanged.
- **Constraints:** the existing per-address burst limits stay as the guard against abuse and are not replaced: a tier limit is a quota on top of them. Counting must not store more about a person than the count (the existing `UsageEvent` holds kind, person and time, nothing of the photo or chart). Admin pages are never exercised against the live site (standing rule). Shares its resolution order with G-102 (D304, D307); best built after G-103 and before G-106, so tiers are priced against limits that exist.
- **Answered (Owner, 2026-10-06):** the limited actions are essentially generation and export; others (predictions, uploads, saving) only if planning shows a need.
- **Open questions:** (1) the values for guests, accounts and each draft tier (Personal, Professional, Enterprise), or set by the Owner in the admin area as G-106's tier settings are? (2) periods: calendar day and month, or rolling 24 hours and 30 days? (3) does reaching a limit refuse, or slow (a queue) for some actions? (4) do admins obey limits like everyone else, as they obey feature states?
- **Architecture fit (review, 2026-10-06):** (1) "Declared where it is handled" cannot be taken literally: each route is built on its own, and the admin page cannot read a declaration that lives inside a handler. A limited action is an entry in one list in `lib/` (as `GENERATION_SETTINGS` is, D293) which the handler, the admin page and the account page all read. That list is the registry, and acceptance (5) is proven against it. (2) The order person > tier's set > guests' or accounts' set > site exists once (`lib/features/resolve.ts`, D304, D307). It is made general over the kind of value (a state or a number) and used by both, with the admin's set editor and its logged actions shared; not a second copy of G-102's tables, actions and pages beside the first. (3) `Tier.limits` (the unused JSON column) is either the home of this or removed by this goal, not left as a third place. (4) A quota is one routine, "may this person do this now, and count it", awaited before the work starts and counting in the same transaction as the check. Today's `recordUsage` (`lib/admin/usage.ts`, D247) is not awaited and counts after the job is accepted, which is right for statistics and wrong for a quota. `UsageEvent` needs an index by person, kind and time. (5) The refusal leaves through the same named-refusal shape as `lib/features/request-check.ts`, and the browser shows it through one notice; a route does not word its own. (6) Size limits (stitches, photo size) are checked where the request is read, by the same routine; "a live subscription" is G-106's one rule.
- **Answered (Owner, 2026-10-06, to the review's questions):** a guest may not use a limited action at all: it needs an account. So no key is made from an address and nothing is stored about a guest; "for guests" in What above comes down to this one rule, and the refusal says to sign in. When the limits cannot be read (the database is down), the request is refused; this differs from G-102, where features fall back to on.
- **Built ahead by G-108 M1 (2026-10-08):** the list of limits, the shared resolution and the admin editing, with one size limit (the space for saved charts). This goal adds the counted limits to it.
- **Consequence to confirm when planning (review):** the limited actions are generation and export, and today a visitor does both without an account. Once this goal ships, a visitor can open, draw and keep a chart in the browser but cannot generate or export one, and while the database is down nobody can.

- **Owner, 2026-10-08:** "limits will be set up by admin, they won't apply if not set up". Every counted limit is unlimited until the admin sets it, for guests too, so nothing changes for anyone at deploy; this settles open question (1) and the consequence above, which applies only once the admin sets guests to 0.
- **Owner, 2026-10-08:** "go g-109 first": G-109 is built before the subscription goals (G-106 (a)).
- **Plan (2026-10-08), the acceptance restated:**
  1. **The counted limits** are entries in `ACCOUNT_LIMITS`, beside the two size limits: generations in 24 hours, generations in 30 days, server exports in 24 hours, server exports in 30 days. Each declares its action and its period; periods are rolling (Owner, 2026-10-08), so the refusal says when the oldest counted use drops out. Every entry defaults to unlimited, so the site behaves as today until the admin sets values; the values are the Owner's, set in the admin area (open question 1).
  2. **What is counted.** Only what the server does: a generation (each try is one) and an export made by the processor (`/api/jobs`, `/api/exports`; "Export all" is one export). The editable file, the palette file and pixel art are made in the browser and stay unlimited, since a browser-only limit would be a hidden button, not a limit.
  3. **One quota routine:** "may this person do this now, and count it" (`lib/limits/quota.ts`). It is awaited before the processor is asked and checks and counts in one transaction, under a per-person lock, so two requests at once cannot both pass the last unit. If the processor then refuses the job (its queue is full, or it cannot be reached), the count is given back. An unlimited action counts as statistics only, as today. `UsageEvent` gets an index by person, kind and time.
  4. **Guests.** A guest's value is either 0 ("sign in to generate") or unlimited. No number is counted for a guest, so nothing is stored about one (Owner, 2026-10-06).
  5. **The refusal** comes from the server: status 429 with the limit named, when it resets, and, when some tier gives more, that a plan lifts it. Its shape is `lib/features/request-check.ts`'s, and the browser shows it through one notice. When the limits cannot be read, the request is refused with 503 (Owner, 2026-10-06).
  6. **The admin's Limits page** lists the counted limits with no change to the page (the list is the registry). A temporary entry proves this in a unit test.
  7. **The account page** shows used, left and the reset for each counted limit that is not unlimited.
  8. **Tests.** Unit tests: periods and resets, the quota's arithmetic, give-back, refusal wording. Browser tests in CI:
     - a person over a limit is refused by name;
     - the account page shows the count;
     - a guest at 0 is told to sign in;
     - two requests at once at the last unit: one passes;
     - with every limit unlimited, the rest of the suite passes unchanged.

**Milestones:**
- [x] M1 — The counted limits and the quota: rolling periods in the list (pure), the four entries, `quota.ts` with its transaction, lock and give-back, the index migration; unit tests; decisions (quota counted from `UsageEvent` under a lock; what counts as one).
- [x] M2 — The routes and the refusal: `/api/jobs` and `/api/exports` take the quota before the processor; the 429 and 503 refusals in the shared shape; the browser's notice; guests at 0; browser tests in CI.
- [ ] M3 — Where it is seen: the admin's Limits page with the periods, "what they get" per layer; the account page's used, left and reset; the temporary-entry proof; browser tests.
- [ ] M4 — Records and release: HANDOVER, coverage rows, release notes, docs-lint; `npm run release`, push, deploy to `cross-stitch.craftodejnice.cz` (existing target) with every counted limit unlimited (nothing changes for anyone until the admin sets values); live check with single GET requests.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-10-08 — M3 written: the admin's Limits page lists the four counted limits from the registry with their periods; the guests row now says per limit what a value means (no effect on space; any number means sign in first). The account's Usage page shows, for each counted limit in force, used of value, left and when the next is available (`quotaStatus`, `nextWords`); nothing is shown while all are unlimited. A temporary registry entry is proved offered, defaulted, parsed and enforced with no other change (`quota.spec.ts`), which also caught "1 hours" in the refusal. Browser checks added to `counted-limits.spec.ts` and `admin-limits.spec.ts`. Verified locally: unit 1,567, tsc, eslint, prettier, check-skin, check:brief, release notes, docs-lint. Next: CI, then M4.
- 2026-10-08 — M2 written: `/api/jobs` and `/api/exports` take the quota before the processor through `quotaForRoute` (429 with `retry-after`, 403 "sign-in" for guests, 503 when the limits cannot be read; body `{error, limit}`); the browser turns a body with `limit` into `LimitReachedError` and shows its words in the generation and export notices. Browser tests in `tests/e2e/counted-limits.spec.ts`: refusal by name at 0, give-back on a processor refusal, two at once at the last use (one 202, one 429), the notice's words, an export counted and the next refused, a guest told to sign in (`@alone`). Verified locally: tsc, eslint, prettier, check-skin, check:brief, release notes; unit 1,565. CI green on cc31ff3: e2e 666 and 25 (three new cases). Next: M3.
- 2026-10-08 — M1 done: the four counted limits (`generations.24h`, `generations.30d`, `exports.24h`, `exports.30d`, unlimited by default) and `countedLimits` in `lib/limits/limits.ts`; the pure rules in `lib/limits/quota.ts` (rolling use, the longest wait, guests refused, words, Retry-After); `takeQuota` in `quota-server.ts` (advisory lock, check and count in one transaction, give-back); the index migration. D364, D365. Verified: tsc, eslint, prettier, check-skin, check:brief, release notes, docs-lint; unit 1,565 (20 new in `quota.spec.ts`). `takeQuota`'s database half is exercised from M2's browser tests in CI. Removed from HANDOVER: nothing; one Next steps line added. Next: M2.
- 2026-10-08 — Owner accepted the plan, to run through all milestones. Answers: rolling 24 hours and 30 days; a limit reached refuses (no queue); admins obey limits as everyone does. Open questions (1) to (4) are all answered.
- 2026-10-08 — planned at the Owner's word ("go g-109 first").
- 2026-10-06 — goal created.

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

### G-119 · Transparency as colour, and a library of stamps kept with the account — ACTIVE (accepted 2026-10-08)
- **What:** asked by the Owner, 2026-10-08: "add a switch to selection tools "transparency as color" if it is on - transparent parts rewrite any color. if it is off, transparent cells do not affect the cells on move or transform selected part. Also we need to add a library of samples saved to the account which can be reused in designs. Save as a sample becomes a selection button on a right panel. On the very top panel there is a add sample button which is active if user has samples and lets chose the sample from gallery". This takes over the stamps draft of 2026-10-07 (the mock-up's Account › Stamps).
- **Why:** a piece moved over a design today wipes what lies under its empty cells; and a motif, border or lettering made once has to be redrawn in every chart.
- **Acceptance criteria (restated):**
  1. Select, Lasso and Wand share a **Transparency as colour** switch in their quick options. On: a piece's empty cells overwrite what they land on (today's behaviour). Off: they leave the cells beneath as they are, in the live preview and when the piece is applied; backstitch beneath is kept likewise. The place a moved piece was lifted from is still emptied either way. The switch starts Off.
  2. **Save as stamp** is a button in the right panel's Selection tab: it asks a name and keeps the piece (stitches, stitch types, shape, backstitch and its threads) with the account. Without an account, or with the feature off, the button says why it cannot be used.
  3. Stamps are kept by the server, refused to anyone but their owner, checked with the same rules as a saved chart's contents, and limited in number by an entry in the existing list of limits.
  4. **Add stamp** sits in the top bar; it is usable only when the reader has stamps. It opens a gallery of their stamps (preview, name, size, threads, search); choosing one places it on the chart as a piece in hand, to move, flip and apply. A thread the chart lacks is added to its palette; a full palette is refused with a message.
  5. An account section lists the stamps as the mock-up draws them (cards with preview, search, pin, rename, delete with a confirmation), with the count beside its tab.
  6. Unit tests for the stamping rule, the stamp's contents and the palette mapping; browser tests for the switch both ways, saving, the account section, Add stamp and placing; the release deployed.
- **Constraints:** **personal data:** stamps are user content on the shared host, deleted with the account, in the same backups as saved charts (flagged to the Owner, VALUES). The account section is one entry in G-107's section list (D346). Admin pages are never exercised live; the deploy is a release (`npm run release`) with a database dump before the migration.
- **Architecture fit:** the stamping rule stays in `lib/editor/floating-selection.ts` (`stampSelection`, `mergeSelection`), told the switch's value, not a second merge. The switch is a shared tool option, as `lockTransparency` is (`app/tools/types.ts`). The stamp's contents and their check are pure modules in `lib/stamps/`; routes follow `app/api/charts/`; the limit and the feature join their registries; the gallery and the account cards reuse `lib/charts/chart-cards.ts`'s search and order.

**Milestones:**
- [x] M1 — Transparency as colour: the shared switch in the quick options of Select, Lasso and Wand, honoured by the preview and the apply, for stitches and backstitch; unit and browser tests; a decision file.
- [x] M2 — Stamps kept by the server: the `Stamp` table and migration, the pure contents and their check, routes to list, save, rename, pin and delete, the limit and the feature; unit and API tests.
- [x] M3 — Save as stamp in the Selection tab, and the account's Stamps section with its count; browser tests.
- [x] M4 — Add stamp in the top bar and its gallery; placing as a piece in hand with the palette mapping; browser tests.
- [x] M5 — Records and release: HANDOVER, coverage rows, release notes, docs-lint; database dump, `npm run release`, push, deploy to `cross-stitch.craftodejnice.cz` (its existing target), live check with single GET requests.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-10-08 — Owner follow-up before sign-off: "Add back and halfstitches support in preview (and to stamps if it is not there)". Stamps already kept half stitches and backstitch; the previews (stamps and saved charts, one drawing) now show both, several pixels a stitch (D362), and a migration drops the stored previews, redrawn on first request. Verified: 1,545 unit (5 new), tsc, eslint, prettier, docs-lint, brief checks; e2e specs updated for the new sizes and the lazy stamp redraw; CI green on 50d05ee (check, rust, e2e 664 and 24). Released as v0.20.0 (a6c13f3) and deployed with no database dump (Owner, 2026-10-08: none until the official release); migration applied, every stored preview dropped (0 of 3 stamps, 0 of 2 charts), live single GETs as before. The release was cut in a temporary worktree, removed after, because another session's untracked file sat in the main tree. Next: Owner sign-off.
- 2026-10-08 — M5 done, goal complete, awaiting the Owner's sign-off: v0.18.0 (5d2d78d) deployed to `cross-stitch.craftodejnice.cz`. M4's CI had failed (parity fixture bundle lacked `process.env` once the Selection tab gained a sign-in link; two stamp specs and one admin spec located rows by place or name that changed; a placed stamp returned focus to Add stamp, so Enter reopened the gallery, fixed in `useModalFocus`); all fixed, CI green on b63cccb (check, rust, e2e 664 and 24), 1,541 unit. Database dumped and checked before the `stamps` migration (19 tables). Live, single GETs only: migration applied, `/`, `/whats-new` (lists 0.18.0) 200, `/account/stamps` to `/login`, `/api/stamps` 401 for a guest; only the app restarted, 24 containers same names, every live site 200. Next: Owner sign-off; then delete the dump and archive the goal.
- 2026-10-08 — M4 done: Add stamp in the top bar, its gallery (search, refusal shown in place), placing by `lib/stamps/place.ts` (D361), the grown chart committed with the piece. Verified: 1,541 unit (8 new for placing), tsc, eslint, prettier, docs-lint, brief checks; e2e `stamps-add.spec.ts` runs in CI. Also: the lasso cost-ratio test warms both sides (a4e1223), as a cold CI run failed it with the code unchanged. Next: M5.
- 2026-10-08 — M1–M3 done (c2c2ba9, 97eb8df, f90ba5a). M1: the switch, Off by default (D359); the viewport-parity fixture now places its piece with the switch On, as the frozen drawing knew only that. M2: `Stamp` table, routes, limit and feature (D360). M3: Save as stamp with a name dialog, the account's Stamps section and its count. Verified: 1,533 unit, tsc, eslint, prettier, docs-lint, brief checks; CI on M2 failed 7 e2e: 6 parity cases (fixed in M3) and the stamps API spec meeting 429, because the e2e servers never raised the chart-save rate limit (bc5be0b raises it). CI on M3 pending. Next: M4.
- 2026-10-08 — Owner accepted the plan, to run through all milestones. Answers: the switch starts Off (empty cells keep what is beneath; a change from today); the pieces are called stamps, as the mock-up names them ("sample" is the demo chart's name); tags and importing a stamp file are left for later.
- 2026-10-08 — widened by the Owner (transparency switch, stamps library, Save as stamp, Add stamp); plan written.
- 2026-10-07 — drafted as stamps from the Owner's mock-ups for G-107.

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
