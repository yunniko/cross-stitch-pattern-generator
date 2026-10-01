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

### G-084 · Generation can trace lines in the picture as backstitch — ACTIVE (2026-10-02)
- **What:** an optional generation setting, off by default, that finds thin dark lines in the source picture (outlines, whiskers, lettering, stems) and adds them to the chart as backstitch lines in a thread of the line's colour, instead of leaving them as a ragged row of whole stitches.
- **Why:** designers backstitch exactly these details; G-073 already stores, edits, draws, counts and exports backstitch (corner to corner, any two grid corners, one palette shared with the crosses). Generation never produces any, so the user redraws every line by hand.
- **Acceptance criteria:** (1) with the setting off, generated patterns are byte-identical to today's (generation goldens do not move); (2) on a line-art test image (dark outline, whiskers, a signature) the traced lines follow the source lines to within a cell, join at their ends, and the cross stitches under them are the surrounding colour rather than the line's colour; (3) on a photo the default sensitivity adds few or no lines rather than noise, and a sensitivity control moves that in both directions; (4) the lines appear in the thread list, legend (length per thread), editor and exports exactly as hand-drawn ones do; (5) every traced line is one the editor can select, move and delete, and generating twice from the same input gives the same lines.
- **Constraints:** off by default and never applied to an existing chart. Line ends are grid corners (the data model, D232 and G-073). Thread colours come from the existing palette plus at most the backstitch-only entries the palette already allows, and the total number of colours must respect the colour limit the user chose. Generation lives in Rust only (`rust/cs-core`); there is no TypeScript generator to keep in step.

**Milestones** (proposed; waits for the Owner's answers and go-ahead):
- [x] M1 -- **Measure.** On sample images (line art, pixel art with outlines, a logo, two photos) detect thin dark lines by a ridge/skeleton method, snap them to corners and record what each setting finds, shown as pictures in `docs/reviews/`. Decide the method, the sensitivity range and how the cross stitches under a line are chosen, as decision files. If nothing separates lines from noise on photos, say so and restrict the setting to line-art-like images.
- [x] M2 -- **Generate.** Implement in Rust behind the setting, producing `backstitch` lines and the matching palette entries; goldens unchanged with the setting off.
- [x] M3 -- **Setting and UI.** The checkbox and sensitivity in the generation options, persisted; e2e that generating with it on yields lines in the thread list and on the chart, and that they can be edited.
- [x] M4 -- **Docs, full suite, deploy.** README, HANDOVER, decision files, docs-lint, deploy and check live.

**Owner's answers (2026-10-02):** (1) the images are mostly drawings with lines, but the app is for wide use, so photos must not get worse and the default must be safe on them; (2) a traced line may add a thread; (3) the cross stitches under a line take the surrounding colour.

**Progress log** (newest first):
- 2026-10-02 -- M1 to M4 done and deployed (7f8a462); the live site passes the new e2e spec. Awaiting the Owner's look and sign-off. Measured in `docs/reviews/2026-10-02-backstitch-from-lines.md`; decisions D266 to D268. Tracing in `rust/cs-core/src/lines.rs`; the checkbox and sensitivity under Photo > Lines; off by default. Verified: 6 unit tests and 6 generation tests in Rust (a line becomes backstitch in a dark thread, the stitches under it are not dark, a brand gives a brand thread, a textured picture gets none, off gives the chart it always was), the 74 golden hashes unchanged, 3 new e2e tests, 962 unit tests. Looked at: a generated chart in the app with its Backstitch thread section. Also fixed: a Pattern Keeper unit test that compared two PDFs built a second apart and so failed now and then (the clock is frozen in it).
- 2026-10-02 -- the Owner answered the three questions (above). Acceptance (3) stands as the guard for wide use. Waits for the go-ahead to start M1.
- 2026-10-02 -- the half-stitch generation draft that held this number was **cancelled by the Owner** ("cancel halfstitches generation") before any work started; this goal replaces it. Drafted at the Owner's request after discussing that detecting lines from a photo is hard, so the plan starts with measuring. Nothing built.

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
