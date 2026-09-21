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

### G-051 · The two defects the pipeline audit left open — DONE (2026-09-21, pending Owner sign-off)
- **What:** cell importance stops leaving holes on a chart finer than the photo, and the quantizer stops relying on an
  accidental value for a dropped cluster's samples. Both are from the 2026-09-20 audit; neither changes what an
  ordinary photo charts.
- **Why:** Owner request (2026-09-21) to fix what the audit found. The first is a real if mild defect: importance
  drives denoise protection and reinvestment priority, and on an upscaled chart it is patchy in a checkerboard rather
  than following the photo. The second is a trap: TypeScript and Rust agree today only by accident, and the next
  refactor of either can silently break them apart — mine did, during G-050.
- **Acceptance criteria:**
  1. Every cell takes its importance from the pixels its own footprint covers. A cell whose footprint holds no pixel
     (only possible when the chart is finer than the photo) samples the pixel its centre falls in, so no cell is left
     at importance 0 for want of a pixel.
  2. **A photo at least as large as its chart produces byte-identical output**, in every mode: the 18 golden hashes
     (D107) and every Rust parity case are unchanged. Measured, not assumed — the footprint partition below is the
     exact inverse of today's mapping for those sizes.
  3. The Rust port matches byte for byte, on upscaled charts too, and the parity corpus gains cases where the chart is
     finer than the photo — it has none today, which is how a divergence there could hide.
  4. A sample whose cluster is dropped for having no weight gets its label from code that says so, on both sides,
     rather than from `-1` written into a `Uint8Array` and resolved through an undefined lookup. Output is unchanged
     and a test pins it.
  5. Vitest, Playwright and the Rust tests pass; `docs-lint` passes; HANDOVER regenerated; deployed and verified live.
- **Constraints:** criterion 2 is the whole reason this is safe to do without rebaselining anything. The measurement
  behind it: over 48 downscale and 1:1 size pairs, the footprint partition `[ceil(c·src/grid), ceil((c+1)·src/grid))`
  is identical to today's `floor(x·grid/src)` assignment, cell for cell; over 24 upscaled pairs it leaves 11,346 cells
  with no pixel, which is exactly the defect. Criterion 4 must not change output: the dropped cluster's samples resolve
  to palette entry 0 today on both sides, and that stays, explicitly.

**Milestones**:
- [x] M1 — Importance from each cell's own footprint, in TypeScript, with the empty-footprint case falling back to the
  centre pixel. Unit tests that no cell is importance-0 for want of a pixel, that a subject reads the same at 1:1 and
  upscaled, and that the golden hashes are untouched.
- [x] M2 — The same in Rust, byte-identical, and the parity corpus gains upscaled cases (a small source at a large
  stitch count) in every edge mode.
- [x] M3 — The dropped-cluster label made explicit on both sides, with a test pinning today's value; then docs, the
  decision file, deploy and live verification.

**Progress log** (newest first):
- 2026-09-21 — **All three milestones done and deployed (da45106); awaiting sign-off.** Importance reads each cell's
  own footprint in both languages, with the centre pixel where the footprint holds none; the dropped zero-weight
  cluster's label is now named on both sides rather than reached through an undefined lookup. The prediction held:
  the 18 golden hashes are unchanged and a test pins that downscaled importance equals the old mapping cell for cell,
  so nothing an ordinary photo charts has moved. The parity corpus gained seven upscaled cases and all 45 are
  byte-identical. Verified: Vitest 1164 passed, 8 skipped; Playwright 324 passed across all 28 specs against the
  sidecar; cargo test, clippy, rustfmt, tsc, eslint and docs-lint clean. Live: a 160x100 photo at 400 stitches
  charted 100,000 stitches in 12 colours, while the downscaled and transparent checks returned exactly their
  pre-deploy numbers; 23 containers before and after with no other restarted, no fallback logged. **Owner approval:**
  "go all three".
- 2026-09-21 — goal created and planned, with the two measurements above taken first: the footprint partition is
  identical to today's for every downscale and 1:1 size pair (so nothing pinned moves), and the dropped-cluster label
  reaches 0 on both sides today, Rust deliberately and TypeScript by accident.

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
