# Goals — cross-stitch-pattern-generator

Template, numbering, and cross-project conventions live in
`E:\CLAUDE\COMPANY\GOALS.md`. This is a **standalone project** (Owner
decision, 2026-09-09) — not a svc-lab service: no monetization. Deployed
live at the Owner's direct instruction after M9 (see progress log below)
to `cross-stitch.craftodejnice.cz`; see
`docs/decisions/D013-deployed-to-cross-stitch-craftodejnice.md`, the deploy
log in `HANDOVER.md` and `COMPANY/INFRASTRUCTURE_DEPLOY.md`. Standard
OPERATIONS.md milestone check-in gates apply (not waived, unlike
svc-lab). Completed goals live in `docs/goals-archive.md`.

## Active goals

### G-068 · Rust becomes the only pipeline — ACTIVE (2026-09-24)
- **What:** the TypeScript generation pipeline stops shipping and is deleted. Rust runs every job, with no fallback.
- **Why:** the Owner's decision, 2026-09-24: the sidecar has proven reliable, and carrying two implementations at
  bit-exactness taxes every pipeline feature (G-061 alone took five Rust files to mirror one TypeScript change).
  See `docs/reviews/2026-09-24-two-implementations-cost.md` for what it buys and costs.
- **The one thing that must not be got wrong:** today the TypeScript is not really a fallback, it is the
  *specification* — `compare:rust` proves Rust correct by comparing it against TypeScript, and Rust has **3 tests of
  its own across 8,991 lines**. Delete TypeScript first and the gate built in G-067 M1 has nothing left to compare
  against. The regression floor has to move to Rust **before** anything is deleted, not after.
- **Acceptance criteria:**
  1. **The golden hashes run against Rust.** `tests/unit/golden-hashes.spec.ts` (37 cases, D107) is computed from
     `cs-bench` output, and still fails when generation output changes — proved by changing it on purpose.
  2. **Nothing in production can run the TypeScript pipeline**, and `CS_JOB=0` no longer offers it.
  3. **The duplicated modules are gone**, not merely unused: the 15 `lib/pipeline` modules with no browser importer,
     plus `lib/crisp`, plus whatever of `lib/export` Rust already covers.
  4. **What the browser still needs is types and settings, not algorithms.** The 8 shared pipeline modules are
     checked one by one; any algorithm the editor genuinely runs stays and is named in HANDOVER as deliberately
     single-implementation.
  5. **CI is green on Rust alone**, and the live site generates, exports and opens a chart afterwards.
- **Constraints:** no output change. The golden hashes recorded under D107 keep their values through the whole
  goal — if a hash has to move, that is a bug in the migration, not a licence to re-record.

**Milestones**:
- [ ] M1 — **Move the regression floor to Rust** (criterion 1): goldens from `cs-bench`, proved by deliberate
  breakage, before a line of TypeScript is deleted.
- [ ] M2 — **Stop shipping the fallback** (criterion 2): the processor always uses the sidecar, `CS_JOB=0` retired,
  Dockerfile, HANDOVER and `COMPANY/INFRASTRUCTURE_DEPLOY.md` updated, and a decision file reversing D190/D193's
  "TypeScript stays the fallback".
- [ ] M3 — **Delete the duplication** (criteria 3 and 4), module by module, suites green at each step.
- [ ] M4 — **Grow Rust's own tests where the goldens do not reach**, since after M3 they are the whole safety net.
- [ ] M5 — README, HANDOVER, deploy and verify live.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-24 — goal created from the Owner's decision. Scoped before planning: **15 `lib/pipeline` modules have no
  browser importer** (`quantize`, `pattern`, `denoise`, `regions`, `hue-reserve`, `contour-cleanup`, `edge-map`,
  `energy`, `local-optimizer`, `pair-edge-evidence`, `palette-optimizer`, `pipeline-context`, `dither-matrices`,
  `photo-upload`, `enhance-preview`) and are the real duplication; **8 are imported by the browser** (`enhance`,
  `dither`, `dither-hand-drawn`, `downsample`, `generation-mode`, `server-errors`, `pattern-server`,
  `enhance-preview-server`), mostly for types, mode lists and the texture editor rather than for maths — each needs
  checking in M3. Ordering is M1 first for the reason in the goal: deleting the specification before moving the
  regression floor would leave nothing watching the only implementation.

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
