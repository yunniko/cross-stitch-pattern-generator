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

### G-050 · A transparent background becomes empty stitches — ACTIVE (2026-09-20)
- **What:** generating from a photo with transparency produces a chart whose transparent parts are empty stitches, not
  white ones, and whose colours and edges are read only from the parts that are actually there.
- **Why:** Owner request (2026-09-20): "transparent pixels become empty grids". Today a transparent background is
  charted as white stitches (`downsampleToGrid` fills an uncovered cell white), and the structure stages read a
  transparent pixel's RGB as if it were a colour — usually black — so a subject on transparency gets a ring of
  invented edge evidence and a background nobody asked to stitch.
- **Owner decisions (2026-09-20):** a cell whose average alpha is under 50 % becomes an empty stitch; at or above 50 %
  it is stitched in the colour of its covered part alone.
- **Acceptance criteria:**
  1. A photo with transparency charts with every under-half-covered cell as the empty-stitch sentinel, and no palette
     colour drawn from transparent pixels. Checked cell by cell on a fixture whose transparent region is known.
  2. Colour, edge and evidence stages ignore transparent pixels rather than reading them as a colour: a subject on a
     transparent background produces the same importance and pair evidence as the same subject on a cropped opaque
     photo, to within the border cells where the two genuinely differ.
  3. **A photo with no transparent pixel produces byte-identical output to today**, in every mode — the 18 golden
     hashes (D107) still hold, unchanged.
  4. Rust matches TypeScript byte for byte on transparent inputs too (`npm run compare:rust`), since the processor
     generates in Rust (D190); new fixtures with transparency join the parity corpus.
  5. The editor, the exports and the realistic preview show those cells as empty — they already support empty stitches
     (G-040, D143), so this is a check, not new work.
  6. Vitest and Playwright cover it; `docs-lint` passes; HANDOVER regenerated; deployed and verified live.
- **Constraints:** the empty-stitch sentinel and its rules are D143's, not new ones. Criterion 3 is the hard one: every
  change must be a no-op on a fully opaque photo, which is what keeps the golden hashes and the Rust parity corpus
  meaningful. Threshold 50 % is the Owner's, recorded in a decision file.

**Milestones**:
- [ ] M1 — The mask and the colour stages: `downsampleToGrid` reports each cell's coverage, cells under the threshold
  become empty, and the quantizer, denoise, ICM, merge, compaction and palette recompute all skip them. Unit tests for
  a known transparent fixture, and the golden hashes unchanged.
- [ ] M2 — The structure stages: importance and pair evidence read only covered pixels, so a subject on transparency
  stops growing a ring of invented edges (criterion 2). Measured against the cropped-opaque equivalent.
- [ ] M3 — Rust: the same mask and the same skips in `cs-core`, byte-identical to TypeScript on transparent fixtures
  as well as opaque ones; the parity corpus gains them.
- [ ] M4 — The rest: the editor, exports and preview checked against a transparent chart, Playwright over a real
  transparent PNG, decision file, README and HANDOVER, then deploy and verify live.

**Progress log** (newest first):
- 2026-09-20 — goal created and planned. Owner settled the threshold (under half covered) before planning. The mode
  rename that came with the same request (Classic and Refined) shipped separately at 0d7c395, labels only.

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
