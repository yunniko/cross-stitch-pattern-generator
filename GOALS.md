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

- 2026-10-05 -- The keys the Owner agreed and the brush options (D288): S Select, V Move, H Pan, Z Zoom; Ctrl+C, Ctrl+V, Ctrl+D for the piece or backstitch in hand; Ctrl+K opens and closes the command list; brush size and shape shown only with Brush, Line, Rectangle and Oval. Verified: unit 1,048, 4 new browser cases, full suite 558 passed. Ctrl+C and Ctrl+V are pinned by unit tests on the key table; the browser case presses Ctrl+D and reads Paste from the list.
- 2026-10-04 -- The new-chart confirmation has a one-press safe choice, "Export, then start new" (Owner): it downloads the editable file and goes on, and keeps the chart if the file could not be made. Undoable new charts and a kept previous chart are left for later (draft G-097). Verified: one new e2e case, the affected specs, full suite.
- 2026-10-04 -- A new chart opens in the Color view whatever view the last one was left in (Owner, after the G-091 QA pass; D283 updated). Verified: unit rows, one new e2e case, full suite.
- 2026-10-04 -- QA findings 7 and 8, the behaviour chosen by the Owner: choosing another palette mode with colours chosen asks first ("Switch and empty" / "Keep"); Escape in a Crop number puts that number back, a second Escape the whole frame. Verified: affected specs 27 of 27, one new case and one extended.
- 2026-10-04 -- **QA batch** (findings of `docs/qa-review/qa-review-2026-10-04-changed.md`): the custom size is typed freely and limited and rounded on leaving the field (1, 10); the Crop frame waits through a looking-only view and survives choosing Crop again (2, 9); a loaded palette brings its palette mode (3); Fill with predicted colours waits for the current recommendation (4); Crop's Apply and Cancel stay in view in a narrow window (5); Apply waits for unusable text (6); a chart with no colours has no palette to export (11); palette file names keep any script (12); wording, newer-version refusal, duplicates counted once (13); recommendations at once 2 to 4 (processor). Findings 3, 4 and 11 and the processor constant are outside the fast lane's limits and went through the full suite before the deploy. Verified: 255 related unit tests, 10 new e2e cases, two old size specs rewritten for the new behaviour, full suite 540 passed, 0 failed.

## Active goals

### G-102 · Feature switches: On, Locked or Hidden for the site, for a person, or as a set for a tier — ACTIVE (2026-10-06)
- **What:** every feature of the editor is one entry in one list, in groups, and has one of three states for a given person: **On** (offered and usable), **Locked** (shown in place, greyed, with a note saying why, and refused if asked for) or **Hidden** (absent, as if it did not exist, and refused if asked for). The state is set for the whole site, for one person, or as part of a named **feature set** that a subscription tier will later point at. The admin area gets a Features page (the list, a state per group and per feature, feature sets) and a per-person state list on the users page. A new feature appears in the list by being declared where the feature itself is (a tool, an export kind, a generation setting, a dither pattern, a texture, a view), not by editing the admin page.
- **Why:** the Owner's ask of 2026-10-06; the ground for subscription tiers (`Tier`, `Subscription` have waited since G-075 for a product decision on what a tier unlocks).
- **Acceptance criteria:** (1) the admin sees every feature grouped, with the state it has for the site, and can set a whole group or one feature to On, Locked or Hidden; (2) the admin can set any feature's state for one person, and the person's state wins over the site's; (3) the admin can make named feature sets, give each feature a state in them, and attach one to a tier; a person on that tier gets the set (person > tier's set > site); (4) a Hidden feature is not offered to that person anywhere in the interface, a Locked one is shown greyed with its note and does nothing when pressed, and a server request for either is refused by name; (5) a feature added to any registry appears in the list with no admin code touched, proven by adding and removing a temporary one; (6) nobody else's experience changes while every feature stays on: the browser suite passes unchanged.
- **Constraints:** the three states and their names (On, Locked, Hidden) are the Owner's (2026-10-06); Locked is shown greyed although the person cannot act on it, which the placement rule "absent, not disabled" otherwise forbids: the Owner's decision for this one case, and the note on the control says why. No billing, no Stripe, no tier is sold (the Owner's "later"; VALUES → no money without approval): the tier side of this goal is the attachment only. Visitors without an account follow the site's switches (assumption, to confirm). A chart holding data of a feature that is off (backstitch lines, a texture) keeps that data and still shows it; only making more of it is withheld (assumption: switching a feature off must never damage a chart). Admin pages are never exercised against the live site (standing rule).

**Milestones** (proposed; a deploy at M4 to `cross-stitch.craftodejnice.cz`):
- [x] M1 -- **The feature list, from the registries.** `lib/features/`: a feature is `{ id, group, label }` derived from the tools (D284), the commands that are not tools, the export kinds, the generation settings and dither patterns (D293), the textures and the views; groups are those of the registries. One pure gate, `featureState(features, id)` → On, Locked or Hidden, and the interface reads it where each registry is read (tools offered, export kinds, settings drawn, dither chooser, texture pickers, views): Hidden leaves the entry out, Locked draws it greyed with the note and takes no press; with everything On, nothing changes. A unit test pins that every registry entry has a feature, and the temporary-feature proof of acceptance (5).
- [ ] M2 -- **States and their resolution.** Prisma: `FeatureState` (site), `UserFeature` (person), `FeatureSet` and its entries, `Tier.featureSetId`. One resolver (person > tier set > site > the feature's default, On) with unit tests; the resolved list reaches the page with the session and the processor's request check, which refuses an export kind or a generation setting that is Locked or Hidden for the requester (acceptance 4). Unknown ids in the database are ignored, so a removed feature leaves no error behind.
- [ ] M3 -- **The admin pages.** `/admin/features`: the groups, a state per group (set all at once; a mixed group shown as such) and per feature; feature sets: make, name, give each feature a state, attach to a tier; `/admin/users`: a person's states beside the existing disable. Server actions with the admin guard, rate-limited like the rest; every change logged with who and when.
- [ ] M4 -- **QA, docs, deploy.** Browser specs for an admin setting a feature Locked and Hidden and a person seeing each (local only); the brief gains a `10-features` file and `coverage.md` rows; HANDOVER and the architecture guide say where a new feature declares itself; QA pass; deploy.

**Open questions for the Owner (answers change M2):**
1. Visitors without an account: the site's states, or a "Visitors" feature set of their own?
2. Answered 2026-10-06: three states, On, Locked (shown greyed with a note) and Hidden (absent).
3. Should an admin's own account bypass every state (so the Owner always sees everything), or obey them like anyone else so a tier can be tried as a user would see it? The plan says obey, with the Owner's states set by hand.

**Progress log** (newest first):
- 2026-10-06 -- M1 done (D303). **The list:** `app/features/registry.ts` derives 55 features in 10 groups from the registries (13 tools; the isolate, mirror, symmetry and lock commands; the Stitched and photo views; 9 export kinds; 8 generation settings; 9 dither patterns; 7 textures; 3 brands). A thing says what it is under with `feature`: left out, its own; `null`, core (Pan, Zoom, Undo, the size, the colour count, the workspaces, the zoom, the cursor); a string, another's (the four mirrors are one, the four symmetry axes one, the strokes' density is the strokes'). **The three states** (`lib/features/features.ts`): on, locked, hidden, unset meaning on. **The gates:** `useFeature`, `useGatedOptions` and `FeatureGate` read the states wherever a registry is read: the tool rail (hidden left out, locked greyed with the note, and never the tool in hand), the command table (hidden dropped with its key, locked unavailable with the note), the export kinds, Export all, the view controls, the quick mirrors, symmetry, the lock, Isolate, the photo settings, the dither patterns, the textures, the brands in three places, the drawn settings. A stored setting that names an unusable feature is read as its default (`in-force.ts`). **The proofs:** a temporary generation setting declared with a control appeared in the list as `generation.proofSetting`, "Proof setting", under Generation, with nothing else edited (unit test, then removed); a temporary set of sixteen states handed to the page was looked at in the browser: Text greyed and refusing its key, Crop and symmetry absent, the A4 kind and Export all greyed, Bayer 8×8, Cosmo and Cross 2 greyed, Anchor and Pixel absent, Vivid and the proof setting greyed, the locked mirrors listed in the command list as unavailable with the note; no page error. **Verified on a production build of the final code, everything on:** 1,174 unit (12 new); browser suite 592 pass plus the 2 run alone, 0 failed, 0 flaky, unchanged (acceptance 6); tsc, eslint, prettier, check-skin, docs-lint and the brief checks clean. Milestone note: HANDOVER gains the G-102 paragraph; the G-079 paragraph (signed off 2026-09-30, its record in `docs/goals-archive/G-071-to-G-080.md`) left Current state to keep its cap. Next: M2.
- 2026-10-06 -- **Owner accepted the plan** ("accept"), with the two assumptions standing: visitors follow the site's states; the admin's account obeys the states. M1 started.
- 2026-10-06 -- the Owner asks for three states instead of on/off: on, off (hidden entirely) and unavailable (shown but inactive). Named On, Locked, Hidden; the plan updated; still awaiting acceptance.
- 2026-10-06 -- goal created from the Owner's ask; plan written, awaiting acceptance.

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

### G-069 · The workspace stops being the only thing that knows how everything connects — DRAFT (2026-09-24; absorbed into G-091, 2026-10-04)
- **What:** the changes `docs/reviews/2026-09-24-workspace-shape.md` recommends: a `useEditorDocument` hook owning
  what it means to replace the open chart, then grouped props for the panes that take 31 and 30 of them.
- **Why:** `app/workspace.tsx` is 754 lines of which 465 are logic and 289 are wiring, and not one of its 19
  functions is longer than 18 lines. It is not complex, it is wide — and the eight functions that replace a chart
  each have to remember the same list of state to reset. That is the shape of mistake that produced D217.
- **Acceptance criteria:** replacing the open chart is decided in one place; adding a tool touches one hook and one
  component; no behaviour change, suites green.
- **Constraints:** not a line-count exercise. G-067's "under 300 lines" was a bad proxy and is not inherited; a shell
  component taking 38 props would meet it and improve nothing.

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
