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

## Active goals

### G-089 · A Crop tool whose frame and four edge numbers are one thing — ACTIVE (2026-10-03)
- **What:** a **Crop** tool in the tool list. With it in hand a frame is drawn on the chart; its four edges can be dragged, and the four numbers (top, right, bottom, left) that now sit in the Chart tab's "Canvas" group become the tool's parameters, always agreeing with the frame: typing a number moves the frame's edge, dragging an edge changes the number. The chart changes only on **Apply** (one undo step); **Cancel** (Escape) leaves it alone. The Canvas group leaves the Chart tab.
- **Why:** the numbers alone make a person guess where the new edge will fall; the existing "Crop" action only crops to a rectangle selection and cannot be refined. One tool with the picture and the numbers together removes both.
- **Acceptance criteria:** (1) choosing the tool shows a frame covering the whole chart and the four numbers at 0; (2) dragging an edge or a corner moves the frame in whole stitches, clamped so at least one stitch remains, and updates the numbers live; typing in a number moves that edge, and a number that is not a whole number or would leave nothing is refused with the existing messages ("Can't crop away the entire pattern.", the 1500 limit) and not applied; (3) the result of Apply is exactly what `resizeCanvas` produces today for the same four numbers (stitches, palette counts, half stitches, backstitch moved and lines outside removed whole, the photo underlay offset), so existing behaviour does not change and the new tool is tested against it; (4) Apply is one undo step, and the frame resets to the new chart; Cancel, Escape, changing tool and opening another chart drop the frame without changing the chart; (5) the area outside the new edges shows the stitches that would be cut away dimmed, and the controls show the resulting size and the finished size on the chosen fabric count; (6) zoom, pan, rulers and the keyboard work while the tool is in hand; (7) in looking-only views and with no chart the tool is unavailable; (8) the design brief (`04`, `03`) and the keyboard shortcuts are updated, with the ranges script covering the new limits.
- **Constraints:** no change to `resizeCanvas`'s arithmetic or messages (one source of truth, D109). A selection piece in hand is applied before the tool opens, as for other tools. The frame and numbers share one state; neither is a copy of the other.

**Milestones** (go-ahead and the proposals accepted, Owner 2026-10-03: "Go with your proposals through all milestones"):
- [ ] M1 -- **The frame as data.** A pure module (`lib/editor/crop-frame.ts`): the frame as four edge offsets, moving an edge or a corner by a stitch delta with clamping, the numbers to and from the frame, the resulting size; unit tests including every clamp and agreement with `resizeCanvas`.
- [ ] M2 -- **The tool.** `crop` added to the tools; the frame, its edge and corner handles and the dimmed outside drawn on the overlay the selection already uses; drag, keyboard nudging and the cursor; Apply, Cancel and Enter and Escape; one undo step. E2e for drag, typing and undo.
- [ ] M3 -- **The numbers move in.** The four fields, with the size readout, live in the tool's own set of controls; the Canvas group is removed from the Chart tab; the existing e2e specs for resizing are moved to the tool, not dropped.
- [ ] M4 -- **Docs, full suite, deploy.** README, design brief, HANDOVER, a decision file for the sign convention and for the selection's Crop action, full suites, deploy and a live spec.

**Questions for the Owner** (my proposals first; the draft stands on them if you do not mind):
1. **Sign.** Today a positive number *adds* empty stitches and a negative *crops*. For a crop frame I propose the numbers are **how far each edge moves in**, so 3 means "cut three stitches off this edge" and a negative number *adds* three empty stitches. That reverses today's sign. Or keep today's sign (positive adds)?
2. **Growing.** Should the frame be allowed outside the chart (adding empty stitches), as the fields allow today? Dragging outside needs room around the chart; I propose **yes, by typing a negative number and by dragging an edge past the chart's border**, with the same 1500 limit. Or crop-only, with growing left to the numbers?
3. **Apply.** An explicit **Apply** (Enter) with Cancel (Escape), as the Canvas group has now; or apply when the tool is left? I propose explicit.
4. **The selection's "Crop" action** (crop to the piece in hand): keep, or remove now that the tool exists? I propose keep: it is the quickest way to crop to a drawn region.
5. **Key.** I propose **C** for the tool (unused today).
6. **Photo.** The photo behind the chart keeps its alignment as today, with no separate crop of the photo. Correct?

**Progress log** (newest first):
- 2026-10-03 -- M1 to M3 built; M4 under way. The Owner accepted all six proposals (sign reversed so a number is how far the edge moves in, growing by typing or dragging, explicit Apply, the selection's action kept, key C, photo keeps its alignment). `lib/editor/crop-frame.ts` (frame as data, drag clamping, `resizeCanvas` agreement; 12 unit tests), `app/hooks/use-crop-tool.ts`, `crop-overlay.tsx` (frame, dimmed cut-away, hatched growth, eight handles, arrow keys), `crop-bar.tsx` (the four numbers, readout, Apply, Cancel, Undo, Redo), tool and key wiring; the Canvas group left the Chart tab; the selection's action is now "Crop to selection". Verified: tsc, unit, 10 new e2e (typing, dragging an edge and a corner, arrow keys, Apply and undo, growth adds no colour, refusal message, Escape/Cancel/Enter, leaving the tool, C key and Space-pan, Chart tab without the numbers); the old resize specs were moved into them, and four other specs updated (symmetry, selection crop labels, one scroll helper). Looked at on screen. D278, D279; design brief 03, 04, 01.
- 2026-10-03 -- goal drafted at the Owner's request. Nothing built.

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

### G-069 · The workspace stops being the only thing that knows how everything connects — DRAFT (2026-09-24)
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
