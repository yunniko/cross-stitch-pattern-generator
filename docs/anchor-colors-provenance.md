# `lib/anchor-colors.ts` — data provenance, license judgment call, and license

`DMC_TO_ANCHOR` (454 entries: a real DMC thread code mapped to its
documented Anchor-equivalent code) and `ANCHOR_COLORS` (355 entries: a
deduplicated, browsable Anchor-code + representative-RGB list) were built
for G-029 M3 (Anchor palette mode). Recorded here per STANDARDS.md's
"record the attribution where the asset is used" — read this in full
before touching this data again; it documents an explicit Owner-approved
judgment call, not routine reuse.

## No independent Anchor color data exists anywhere

Unlike DMC and Cosmo, **Anchor (the thread brand) has no independently-
measured RGB dataset available anywhere** — verified during the
2026-09-12 competitive/data research
(`docs/reviews/2026-09-12-thread-brand-palette-research.md`), not
assumed. Every "Anchor color chart" found (commercial sites, hobbyist
tools, PDFs) is a **DMC-equivalence conversion**: it presents Anchor codes
paired against DMC codes, with the RGB values belonging to the DMC side.
This is expected, not a gap in the search: neither DMC nor Anchor (both
owned by different companies) has ever published official colorimetric
data for its physical thread, so Anchor's own conversion charts
themselves have nothing more authoritative to draw from either.

**This means Anchor mode in this app is, by necessity, "nearest real DMC
thread, relabeled with its documented Anchor equivalent" — not an
independently-measured match.** This is disclosed in the app itself (the
Palette mode button's tooltip and the "+Add"/color-editor panel's message
text both say so explicitly), not just noted here — see D94 in
HANDOVER.md.

## Source and the license judgment call

The DMC-to-Anchor code mapping is copied from
[katjackson/embroidery-color-scheme-tool](https://github.com/katjackson/embroidery-color-scheme-tool)'s
`private/dmcColorChart.csv` (columns `dmc,anchor,description,red,green,
blue,hexValue`), fetched and inspected directly 2026-09-12. **This
repository has no LICENSE file and no stated license terms at all**
(GitHub's own API reports `license: null`) — a materially different, and
weaker, situation than DMC's own data (which traces to `sharlagelfand/dmc`,
an MIT-licensed repackaging of an otherwise-unlicensed upstream) or
Cosmo's (directly MIT-licensed).

**This gap was surfaced to the Owner explicitly, not resolved
unilaterally** (2026-09-12, mid-M3): asked whether to (a) use the mapping
anyway as a documented judgment call, (b) drop Anchor from this goal
entirely, or (c) spend more time searching for a second licensed source.
**The Owner chose (a)**, on this project's own record of already relying
on the same reasoning for DMC's own data:

- **Only the code-to-code pairs are used** (e.g. `"310": "403"`) — not
  the source file's `description`, `red`, `green`, `blue`, or `hexValue`
  columns for Anchor's own RGB (this app already has its own
  independently-sourced DMC RGB in `lib/dmc-colors.ts`; Anchor's RGB is
  always the real matched DMC color's RGB, never anything read from this
  source file).
- **A plain equivalence table between two standardized code systems is
  arguably factual/measured correspondence, not copyrightable creative
  expression** — the same reasoning `docs/dmc-colors-provenance.md`
  already applies to DMC's own unlicensed upstream (adrianj/
  CrossStitchCreator), and the research phase found "multiple independent
  hobbyist projects across GitHub host near-identical, similarly
  unlicensed tables of the same kind" for this exact DMC↔Anchor pairing
  specifically — consistent with this being treated as ambient community
  reference data, not one party's proprietary creative work.
- This is a judgment call with real (if likely small) residual legal
  risk, not a certainty — recorded honestly as exactly that, per
  VALUES.md Honesty, rather than presented as a fully resolved license
  question.

## Verification performed before use (not assumed)

- **Coverage**: the mapping's 454 DMC codes are the *exact same set* as
  this app's own `DMC_COLORS` codes (`lib/dmc-colors.ts`) — checked by
  set comparison, zero missing, zero extra.
- **Uniqueness on the DMC side**: all 454 DMC codes in the mapping are
  unique (no duplicate DMC rows).
- **Real many-to-one collisions on the Anchor side, quantified**: only
  355 of the 454 DMC codes map to a *unique* Anchor code — 99 DMC codes
  share an Anchor code with at least one other DMC code (Anchor's line is
  coarser than DMC's in places). `applyBrandPalette` groups by the
  resulting Anchor code, the same merge behavior every other brand
  already has for its own near-duplicate collisions.
- **Spot-checked against independent, widely-cited community knowledge**
  (not just internal self-consistency): DMC 310 (Black) → Anchor 403,
  and DMC 666 (Bright Red) → Anchor 46 — both are extremely commonly
  cited DMC↔Anchor equivalences across the cross-stitch community,
  independent of this specific source file, and both match exactly.

## `ANCHOR_COLORS`'s representative-RGB rule, made explicit

For the "+Add"/color-editor picker's browsable swatch list (not the
actual pattern-matching algorithm — see `lib/dmc-match.ts`'s
`applyBrandPalette`, which always derives RGB from the real nearest-DMC
match at matching time), each of the 355 unique Anchor codes needs
*some* single representative RGB to show as a swatch. **Rule: the RGB of
whichever DMC code is encountered first, in `DMC_COLORS`'s own array
order, among all DMC codes sharing that Anchor code** — deterministic,
documented, and consistent with how every other brand's own "multiple
originals collapse onto one target" merge already picks a representative
(first-encountered wins). Not claimed to be "the" correct color for that
Anchor thread if the source data's own DMC-side collisions reflect real
shade differences — just a deterministic, honestly-documented choice for
a UI picker, not the safety-critical part of this feature.

## No descriptive names — same honest treatment as Cosmo

Every `ANCHOR_COLORS` entry's `name` is `""`, not the source CSV's
`description` column. That column is the *DMC* thread's own name, not an
Anchor-specific one — using it directly would misattribute a DMC name to
an Anchor thread, and would be actively wrong for any of the 99
many-to-one collision groups (which DMC code's description would even be
"the" name for a merged Anchor code?). `lib/thread-brands.ts`'s
`formatThreadName` already falls back to the bare code for an empty name
(built for Cosmo in M2), so Anchor colors display as `"403"`, not a
fabricated or borrowed name.

## Regenerating this file

If a genuinely licensed, independently-measured Anchor dataset becomes
available, replace this entirely (dropping the DMC-equivalence
`"dmc-equivalence"` matching mode for Anchor in `lib/thread-brands.ts` in
favor of `"direct"`, same as DMC/Cosmo). Until then, re-deriving this
same mapping from an equivalent unlicensed source should repeat the same
verification steps above (coverage, uniqueness, spot-checks) and revisit
the license judgment call explicitly rather than assuming it still
applies unchanged.
