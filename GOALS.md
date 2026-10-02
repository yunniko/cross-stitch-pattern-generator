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

### G-085 · Generation can lay texture strokes (fur, feathers) as backstitch — DRAFT (2026-10-02)
- **What:** an optional generation setting, off by default, that adds short backstitch strokes over the cross stitches where a picture has fine texture the stitches cannot show: the feathers of a bird, the fur of an animal, hair, rough bark. The strokes follow the direction of the texture and are a lighter or a darker shade of the stitches under them.
- **Why:** a hand-stitched owl (the Owner's picture, 2026-10-02, not kept in the repository) gets its look from backstitch that makes texture: short strokes along the feathers on the face and chest, as well as fine branches and claws. G-084 traces lines that are in the picture; these strokes are not in the picture, they are what a stitcher draws from the shading, so they need a different method. Backstitch, its threads, its editing and every export already exist (G-073).
- **Acceptance criteria:** (1) with the setting off, every generated pattern is byte-identical to today's (the goldens do not move); (2) on pictures with fur, feathers or hair, the strokes lie along the direction of the texture, on the textured areas and not on smooth ones (a clear sky, a smooth background stays free of them); (3) a density control moves them from a few accents to a full coat, and the default is a few; (4) the strokes are in at most four threads, each an existing palette thread or one added at the end, lighter or darker than the stitches beside it; (5) they are ordinary backstitch: listed in the thread list and legend by length, editable, in every export; (6) generating twice from the same input gives the same strokes; (7) a chart with several thousand strokes keeps the editor responsive (frame time measured against a chart without them) and exports without failing; (8) the Owner has seen charts made from pictures like the owl and judged that the result is worth having, before the setting is built into the UI.
- **Constraints:** off by default and never applied to an existing chart. Strokes are straight lines between grid corners of at most three cells, as every backstitch is (D268). Generation lives in Rust only (`rust/cs-core`). It composes with G-084's line tracing: a stroke does not cover a traced line. A stroke count needs a ceiling per chart, so a photograph cannot produce an unusable number.

**Milestones** (proposed; waits for the Owner's answers and go-ahead):
- [ ] M1 -- **Measure, and ask.** From the picture, estimate where there is detail finer than a stitch and which way it runs (a structure tensor of the fine detail), lay strokes along that field in a prototype, and render charts with and without them for pictures like the Owner's owl, a furry animal, a bird and a smooth portrait. Write what it finds, with the pictures, in `docs/reviews/`, and decide the method and its parameters as decision files. **Stop here for the Owner's look (criterion 8):** if the strokes do not read as texture, the goal ends here with the finding.
- [ ] M2 -- **Generate.** Implement in Rust behind the setting, producing `backstitch` strokes and their palette entries, with a per-chart ceiling; goldens unchanged with the setting off; tests for the direction, for smooth areas staying free and for determinism.
- [ ] M3 -- **Setting and UI.** The checkbox and density in the generation options, persisted; e2e that generating with it on yields strokes in the thread list and on the chart, and that they can be edited.
- [ ] M4 -- **Editor and exports at volume; docs; deploy.** The editor and every export with several thousand strokes, measured; README, HANDOVER, decision files, docs-lint, deploy and check live.

**Questions for the Owner:**
1. Which pictures matter most: animal fur, bird feathers and hair, or also rough surfaces such as bark, grass, water and sky? This sets where the strokes may go.
2. Thread colours: should a stroke be a lighter or darker shade of the stitches under it using threads already in the palette (my default), or may it add up to four new threads?
3. How much: a few accent strokes, as on the owl's face, or a full coat of texture? The density control covers both; which is the default?
4. The strokes lie over the cross stitches and leave them as they are (my default). Should the stitches under dense strokes be simplified, since the strokes carry the detail?

**Progress log** (newest first):
- 2026-10-02 -- goal drafted at the Owner's request, after the owl picture: its backstitch is of two kinds, the lines in the picture (G-084) and texture strokes made from the shading, which this goal is. Nothing built. I am not sure the result will look hand-stitched, so M1 ends with the Owner's look before anything is built into the app.

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
