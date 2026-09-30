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

### G-076 · Choose the stitch texture of the Stitched view — ACTIVE (2026-09-30)
- **What:** a set of buttons on the Chart tab, each showing its texture as 3 × 4 stitches; choosing one redraws the
  Stitched (realistic) view with it. All textures are drawn at the same size, scaled as needed. First new texture:
  the Owner's `texture1.png` (9 × 9 px).
- **Why:** the Owner wants to change how the realistic preview looks without a code change per look.
- **Acceptance criteria:** buttons on the Chart pane with a 3 × 4 swatch each, all the same size; the choice changes the
  Stitched view and is remembered; the exported realistic preview follows the choice (M2).
- **Constraints:** the Rust preview exporter embeds the textures; byte-identity with the screen is not required (Owner, 2026-09-30).

**Milestones:**
- [x] M1 — catalog, setting, tile building per texture, buttons on the Chart pane (on-screen only)
- [x] M2 — the exported realistic preview (PNG and inside `.cspzip`) draws with the chosen texture (D249); not byte-identical to the screen, by Owner decision

**Progress log** (newest first):
- 2026-09-30 — M2 built (D249). Rust preview embeds each catalog texture; `stitchTexture` travels client → processor → `cs-job`.
  837 unit, 118 Rust-side (goldens unchanged), 461 of 463 e2e with a real binary; the 2 admin-stats cases count usage
  events exactly and failed only under parallel load, passing alone. New: `scripts/rust-stitch-texture.ts`, an export e2e.
  Not run: a Docker image build. Pending: the Owner's sign-off.
- 2026-09-30 — M1 built (13c48d2, D248). 836 unit tests pass; the new e2e (3 × 4 swatches at one size, Stitched view
  redraws, choice survives a reload) passes, as do 213 e2e cases across the viewport/render-parity, OXS and blank-chart
  specs. 8 e2e cases that Generate or export through the processor did not run here (no Rust binary in this
  environment; the unmodified navigation spec failed the same way) — the full suite is still owed before a deploy.

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
