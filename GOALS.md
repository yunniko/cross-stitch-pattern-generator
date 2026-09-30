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

### G-079 · Small fixes: dismissable errors, one canvas colour, a transparency lock — ACTIVE (2026-09-30)
- **What:** (1) every error message goes away by itself or can be dismissed; (2) the canvas colour leaves the top panel
  (the Chart tab has it) and the Chart tab's colour control uses the colour picker library the thread colour editor uses
  (`react-colorful`, the Owner's "rgb library"); (3) a "lock transparency" icon button with on and off states: while on,
  no drawing or filling tool can turn an empty stitch into a colour or a colour into an empty stitch; selection, moving
  and dragging are unchanged, except that fill selected fills only the stitches that are not empty.
- **Why:** small irritations the Owner hit while working: messages that stay, the same setting in two places, and
  no way to paint a cut-out chart without spilling into its transparent background.
- **Acceptance criteria:** an error strip or line has a dismiss control and clears itself after a while; the top panel has
  no canvas colour; the Chart tab's canvas colour opens the same kind of picker as a thread; with the lock on, the brush,
  the shape tools, Fill, double-click fill and Lasso fill leave every stitch's empty/filled state as it was, and Fill
  selected fills only non-empty stitches; with it off, everything works as before.
- **Constraints:** the lock guards the drawing and filling tools only (Owner): selection, move, paste, duplicate, flip,
  rotate, crop and the quick mirror are unchanged. Assumption, Owner to confirm: the lock is remembered in the browser
  with the other options, not saved in a chart file; "fill selected" is restricted only while the lock is on.

**Milestones:**
- [x] M1 — dismissable errors; canvas colour out of the top panel and on the shared picker
- [x] M2 — the lock transparency button and its rule in every drawing and filling tool (D253)

**Progress log** (newest first):
- 2026-09-30 — M1 and M2 built (D253). Errors: every strip or line has a cross (`DismissButton`) and an error clears after 12 s
  (`app/hooks/use-auto-dismiss.ts`); the canvas colour left the top panel and is a swatch on the Chart tab opening
  `react-colorful` with a hex field; the lock is the padlock icon in the top panel (`aria-pressed`, remembered). 868 unit
  (new `tests/unit/transparency-lock.spec.ts`), new `tests/e2e/small-fixes.spec.ts` (5 cases) and 474 of 476 e2e (the 2
  admin-stats cases pass alone). Looked at on screen. Not deployed. Pending: the Owner's look and sign-off.
- 2026-09-30 — goal created at the Owner's request ("small fixes of current issues"; "rgn is mistype, I meant rgb
  library"). The Owner's request names both milestones, so both are worked before the check-in.

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
