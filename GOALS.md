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

- 2026-10-04 -- **QA batch** (findings of `docs/qa-review/qa-review-2026-10-04-changed.md`): the custom size is typed freely and limited and rounded on leaving the field (1, 10); the Crop frame waits through a looking-only view and survives choosing Crop again (2, 9); a loaded palette brings its palette mode (3); Fill with predicted colours waits for the current recommendation (4); Crop's Apply and Cancel stay in view in a narrow window (5); Apply waits for unusable text (6); a chart with no colours has no palette to export (11); palette file names keep any script (12); wording, newer-version refusal, duplicates counted once (13); recommendations at once 2 to 4 (processor). Findings 3, 4 and 11 and the processor constant are outside the fast lane's limits and went through the full suite before the deploy. Verified: 255 related unit tests, 10 new e2e cases, two old size specs rewritten for the new behaviour, full suite 540 passed, 0 failed.

## Active goals

### G-090 · Readiness to grow: architecture, interface placement, development speed and QA — ACTIVE (2026-10-04)
- **What:** an analysis answering the Owner's four questions before the app is extended (vector editor, painting board, more pixel-art features, layers, new tools, perhaps plugins): (1) is the architecture ready, and what architecture and placement guide would give each new request its own place; (2) the same for the interface; (3) how to make development faster without losing the tests; (4) whether to set up QA. Then the guides themselves, and the follow-up goals the Owner chooses.
- **Why:** the Owner feels new requests are squeezed into the app rather than placed. Extending on the present shape would multiply that.
- **Acceptance criteria:** (1) a written analysis with measurements, a verdict per question and a recommendation per planned direction (`docs/reviews/2026-10-04-growth-readiness.md`); (2) an architecture document with a placement guide ("a new X goes here") that a newcomer can follow, and the lint boundaries that enforce it; (3) interface placement rules, and the design brief extended with each control's scope; (4) a development-loop proposal with measured before and after; (5) a QA proposal with a first pass run; (6) each structural change that follows is its own goal, approved by the Owner, not part of this one.
- **Constraints:** analysis and guides only: no change to the app's behaviour in this goal. Anything that relaxes the Company charter for this project (a fast lane for small changes) is the Owner's decision, recorded as such.

**Milestones:**
- [x] M1 -- **The analysis.** Measurements and answers to the four questions.
- [x] M2 -- **Architecture and placement guide.** `docs/architecture.md`: the four layers, the registries, where each kind of request goes, the migration order from today's code; proposed lint boundaries. No code moved.
- [x] M3 -- **Interface placement.** The four placement rules worked through the design brief: each control's scope, the misplaced ones listed, the command list.
- [x] M4 -- **Development loop and QA.** The fast lane written as a rule for the Owner to approve; the lint, flaky-test and rate-limit fixes scoped; a first exploratory QA pass on the last three goals' features, with its findings triaged.
- [x] M5 -- **Follow-up goals drafted** for the Owner to order: tool registry and editor shell (absorbs G-069), document model with layers and recorded undo, interface redesign, development-loop fixes.

**Owner's answers (2026-10-04):** (1) prepare the architecture for change and do not implement the new features now; add guidelines for adding features and tools where the code is not enough; (2) the fast lane: yes (D280); (3) wanted to know what own plugins and other people's plugins each need (answered in `docs/architecture.md` section 6; no decision yet); (4) QA pass at each goal's last milestone: yes.

**Questions as asked:**
1. **Order of ambition.** Which comes first: layers, the painting board, the vector editor, or more tools on the present grid? The document model is designed for whichever is first; I propose **tools and shell first, then layers**, because every later feature needs both.
2. **Fast lane.** May small interface-only changes skip the full suite, the deploy and the per-goal paperwork, batched into one verified deploy a day? (This relaxes the charter for this project.)
3. **Plugins.** Your own extensions only, or other people's code too? The second needs isolation and is a much larger decision; I propose designing the registries now and deciding isolation later.
4. **QA.** An exploratory pass at each goal's last milestone, findings to a triage list: yes?

**Progress log** (newest first):
- 2026-10-04 -- the Owner said "yes to all": the triage (fixes made as the first fast-lane batch, see "Small changes"; findings 7 and 8 still need the Owner's choice of behaviour), removing the old worktree's database container (**not done: the removal was refused by this session's permission rules; the commands are in the check-in for the Owner to run**), and M5. M5 done: six follow-up goals drafted, G-091 to G-096 (editor shell, tool registry, command registry, document module, interface redesign, remaining loop fixes), in dependency order; G-069 absorbed into G-091. All milestones done; awaiting the Owner's sign-off and the order in which to start the follow-ups.
- 2026-10-04 -- M4 done. **Loop:** `docs/development-loop.md` (lanes, the fast lane step by step, measured times, open items); tooling only, no app behaviour changed: `npm run check:fast` (42 s), `npm run e2e:servers`, lint cache (22 s to 6.5 s), and the two admin-stats cases tagged `@alone` and run after the rest, so the full suite ends with 0 failed (533 passed, one verified run, 4 min 25 s). A small interface change is about 1.5 min of machine time in the fast lane against about 6 min before. **Correction:** the 70 s lint in M1 was a bad measurement and its guessed cause was wrong; the review is corrected. **QA:** first exploratory pass on G-086, G-087 and G-089, `docs/qa-review/qa-review-2026-10-04-changed.md`: 16 findings, none a crash; the notable ones are a custom size that cannot be typed (typing 50 gives 100; predates these goals), Crop left in hand with no frame after a view round trip, a palette file of another brand leaving the mode control wrong, and "Fill with predicted colours" filling nothing right after a brand change. Nothing fixed; triage proposed for the Owner. Not covered: the rest of the app, the live site, phone width. Open and needing the Owner: removing the old worktree's test database container that blocks the configured server start. Next: M5, follow-up goals drafted.
- 2026-10-04 -- the Owner decided own plugins only (D281) and asked whether the app can stay in the browser or should move to Java: answered in `docs/architecture.md` section 7 (stay; the limits found are structural, not the platform's; a judgment without a prototype). M3 done: `docs/interface-placement.md` gives every control's scope, its present place and whether they agree (20 of 36 rows break a rule, 12 outright), two data-scope mismatches (fabric count and unit are saved in the browser, not the chart; symmetry is saved in the chart), the command list (roughly 90 commands) and a five-step rule for placing something new. The scope is given there, keyed by the brief's control names, not as a column added to each of the brief's tables. Present places were read from code; nobody was observed using the app. Next: M4, development loop and a first QA pass.
- 2026-10-04 -- the Owner answered (above). M2 done: `docs/architecture.md` (four layers, five registries, a placement guide with a "today" and a "target" column, the order of preparation in six behaviour-neutral steps, proposed lint boundaries, own and outside plugins compared) and D280 (the fast lane). Nothing in the app changed; the guide's "today" column was written from the files touched by the last goals, not verified by adding a feature with it. Next: M3, interface placement.
- 2026-10-04 -- goal opened at the Owner's request and M1 done: `docs/reviews/2026-10-04-growth-readiness.md`. Measured: the workspace grew from 754 to 1,071 lines in ten days and is touched by 30 of 201 commits; 46 branch sites on the tool in hand; a new tool edits 7 existing files; type-check 21 s, unit 22 s, lint 70 s, build 35 s, full browser suite about 4.5 min. Verdicts: the architecture is not ready for layers, a vector editor or plugins (closed document model, closed tool set, wide workspace); interface placement has no rule; the tests are not the main cost of a change; QA is worth having as a periodic exploratory pass. Not measured: memory or speed with layers, real use of the interface, the estimated speed-up. Awaiting the Owner's answers before M2.

### G-091 · Editor shell: replacing the open chart is decided in one place — DRAFT (2026-10-04)
- **What:** architecture step 1 (`docs/architecture.md`): a `useEditorDocument` hook owning what it means to replace the open chart (new, open, import, generate, restore), and grouped props for the widest components. Absorbs the draft G-069.
- **Why:** `app/workspace.tsx` is 1,071 lines and grew 42 % in ten days; eight functions each restate the list of things to reset.
- **Acceptance criteria:** replacing the chart resets state in one function; `ImageWindow` and `ContextBar` take named groups instead of 36–37 flat props; no behaviour change (full suite green, goldens unchanged); the workspace is smaller and no new file is over 500 lines.
- **Constraints:** no behaviour change; not a line-count exercise (G-067's lesson).

### G-092 · Tool registry: a tool is one module — DRAFT (2026-10-04)
- **What:** architecture step 2: the fourteen tools become modules behind one contract (id, name, key, cursor, options as data, handlers, overlay), registered in one list; the shell routes events to the tool in hand; `use-canvas-tools.ts` (1,205 lines) is split by tool; the tool list, the shortcut table and the tool-options area read the registry; a narrow editor API is the only thing a tool touches (D281).
- **Why:** 46 places in 8 files branch on the tool in hand; adding Crop edited 7 existing files. This is also the first plugin seam.
- **Acceptance criteria:** adding a tool is one new module and one registration line (shown by moving one existing tool last, as the proof); no `activeTool ===` outside the shell; tool logic has unit tests that need no browser; lint forbids a tool importing the workspace or another tool; no behaviour change.
- **Constraints:** depends on G-091. No new tools in this goal.

### G-093 · Command registry, shortcuts and a command list — DRAFT (2026-10-04)
- **What:** architecture step 3: every action registered once (name, key, when available); shortcuts and the interface read it; the gaps `docs/interface-placement.md` lists are decided (keys for Select, Move, Zoom; copy, paste, duplicate).
- **Why:** roughly 90 commands are wired by hand, a quarter have keys, and Enter and Escape mean three things each.
- **Acceptance criteria:** one table of commands in code, checked against the design brief; a searchable command list in the app; new keys only where the Owner approves them.
- **Constraints:** depends on G-092. New shortcuts are behaviour changes and need the Owner's yes each.

### G-094 · Document module: layers-ready data, recorded undo, a versioned file — DRAFT (2026-10-04)
- **What:** architecture step 4: today's chart becomes "a document with one stitch layer" behind `lib/document/`, with changes as commands (undo records changes, not copies), `flatten()` feeding generation and every export unchanged, and a file format version with a migration step. Fabric count and unit move into the chart file (the data-scope defect in `docs/interface-placement.md`).
- **Why:** layers, a painting board and an object layer cannot be added to one flat grid; undo by full copy does not scale past it.
- **Acceptance criteria:** every existing file opens and saves byte-identically apart from the new version field; every export is byte-identical (goldens); memory and speed of undo and flatten measured at 1500 × 1500 before and after; no visible change except fabric count travelling with the chart.
- **Constraints:** the expensive step: measurement first, and its own decision on the undo design. Depends on G-092.

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

### G-086 · Backstitch shows in the Stitched view and in the realistic preview — ACTIVE (2026-10-02)
- **What:** the Stitched view of the editor, and the realistic preview PNG export, draw the chart's backstitch as coloured lines over the stitches. Today they draw the stitches only, so a chart with backstitch looks as if it had none. The line is a plain coloured line for now; a textured thread, like the stitches have, comes later (Owner, 2026-10-02).
- **Why:** the Stitched view is the nearest thing to the finished piece, and the lines (G-073, G-084, G-085) are part of the finished piece. The Color and B&W views and the A4 and PNG chart exports already show them.
- **Acceptance criteria:** (1) in the Stitched view every backstitch line is drawn over the stitches, in its thread's colour, a fifth of a cell wide as in the Color view, and solid (the dashes tell threads apart on a printed chart, which a view of the finished piece does not need); (2) it follows zoom and pan and a repaint of part of the chart draws the same lines; (3) the realistic preview export draws the same lines at its own cell size; (4) the preview of a chart without backstitch is byte for byte what it was; (5) Color, B&W and the other exports are unchanged.
- **Constraints:** a plain coloured line, no texture (the Owner's wish for now). The preview export is streamed row by row so a large chart does not need the whole picture in memory, and must stay so.

**Milestones:**
- [x] M1 -- **The Stitched view.** Draw the lines after the realistic stitches in `drawScene`, solid; unit and e2e checks.
- [x] M2 -- **The realistic preview export.** The Rust exporter, which production runs, and the TypeScript renderer it mirrors, each draw the lines over the stitches; the preview of a chart with no backstitch is unchanged byte for byte.
- [x] M3 -- **Docs, full suite, deploy.**

**Progress log** (newest first):
- 2026-10-02 -- built and deployed (ac7a9cc); the live site passes the new e2e spec. The Stitched view draws every line after the stitches in `drawScene`, solid (`drawBackstitch` takes `solid`); the realistic preview export lays antialiased lines over each strip of rows in `Preview::overlay_backstitch` (Rust, production) and `overlayBackstitch` (TypeScript), the same arithmetic (D275). Verified: a Rust test and a TypeScript test pinning the same seven pixels, strips giving the same pixels as the whole, a recording-context test of the scene, 2 e2e tests (a line shows in the Stitched view along its whole length and goes when deleted; a chart without backstitch is untouched), and looked at an exported preview.
- 2026-10-02 -- goal created at the Owner's request ("add backstitch to stitched mode ... for now just a coloured line").

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
