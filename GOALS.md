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

### G-058 · Every texture slider reaches every mark — ACTIVE (2026-09-22)
- **What:** Ring width, Size variation, Stroke sweep and Edge wobble stop applying to one or two mark shapes and
  reach all of them, each behind a switch that starts off — so a texture draws exactly as it does today until the
  switch is moved.
- **Why:** Owner observation, 2026-09-22, and the table below is why it is right. Of five knobs, only Mark spacing
  touches every mark; three touch the two ring shapes (62% of marks at the shipped mixture) and one touches lumps
  (15%). That is the main thing limiting the range of textures a reader can reach.

  | Slider | Rings | Broken rings | Dots | Lumps | Stamp |
  |---|---|---|---|---|---|
  | Mark spacing | yes | yes | yes | yes | yes |
  | Ring width, Size variation, Stroke sweep | yes | yes | no | no | no |
  | Edge wobble | no | no | no | yes | no |

- **What each switch would mean** (settled while planning, so M1 does not have to re-argue it):
  - **Wobble everywhere** — the per-stitch jitter that ragged a lump's edge is added to every shape's score. On a
    stamp it applies only to the stitches the stamp does *not* name, so a painted shape stays as painted.
  - **Size everywhere** — dots and lumps gain a core: stitches within Ring width fill first, the rest spill outward
    afterwards. This is what gives them a size at all; today their extent is whatever the tone gives them. The stamp
    is exempt: its size is its grid.
  - **Sweep everywhere** — the angular sweep that draws a ring as a stroke applies to dots and lumps too, so they
    fill round like a pie rather than outward. The stamp is exempt: its order is painted.
- **Acceptance criteria:**
  1. **Off is today.** With the switches off — which is what every existing texture and every old saved file says —
     the default texture still reproduces G-054 against its frozen copy (D203), the 18 golden hashes are unchanged,
     and every existing parity case is identical. This is the criterion the whole design serves.
  2. **Each switch reaches what it claims,** measurably and per shape: with size everywhere on, a dots-only texture's
     mean reach responds to Ring width across its range (today it does not move at all); with wobble everywhere on, a
     rings-only texture's edges roughen; with sweep everywhere on, a dots-only texture's stitches fill by angle.
  3. **Tone stays exact** for any combination of switches, over sampled textures — the property D201 rests on.
  4. **Rust matches byte for byte**, with parity cases for each switch alone and for all three together.
  5. **Carried and validated like the rest of a texture** (D203, D204): booleans in the texture, absent in an old
     file meaning off, embedded in a chart that uses them.
  6. **The panel says what a switch does** — which marks it newly reaches — and the swatch shows it.
- **Constraints:** neutral defaults are the point; the alternative (letting the knobs reach everything and
  re-baselining the frozen default) was put to the Owner and this is the one chosen. A texture is still data with
  ranges, both languages still change together, and tone is still held by ranking (D201).

**Milestones**:
- [x] M1 — The three switches in the engine, in both languages: the neutral-default proof against the frozen copy,
  the per-switch measurements of criterion 2, the tone property over sampled combinations, and the parity cases.
- [x] M2 — The panel: a switch beside each slider naming the marks it reaches, the ring slider re-read so that
  turning it up thickens the stroke rather than thinning it (Owner, 2026-09-22), and an end-to-end pass showing a
  flipped switch changes the chart and is saved with it.
- [x] M3 — Decision file, README and HANDOVER, deploy and verify live.

**Progress log** (newest first):
- 2026-09-22 — **M2 and M3 done, pending the deploy.** Each of the three knobs has an "Every mark" switch beside
  it, off by default and named by what it reaches. **The ring slider now reads as Ring thickness and is the stored
  radius backwards** (Owner, 2026-09-22): turning it up tightens the circle, so the same thread sits closer together
  — which is what "thicker" means when tone fixes the amount of thread. D207 records both, and the e2e proves a
  flipped switch changes the chart and is saved with it. Verified: Vitest 1225 passed / 8 skipped, Playwright 331
  passed across 27 specs, `compare:rust` 85 cases identical, tsc, eslint and docs-lint clean.
- 2026-09-22 — **M1 done.** Three optional booleans on the texture, absent meaning off, each adding a term to the
  scoring so that with all three off every branch is the expression it was before — pinned against the frozen G-054
  copy and by a test that an explicit `false` is identical to the field with nothing at all. **The size switch had
  to be redesigned after measuring it:** a core that fills by distance and spills by distance is a monotone rewrite
  of plain distance, so it ranks the same stitches in the same order and changed *nothing* (measured 0%). The spill
  is scattered instead, which makes the radius visible. **Its direction is the opposite of the slider's name**, and
  not by choice: tone fixes how many stitches a mark lights, so a wide core swallows them into a compact disc while
  a narrow one leaves the ink to scatter — measured at −45% reach from 0.1 to 0.45. The Owner has asked for the
  slider to read logically, which M2 now carries. Verified: Vitest 1225 passed / 8 skipped, `compare:rust` 85 cases
  identical including each switch alone and all three together, tsc and eslint clean.
- 2026-09-22 — goal created on the Owner's instruction. Measured first, so M1 starts from numbers rather than
  impressions: at a flat 30% tone, mark spacing from 4 to 16 multiplies the thread per mark by 16× (5.0 → 79.0
  stitches) and the reach by 4× (1.57 → 6.49), while Ring width across its whole range leaves the thread per mark
  *identical* (11.5 stitches at every setting) and moves the reach by about 35% (2.05 → 2.77). That is the gap this
  goal closes: tone decides how many stitches a mark lights, so a knob that only rearranges them inside two shapes
  cannot do much.

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
