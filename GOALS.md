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

### G-062 · A thread for every hue the photo has — ACTIVE (2026-09-23)
- **What:** the palette reserves slots for the distinct hues the photo holds, whether or not they earn one by area.
  A red print covering 0.5% of the chart, or pink flowers covering 0.1%, get a thread because they are a colour that
  is there, not because they win a squared-error contest against a brown ramp.
- **Why:** this is the fourth mechanism tried against the Owner's report, and the first that addresses the reason
  the other three failed. Measured across G-060 and G-061: the palette merge (reverted, D210), allocation
  re-ranking, the cell's own colour (Vivid, shipped, D211) and a hue-weighted clustering metric all leave the cat's
  pink with **no thread at all by 64 colours**. The cause is the same in each case — the pink is 0.5% of the chart
  and numerically close to cream, so every stage that allocates by squared error treats it as a rounding error.
  Reserving a slot is the only shape that does not ask it to win that contest. It was rejected at planning on
  2026-09-22 as too blunt ("a thread in the legend for 11 stitches"); three failures later, that cost is the trade
  the Owner is asking for.
- **Acceptance criteria:**
  1. **A stated, falsifiable target on the delivered chart, on the Owner's own photos.** At 150 stitches and 24
     colours the cat's legend contains a pink thread and the lattice's contains a red and a blue one — checked in
     the finished palette, after the smoothing, the merge and any brand snap, not in an intermediate stage. This is
     the criterion the last three attempts lacked; if the change cannot meet it, it does not ship.
  2. **It costs what it says.** The threads it spends come out of the tonal ramp, so the 3×3 neighbourhood error
     and confetti are published per fixture and colour count in `docs/reviews/`, against the same chart without it,
     together with how many threads were reserved and how many stitches each covers.
  3. **A photo with nothing rare in it is untouched** — on the gradient and flat-region fixtures it reserves
     nothing, and the chart is byte-identical to the same chart with the feature off.
  4. **The reserved thread survives to the legend.** A test proves it is not merged away (D209's threshold), not
     smoothed out, and not collapsed onto another skein by a thread brand — or, where a brand genuinely has no
     separate thread for it, the chart says so rather than silently dropping it.
  5. **Off is today, byte for byte** — the 18 golden hashes and every existing Rust parity case unchanged.
  6. **Both languages agree** byte for byte with it on, with parity cases on both photos, dithered and not.
- **Constraints:** it may not invent a hue the cells do not hold — a reserved thread is seeded from real cells and
  keeps their colour. It spends only slots the palette would otherwise have given to a near-duplicate; the requested
  colour count is still the ceiling.
- **Settled by the Owner, 2026-09-23:** it is **folded into Vivid**. One switch means "show me the colours that are
  there"; Vivid's cells put the colour on the grid and the reserved threads spend palette slots on it.

**Milestones**:
- [x] M1 — The rule, defined and calibrated by measurement, before any pipeline change: what counts as "a hue the
  photo has" (a chroma floor, hue bins, a minimum share of stitches), how many slots it may take, and where the
  seeding happens — with a sweep over both photos and every fixture, and a check that a reserved thread survives
  the merge, the smoothing and the brand snap. Published in `docs/reviews/`. **Ends with a go/no-go against
  criterion 1**, measured on a throwaway implementation rather than a shipped one. Done 2026-09-23: **go**.
- [ ] M2 — The engine change in both languages, Off byte-identical, parity cases on both photos.
- [ ] M3 — The control (folded into Vivid or its own), the request, file and autosave plumbing, an end-to-end pass,
  decision file, README and HANDOVER, deploy and verify live on the Owner's photos.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-23 — **M1 done: go.** Measured on a throwaway implementation, written up in
  `docs/reviews/2026-09-23-hue-reservation.md`. Criterion 1 is met at 150 stitches and 24 colours: the cat's legend
  gains a pink thread (192,166,179, 119 stitches) and a rose (220,157,142, 89), the lattice's a blue (130,149,182,
  28) and a dark red (36,17,20, 220). Three findings the rest of the goal rests on:
  1. *A reserved thread survives every stage.* Cat pink 133 stitches at the quantizer, 128 after ICM, 119 after
     cleanup, 119 after the merge; lattice blue 48 / 29 / 28 / 28. The merge does not eat it — worth stating,
     since G-060 was built on the belief that it would.
  2. *Re-converging Lloyd after seeding loses them all*, because the seeded centroid drifts back into the mass it
     was placed to escape. Cells are assigned to the nearest thread once, and the reserved centroid stays put.
  3. *The legend's recompute is what mutes them*, since a thread's colour is the mean of its members: the cat's
     pink falls from chroma 0.042 to 0.027. Applying Vivid's own rule one level up — mean lightness, chroma of the
     thread's most colourful quarter — restores it to 0.035, and the lattice's blue from 0.034 to 0.054.
  Honest qualification recorded in the review: the hues arrive **as the photo holds them**, dusty and dark, not as
  saturated colours. What changes is that there is a thread for them at 24 colours instead of none at 64.
- 2026-09-23 — the Owner chose to fold this into the Vivid switch rather than add a third control.
- 2026-09-23 — goal created at the Owner's request, as the third of the four directions first offered on
  2026-09-22. What it must not repeat: G-060 shipped on a diagnosis that named the wrong stage, and G-061 shipped a
  mechanism that works but does not answer the complaint. Hence criterion 1 and M1's go/no-go: the target is stated
  first, measured on the finished chart, and the goal stops if a throwaway implementation cannot reach it.

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
