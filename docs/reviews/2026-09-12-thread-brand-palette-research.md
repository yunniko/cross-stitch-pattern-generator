# Thread-brand palette data research — Anchor, Cosmo, and others

Owner-requested (2026-09-12), following on from the OXS competitive-analysis
review's gap #1 ("Anchor/other thread-brand palettes"): before planning
G-029 (Anchor + Cosmo palette modes), find out what open (even unofficial)
color datasets actually exist for thread brands beyond DMC, and at what
quality/license. Retrieval date for every source is **2026-09-12**.

## Anchor — no independent dataset exists

Every "Anchor RGB" resource traced back to its actual data turns out to be
a **DMC↔Anchor cross-reference table**, not independently measured Anchor
color data. Verified directly, not just inferred from a description:

- [katjackson/embroidery-color-scheme-tool](https://github.com/katjackson/embroidery-color-scheme-tool),
  `private/dmcColorChart.csv` — fetched and inspected directly. Header:
  `dmc,anchor,description,red,green,blue,hexValue`. One row per **DMC**
  code; `anchor` is a paired equivalent-code column; the RGB values belong
  to the DMC row. GitHub reports `license: null` (no LICENSE file, no
  stated terms) via its own API.
- [zilliah/embroidery-floss-api](https://github.com/zilliah/embroidery-floss-api) —
  DMC only today ("Currently includes the 'basic' DMC colours"); its own
  README lists Anchor as unimplemented future work. No license found.
- Commercial/hobby comparison sites (stitchmate.app's "Anchor Color Chart",
  xstitchify.com's "Anchor Colour Chart", Lord Libidan's conversion PDFs,
  123stitch.com) all present Anchor charts, but these are each site's own
  product/content, not licensed open data, and every one that discloses
  methodology describes DMC-equivalence conversion, not independent
  measurement.

**Why this is expected, not a gap in my search**: neither DMC nor Anchor
(both owned by different companies, but neither publishes official RGB for
physical thread) has ever released colorimetric data. Every third-party
"Anchor color" table found is therefore, at best, one more remove from
physical reality than our existing DMC table already is (see
`docs/dmc-colors-provenance.md`'s own honesty section on this).

**Practical consequence for G-029**: an Anchor mode built from currently-
available data is really *nearest-DMC-match, relabeled with that DMC
shade's known Anchor equivalent* — not an independent color-matching
pipeline. This must be disclosed in-app, not just in this doc.

## Cosmo — a genuinely good independent dataset

[tallcoleman/CosmoToRGB](https://github.com/tallcoleman/CosmoToRGB) —
**MIT licensed** (confirmed via GitHub's own API: `license.key: "mit"`).
The author explicitly rejected DMC-conversion shortcuts and instead
sampled RGB values directly from Cosmo's own official 2020 color-card PDF
using GIMP, producing a 500-color dataset (also mirrored as a Google
Sheet). This is a genuinely independent, documented methodology —
arguably better-sourced than what we currently have for DMC (whose data
is itself a re-derivation of an unlicensed upstream CSV via an MIT-
licensed cleaning script; see `docs/dmc-colors-provenance.md`).

## Other brands checked — no usable open data found

No open **digitized** dataset exists for any of these, but several have a
real **official visual color chart** (a printed/PDF shade card the
manufacturer itself publishes) — which matters because that's exactly the
raw material Cosmo's own dataset was built from (photograph/scan the
manufacturer's own chart, sample RGB per swatch). "No dataset" and "no
usable source material" are different findings; the table separates them.

| Brand | Digitized open dataset? | Official visual color chart exists? |
|---|---|---|
| Madeira (needlework/stranded-cotton range) | No. [Ink/Stitch](https://github.com/inkstitch/inkstitch) (GPLv3) has Madeira palettes, but for its **machine-embroidery polyester/rayon range** — a different product line/numbering from needlework floss, not reusable here even ignoring the GPL. | **Yes** — Madeira publishes its own shade cards directly: [madeirausa.com/color-cards1](https://www.madeirausa.com/color-cards1/) and [madeira.com/.../shade-cards](https://www.madeira.com/embroidery-solutions/service/support/shade-cards) (official manufacturer pages, not a reseller). |
| Sullivans | No. Only commercial chart sites (stitchmate.app, etc.), sourcing not disclosed. | **Yes** — Sullivans USA sells an official "Six-Strand Embroidery Floss Color Card": [sullivansusa.net](https://www.sullivansusa.net/product/six-strand-embroidery-floss-color-card/). |
| J&P Coats | No. Only commercial chart sites/PDFs of unclear provenance. | Likely, but not confirmed as a current official manufacturer publication in this pass — only reseller/community charts found. |
| Kreinik (metallics/blending filament) | No. | **Yes** — Kreinik publishes its own official PDF: [Metallic Thread Color Reference Chart](https://www.kreinik.com/PDF/Metallic_Color_Reference_Chart.pdf) directly from kreinik.com. |
| Presencia | No open dataset found, and no official visual chart confirmed in this pass either. | Not confirmed. |
| Anchor | (see above — DMC-derived tables only, no independent RGB) | **Yes** — Anchor/Coats sells an official physical shade card with real thread swatches: [anchorcrafts.com/products/anchor-embroidery-thread-shade-card](https://anchorcrafts.com/products/anchor-embroidery-thread-shade-card). This means a Cosmo-style independent scan is *possible* for Anchor too — it just hasn't been done and published as open data by anyone yet, unlike Cosmo. |
| Weeks Dye Works / Classic Colorworks / The Gentle Art (hand-dyed) | No. | Physical color cards are sold (e.g. via Etsy, 123stitch.com), but hand-dyed lot-to-lot variation makes a single canonical RGB per code a weaker fit for this category regardless of chart availability. |

**Why this matters**: for Madeira, Sullivans, Kreinik, and (with real,
physical swatches) Anchor, the blocker isn't "no source material exists" —
it's "no one has done the Cosmo-style digitization work yet, or published
it openly." That's a materially different, more optimistic finding than
"this data cannot exist": a future goal could replicate tallcoleman's own
method (buy/access the official chart, sample RGB per swatch, publish with
a license) for any of these brands, not just wait for one to appear.

## Confidence and gaps

- **High confidence**: Cosmo's MIT license (verified via GitHub API, not
  just the blog's own claim) and independent-sourcing methodology
  (verified via the author's own blog writeup); the Anchor-is-DMC-derived
  finding (verified by directly inspecting a real dataset's actual CSV
  columns, not inferred from a description).
- **Medium confidence**: the "no open dataset exists" conclusion for
  Madeira/Sullivans/J&P Coats/Kreinik/Presencia/hand-dyed brands rests on
  web search coverage, not an exhaustive GitHub code-search — a dataset
  could exist under a name/repo this search didn't surface. Worth a
  second pass if the Owner specifically wants one of these brands later.
- **Not verified**: whether Ink/Stitch's Madeira palette numbering has
  *any* overlap with the needlework range worth exploiting — assumed not
  reusable based on product-category difference, not independently
  confirmed cell-by-cell.

## What this doesn't decide

This is data-sourcing research only. See `GOALS.md` G-029 for the actual
implementation plan (Anchor + Cosmo palette modes) built on these findings.
