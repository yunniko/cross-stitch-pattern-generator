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

### G-061 · Vivid: a stitch keeps the colour that is in it — ACTIVE (2026-09-22, deployed 2026-09-23, awaiting sign-off)
- **What:** a **Vivid** switch beside Algorithm. Off (default) is today exactly. On, a stitch takes the mean
  lightness of the pixels it covers but the chroma of its most colourful part, instead of averaging a saturated
  minority into neutrality — so the reds, greens, blues, pinks and violets that are in the photo are still in the
  grid when the palette is chosen.
- **Why:** the Owner's report, 2026-09-22: a photo with reds, greens and blues comes back as browns until the palette
  is raised a long way; the cat photo reaches its pinks near 30–40, dithered or not. M1 located it: the colour is
  gone **before any palette is allocated**. At 100 stitches the lattice photo's cells hold 39 red and 29 blue
  stitches of 8000 and the cat's hold 7 pink of 10,000; the quantizer returns none of them, and ICM, the cleanup
  passes and the merge then change the hue families by nothing at all. Re-ranking allocation was measured not to fix
  it (seven candidate scorings, inside the noise). Keeping each cell's chroma does: 7 pink cells become 49, 1 violet
  becomes 17, 39 red becomes 80, 29 blue becomes 50.
- **Acceptance criteria:**
  1. **Off is today, byte for byte** — the 18 golden hashes (D107) and every existing Rust parity case unchanged.
  2. **On, the Owner's two photos deliver their hues far earlier**, measured as the colour count at which each hue
     family first gets a thread, at more than one chart size, against Off.
  3. **On, a photo that was already right is not made garish** — 3×3 neighbourhood error and confetti on the
     existing fixtures and the real-photo corpus, published per fixture, with the percentile chosen against them.
  4. **It is a switch of its own**, not a third Algorithm value: all four combinations with Classic/Refined work, and
     the measurement shows what each does (D040's lesson — a thing that is not a clustering algorithm does not
     belong in the clustering enum).
  5. **Carried and recorded like every other setting**: validated in the request, in the saved file and the autosave
     record, absent meaning off — and recorded on the pattern, which `generationMode` today is not.
  6. **Both languages agree** byte for byte, on and off, with parity cases on both photos.
  7. **Dithered charts get it too**: the change is upstream of the quantizer, so it must show there as well.
- **Constraints:** it may not invent colour the photo does not hold — the chroma it keeps is measured from the
  pixels of that cell. Lightness stays the area mean, so a chart's tone and structure do not move.
- **Out of scope, deliberately:** the medoid denoise. M1 measured it: with Vivid cells the blue surviving it rises
  from 5 cells to 21–32 and red, pink, violet and green pass through intact or better, so the downsample alone is
  likely enough. If M2's end-to-end numbers say otherwise, the minimal change is to extend the *existing* ally rule
  with a chroma-excess-over-neighbourhood test calibrated the way D51 calibrated the ridge floor — not a blunt
  "protect chromatic cells", which on a JPEG would protect 4:2:0 chroma fringing as if it were real. Also out of
  scope: Photo fix, which the Owner will redo later, and whose Auto/Vivid modes were measured to *lower* this cat's
  chroma (median 0.020 → 0.010).

**Milestones**:
- [x] M1 — Where the colour is lost, measured: allocation re-ranking ruled out, the loss located in the downsample,
  the chroma-preserving alternative and the denoise's behaviour under it measured. Done 2026-09-22.
- [x] M2 — The percentile chosen against criteria 2 and 3 over every fixture and both photos, published in
  `docs/reviews/`, and the engine change in both languages with Off byte-identical.
- [x] M3 — The switch: pane, request, file, autosave record and the pattern's own record, an end-to-end pass, then
  decision file, README and HANDOVER, deploy and verify live on the Owner's photos.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-23 — **Deployed at 355790e and verified live on the Owner's own photos**, on the Owner's instruction to
  ship it and try it despite M2's verdict. The cat at 150 stitches and 40 colours goes from 5 to 9 threads above
  chroma 0.06 (most saturated 0.095 → 0.112); the lattice at 120 stitches from 9 to 13 (0.109 → 0.118); both charts
  differ from their Averaged twin, the exported file records `vivid`, and the console is clean. 23 containers before
  and after with an identical name set, 38 vhosts unchanged. **Criterion 2 is not met and was not claimed**: the
  photos do not deliver their hues *far* earlier, they deliver a few more saturated threads. Shipped to be tried.
  **Awaiting sign-off.**
- 2026-09-23 — **M2 and M3 built.** Rust mirrors the cell rule byte for byte: 96 parity cases identical, seven of
  them new Vivid ones covering both palettes, Crisp, dithered, Classic clustering, transparency and the stand-down
  case. The switch is Color detail (Averaged | Vivid) beside Algorithm — a switch of its own, per D040 — carried
  through the request (a boolean, range-checked), the saved file, the autosave record and the pattern's own record,
  which says whether it *acted*, not whether it was asked for. Two name collisions with Photo fix's own Vivid were
  found by the suites and fixed by scoping each spec to its own section; the Owner accepted the collision until
  Photo fix is redone.
- 2026-09-22 — **BLOCKED after M2's measurements: Vivid works and does not solve the complaint. Not deployed.**
  The code is committed, off by default and byte-identical when off (golden hashes, downsample and regression suites
  pass), because the measurements below are worth keeping; nothing has shipped.
  1. *Vivid does what it claims at the cell level* — 3 to 10 times the chromatic cells (M1's numbers) — and moves
     some families one step earlier on the cat: yellow 12→8, orange/brown 16→12, green 20→16 colours.
  2. *It does not deliver the complaint.* The cat's pink gets **no thread at all by 64 colours**, with Vivid or
     without, at 100 or 250 stitches; the lattice's blue arrives **later** with Vivid on (32→48). The one pink-ish
     thread anywhere in the sweep is a dusty mauve at 250 stitches and 40 colours.
  3. *A hue-weighted clustering metric does not rescue it either.* Stretching a/b by √2 to √8 before Lloyd (which
     is exactly a weighted distance) moves the lattice's red from 64 to 32–48 but pushes its blue from 32 to 40–64,
     non-monotonically, and never produces the cat's pink at any weight, with or without Vivid.
  4. *Nor does the thread colour itself.* Recomputing each thread as mean lightness with the chroma of its most
     colourful quarter raises threads above chroma 0.03 from 11 to 21 (cat, 24 colours) but produces no pink thread.
  5. *A gate was needed and found.* Vivid on small images amplified noise badly (121× the error on `flat regions`,
     2.5× on the photo fixture). The chroma a cell gains from noise alone reaches 0.127 on fixtures at ~4 pixels a
     cell — larger than the 0.03–0.04 real sub-stitch colour produces at 144–400 pixels a cell — so no threshold on
     the gain can separate them. Vivid now stands down below `VIVID_MIN_PIXELS_PER_CELL` (24), which is what the
     fixtures fall under; every fixture then measures 1.00× error and +0.00 confetti.
  **The open question for the Owner.** Four mechanisms have now been measured and none delivers "the reds and blues
  I can see". The reason is consistent: the pink is 0.5% of the chart and numerically close to cream, so every
  stage that allocates by squared error treats it as a rounding error. The one approach not yet tried is the one
  rejected at planning as too blunt — **reserving palette slots for the most distinct hues present, whether or not
  they earn it by area**. That is the only shape that guarantees the outcome the Owner is asking for, and its cost
  (a thread in the legend for a few dozen stitches) now looks like the trade the Owner actually wants. Recommended,
  but not started: this goal has already been re-aimed twice.
- 2026-09-22 — **M1 done; unblocked by the Owner, who chose a mode and the name Vivid.** Two further decisions,
  both answered with measurement rather than preference:
  1. *A switch of its own, not a third Algorithm value.* Classic/Refined selects the quantizer and nothing else
     reads it; this changes what the cells are, before any colour is chosen. D040 records this project making the
     opposite choice once (DMC as a third algorithm) and undoing it, because it forbade valid combinations.
  2. *The denoise is left alone for now.* Under Vivid cells the medoid's damage falls sharply: lattice blue
     29→5 today becomes 50→21 (top quarter) or 66→32 (top tenth); cat pink 7→7 becomes 49→50; cat green
     436→378 becomes 849→885; the noisy fixtures are unchanged either way. Since 8 blue cells already earned a
     thread at 48 colours, 21–32 should not need help. Revisited only if M2's charts say otherwise.
- 2026-09-22 — **BLOCKED: the approach the Owner approved is measured not to work, and the lever is two stages
  earlier.** M1 measured before changing anything, which is what this entry exists to report.
  1. *Sweeping the allocation ranking does nothing.* Seven candidate scorings (the cell's own chroma amplifying its
     error; the hue part of the error weighted 4–64×; both together) were run end to end on both of the Owner's
     photos and two fixtures at 16/24/32 colours. Hue families present moved between 3/5 and 4/5 in both directions
     — inside the noise — while the 3×3 error moved ±0.1×. No candidate brought the red or the pink in earlier.
  2. *Because the colour is gone before allocation runs.* Following each hue family through the stages on the
     lattice photo at 24 colours: the cells hold **39 red/pink stitches and 29 blue/violet of 8000**; the quantizer
     returns **none of either**; and ICM, the cleanup passes and the merge then change the family counts by nothing
     at all. On the cat photo the cells hold **7 red/pink stitches and 1 violet** — the pink is essentially not in
     the chart before any palette is chosen. The medoid denoise also removes 24 of the lattice's 29 blue cells.
  3. *What does move it: how the photo is shrunk.* Keeping the mean's lightness but taking the chroma of each cell's
     most colourful quarter, instead of averaging a saturated minority into neutrality, changes the cells reaching
     the quantizer from 7 red/pink to **49** on the cat (68 at the top tenth), 1 violet to **17** (33), 436 green to
     **849**; and on the lattice 39 red/pink to **80** (109), 29 blue/violet to **50** (66).
- 2026-09-22 — goal created after G-060 was reverted (D210). The Owner chose this direction from four: chroma-aware
  importance, hue-weighted clustering distance, reserved palette slots, or diagnose further.

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
