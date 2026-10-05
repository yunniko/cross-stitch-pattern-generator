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

### G-098 · The editor shell is split by what it does — ACTIVE (2026-10-05)
- **What:** `app/workspace.tsx` (957 lines) holds four things that grew there one goal at a time: the chart's lifecycle (open, new, generate, autosave), the editor's own command states (G-093), the wiring of the panes, and loose state (isolate and lit threads, lettering, the start screen). Each becomes a module with a narrow input: a document hook, a commands hook, and the shell left to lay out the panes.
- **Why:** STANDARDS asks that a module over about 500 lines be split or carry a decision saying why not; this one has neither. G-091 took the reset lists out and grouped the props, and G-093 and G-094 then added about 110 lines.
- **Acceptance criteria:** no behaviour change (full suite, no spec changed); each new module has one job that can be said in a sentence and is unit-tested where it holds logic; the shell names no command and no file operation. Not a line count (G-067's lesson, kept by G-069 and G-091).
- **Constraints:** best done before G-095, since the redesign rewrites the same file's layout; independent of G-096 and G-097.

**Milestones** (plan accepted in advance by the Owner, 2026-10-05: "start G-098, all milestones"; the deploy in M4 is this project to its existing site):
- [x] M1 -- **The small owners.** Each piece of loose state gets a module with its rule beside it: the lit threads and Isolate; the chart's fabric and the options in force; what is being looked at (the view, the pane, and the rule that unused photo sliders are given up); the name being typed. The rules are pure functions with unit tests.
- [x] M2 -- **The editor's own commands.** What each command does now leaves the shell: a pure function from the editor's state and actions to the command states, unit-tested for when each is available, and a hook that holds the one piece of state they need (the tool put down while Space is held).
- [x] M3 -- **The chart's lifecycle.** Opening, starting, generating into, restoring and autosaving the chart, with their messages and the new-chart confirmation, become one hook; the three hidden file choosers become a component. The shell then names no file operation.
- [ ] M4 -- **Decision, docs, QA pass, full suite, deploy** (cross-stitch-pattern-generator to `cross-stitch.craftodejnice.cz`): what stays in the shell and why, written down.

**Progress log** (newest first):
- 2026-10-05 -- M3 done. `app/hooks/use-chart-lifecycle.ts`: the ways in (photo, empty grid, pixel art, a saved file), generation's result, restore and autosave, the confirmation, the open messages and the document's identity; it is handed the resets of state other owners keep. `app/components/file-inputs.tsx` holds the three choosers; `app/hooks/use-recommended-count.ts` the colour count a new photo is given. The workspace names no file operation. Verified: 1,096 unit; full browser suite 563 passed, 0 failed, 1 flaky (`photo-sliders.spec.ts`, a read without a wait in the spec; 36 of 36 alone), no spec changed. Workspace 829 to 658 lines. Milestone note: nothing was removed from HANDOVER.
- 2026-10-05 -- M2 done. `app/commands/shell-commands.ts`: a pure function from what is true of the editor (13 facts) and what can be done (25 actions) to the state of each of the editor's 38 commands, and the hook that assembles the table; `app/hooks/use-held-pan.ts` holds the tool put down while Space is held. The workspace now states the facts and hands over the actions. Verified: 11 new unit tests of when each command can run (a piece in hand, exporting, generating, no photo, over the start screen, no chart) and which action each is; 1,096 unit; full browser suite 563 passed, 0 failed, 1 flaky (`backstitch-draw.spec.ts`, "letting go of Ctrl ends a chain": passed on retry and then 60 of 60 alone, so load, not this change). Workspace 862 to 829 lines. Milestone note: nothing was removed from HANDOVER.
- 2026-10-05 -- M1 done. Out of the workspace, each with its rule beside it: `lib/editor/lit-threads.ts` and `app/hooks/use-lit-threads.ts` (Isolate and the lit threads, now one value instead of three pieces of state set from inside each other's updaters); `lib/editor/chart-fabric.ts` and `app/hooks/use-chart-fabric.ts` (the options in force and the chart's own two settings); `app/hooks/use-editor-view.ts` (the view, the settings shown, and the rule that unused photo sliders are given up); `app/hooks/use-name-draft.ts`. Verified: 10 new unit tests of the two rules; full browser suite 564 passed, 0 failed, no spec changed. Workspace 957 to 862 lines. Milestone note: nothing was removed from HANDOVER.
- 2026-10-05 -- started; plan above accepted by the Owner in advance.

### G-095 · Interface redesign against the placement rules — DRAFT (2026-10-04)
- **What:** the Owner's redesign, built on `docs/design-brief/` and `docs/interface-placement.md`: every control placed by scope, view and application controls independent of the tool in hand, tool options with the tool, exports and their settings together.
- **Why:** 20 of 36 control groups break a placement rule today.
- **Acceptance criteria:** to be set with the Owner's design; at least: no control in the placement table marked "No", and the brief's checks still pass.
- **Constraints:** waits for the Owner's design direction. Cheapest after G-092 and G-093, since the tool list, options and commands are then generated.

### G-096 · Development loop: the remaining fixes — DRAFT (2026-10-04)
- **What:** the open items of `docs/development-loop.md`: specs that do not test generation open a saved chart (also keeps live checks under the rate limit); try the browser suite against the development server for the fast lane; scope the slow lint rule.
- **Why:** 46 of 63 spec files generate a chart they do not need; every browser check waits for a production build.
- **Acceptance criteria:** measured before and after for the full suite, a fast-lane loop and a live check of the whole suite.
- **Constraints:** test tooling only.

### G-097 · A new chart can be undone, and the replaced chart survives a reload — DRAFT (2026-10-04, left for later by the Owner)
- **What:** (1) starting a new chart is one more step in the undo history instead of a new history, so Undo brings the old chart back with its photo, axes and settings, and the confirmation can go; a notice says so. (2) The browser keeps the one chart that was last replaced, and the start screen offers to reopen it.
- **Why:** today a replaced chart is gone unless it was exported; the confirmation is the only guard.
- **Acceptance criteria:** to be set when taken up. Known work: undo across documents must restore the photo in hand and reset the view as D283 does; history is memory-only and 50 steps deep, which is why (2) exists.
- **Constraints:** changes undo history and browser storage, so a normal goal. A full chart library belongs with G-094.

### G-088 · Design helper documentation: what the app does and what every control must allow — ACTIVE (2026-10-02)
- **What:** a document set, `docs/design-brief/`, that a designer redesigning the application can work from without opening the app or reading code. It states what the app is for and what a person can do in it, then every feature in turn. It says nothing about how the present interface looks or is built: no layout, panel, widget, colour or component names, only the behaviour and the data the interface must carry.
- **Why:** the Owner is going to redesign the application. A redesign built from screenshots keeps the present layout's accidents and loses rules nobody drew, such as a ceiling that depends on a prediction or a control that is unavailable in one mode.
- **Acceptance criteria:** (1) an overview: the purpose, who uses it, the main journeys (photo to chart to export, start blank, open a saved chart), and the product's states (no chart, chart from photo, chart without a photo, generating); (2) a feature list covering everything the app does today, each feature with what it is for, when it is available, what it takes and what it gives back; (3) for **every control or input**: its purpose, its kind of value (choice, number, toggle, text, colour, file, pointer gesture), the **range or the full list of values** with units and step, the default, what is remembered and for how long (not at all, this session, this browser, the saved file), the **states** (enabled, disabled and why, hidden when, busy, error, empty, read-only), what it depends on or changes in other controls, and the messages it can produce; (4) the rules that bind more than one control, such as which modes exclude which; (5) the limits of the system a design has to show or live with (sizes, counts, durations, rate limits, file types and sizes); (6) every message and empty, loading and error state, with the condition that causes it; (7) checked against the app: the values in the document come from the code's own constants and from running it, a script lists the ranges the code declares and fails when the document's differ, and a reader who has not seen the app can answer questions from the document alone, tried on at least five; (8) no sentence names an interface element of the present design (the check is a word list the Owner approves); (9) checked against the development record so nothing is left untouched: every goal in `GOALS.md` and `docs/goals-archive/`, every decision file, the README's feature list and the HANDOVER's "Current state" and "Rules in force" is traced in `docs/design-brief/coverage.md` to the document that covers it, or marked "not user-facing" / "superseded by" with a reason, and a script fails when a goal or decision is neither.
- **Constraints:** facts, not recommendations: no redesign advice in these documents. Written from the code and a running app, never from memory. Kept short enough to read: one file per area, each with a contents table. Draft assumptions, for the Owner to correct: in English; the editor and its exports; the admin area and the account and profile pages are left out (Owner, 2026-10-02), except that where being signed in changes what the editor does that is stated; the exports' file contents described only as far as a designer must show them (type, name, size, options), not their internal format.

**Milestones** (proposed; waits for the Owner's answers and go-ahead):
- [x] M1 -- **Inventory.** Trace the development record (every goal, decision, README and HANDOVER feature) into `coverage.md`, then walk the code and the running app and list every feature, control, state and message into a working inventory with its source (constant or file), so nothing depends on memory. Agree the contents and the banned-word list with the Owner.
- [x] M2 -- **Overview and rules.** The purpose, journeys, product states, cross-control rules and system limits.
- [x] M3 -- **Features, first half.** Photo and generation settings, palette set-up and prediction, the chart and its views, editing tools, selection, symmetry, colours and threads.
- [x] M4 -- **Features, second half.** Text, backstitch, half stitches, canvas and stitch textures, exports and A4 settings, saving, opening and restoring.
- [x] M5 -- **Check.** The script that compares the documented ranges with the code, the word-list check, the five reader questions, `docs-lint`, README and HANDOVER updated.

**Owner's answers (2026-10-02):** (1) the admin area and the user profile will be redesigned later, so they are out; (2) no touch or small-screen behaviour: that is interface implementation, which the documents avoid; (3) several Markdown files are fine.

**Progress log** (newest first):
- 2026-10-02 -- M3 to M5 done ("go ahead with other milestones"): `docs/design-brief/` now holds nine documents (about 15,000 words: overview; photo and generation; chart views; editing; colours and threads; backstitch and half stitches; text; exports and files; limits, server-run actions and messages), `coverage.md` and three scripts that fail on drift. Verified: ranges script 60 checks 0 failed (shown to fail on a changed figure), words script 0 hits (8 reworded), coverage `--strict` 0 problems over 363 goals and decisions, a probe of the live interface agreed with the text (one wording fixed: lowest zoom reached 28 %; one finding stated: a Generate pressed before the recommendation arrives uses the old count), five reader questions answered from the documents and confirmed in code. Not done: a cold reader has not tried it (the test reader was the author); most editing and export behaviour is from code, README and decisions, not exercised by hand (`docs/reviews/2026-10-02-design-brief-check.md`). `inventory.md` deleted as planned. Awaiting the Owner's sign-off.
- 2026-10-02 -- the Owner approved M1 ("Looks good") and added: every action done by the server is marked **[server]** in the documents, with its own states (queued, running, refused, unreachable and so on). The entry template gained a "Runs on" field. M2 done: `01-overview.md` (the product, journeys, states, what is kept, what runs where) and `09-limits-and-messages.md` (limits from the code's constants, the server-run actions and their 13 shared states, messages not tied to one control; the full message catalogue is finished at M5). "pixel" was removed from the banned words: it is a domain word (pixel art, photo pixels), not an interface one. Verified: the figures were read from `lib/types.ts`, `processor/job-protocol.ts` and `lib/server/request-guard.ts`; wording checked against `banned-words.txt` by a one-off search. Not yet checked by running the app. Next: M3.
- 2026-10-02 -- M1 done: `docs/design-brief/` holds the agreed contents (`README.md`, nine area files and how a control entry reads), `coverage.md` (all 88 goals and 275 decisions traced to an area, marked internal, out of scope or not shipped; 15 superseded decisions need no row), `scripts/design-brief-coverage.mjs` (fails when a goal or decision has no row; `--strict` fails while a named document is unwritten), `inventory.md` (475 machine-listed labelled or constrained elements across 28 files, a checklist deleted at M5) and `banned-words.txt` (proposed). Verified: the coverage script runs clean (243 rows point at documents still to be written). Awaiting the Owner: the contents, the banned-word list, and the go-ahead for M2.
- 2026-10-02 -- the Owner added a criterion (9): the documents are checked against the documented development process so nothing is left untouched. Started; M1 under way.
- 2026-10-02 -- the Owner answered the three questions (above).
- 2026-10-02 -- goal drafted at the Owner's request. Nothing written.

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
