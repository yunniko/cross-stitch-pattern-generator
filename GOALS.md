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

### G-087 · Generate from a palette the user sets up, and a predicted colour count and colours — DRAFT (2026-10-02)
- **What:** three changes to generation. (1) A **"Set up palette"** mode beside the usual automatic one: the user adds threads, out of the palette mode they have chosen (DMC, Cosmo, Anchor), to a set for this generation, and the chart uses only those threads. A button **fills the set with the predicted colours**, which the user then edits. Sets can be **saved and loaded** by name, and the Export dropdown gains a **palette file** with the current chart's threads, which can be loaded back as a set. The chosen set stays in the browser through reloads, is saved in the editable file (and the cspzip) of a chart made from a photo with one, and is restored when that file is opened; a new chart resets it. (2) The four **photo sliders reset** when a new picture is loaded for a new chart. (3) The **colour count slider's upper limit** follows a prediction of how many colours the picture reasonably needs, when that is below the usual maximum, with a **hint** of the best count or range.
- **Why:** now a chart's colours are whatever the quantiser makes, and a user who owns, or wants, particular threads cannot say so. Adding a colour past a point only spends threads on shadows, and nothing tells the user where that point is. The prediction serves both the count hint and the "fill with predicted colours" button, so they are one piece of work.
- **Acceptance criteria:** (1) with "Set up palette" off, which is the default, every generated pattern is byte-identical to today's (the generation goldens do not move); (2) in set-up mode a chart's palette holds only threads of the set, each cell takes its nearest, and a set of 8 out of the 400 or more of a brand gives a chart of at most 8 colours; the user is shown, before generating, how well the set covers the picture; (3) "fill with predicted colours" puts the predicted threads of the chosen palette mode into the set, N of them, for the user to add to or remove from; (4) sets are saved and loaded by name in the browser, and a palette file exported from the Export dropdown (the current chart's threads, with codes) loads back as a set; a file that is not one is refused with a message; (5) the set survives a reload; it is written to the editable file and the cspzip of a chart generated from a photo with one; opening such a file restores it, a file without one leaves the set as it is, and a new chart empties it; regenerating the same photo in automatic mode changes the chart's palette and leaves the file's record of the set it was made from as it was; (6) loading a new picture for a new chart puts the four photo sliders at neutral, and regenerating the same picture keeps them; (7) the colour count slider cannot go above the prediction's upper limit when that is below the usual 100, and shows a hint such as "10 to 14 colours suggest the best result", which updates when the picture, its size or the palette mode changes, and costs under a second on a typical picture; (8) on a set of pictures including ones with dark shadows, the predicted range stops where added colours stop changing what is visible, which the Owner has seen.
- **Constraints:** set-up mode lives beside the automatic one and changes nothing for those who do not use it. A set belongs to one palette mode, the one chosen (the chart's `threadBrand` is one brand); a thread is identified by brand and code, so a saved set survives changes to the thread tables. Generation lives in Rust (`rust/cs-core`) and the prediction runs where generation runs, on the processor. A chart's palette and the set it was made from are different things: editing the chart's colours never changes the set, and the set never changes a finished chart. Old files, which have no set, open as they do now.

**Milestones** (proposed; waits for the Owner's answers and go-ahead):
- [ ] M1 -- **Predict.** A quick quantiser run on the reduced picture, k from 2 up: the error curve, the suggested count and range, the colours with the cells each would cover, and in a brand mode the nearest threads. Tuned on pictures including dark and shadowed ones so that added colours stop where they stop changing what is visible (a minimum area per colour, error weighted by how visible it is). Measured against the full generation: how close are the predicted colours and count to the chart's. Written up in `docs/reviews/`, the method and its numbers as decisions.
- [ ] M2 -- **Generate from a set.** A generation option naming the set (brand and code of each thread); nearest-thread matching with the existing smoothing on top; the coverage figure; goldens unchanged with the option absent; tests for "only the set's threads", for a set too small for the picture, and for determinism.
- [ ] M3 -- **The setup UI and the count limit.** The mode switch, the thread picker out of the palette mode, fill with predicted, save and load by name, the palette file in the Export dropdown and its loading, persistence in the browser, the slider limit and the hint, and the photo sliders' reset; the processor endpoint for the prediction. E2e for each.
- [ ] M4 -- **The set in the file.** The editable file and the cspzip carry the set; opening restores it, a new chart resets it; older files open unchanged.
- [ ] M5 -- **Docs, full suite, deploy.**

**Questions for the Owner:**
1. May one set mix brands (some DMC, some Anchor)? My default is one brand, the palette mode chosen, as in the request ("out of chosen palette mode").
2. The palette file: my own small JSON with brand and code per thread (my default), or also a standard format such as GIMP's `.gpl`, which has colours but no thread codes?
3. When a set cannot represent the picture (no skin tone in it, say) the chart is made anyway and the user warned by the coverage figure before generating, not blocked (my default). Right?
4. The count limit: a hard ceiling at the predicted upper count, as asked, or a hard ceiling with an "allow more colours" switch for the user who wants more anyway?
5. In set-up mode the colour count slider goes away, since the count is the size of the set (my default).
6. "Reset the photo sliders on a new generate from an image": I read it as when a **new picture** is loaded for a new chart, not when the same picture is regenerated, which keeps its settings. Right?

**Progress log** (newest first):
- 2026-10-02 -- goal drafted at the Owner's request. Nothing built.

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
