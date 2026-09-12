# Domain reference — canvas/fabric types beyond Aida, and finished-size math

Researched 2026-09-12 (Owner-requested research, not yet a goal) via the
`domain-expert` subagent, following up on Part 3 gap #4 of
`docs/reviews/2026-09-12-competitive-analysis.md` ("Aida-only; no evenweave/
linen support"). Retrieval date for all web sources: 2026-09-12.

## The core formula

```
spi (stitches per inch) = count / threadsPerStitch
finished_inches        = stitches / spi
```

`threadsPerStitch` is **1** for block/hole-counted materials (Aida, plastic
canvas, perforated paper, congress cloth, water-soluble/waste canvas) and
**2** for thread-counted materials worked the conventional way (evenweave,
linen). Every risk in this doc lives in that one divisor.

**Why the confusion exists**: "count" doesn't mean the same physical thing
across fabric families. Aida count is blocks-per-inch (each block itself
woven from a bundle of threads); evenweave/linen count is threads-per-inch,
and one stitch conventionally spans two of those threads. Source: Cross
Stitch Guild, https://www.thecrossstitchguild.com/cross-stitch-basics/stitchers-study/zweigart-fabric-facts.aspx.

## Per-type reference

| Type | Counts sold | threadsPerStitch | spi formula | Source |
|---|---|---|---|---|
| **Aida (cotton)** | 6, 8, 11, 14, 16, 18; 20-ct also sold (single-retailer confirmation) | 1 | spi = count | [Cross Stitch Guild](https://www.thecrossstitchguild.com/cross-stitch-basics/stitchers-study/zweigart-fabric-facts.aspx); [Stitchtastic 20-ct](https://www.stitchtastic.com/store/20-count-aida) |
| **Hardanger** | 22 (dominant/only mainstream count) | **1 or 2 — genuinely ambiguous, user must choose** | 22 spi over one, 11 spi over two | [Lord Libidan](https://lordlibidan.com/cross-stitch-fabric-types/) |
| **Evenweave** (Davosa, Bellana, Lugana, Linda, Annabelle, Brittney, Quaker, Murano, Jobelan) | 18, 20, 25, 27, 28, 32 | **2** (over-one is a real minority technique for fine detail) | spi = count / 2 | [Cross Stitch Guild](https://www.thecrossstitchguild.com/cross-stitch-basics/stitchers-study/zweigart-fabric-facts.aspx): "Working over two threads on a 28-count evenweave gives stitches the same size as on 14-count aida"; [Willow Fabrics](https://www.willowfabrics.com/blog/post/what-is-evenweave-fabric-jobelan-lugana-and-murano-compared) |
| **Linen** (Dublin, Cashel, Belfast, Edinburgh, Newcastle) | 25, 28, 32, 36, 40 | **2** | spi = count / 2 | [Stitched Modern](https://stitchedmodern.com/blogs/news/what-does-cross-stitch-fabric-count-mean); [Casa Cenina](https://www.casacenina.com/zweigart/belfast-linen-32-count-raw-linen.html) |
| **Plastic canvas** | 7, 10, 14 mesh (mainstream; 5 also exists) | 1 | spi = mesh | [Wikipedia](https://en.wikipedia.org/wiki/Plastic_canvas); [Herrschners Plastic Canvas 101](https://herrschners.com/plastic-canvas-101/) |
| **Waste canvas** | 8.5, 10, 11, 14, 18 | 1 in normal (over-one) use | spi = count | [needlework-tips-and-techniques](https://www.needlework-tips-and-techniques.com/waste-canvas.html); [Studio Koekoek](https://studio-koekoek.com/cross-stitch-tutorial-how-to-work-with-waste-canvas-and-stitch-on-any-fabric-you-like/) |
| **Perforated paper** | Mill Hill 14-ct (18-ct also sold), sheets 9"×12" | 1 | spi = count | [Herrschners Mill Hill 14-ct](https://herrschners.com/mill-hill-14-ct-perforated-paper/) |
| **Congress cloth** | 24 (mono canvas) | 1 | spi = mesh | [Needlepoint Joint](https://needlepointjoint.com/products/congressc); [Fireside Stitchery](https://firesidestitchery.com/products/congress-cloth) |
| **Water-soluble canvas** | DMC: 14 only | 1 | spi = count | [DMC official](https://www.dmc.com/us/water-soluble-canvas-14-count-9000164.html) — "corresponds to a 5.5 stitches/cm (14 ct) Aida fabric" |
| **Vinyl/Vinyl-Weave "aida"** | 14, 18 | 1 | spi = count | [Lord Libidan](https://lordlibidan.com/cross-stitch-fabric-types/) — weakly sourced, hobbyist blog only |

## Conventions, exceptions, and open edges

- **Over-one on evenweave/linen is a real minority technique**, not folklore
  — Cross Stitch Guild confirms it's used "when very fine detail is
  required" (https://www.thecrossstitchguild.com/cross-stitch-basics/cross-stitch-basics/cross-stitching-on-evenweave.aspx).
  It doubles spi and halves finished size versus the over-two default.
  Argues for an explicit over-one/over-two toggle rather than a hardcoded
  divisor per fabric family.
- **Hardanger 22 must not silently default** — both over-one (22 spi) and
  over-two (11 spi) are common; the app should ask, not assume.
- **Odd counts (25, 27, 31...) produce fractional spi**, e.g. 25-ct Lugana
  over two = 12.5 spi. Never render "equivalent to N-count Aida" text for
  these — say "12.5 stitches/inch," not a rounded Aida-equivalent count.
- **Waste canvas caveat**: `spi = count` gives the design-grid size, not a
  guaranteed rigid finished measurement — the base fabric (e.g. a T-shirt)
  can stretch and the canvas is removed after stitching, so precision is
  weaker than on stable woven fabric.
- **Perforated paper / congress cloth have a hard sheet-size ceiling**
  fabric doesn't (Mill Hill paper ships 9"×12"; plastic canvas sheets
  ~10.5"×13.5"). A max-size warning matters more than the count math if
  either is ever added.
- **Fabric-to-buy margin** (adjacent, if ever surfaced): craft convention is
  finished design size + ~3in (7.5cm) per side, i.e. +6in per dimension —
  sources vary 2–3in per side, so cite as convention, not physical law.
  ([Knytstudio](https://www.knytstudio.com/blog/how-to-calculate-cross-stitch-fabric-size); [Lost In Cross Stitch](https://www.lostincrossstitch.com/calculate-cross-stitch-fabric-size/))
- **What Xstitchify (competitor) actually does**: their own guidance divides
  by `fabric count / 2` for evenweave
  (https://xstitchify.com/how-to-calculate-cross-stitch-fabric-size/) — i.e.
  their "11–28 count Aida/evenweave" range from the competitive-analysis doc
  is *not* one flat dropdown; they apply the same halving described here.
  Copying their count range without the divisor would put this app behind
  them, not level.
- **Uncited, recalled knowledge only — verify before relying on it**:
  nominal-vs-actual thread-count drift on hand-woven linen (routinely ±1
  thread/inch, with local irregularity from slubs), and wash shrinkage. No
  manufacturer tolerance spec was reachable during this research.

## What would break if extended naively

The current implementation (`lib/finished-size.ts`, `lib/floss-estimate.ts`)
is correct and honestly scoped for Aida-only today — its own code comment
already names the evenweave exclusion deliberately. The risk is specific to
*future* work:

- Adding a raw count like `28` to `STANDARD_AIDA_COUNTS` without the /2
  divisor would silently **understate finished size by exactly half** (a
  280×280-stitch pattern would read 50.8cm instead of the true 101.6cm) —
  and, combined with the standard "+6in margin" buying convention, could
  lead a user to buy roughly a quarter of the fabric area actually needed.
  The wrong number is baked into three surfaces: the live UI readout
  (`app/workspace.tsx`), the exported chart header (`lib/a4-render.ts`),
  and the Pattern Keeper PDF (`lib/pattern-keeper-pdf.ts`).
- `lib/floss-estimate.ts`'s thread-path formula is inversely proportional to
  spi, not raw count — the same naive extension would underestimate floss
  needed by ~2x, and `strandsForAidaCount`'s count threshold would need to
  switch from raw count to effective spi.
- The minimum correct data model is two fields per fabric selection —
  `{ count, threadsPerStitch }` (or `{ fabricType, count, overTwo }`) — with
  `spi = count / threadsPerStitch` as the single value both `finished-size.ts`
  and `floss-estimate.ts` consume; neither should see a raw count directly.
  This also naturally covers Hardanger's ambiguity and an over-one toggle
  without per-fabric special-casing.
- Persistence (`lib/workspace-storage.ts`) only validates `count > 0` today;
  a new fabric-family field would need its own validation/migration for
  existing saved projects (see also the existing `aidaCount` import concern
  already flagged in `GOALS.md`).

## Confidence and gaps

- **High confidence**: the over-one/over-two divide for evenweave and linen;
  Aida = blocks/inch; plastic canvas mesh = holes = stitches/inch; DMC
  soluble canvas 14-ct = Aida 14-ct equivalent. Corroborated by a
  manufacturer page (DMC) and a major retailer (Herrschners) plus the Cross
  Stitch Guild's explicit, quantitative statement.
- **Medium confidence**: the exact Zweigart product-count list (assembled
  from retailer listings, not Zweigart's own catalogue, which wasn't
  reachable live). 20-ct Aida confirmed at one retailer only.
- **Low confidence**: vinyl canvas counts; waste canvas's full count range
  (two tutorial sites that don't fully agree); 16/18/22 plastic-canvas mesh
  claimed by one blog, corroborated nowhere.
- **Not researched / a human should verify**: nominal-vs-actual linen count
  tolerance and shrinkage; whether this app's likely beginner-skewed
  audience would find an over-one/over-two toggle helpful or just
  confusing — that's a product call, not a domain fact.
