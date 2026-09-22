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

### G-056 · A stamp painter: draw your own mark — ACTIVE (2026-09-22)
- **What:** a fifth kind of mark whose shape the reader paints. A small grid says in which step each stitch of the
  mark fills; the chart draws it wherever a mark lands, mixed with the four built-in shapes by the same weights.
- **Why:** named in G-055 as the other half of the texture idea and deliberately deferred until the knobs had been
  used. The knobs move spacing, size and mixture; they cannot make a mark the shapes do not already contain — a
  cross, a heart, a hatch stroke, an initial.
- **Acceptance criteria:**
  1. **Nothing that exists moves.** Off, the ten patterns and the default texture are byte-identical: the 18 golden
     hashes (D107), the frozen pre-texture comparison (D203) and every existing parity case unchanged. A texture with
     no stamp behaves exactly as it does today, which includes the shape the weights fall back to.
  2. **A stamp cannot break tone.** Whatever is painted, a flat tone `t` still lights `t` of every mark, within 0.02
     — checked over sampled stamps at several spacings, the same property D201 rests on.
  3. **Both languages agree** byte for byte on stamped textures, including a stamp wider than the marks' own spacing,
     which is the case where cells fall outside the region and get clipped.
  4. **The stamp is carried like the rest of the texture** (D204): validated by size, length and value range in the
     request, embedded in the saved file, and falling back rather than failing when unreadable.
  5. **The painter is usable and honest:** painting a mark shows it in the swatch, the chart matches the swatch
     stitch for stitch (D204's pinning extended to stamps), and when a stamp is wider than the spacing the editor
     says the outside will be clipped instead of cropping it silently.
- **Constraints:** a stamp is data — a size and a list of small integers — like every other part of a texture (D203).
  Both languages change together. Tone stays exact by construction (D201): the stamp decides a cell's *order*, never
  how many cells light.

**Milestones**:
- [x] M1 — The stamp in the engine: a fifth shape scored from a painted grid, in both languages, with its validation,
  the tone property over sampled stamps, and parity cases including a stamp wider than the spacing.
- [x] M2 — The painter: a grid in the texture editor that paints fill order, its weight beside the other four, the
  swatch pinned to the chart for stamped textures, and the clipping notice.
- [x] M3 — End-to-end coverage, decision file, README and HANDOVER, deploy and verify live.

**Progress log** (newest first):
- 2026-09-22 — **M3 deployed and verified live** at 00a8d16. A cross painted on the 5×5 grid through the real
  controls reaches the chart, which comes back recording the stamp and its 0.3 share; the processor logs show no Rust
  fallback. 23 containers before and after with an identical name set, 38 vhosts unchanged, every live site still
  answering. **Awaiting sign-off.**
- 2026-09-22 — **M3 done.** D205 records why a painted mark is a fifth weighted shape and why
  what it leaves unpainted still fills — every cell keeps an order, because that ranking is what holds tone. README
  and HANDOVER updated, the latter with the rule a future session would otherwise break: the shape list only grows at
  the end and the fallback is pinned by name. Verified: Vitest 1218 passed / 8 skipped, Playwright 330 passed across
  27 specs, `compare:rust` 81 cases identical, tsc, eslint and docs-lint clean.
- 2026-09-22 — **M2 done.** `app/components/stamp-painter.tsx`: a 3/5/7/9 grid inside the Texture panel, four
  steps, click to paint and click again to clear. Painting a mark gives it a 30% share of the chart and a "Painted"
  slider beside the other four; clearing it takes the share back, because a stamp weight with no stamp is a texture
  the processor refuses. Re-sizing keeps what fits, measured from the centre out. When a stamp is wider than the
  spacing the panel says its outside will be clipped rather than cropping it quietly. The swatch pinning now covers
  stamped textures, including a clipped one. Verified: Vitest 1218 passed / 8 skipped, Playwright 6 dithering specs
  green (two new: a painted cross reaching the chart and being saved with it, and the clipping notice appearing only
  when it should), tsc and eslint clean. Next: M3, docs and the deploy.
- 2026-09-22 — **M1 done.** A stamp is `{ size, order }` — an odd-sided square of fill steps — carried in the
  texture and drawn as the fifth shape. A stitch the stamp names fills in its own step (distance from the centre
  ordering the stitches within a step), and anything it does *not* name fills afterwards, nearest the centre first,
  so a sketched stamp leaves no holes. The default texture still reproduces G-054 to the bit: the fallback shape is
  pinned to `lump` rather than "the last of the list", which is what adding a fifth would otherwise have changed.
  Tone holds over random stamps at sizes 3–9 and spacings 4–14, within 0.02 — including a 9-wide stamp at spacing 4,
  where a mark's region clips the stamp's outside. **One divergence found by parity:** Rust wrote `"stamp": null`
  into a stamp-less texture where TypeScript writes no key, so the recorded texture differed while the chart did
  not; the Rust writer now omits it. Verified: Vitest 1222 passed / 8 skipped, `compare:rust` 75 cases identical
  including two stamped ones, tsc and eslint clean. Next: M2, the painter.
- 2026-09-22 — goal created and planned, on the Owner's instruction after G-055's sign-off. Settled while planning:
  the stamp is a **fifth weighted shape**, not a replacement mode, so it mixes with rings and dots the way the others
  do; and the shape a short weight list falls back to stays `lump` explicitly rather than "the last shape", so adding
  a fifth cannot change what a default texture draws.

### G-057 · The texture swatch shows the chart's own marks — ACTIVE (2026-09-22)
- **What:** the Texture panel's swatch stops being a 56-stitch sample drawn on its own and becomes a window onto the
  chart the next Generate will make: the same grid width, so the same marks, over a range of tones rather than one.
- **Why:** the Owner doubted it showed real pattern details, and measurement agreed. Marks are placed by walking a
  jittered lattice across the whole grid, so a 56-wide field and a 200-wide one diverge after the first row: **46% of
  the swatch's stitches differ from the same corner of a 200×125 chart** (45.7% at 400×300, 47.7% at 1000×750). The
  test that pinned the swatch to the pipeline was true and too narrow — it built a chart of the swatch's own size,
  which is the one case where they agree.
- **Acceptance criteria:**
  1. **The swatch is a real corner of a real chart.** For the chart size the current settings would produce, the
     swatch's stitches equal the matching stitches of a full-size field, cell for cell, at every tone it draws.
  2. **It shows tones, not a tone.** The swatch draws a dark-to-light ramp, so marks are seen growing rather than at
     one arbitrary level.
  3. ~~**It stays live.** Redrawing stays under about 30 ms for a 1000-stitch chart, so only the rows the window
     needs are computed.~~ **Corrected 2026-09-22, after measuring:** no window can be built without the whole grid,
     because each mark's shape is drawn from what is left of the stream *after* placement — so the field costs
     14 ms at 200 stitches, 30 at 400, 200 at 1000 and 494 at 1500. The swatch redraws 120 ms after the sliders
     stop instead. Making a window cheap would mean drawing shapes from a per-mark hash, which changes every chart
     drawn so far and is the Owner's call (D206).
  4. **Nothing that exists moves:** Off, the eleven patterns and the default texture stay byte-identical, the 18
     golden hashes and the frozen pre-texture comparison unchanged.
  5. **What the swatch still cannot show is said plainly**, in the panel and in the docs: a chart picks between each
     stitch's own two nearest threads, and a two-thread swatch cannot show that.

**Milestones**:
- [x] M1 — The window: a field computed at the chart's width with only the rows the window needs, pinned against a
  full-size field, and the ramp. The measurement above recorded in the test that replaces the old pinning.
- [x] M2 — The panel takes the chart's size from the photo and the settings, the note about threads, docs and the
  decision, deploy and verify live.

**Progress log** (newest first):
- 2026-09-22 — **Deployed and verified live** at 76df9aa. The swatch reads 56×56 with row shares 0.18, 0.39, 0.54,
  0.66 down its ramp, and changing the chart size from 200 to 100 stitches changes 1325 of its 3136 stitches — which
  is exactly the point: the marks it shows are that chart's own. 23 containers before and after with an identical
  name set, 38 vhosts unchanged. **Awaiting sign-off.**
- 2026-09-22 — **M1 and M2 done.** The swatch is now a corner of the chart the settings would
  make: the field is built at the chart's own width and height, cropped to 56×56, and drawn over a dark-to-light
  ramp so marks are seen growing rather than at one tone. **Two bugs the old test could not see**, both now pinned:
  the field depends on the grid's *height* as well as its width, because each mark's shape is drawn from the stream
  left after placement — so no cheap window is possible (criterion 3 corrected above); and a tone compared with a
  threshold is only the pipeline's rule while the dark thread is the nearer one, so the swatch had the marks
  inverted across the light half. The swatch now goes through `ditherToPalette`'s own rule (`drawnRampWindow`), and
  the test builds a real chart of the right size and ramp to compare against. The panel takes the chart's size from
  the photo's proportions and the size setting, and says what a two-thread swatch cannot show. Verified: Vitest 1219
  passed / 8 skipped, Playwright 330 passed across 27 specs, tsc, eslint and docs-lint clean. D206 records the cost
  and the rejected alternative.
- 2026-09-22 — goal created after the Owner's doubt, with the divergence measured first: 46% of the swatch's stitches
  differ from the same corner of a 200×125 chart. My own pinning test had asserted agreement on a 56×56 chart, which
  is the single size where the two agree — a true claim about a case the UI never shows.

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
