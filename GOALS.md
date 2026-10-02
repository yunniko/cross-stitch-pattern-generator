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
- 2026-10-02 -- built and deployed. The Stitched view draws every line after the stitches in `drawScene`, solid (`drawBackstitch` takes `solid`); the realistic preview export lays antialiased lines over each strip of rows in `Preview::overlay_backstitch` (Rust, production) and `overlayBackstitch` (TypeScript), the same arithmetic (D275). Verified: a Rust test and a TypeScript test pinning the same seven pixels, strips giving the same pixels as the whole, a recording-context test of the scene, 2 e2e tests (a line shows in the Stitched view along its whole length and goes when deleted; a chart without backstitch is untouched), and looked at an exported preview.
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
