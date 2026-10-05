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

**Known before starting:** today's preview for the drawn marks is redrawn in the browser as a slider moves; from the server it will lag by the request. If the reference previews differ from Rust's anywhere, that is a difference between today's two implementations and is reported, not hidden.

### G-095 · Interface redesign against the placement rules — DRAFT (2026-10-04)
- **What:** the Owner's redesign, built on `docs/design-brief/` and `docs/interface-placement.md`: every control placed by scope, view and application controls independent of the tool in hand, tool options with the tool, exports and their settings together.
- **Why:** 20 of 36 control groups break a placement rule today.
- **Acceptance criteria:** to be set with the Owner's design; at least: no control in the placement table marked "No", and the brief's checks still pass.
- **Constraints:** the layout is the Owner's choice; nothing is built before it is chosen. Cheapest after G-092 and G-093, since the tool list, options and commands are generated.

**The Owner's direction (2026-10-05):**
- Some options are "set up once and forget": the author name, the default canvas size, the default inch or cm.
- Making the chart from a photo is kept a little apart from editing it: a person first tries different generations and mostly does not edit meanwhile; once editing has started they mostly do not regenerate. "Maybe we should make kind of workspaces each with its own tool set"; more photo work in the browser (painting over, removing the background) may come later and is not a next goal.
- "I like tabs system."
- Doubt that Text as a plain tool leaves room for all it has now. So a tool may declare a quick option set (on top), an extended set shown as a temporary tab that exists only while the tool is in hand, or both.
- "Anyways, the system has to allow add tools easily."
- Mock-ups wanted.

**Milestones:**
- [x] M1 -- **Layout mock-ups** (asked for by the Owner; `review before continuing`). Three proposals, five screens each.
- The rest is planned once a layout is chosen.

**Progress log** (newest first):
- 2026-10-05 -- the Owner answered: workspaces and tries from A, view controls from B; keeping tries was not what they had meant, but they like it "because it will lower server usage". They asked for a mock-up of that mix: added as **proposal D** on the same page (A with the view controls floating over the foot of the chart, a thin readout line in place of the view bar), 20 screenshots now. Still open: panel left or right, the contents of Preferences, whether tries survive a reload. **BLOCKED:** the Owner confirming D.
- 2026-10-05 -- M1 done. `docs/design-mockups/g095-layouts.html` (one self-contained page; `node scripts/design-mockup-shots.mjs` writes its 15 screenshots) shows three layouts over the same five screens (making the chart from a photo, editing with Brush, editing with Text, Export, Preferences): **A** workspaces as tabs across the top, **B** workspaces as a rail at the left edge with tools in a row, **C** closest to today with no workspace switch and Export as a dialog. All three have quick tool options above the chart, a temporary tab for a tool's extended options, view controls that never leave, tries kept while generating, and Preferences. They are drawings: nothing is wired, the picture and every figure are placeholders, the present look is kept on purpose, and only a desktop width was drawn. Verified: all 15 screens rendered without a script error and were looked at one by one. **BLOCKED:** which layout (or which parts of which) does the Owner choose; and the questions sent with them.
- 2026-10-05 -- the Owner gave the direction above and signed off G-088, which this goal builds on.

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
