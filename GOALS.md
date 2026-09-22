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

### G-061 · Colour that the eye sees should cost the palette something — BLOCKED (2026-09-22)
- **What:** the quantizer learns that a saturated colour is worth more than its area says. A red print covering 0.5%
  of the chart, or a pink flower covering 0.1%, gets a thread early instead of at 32–40 colours.
- **Why:** the Owner's report, 2026-09-22: a photo with reds, greens and blues in it comes back as browns until the
  palette is raised a long way; the cat photo reaches its pinks and purples only near 30–40, dithered or not.
  Measured on both photos at 100 stitches: the red shirt print is **11 cells of 8000** and gets a thread at **32**
  colours; the cat's pink is **0.1% of cells**. It is neither the palette merge (G-060's wrong guess, D210) nor
  downsampling (the full-resolution pixels carry 6.8% of cells over chroma 0.06 against 5.7% after downsampling).
  It is that colours are allocated by area-weighted squared error, and `computeCellImportance` — the one signal that
  is meant to rescue rare detail — is `0.7·maxEdge + 0.3·contrast`, **both computed from luminance alone**. A pale
  flower on cream has no luminance edge and no luminance contrast, so nothing ever bids for it.
- **Acceptance criteria:**
  1. **The Owner's two photos improve, measured.** The colour count at which each hue family first gets a thread,
     before and after, on both photos and at more than one chart size. The red and the pink arrive materially
     earlier; the figure is measured, not promised here.
  2. **Photos that were fine stay fine.** On the existing fixtures and the real-photo parity corpus, the 3×3
     neighbourhood error does not get worse and confetti does not rise materially. A change that buys hue with
     accuracy everywhere else is not the change.
  3. **Structure is untouched.** ICM, pair evidence and the cleanup passes read the same `importance` they read
     today, byte for byte — the chroma term is used only where a colour is *allocated*. This is what keeps the
     change auditable, and it is why the 18 golden hashes are expected to move only through allocation.
  4. **Dithered charts get it too.** They skip the merge but use the same quantizer palette, so the improvement must
     show there as well (this is what G-060 could never do).
  5. **Both languages agree** byte for byte, with parity cases on both photos.
  6. **The trade is published**, per fixture and colour count, in `docs/reviews/`.
- **Constraints:** the chroma term is separate from `importance`, not folded into it — see criterion 3, which names
  what compels it. It may not invent colour that is not in the photo: it re-ranks what the cells already hold.
- **To settle with the Owner before M2:** whether this is **on by default** (recommended — a setting nobody turns on
  does not solve the reported problem; it rewrites the golden hashes and means a chart regenerated tomorrow differs
  from one generated today, though saved files carry their own palette and still open unchanged) or a control.

**Milestones** (filled in during planning):
- [ ] M1 — The baseline and the candidate, measured: a `docs/reviews/` document giving, per photo and fixture, the
  colour count at which each hue family first appears today; a per-cell chroma signal; and a sweep of how strongly it
  should weigh, chosen against criteria 1 and 2 rather than by eye.
- [ ] M2 — The change in the engine, both languages, with structure provably untouched (criterion 3) and parity
  cases on both photos, dithered and not.
- [ ] M3 — The published trade, decision file, README and HANDOVER, deploy and verify live on the Owner's own photos.

**Progress log** (newest first; The Company appends at every stopping point):
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
  **The open question for the Owner:** this is a change to `downsampleToGrid`, which every chart in the project's
  history was built through — a bigger and riskier change than the ranking tweak that was approved, and one that
  makes every photo's chart different, not just the muted ones. Approved before it is built, per OPERATIONS §4.
- 2026-09-22 — goal created after G-060 was reverted (D210). The Owner chose this direction from four: chroma-aware
  importance, hue-weighted clustering distance, reserved palette slots, or diagnose further. Measurements that the
  plan rests on are in this session's report and will be re-run into `docs/reviews/` as M1's first act. Noted while
  measuring, and **not part of this goal**: on the cat photo the Auto and Vivid enhancement modes *lower* cell chroma
  (median 0.020 → 0.010; the most saturated thread at 24 colours falls from 0.094 to 0.033), which looks like a real
  defect in those modes.

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
