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

### G-060 · A floor that stops the smoothing eating rare colours — ACTIVE (2026-09-22)
- **What:** a setting that keeps a colour in the chart once it holds at least a few stitches, instead of letting the
  smoothing passes reassign its last stitches away. Off by default, so every chart drawn so far is untouched.
- **Why:** the Owner asked why raising the colour count stops changing anything, and the measurement is blunt. On the
  photo fixture at 150 stitches, asking for 64 colours: the quantizer really does produce **64**, of which 30 hold
  under 0.2% of the chart (median colour 64 stitches of 15,000, smallest 1). The smoothing then reassigns the
  stragglers and the chart comes back with **15**. The same photo at 400 stitches keeps **40**. So the delivered
  count is governed by the chart's size, not by the slider, and nothing says so. This goal is the lever; telling the
  reader what happened is its own smaller change and is *not* in scope here.
- **Acceptance criteria:**
  1. **Off is today.** With the floor at zero the 18 golden hashes (D107), the ICM equivalence specs
     (`m5-equivalence`, `icm-neighbour-bound`) and every existing Rust parity case are unchanged, and the smoothing
     takes the same path — a scalar compare, not a new pass (D044 keeps that loop free of closures and scans).
  2. **On, it delivers, and the number is recorded.** At 150 stitches asking for 48 the delivered palette rises
     materially above today's 15; the figure it reaches is measured per fixture rather than promised here.
  3. **What it costs is published, not implied.** Confetti and the 3×3 neighbourhood error against the floor off,
     per fixture and colour count, in `docs/reviews/`. A reader trading smoothness for colours should see the price.
  4. **Both languages agree** byte for byte with the floor on, with parity cases at more than one floor.
  5. **Carried like every other setting** (D203, D204): validated by range in the request, in the saved file and the
     autosave record, absent in an old file meaning off.
  6. **The pane says what it does** — that it keeps small colours the smoothing would otherwise absorb — and the
     preview and legend still tell the truth about the result.
- **Constraints:** the floor is a count of stitches a colour may not be reduced below by the smoothing, checked as a
  scalar in the passes that reassign cells; it never *creates* stitches for a colour the quantizer did not give one.
  Dithering already skips those passes (D199), so the floor is meaningless there and is ignored rather than refused.
  **Narrowed in M1, on the measurement:** the floor is checked in the palette merge only, which is where 24 of the 33
  lost colours go; the cell-moving passes are untouched (D209, and the first progress entry below).
- **Not in scope** (Owner, 2026-09-22): any notice in the UI about how many colours a chart came back with. The
  setting explains itself; the shortfall is not reported.

**Milestones**:
- [x] M1 — The floor in the engine: per-colour counts carried through the smoothing, a reassignment refused when it
  would take a colour below the floor, in both languages, with the off-is-identical proof and the delivered-colour
  measurement.
- [x] M2 — The setting: in the pane, the request, the file and the autosave record, with its wording, and an
  end-to-end pass showing the floor changes the delivered palette and travels with the chart.
- [x] M3 — The published trade (criterion 3), decision file, README and HANDOVER, deploy and verify live.

**Progress log** (newest first):
- 2026-09-22 — **M3 done, pending the deploy.** `docs/reviews/2026-09-22-colour-floor.md` is written by
  `npm run compare:floor` (new script, 48 floored cases over four fixtures and three asks). The headline is not the
  trade the goal expected: the floor reads *closer* to the photo, not further — median 0.98× the unfloored 3×3 error,
  and the only four cases above 1.00 are one DMC chart at 1.0003×. Its real cost is +0.03 points of confetti (median)
  and the threads themselves. D209 records where the floor lives and why. Verified: Vitest 1248 passed / 8 skipped,
  Playwright 336 passed across 28 specs, `compare:rust` 94 cases identical, tsc, eslint and docs-lint clean.
- 2026-09-22 — **M2 done.** `colorFloor` travels the whole way: the pane's "Keep similar colors" select (Off / 50+ /
  25+ / 10+ stitches / Every color, disabled while dithering), the workspace options, the job request (range-checked
  0..MAX_COLOR_FLOOR, not the pane's five values), the built pattern, the saved file and the autosave record, absent
  meaning off in each. Two e2e cases: the floor reaches the chart and the file records it (48 colours asked on a small
  chart delivers more than off), and the select is disabled for a dithered chart.
- 2026-09-22 — **M1 done, and the goal's premise corrected.** Measured where the colours actually go, per pass, on the
  photo fixture at 150 stitches asking 48: quantizer 48 → coarse ICM 38 → fine ICM 41 → component recolour 40 →
  diagonal fix 40 → recolour 40 → **palette merge 16**. So the optimizer and cleanup cost 8 colours and the merge
  costs 24 — and the merge's merges chain, so a cell can end far past the 0.02 OKLab step each single merge was
  justified by. The floor therefore went into `mergeSimilarColors` alone (D209): a colour holding at least the floor
  is never a merge's loser, checked as a scalar inside the existing pair scan. A floor in the ICM was rejected: it
  would pin a colour's last stitch where every neighbour disagrees, which is confetti by construction. Delivered at
  150/48 on the photo fixture: 16 off, 24/26/30/40 at floors 50/25/10/1. Off is identical: 18 golden hashes,
  `m5-equivalence`, `icm-neighbour-bound` and the whole suite unchanged, and 94 Rust parity cases identical including
  five new floor cases at floors 1, 3, 5, 10 and 50.
- 2026-09-22 — goal created on the Owner's instruction, from measurements taken while answering the question: the
  quantizer produces what is asked, the smoothing decides what survives, and at 150 stitches the survivors saturate
  around 14–16 whatever is requested (40 at 400 stitches). Rejected while planning: restoring dropped colours after
  the smoothing, which puts back exactly the confetti the smoothing had removed and gives the passes no say; the
  floor belongs inside them.

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
