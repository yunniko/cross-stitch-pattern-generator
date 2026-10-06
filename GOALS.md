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

- 2026-10-06 -- **Fix (Owner: Generation features did not switch in feature sets, "That is not a feature id.").** The admin's server actions accepted lowercase ids only, so every Generation feature but Vivid (`generation.edgeMode`, `ditherMode`, `paletteSet`...) was refused, in sets, for the site and for a person alike. The shape is now `isFeatureIdShape` in `lib/features/features.ts` (either case), and a unit test holds every id in the feature list to it; D305 corrected. Verified: unit 1,182 (1 new); the tier spec now locks `generation.edgeMode` in a set and finds it kept after a reload; full suite 591 pass plus 11 alone, 0 failed, 1 flaky (the fonts, as before). Missed by G-102's specs, which wrote Generation states straight to the database.
- 2026-10-05 -- The keys the Owner agreed and the brush options (D288): S Select, V Move, H Pan, Z Zoom; Ctrl+C, Ctrl+V, Ctrl+D for the piece or backstitch in hand; Ctrl+K opens and closes the command list; brush size and shape shown only with Brush, Line, Rectangle and Oval. Verified: unit 1,048, 4 new browser cases, full suite 558 passed. Ctrl+C and Ctrl+V are pinned by unit tests on the key table; the browser case presses Ctrl+D and reads Paste from the list.
- 2026-10-04 -- The new-chart confirmation has a one-press safe choice, "Export, then start new" (Owner): it downloads the editable file and goes on, and keeps the chart if the file could not be made. Undoable new charts and a kept previous chart are left for later (draft G-097). Verified: one new e2e case, the affected specs, full suite.
- 2026-10-04 -- A new chart opens in the Color view whatever view the last one was left in (Owner, after the G-091 QA pass; D283 updated). Verified: unit rows, one new e2e case, full suite.
- 2026-10-04 -- QA findings 7 and 8, the behaviour chosen by the Owner: choosing another palette mode with colours chosen asks first ("Switch and empty" / "Keep"); Escape in a Crop number puts that number back, a second Escape the whole frame. Verified: affected specs 27 of 27, one new case and one extended.
- 2026-10-04 -- **QA batch** (findings of `docs/qa-review/qa-review-2026-10-04-changed.md`): the custom size is typed freely and limited and rounded on leaving the field (1, 10); the Crop frame waits through a looking-only view and survives choosing Crop again (2, 9); a loaded palette brings its palette mode (3); Fill with predicted colours waits for the current recommendation (4); Crop's Apply and Cancel stay in view in a narrow window (5); Apply waits for unusable text (6); a chart with no colours has no palette to export (11); palette file names keep any script (12); wording, newer-version refusal, duplicates counted once (13); recommendations at once 2 to 4 (processor). Findings 3, 4 and 11 and the processor constant are outside the fast lane's limits and went through the full suite before the deploy. Verified: 255 related unit tests, 10 new e2e cases, two old size specs rewritten for the new behaviour, full suite 540 passed, 0 failed.

## Active goals

### G-103 · The three workspaces are features: Generation, Edit and Export each switched with its tab — DRAFT (2026-10-06)
- **What:** asked by the Owner, 2026-10-06. Generation, Edit and Export become features in the G-102 list, each one switch covering both the work and the way in: the workspace's tab and everything inside it. Hidden: the tab is absent and the workspace cannot be reached by any road (key, command list, link, a request to the server). Locked: the tab is shown greyed with its note. On, Locked or Hidden for the site, a person, a feature set, guests or accounts, as every other feature.
- **Why:** G-102 made the workspaces core (`feature: null`), so today a tier can withhold single generation settings or export kinds but not a whole stage; the Owner wants a stage as one switch.
- **Acceptance criteria (draft):** each of the three appears in `/admin/features` as one entry; Hidden and Locked hold for the tab, the keys and commands that open it, and the server routes behind it (generate, export), refused by name; the features inside a workspace keep their own switches, and a workspace switched off wins over them; with all On, the browser suite passes unchanged.
- **Constraints:** a chart already open keeps its data whatever is switched off (G-102's rule: never damage a chart). Admin pages are never exercised against the live site (standing rule).
- **Open questions:** (1) with Generation off, how does a person start a chart: an empty grid of a chosen size, opening a file, or not at all? (2) when the workspace a person would land in is off, which one opens? (3) does Edit off still allow the photo settings and cropping, or are those Edit's?

### G-104 · A colour picker, held on a key without changing tools — DRAFT (2026-10-06)
- **What:** asked by the Owner, 2026-10-06. A colour picker: pressing on a stitch takes its colour (and a backstitch line's) as the colour in hand. It is a tool of its own in the rail, and it is also reached by holding a modifier key with any drawing tool in hand: while the key is down the pointer picks, and on release the tool in hand is unchanged.
- **Why:** taking a colour from the chart today means finding it in the palette by eye.
- **Acceptance criteria (draft):** pick a stitch's colour with the tool and with the held key from Brush, Line, Rectangle, Oval and Fill; the tool in hand never changes; the pointer shows picking while the key is held; an empty cell picks nothing and says so; the picker is a feature in the G-102 list; unit tests on the key table, browser cases for both roads.
- **Constraints:** the key must not take one the Owner agreed in D288 or that a tool already uses as a modifier (Ctrl ends a backstitch line, D236; Shift takes larger steps for the keyboard cursor and Crop; Alt with Zoom zooms out). A tool is one module (D284).
- **Open questions:** which key: Alt (as in common image editors; on some systems Alt alone moves focus to the browser menu, which needs handling) or another? Should a half stitch or a backstitch line be pickable, and which wins when a press lands on both?

### G-105 · Release versions, release notes, a user guide, and a process that keeps them current — DRAFT (2026-10-06)
- **What:** asked by the Owner, 2026-10-06. (1) The app carries a release version (today `package.json` reads 0.1.0 and nothing shows it): each deploy is a numbered release, tagged in git, shown in the app. (2) Release notes per release, written for users (what changed, not commits), shown in the app as "What's new". (3) A user documentation wiki: how to use every workspace, tool and export, with pictures. (4) The development process changed so that a change which alters what a user sees updates the guide and the next release's notes in the same commit, enforced by a check, not a promise.
- **Why:** users have no record of what changed or how anything works; the design brief (`docs/design-brief/`) describes the app for the developers, not for users.
- **Acceptance criteria (draft):** the version shows in the app and matches a git tag and a deploy-log row; every release since the scheme starts has notes; the guide covers every feature in the G-102 list (a check fails when a feature has no guide page, as `coverage.md` does for the brief); `docs/development-loop.md` and the fast lane (D280) name the step; a feature Hidden for a person is left out of the guide they see (assumption, to confirm).
- **Constraints:** nothing published elsewhere without the Owner's approval (VALUES): the guide lives in the app itself unless the Owner chooses an outside host. Screenshots are made from the app by a script, so they can be remade when the interface changes.
- **Open questions:** (1) version scheme: semantic (1.4.2) or by date (2026.10.06)? (2) the guide: pages inside the app (`/help`), or an outside wiki? (3) language: English only, or also Czech? (4) can users edit or comment on the guide, or is it written by the Company only?

### G-106 · Subscriptions: Stripe, tiers that are sold, and the admin's controls — DRAFT (2026-10-06)
- **What:** asked by the Owner, 2026-10-06. A person can subscribe to a tier, pay through Stripe (Checkout and the Customer Portal), and gets the tier's feature set (G-102) while the subscription is live; Stripe's webhooks keep `Subscription` current (renewal, failed payment, cancellation, end of period). The admin can make and price tiers, see each person's subscription and its history, give or take a tier by hand (a free month, a refund, a comp), and see revenue and counts.
- **Why:** `Tier` and `Subscription` (with `stripePriceId`, `stripeCustomerId`) have waited since G-075; G-102 built what a tier unlocks.
- **Acceptance criteria (draft):** end to end in Stripe's test mode: subscribe, renew, fail a payment, cancel, and each changes what the person can use within the feature list's refresh time; webhooks verified by signature and safe to receive twice; no card data ever touches this app's server; the admin actions logged with who and when, as feature changes are.
- **Constraints:** **escalation-tier, needs the Owner:** creating the Stripe account, accepting its terms, the business identity it is held under, and switching to live mode (VALUES: no accounts, no money without approval). Built and verified in test mode only until the Owner says otherwise. Selling needs terms of service, a privacy policy, prices with VAT (EU) and invoices, which are the Owner's to decide and may need professional advice. G-030 withdrew a plain paywall-on-exports plan; whether this goal is part of G-030's social ecosystem or stands apart is the Owner's call.
- **Open questions:** (1) which tiers, at what prices, monthly and/or yearly? (2) a free trial? (3) what happens to saved charts (G-108) when a subscription ends? (4) on whose name and country is the Stripe account (decides VAT handling)?

### G-107 · The admin area and the account pages redesigned — DRAFT (2026-10-06)
- **What:** asked by the Owner, 2026-10-06. The admin area (`app/admin/`: overview, users, a person's features, features, stats) and the account page (`app/account/`) redesigned as one consistent set, in the app's own look (`app/skin/`) and against the placement rules (`docs/interface-placement.md`), with room for what G-106 and G-108 add: subscription and billing, saved charts, publicity settings.
- **Why:** these pages grew a goal at a time (G-075, G-102) and were never designed as a whole; G-106 and G-108 would add to them as they are.
- **Acceptance criteria (draft):** set with the Owner from mock-ups, as G-095's were; the existing admin and account specs pass, rewritten only where the behaviour is meant to change; keyboard and contrast checks as the editor has.
- **Constraints:** admin pages are never exercised against the live site (standing rule). Best done before G-106 and G-108, so they are built into the new pages.
- **Open questions:** what the Owner finds wrong or missing today on these pages, before mock-ups are drawn.

### G-108 · Charts saved to an account, a gallery, and who can see each (private by default) — DRAFT (2026-10-06)
- **What:** asked by the Owner, 2026-10-06. A signed-in person saves a chart to their account (the versioned document of G-094, with its photo if they choose) and reopens it from any browser; their charts are listed with previews. Each chart has a visibility: **private** (the default), unlisted (anyone with the link), or public (in a gallery). The gallery shows public charts with previews; the owner can change visibility or delete at any time. Account settings hold the defaults.
- **Why:** today a chart lives only in one browser or an exported file; G-097 left "a full chart library" for later.
- **Acceptance criteria (draft):** save, reopen elsewhere, rename, delete; a private chart refused to anyone else by the server, not only hidden by the interface; a new chart is private until its owner changes it; the gallery lists only public charts; storage limits per person (and per tier, through G-102/G-106) enforced and named; saving is a feature in the G-102 list.
- **Constraints:** **personal data:** saved charts and photos are user content stored on the shared host; this needs a retention rule, deletion on account deletion, a backup plan, and the privacy policy G-106 also needs (flagged to the Owner, VALUES). A public gallery hosts content uploaded by users, so a way to report and take down a chart, and whose photos may be shown, are the Owner's decisions. Overlaps G-030 (the social ecosystem) and G-097 (2: the last replaced chart): the gallery is the first piece of G-030 if the Owner wishes.
- **Open questions:** (1) is the source photo saved with a chart, and shown publicly? (2) storage limits for accounts without a tier? (3) can others copy a public chart into their own account? (4) moderation: report button, admin takedown, or review before publishing?

### G-100 · Dithering is extensible: a pattern is one module, written once — DRAFT (2026-10-05)
- **What:** asked by the Owner, 2026-10-05. Today a dither pattern exists twice: in Rust, which makes the chart (`rust/cs-core/src/dither.rs`, `dither_hand_drawn.rs`), and again in TypeScript (`lib/pipeline/dither.ts`, `dither-hand-drawn.ts`), which draws the preview in the photo settings; its id is in two lists, its label and group in the photo settings, and a pattern with settings of its own (as the drawn marks have) has its editor written by hand. The goal: (1) a pattern is one Rust module behind one contract (its id, its settings, its arithmetic) in a list, as overlays are; (2) the preview is drawn by that same code, so nothing is written twice; (3) a pattern's name, group and settings are declared once and the chooser and its settings are drawn from the declaration.
- **Why:** a threshold-matrix pattern is already only data (D198), but any other new pattern is two implementations that must agree, three lists and hand-written interface.
- **Acceptance criteria:** the 13 existing patterns produce the same charts (golden hashes, `scripts/measure-generation.ts`) and the same previews (compared pixel for pixel before and after); a new pattern added as one Rust module and one declaration, shown by a temporary one and then removed; the preview of a pattern without settings appears no slower than today, and the wait for a pattern with settings (now a request to the server) is measured and reported.
- **Constraints:** **Where the preview comes from is decided (Owner, 2026-10-05):** "By default dithering should have precompiled images, it doesn't need to dither every time. If dithering is parametrical as hand drawn one, let it just be dithered at server side." So a pattern without settings of its own has its preview made once, when the app is built, by the Rust that makes charts; a pattern with settings asks the server for its preview when a setting changes. The TypeScript copies of the patterns go. Old charts record the pattern they were made with by id, so ids never change.

**Milestones** (proposed 2026-10-05; not started, waiting for the Owner's go):
- M1 -- **Measure and pin.** The previews of all 13 patterns as they are drawn today, saved as the reference; how long the drawn-marks preview takes to appear today; the charts pinned by the golden hashes and `scripts/measure-generation.ts`.
- M2 -- **A pattern is one Rust module.** One contract (id, its own settings, its arithmetic, whether it has settings) and one list; the 13 patterns moved behind it; charts unchanged.
- M3 -- **Previews from that code.** A build step has Rust draw the preview of every pattern without settings into image files the app ships; a pattern with settings asks the server (a request of its own kind, limited like the colour recommendation, sent once the settings rest). The TypeScript implementations are deleted. Previews compared with the reference, and the wait measured.
- M4 -- **Declared once, and the proof.** A pattern's name, group and settings in one declaration that the chooser and the settings are drawn from; a temporary pattern added as one module and one declaration, then removed.
- M5 -- **Docs, QA pass, full suite, deploy** (cross-stitch-pattern-generator to `cross-stitch.craftodejnice.cz`).

**Left by G-095 (2026-10-05):** the patterns are chosen from ten pictures (`app/components/dither-chooser.tsx`), drawn in the browser by the TypeScript patterns; M3 here replaces what draws them with the built images, and the larger preview under them the same way.

**Known before starting:** today's preview for the drawn marks is redrawn in the browser as a slider moves; from the server it will lag by the request. If the reference previews differ from Rust's anywhere, that is a difference between today's two implementations and is reported, not hidden.

### G-101 · A phone layout, and drawing by touch — DRAFT (2026-10-05, for later)
- **What:** the editor usable on a phone: the regions G-095 builds (tools, panel, quick options, view controls, tries) rearranged for a narrow screen, and touch given a meaning on the chart (one finger draws or pans, a pinch zooms), with a visible control for everything a key does.
- **Why:** asked by the Owner on 2026-10-05, who chose to keep it out of G-095.
- **Acceptance criteria:** to be set with the Owner from mock-ups, as G-095's were.
- **Constraints:** after G-095, whose three provisions are what make this a matter of design and touch behaviour, not of restructuring. Needs phone-sized test runs and a check on a real device.

### G-097 · A new chart can be undone, and the replaced chart survives a reload — DRAFT (2026-10-04, left for later by the Owner)
- **What:** (1) starting a new chart is one more step in the undo history instead of a new history, so Undo brings the old chart back with its photo, axes and settings, and the confirmation can go; a notice says so. (2) The browser keeps the one chart that was last replaced, and the start screen offers to reopen it.
- **Why:** today a replaced chart is gone unless it was exported; the confirmation is the only guard.
- **Acceptance criteria:** to be set when taken up. Known work: undo across documents must restore the photo in hand and reset the view as D283 does; history is memory-only and 50 steps deep, which is why (2) exists.
- **Constraints:** changes undo history and browser storage, so a normal goal. A full chart library belongs with G-094.

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
- **One durable technical fact worth keeping regardless of eventual
  shape** (verified while a fuller version of this goal was briefly
  drafted, then withdrawn): `buildPattern` (`lib/pattern.ts`) and
  everything it calls already take/return plain typed-array buffers with
  zero DOM dependency (`lib/pattern.worker.ts` is just a thin
  `postMessage` shim around it) -- so if a future version of this goal
  ever does need server-side generation, the existing TypeScript pipeline
  can run in a Node server context unmodified, without needing G-023's
  Rust work first. Not a decision, just a fact worth not re-deriving
  later.
