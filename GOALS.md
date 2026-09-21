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

### G-055 · A texture editor for the hand-drawn dither — ACTIVE (2026-09-21)
- **What:** the settings behind `hand-drawn` become a *texture* the reader can edit — mark spacing, the mix of the
  four shapes, ring size, how wide a broken ring's gap is, how much a lump wobbles — with a swatch that redraws as
  the sliders move, carried with the chart so it reopens the way it was made.
- **Why:** Owner request, 2026-09-21, after seeing the mark library on its own. The shapes are fixed today and the
  mix is a constant in the source; spacing and mix change the look more than the shape library does, so the knobs are
  where most of the range lives.
- **Deliberately not in this goal:** a *stamp* editor, where the reader paints a small grid saying which stitch of a
  mark fills first. That is the other half of the idea and is real work of its own (a grid painter, a stamp carried in
  the file, the engine looking a mark up instead of computing it). It gets its own goal once these knobs have been
  used in anger — a custom mark on the wrong spacing still looks wrong, so the knobs come first.
- **Acceptance criteria:**
  1. **Nothing that exists moves.** Off, the nine other patterns, and `hand-drawn` at its default texture produce
     byte-identical charts to today: the 18 golden hashes (D107) and every existing parity case unchanged. The default
     settings object must reproduce today's constants exactly, which is the test that says the refactor was faithful.
  2. **Any texture holds tone.** D201's even-spread ranking survives whatever the knobs say — checked over a sweep of
     valid settings, not only the default: a flat tone `t` lights `t` of every mark, within 0.02. A knob that can
     break that is out of range, not a feature.
  3. **Both languages agree.** Rust matches TypeScript byte for byte across a spread of textures at two chart sizes,
     not just the default one.
  4. **It is carried, and it comes back.** The texture travels in the generation request (validated against real
     numeric ranges, not derived from a type union), is embedded in the saved file and the autosave record rather
     than referenced, and a chart made with a custom texture reopens identically. An old file still opens; a file
     holding an unknown or out-of-range texture falls back to the default instead of failing.
  5. **The swatch tells the truth.** The editor draws its preview in the browser, with no server round trip, and the
     preview is *proved* to match what generation makes from the same settings rather than assumed to — the same
     threshold field, compared in a test.
  6. **Bounded.** Every knob has a range the UI enforces and the processor re-checks, and no setting inside those
     ranges makes generation at 1500 stitches materially slower than `hand-drawn` is today (5.6 s measured, G-054).
- **Constraints:** a texture is data, never code — the parity regime rests on both languages reading the same numbers
  (D198's precedent, and why a formula editor is not on the table). Both languages change together. Dithering still
  skips every smoothing pass and refuses Crisp (D199). **The permanent cost to accept:** today's ten patterns are
  fixed and covered exactly; an editor makes the space infinite, so the tests can only sample it — which is why
  criterion 2 is a property over a sweep rather than a handful of cases.

**Milestones**:
- [x] M1 — The engine takes a texture: today's constants become a settings object with defaults that reproduce the
  current chart byte for byte, in both languages, with the tone property over a sweep of settings and parity cases
  across several textures. **Settles here:** whether the seed becomes a knob (a "Shuffle", stored with the texture) —
  recommended, since D202 noted that one fixed seed makes every chart of a size share its placement.
- [ ] M2 — Carrying it: the texture in the request with real range validation, in the saved file and the autosave
  record, the old-file and bad-value fallbacks, and the reopen-identically test.
- [ ] M3 — The editor: the controls in the Photo pane, shown only when a drawn pattern is chosen and collapsed until
  opened, with the live swatch and a couple of presets (the current mix, and whatever the sliders show is worth
  keeping). Playwright over editing a texture, regenerating, and reopening the saved file.
- [ ] M4 — Decision files, README and HANDOVER, the comparison document re-run to show the default's numbers have not
  moved, deploy and verify live.

**Progress log** (newest first):
- 2026-09-21 — **M1 done.** `DitherTexture` holds the nine numbers that were constants: spacing, separation, the four
  shape weights, ring radius (as a smallest and a span), gap width, wobble, sweep and the seed. **The seed became a
  knob**, as recommended — it is what lets two charts of the same size differ, which D202 named as the price of one
  fixed seed. **The default reproduces G-054 to the bit**, pinned against a frozen copy of the pre-texture module at
  three grid sizes (`tests/unit/helpers/dither-frozen-g054.ts`, kept deliberately). One trap worth the decision file:
  `radiusSpan` is stored rather than a largest radius, because `0.42 - 0.26` is not `0.16` in binary floating point
  and the default would not have reproduced. Tone holds across 24 sampled textures at three tones, within 0.02 —
  the property the goal asks for, since the space is now infinite. Verified: Vitest 1203 passed / 8 skipped,
  `compare:rust` 73 cases identical including five textures (wide, tight, rings-only, dots-only, reseeded), tsc and
  eslint clean. Next: M2, carrying the texture in the request and the file.
- 2026-09-21 — goal created and planned, on the Owner's instruction. Two things settled while planning: a formula or
  script editor is out (two languages cannot evaluate arbitrary expressions identically without a shared interpreter,
  and the byte-identity invariant is worth more than the generality), and the swatch renders in the browser because
  `lib/pipeline/dither-hand-drawn.ts` is pure TypeScript with no server dependency. Open for M3: whether the controls
  sit inline in the Photo pane or in a popover — inline and collapsed is the recommendation, since the pane is already
  long and the texture is only meaningful while a drawn pattern is selected.

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
