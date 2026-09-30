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

### G-078 · Rulers on the four edges of the viewer — ACTIVE (2026-09-30)
- **What:** a ruler along each edge of the viewer (top, bottom, left, right) that marks every 10th stitch of the chart and
  follows scroll and zoom, so a stitch can be counted from any side. Each ruler also shows where the pointer is. While a
  tool that draws its own outline is in hand (the brush), the pointer itself is hidden over the pattern.
- **Why:** the Owner works on large charts and needs to know where they are without counting cells (the exports carry
  such numbers on the chart edges; the editor does not).
- **Acceptance criteria:** four rulers around the working area; a numbered mark at every 10th stitch line (10, 20, 30, as
  the exports number them) that stays on its stitch line through scrolling and zooming; a marker on every ruler at the
  pointer, and the stitch it is over; readable at every zoom; the pointer hidden over the pattern with the brush; nothing
  else in the viewer moves or breaks.
- **Constraints:** the rulers sit beside the scrolling well, so the chart's own measuring is untouched (D135). At a zoom
  where every 10th number would crowd, numbers thin to every 20th, 50th, 100th (assumption, Owner to confirm). The pointer is
  hidden wherever the tool's own outline is drawn (brush, line, rectangle, oval, fill, lasso fill), not for the brush alone
  (assumption, Owner to confirm).

**Milestones:**
- [x] M1 — the tick model, the four rulers with the pointer marker, the hidden pointer, tests, looked at on screen
- [ ] M2 — the Owner's adjustments after looking, and the deploy

**Progress log** (newest first):
- 2026-09-30 — Owner: "add coordinates of cursor on status bar". The status bar now reads the stitch under the pointer
  ("Stitch 24, 18", counted from 1 at the top left, so it matches the ruler's marker; a dash off the chart). Built
  (`app/components/pointer-readout.tsx`), not deployed. 859 unit; 469 of 471 e2e (the 2 admin-stats cases pass alone); new
  case in `tests/e2e/rulers.spec.ts`.
- 2026-09-30 — Deployed 799bf6f at the Owner's instruction; the live specs pass (10 of 10), other sites unaffected. M2 (the Owner's adjustments) is what remains.
- 2026-09-30 — M1 built (D252). 859 unit (new `tests/unit/ruler.spec.ts`), new `tests/e2e/rulers.spec.ts` (4 cases: marks on
  their stitch lines through zoom and scroll, thinning when zoomed out, the pointer marker on all four rulers, the hidden
  pointer) and 468 of 470 e2e (the 2 admin-stats cases pass alone). Looked at on screen zoomed in and out. Waits for the Owner before M2.
- 2026-09-30 — goal created at the Owner's request ("the ruler on the edges of viewpoint... mark every 10th stitch... all
  four sides of working area", then "the pointer of where the cursor is on every ruler" and "when brush is active cursor
  itself should be hidden over the pattern"). Interpreted: the viewer's edges, numbered like the exports.

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
