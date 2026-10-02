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

### G-088 · Design helper documentation: what the app does and what every control must allow — DRAFT (2026-10-02)
- **What:** a document set, `docs/design-brief/`, that a designer redesigning the application can work from without opening the app or reading code. It states what the app is for and what a person can do in it, then every feature in turn. It says nothing about how the present interface looks or is built: no layout, panel, widget, colour or component names, only the behaviour and the data the interface must carry.
- **Why:** the Owner is going to redesign the application. A redesign built from screenshots keeps the present layout's accidents and loses rules nobody drew, such as a ceiling that depends on a prediction or a control that is unavailable in one mode.
- **Acceptance criteria:** (1) an overview: the purpose, who uses it, the main journeys (photo to chart to export, start blank, open a saved chart), and the product's states (no chart, chart from photo, chart without a photo, generating); (2) a feature list covering everything the app does today, each feature with what it is for, when it is available, what it takes and what it gives back; (3) for **every control or input**: its purpose, its kind of value (choice, number, toggle, text, colour, file, pointer gesture), the **range or the full list of values** with units and step, the default, what is remembered and for how long (not at all, this session, this browser, the saved file), the **states** (enabled, disabled and why, hidden when, busy, error, empty, read-only), what it depends on or changes in other controls, and the messages it can produce; (4) the rules that bind more than one control, such as which modes exclude which; (5) the limits of the system a design has to show or live with (sizes, counts, durations, rate limits, file types and sizes); (6) every message and empty, loading and error state, with the condition that causes it; (7) checked against the app: the values in the document come from the code's own constants and from running it, a script lists the ranges the code declares and fails when the document's differ, and a reader who has not seen the app can answer questions from the document alone, tried on at least five; (8) no sentence names an interface element of the present design (the check is a word list the Owner approves).
- **Constraints:** facts, not recommendations: no redesign advice in these documents. Written from the code and a running app, never from memory. Kept short enough to read: one file per area, each with a contents table. Draft assumptions, for the Owner to correct: in English; the editor and its exports; the admin area and the account and profile pages are left out (Owner, 2026-10-02), except that where being signed in changes what the editor does that is stated; the exports' file contents described only as far as a designer must show them (type, name, size, options), not their internal format.

**Milestones** (proposed; waits for the Owner's answers and go-ahead):
- [ ] M1 -- **Inventory.** Walk the code and the running app and list every feature, control, state and message into a working inventory with its source (constant or file), so nothing depends on memory. Agree the contents and the banned-word list with the Owner.
- [ ] M2 -- **Overview and rules.** The purpose, journeys, product states, cross-control rules and system limits.
- [ ] M3 -- **Features, first half.** Photo and generation settings, palette set-up and prediction, the chart and its views, editing tools, selection, symmetry, colours and threads.
- [ ] M4 -- **Features, second half.** Text, backstitch, half stitches, canvas and stitch textures, exports and A4 settings, saving, opening and restoring.
- [ ] M5 -- **Check.** The script that compares the documented ranges with the code, the word-list check, the five reader questions, `docs-lint`, README and HANDOVER updated.

**Owner's answers (2026-10-02):** (1) the admin area and the user profile will be redesigned later, so they are out; (2) no touch or small-screen behaviour: that is interface implementation, which the documents avoid; (3) several Markdown files are fine.

**Progress log** (newest first):
- 2026-10-02 -- the Owner answered the three questions (above). Waits for the go-ahead to start M1.
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
