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

### G-080 · A predictable cell cursor: a dot at the pointer, and the keyboard — ACTIVE (2026-10-01)
- **What:** with the system pointer hidden over the chart (G-078), the highlighted stitch does not say where in it the
  pointer is, so it cannot be told when the highlight will move. (1) A small dot at the pointer's exact place over the
  outline. (2) A keyboard cell cursor: the arrow keys move the highlighted stitch one stitch at a time (Shift: ten) and
  Enter is the pen -- press to paint, hold while moving to draw a stroke or stretch a shape, release to finish.
- **Why:** the Owner "can not predict where and when my cell cursor will move next", especially at large zoom, and does not
  want the system pointer back (Owner, 2026-10-01: "Reading B and the dot").
- **Acceptance criteria:** a dot is drawn at the pointer wherever the outline is, and moves inside one stitch; the arrow
  keys move the outlined stitch and stop at the chart's edge; Enter paints it with the tool in hand (brush, Fill, Line,
  Rectangle, Oval), and holding it while moving draws; the lock, the rulers' marker and the status bar follow the keyboard
  as they follow the mouse; a real pointer move hands the cursor back; arrows in a text field or with Select are untouched.
- **Constraints:** Space is the temporary pan, so the pen is Enter. Lasso fill, backstitch and the selection tools are not
  driven from the keyboard in this goal (assumption, Owner to confirm).

**Milestones:**
- [x] M1 — the dot, and the keyboard cell cursor with Enter as the pen, tests, looked at on screen (D254)

**Progress log** (newest first):
- 2026-10-01 — Deployed cd6fbdb at the Owner's instruction; the live specs pass (26 cases), other sites unaffected. Pending: sign-off.
- 2026-10-01 — M1 built (D254). The dot (`drawPointerDot`, drawn with the outline) and the keyboard cursor
  (`app/hooks/use-keyboard-cursor.ts`: arrows, Shift for ten, Enter as the pen, edge-stopping, scrolls to keep the stitch
  in view; the rulers' marker and the status bar follow it). 873 unit; new `tests/e2e/keyboard-cursor.spec.ts` (4 cases); 478
  of 481 e2e (2 admin-stats cases pass alone). Also fixed the flaky shape-tools case the handover listed: it reloaded the
  page and expected a fresh start, but a reload restores the autosaved chart (it failed 10 of 10 against the live code when
  run repeatedly); its second visit is now a new browser context (12 of 12). Looked at on screen.
- 2026-10-01 — goal created after the Owner chose the dot and the keyboard over the alternatives offered (hysteresis,
  animation, a hidden-pointer "grid cursor" mode, edge ticks).

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
