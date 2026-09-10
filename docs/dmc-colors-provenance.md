# `lib/dmc-colors.ts` — data provenance and license

`DMC_COLORS` (454 entries: DMC code, name, and an RGB approximation of the
physical thread color) was built for G-013 (DMC palette mode). Recorded here
per STANDARDS.md's "record the attribution where the asset is used."

## Source and license

The data is a faithful re-derivation of the `floss` dataset bundled with
[sharlagelfand/dmc](https://github.com/sharlagelfand/dmc) (an R package,
"Convert Colour to DMC Embroidery Floss and Back"), **MIT licensed**
(`DESCRIPTION`: `License: MIT + file LICENSE`; copyright Sharla Gelfand,
2020 — see the repo's own `LICENSE.md`). That package's own data-cleaning
script (`data-raw/floss.R`) documents that its raw numbers originate from
[adrianj/CrossStitchCreator](https://github.com/adrianj/CrossStitchCreator)
(a C# cross-stitch tool with no license file of its own), with a documented
set of corrections layered on top:

- A handful of hex codes mangled by Excel round-tripping, fixed to the
  correct 6-digit value for those specific DMC codes.
- A handful of RGB/hex mismatches, resolved by visual trial-and-error
  against the real floss color and re-deriving RGB from the corrected hex.
- Name cleanup: expanding abbreviations (`Vy`→`Very`, `Dk`→`Dark`,
  `Lt`→`Light`, etc.) and inserting a `-` separator before a trailing
  shade/intensity descriptor (e.g. `"Salmon Very Light"` →
  `"Salmon - Very Light"`), plus a handful of manual full-name overrides
  for names the automated cleanup couldn't fix correctly.

Since `sharlagelfand/dmc`'s own bundled dataset (`data/floss.rda`) is an R
binary format with no plain CSV/JSON export, this project's `DMC_COLORS`
was produced by re-running that exact same, publicly documented cleaning
script's logic (reimplemented in Python, matched line-for-line against
`data-raw/floss.R`) against the same raw
`data-raw/floss_adrianj.csv` input file from that MIT-licensed repository —
not copied from `adrianj/CrossStitchCreator` directly. The result was spot-
checked against several well-known DMC colors (e.g. 310 = Black = `#000000`,
B5200 = Snow White = `#FFFFFF`) and scanned for leftover unexpanded
abbreviations and duplicate codes (none found; all 454 codes unique).

**Why this is a reasonable basis despite the upstream (adrianj) repo having
no license of its own**: a lookup table mapping standardized commercial
color codes to their RGB approximation is factual/measured correspondence
data, not creative expression, and multiple independent hobbyist projects
across GitHub host near-identical, similarly unlicensed tables of the same
kind — this appears to be treated as open reference data community-wide.
`sharlagelfand/dmc`'s own author explicitly chose to license her corrected,
curated version of this same data as MIT, which is the license this project
relies on.

## RGB values are approximations, not DMC's own published data

DMC (the manufacturer) does not publish official RGB values for its thread
line; every third-party RGB table (including this one) is a
photographed/scanned/reverse-engineered approximation of the physical
thread color, and different sources' approximations disagree by small
amounts. This is fine for this app's purpose (visually matching a
generated palette to the nearest real, buyable thread color) but means the
displayed color swatch won't be pixel-identical to the actual skein under
every monitor/lighting condition — normal and expected for this kind of
tool, and consistent with how other cross-stitch software handles it.

## Regenerating this file

If DMC's line changes or a corrected dataset becomes available, rebuild by
re-running `data-raw/floss.R`'s logic (or an equivalent) against a current
raw color list, keeping the same `{ code, name, rgb }` shape.
