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
- 2026-09-22 — **Deployed and verified live** at acf89fa. The panel shows the three switches, all off, and a Ring
  thickness slider; flipping the size switch changes 87 stitches of the swatch. 23 containers before and after with
  an identical name set, 38 vhosts unchanged. **Awaiting sign-off.**
- 2026-09-22 — **M2 and M3 done.** Each of the three knobs has an "Every mark" switch beside
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

### G-059 · A preview for every pattern, and lines as one option — ACTIVE (2026-09-22)
- **What:** two things the Owner asked for on 2026-09-22. The dither preview appears whenever a pattern is chosen,
  not only for Hand-drawn and not behind a collapsed panel; and the two line screens become one **Lines** option with
  a direction — horizontal, vertical, diagonal `/`, diagonal `\`.
- **Why:** the preview is the only place a reader sees what a pattern does before spending a generation on it, and it
  currently exists for one pattern in ten. The line screens are one idea with a setting, listed as two.
- **Acceptance criteria:**
  1. **Every pattern previews, and the preview is right.** For each family the window is the chart's own stitches,
     compared against a real chart of that size: a matrix pattern, a diffusion kernel and the drawn marks.
  2. **It costs what each family forces, not more.** A matrix cell depends on nothing but its own position, so its
     window needs no chart; a diffusion kernel's error runs along rows, so its window needs the chart's full width
     but only the rows above it; the drawn marks need the whole grid (D206). Each is measured.
  3. **The preview is visible whenever dithering is on**, without opening anything, and the texture knobs stay
     behind their panel — they belong to one pattern, the preview to all of them.
  4. **Lines is one option with four directions**, and the two new ones (vertical, `\`) are generated data like the
     rest (D198). Both languages agree, with parity cases for each direction.
  5. **Old charts keep opening.** The stored values stay the four `lines-*` mode ids, so a file naming
     `lines-horizontal` or `lines-diagonal` opens exactly as it did; nothing is migrated.
  6. **Nothing else moves:** Off, the other patterns, the default texture and the 18 golden hashes unchanged, and
     the two existing line screens draw exactly what they drew.
- **Constraints:** a preview must be the real thing or say what it is — an approximation shown as a preview is worse
  than none (D206). Patterns stay data (D198); both languages change together.

**Milestones**:
- [x] M1 — Lines as one option: the vertical and anti-diagonal matrices generated, the mode list and both languages,
  the direction control in the pane, parity for each direction, and the proof that old ids still open.
- [ ] M2 — The preview for every family: the window built the cheapest exact way for each, moved out of the
  collapsible and shown whenever dithering is on, pinned against real charts and measured. **Clicking the preview
  reshuffles the marks** (Owner, 2026-09-22), replacing the Shuffle button.
- [ ] M3 — The comparison document re-run over the widened set, decision file, README and HANDOVER, deploy and
  verify live.

**Progress log** (newest first):
- 2026-09-22 — **M1 done.** Four directions — horizontal, vertical, `/`, `\` — generated as data like the rest, and
  one **Lines** entry in the list with the direction under it. The two that existed are byte-identical (the
  generator only added rows), and the stored ids are unchanged, so an old file naming `lines-diagonal` opens as it
  did. Each direction's lines are pinned as unbroken along their own way at three tones. **One test of mine had to
  be rewritten rather than the code:** at half tone every other line is lit, so stepping two lines at a time lands
  on a lit one again and even the wrong direction reads as unbroken — the across check is made at a quarter tone,
  and the reason is in the test. Verified: Vitest 1227 passed / 8 skipped, `compare:rust` identical on all four
  directions, tsc, eslint and the dithering e2e green. Next: M2, the preview.
- 2026-09-22 — goal created on the Owner's instruction, carrying two of the four requests made that day (the ring
  slider and the switches went into G-058). Settled while planning: the stored representation stays four `lines-*`
  mode ids with the pane grouping them, which is what makes old files a non-issue; and the preview's cost is decided
  per family rather than by one rule, because only the drawn marks genuinely need the whole grid.

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
