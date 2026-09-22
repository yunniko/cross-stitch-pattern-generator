# Reserving a thread for a hue the photo has — the M1 measurement

Measured 2026-09-23 for G-062 M1, on a throwaway implementation (not committed: it ran as a custom `ColorQuantizer`
passed to `buildPattern`, plus a stage-by-stage replay of `pattern.ts`). The Owner's two photos are measured but not
committed — they are personal photographs and this repository is public. M2 adds a committed comparison script over
the fixtures.

## The rule as measured

1. Cells come from **Vivid** (G-061, D211), so the colour is on the grid to begin with.
2. Each cell above chroma **0.02** falls into one of **12 hue bins**. A bin that holds at least **0.1% of the cells**
   and that no palette thread already speaks for earns a reserved thread, at most **6** of them.
3. Each reserved slot is paid for by merging the **closest pair** in the palette — the two threads a stitcher would
   least miss — and seeded at the most colourful cell of its bin.
4. Cells are then assigned to the nearest thread **without re-converging Lloyd**. This matters: see below.

## Does a reserved thread survive to the legend?

Cat with flowers, 24 colours at 150 stitches, stitches held by each reserved thread:

| Stage | green | pink | rose |
|---|---|---|---|
| quantizer | 344 | 133 | 129 |
| after ICM | 408 | 128 | 84 |
| after cleanup | 417 | 119 | 89 |
| after palette merge | 417 | 119 | 89 |

Lattice portrait, same settings:

| Stage | blue-violet | blue | dark red |
|---|---|---|---|
| quantizer | 56 | 48 | 406 |
| after ICM | 50 | 29 | 225 |
| after cleanup | 50 | 28 | 220 |
| after palette merge | 50 | 28 | 220 |

**Nothing removes them.** The smoothing trims them, the merge leaves them alone. This is worth stating plainly
because G-060 was built on the belief that the merge eats rare colours; with a reserved thread it does not.

Re-converging Lloyd after seeding is what loses them: with `reconverge` on, neither photo's reserved hue reaches the
legend, because the seeded centroid drifts back into the mass it was placed to escape.

## What the legend says

A thread's colour is the OKLab mean of the cells that ended up in it, which mutes a reserved thread: its cluster
holds the saturated cells it was seeded from *and* the paler ones nearest to it. Applying Vivid's own rule one level
up — mean lightness, chroma of the thread's most colourful quarter of members — restores it:

| Reserved thread | seeded | mean of members (today) | Vivid rule on members |
|---|---|---|---|
| cat, pink | 198,166,180 (0.042) | 188,168,178 (**0.027**) | 192,166,179 (**0.035**) |
| cat, rose | 207,161,154 (0.056) | 212,161,147 (0.064) | 220,157,142 (**0.079**) |
| cat, green | 117,129,94 (0.053) | 118,123,92 (0.046) | 120,123,86 (0.054) |
| lattice, blue | 124,148,182 (0.058) | 139,148,170 (**0.034**) | 130,149,182 (**0.054**) |
| lattice, blue-violet | 95,99,124 (0.040) | 93,97,110 (0.021) | 90,97,117 (0.033) |
| lattice, dark red | 35,19,25 (0.028) | 28,21,24 (0.013) | 36,17,20 (0.032) |

Chroma in brackets. 0.03 is roughly where a colour stops reading as a neutral.

## Go/no-go against criterion 1

Criterion 1 asked for a pink thread in the cat's legend and a red and a blue one in the lattice's, at 150 stitches
and 24 colours, in the finished palette. **Met**, with the Vivid rule applied to thread colour:

- cat: a pink at 119 stitches and a rose at 89.
- lattice: a blue at 28 stitches and a dark red at 220.

One honest qualification: they arrive **as the photo holds them**, not as saturated colours. The cat's flowers are a
dusty pink and the lattice's shirt print is a dark red in shadow, and that is what the threads say. What changes is
that the chart now has a thread for them at 24 colours instead of none at 64.

## What M2 still has to answer

- Whether the thread-colour rule applies to every thread under Vivid or only reserved ones, chosen against 3×3
  error and confetti per fixture.
- The cost of the slots: each reserved thread is paid for by merging the closest pair, so the tonal ramp loses a
  step. Published per fixture and colour count.
- The bin count, chroma floor, minimum share and cap above are one setting that works, not a calibrated choice.
- Whether a thread brand can still collapse two reserved hues onto one skein (criterion 4).
