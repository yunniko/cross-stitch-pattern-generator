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

### G-084 · Generation can place half stitches on diagonal edges (and, later, backstitch on lines) — DRAFT (2026-10-02)
- **What:** an optional generation setting, off by default, that turns a cell which is part colour and part background, split along a diagonal, into a half stitch of that colour ("/" or "\\"). A second setting, backstitch from lines, is planned after it and gets its own milestones once the first is signed off.
- **Why:** diagonal edges against a background come out as a staircase of whole stitches; a half stitch at each step is how designers smooth them, and G-082 already stores, draws and exports half stitches. A cell that is half colour A and half colour B cannot be represented (one kind per cell, G-082 answer 1) and is out of scope.
- **Acceptance criteria:** (1) with the setting off, every generated pattern is byte-identical to today's (the existing generation goldens do not move); (2) with it on, a test image of a coloured diagonal shape on a transparent background gets half stitches along its diagonal edges and whole stitches inside, and a photo with no transparency gets none; (3) the half stitches carry through the existing legend, editor, A4, PDF (as whole stitches) and OXS paths unchanged; (4) the setting is remembered like the other generation options; (5) the Rust and TypeScript generators agree where both exist.
- **Constraints:** background means the cells the generator already treats as empty (transparent pixels, G-050 and D196), because that is the only background it knows; a "fabric colour" picker for opaque images is a possible later extension, not part of this goal. Generation lives in `rust/cs-core/src/pattern.rs` with a TypeScript mirror in `lib/pipeline/`, so both change together. Backstitch detection is excluded until its own milestones are planned.

**Milestones** (proposed; waits for the Owner's answers and go-ahead):
- [ ] M1 -- **Measure.** Per cell, from the cell's coverage and the source pixels inside it, decide "diagonal split into colour and nothing" with a threshold; run on sample images (a silhouette, pixel-art, a photo cut-out) and record the proportion of edge cells that qualify and what they look like, in `docs/reviews/`. Decide the threshold from that, as a decision file.
- [ ] M2 -- **Generate.** Implement it in Rust and TypeScript, behind the setting, producing `cellKind`; parity test between the two; goldens unchanged with the setting off.
- [ ] M3 -- **Setting and UI.** The checkbox (and its threshold if the measurements say one is needed) in the generation options, persisted; e2e of generating with it on and seeing half stitches on the chart.
- [ ] M4 -- **Docs, full suite, deploy.** README, HANDOVER, decision files, docs-lint, deploy and check live.

**Questions for the Owner:**
1. Is "transparent = background" enough for the first version, or do you also want a fabric-colour picker for opaque images?
2. When a cell is about half a colour and half background but the diagonal is unclear, should it stay a whole stitch (my default) or be dropped?
3. Should the half stitch pick its direction ("/" or "\\") only from the cell's own pixels, or also from the neighbouring edge so a staircase line stays straight?

**Progress log** (newest first):
- 2026-10-02 -- goal drafted at the Owner's request ("draft it as G-084, half stitches first"), after the discussion that a half stitch is one colour on one diagonal with bare fabric in the other half, so only colour-against-background cells qualify. Nothing built.

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
