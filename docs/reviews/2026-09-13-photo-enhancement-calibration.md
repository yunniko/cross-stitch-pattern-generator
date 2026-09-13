# Photo enhancement calibration on real photos — 2026-09-13

G-032 M4 measurement of the three enhancement presets (Auto, Vivid, Portrait) on 13 real photographs, against a release
rule written before any real photo was measured. **Result: no mode meets the rule, so none is released.** The photos
are not in the repository; sources and licences are listed below.

## Method

- Script: `scripts/calibrate-enhancement.ts`, run with `npm run calibrate:enhancement` (547 s on the Owner's machine).
- Photos were decoded with Chromium's canvas at the app's 4000 px decode cap, so pixels match what the app generates
  from. The tree photo stacks three versions of the same scene (overexposed, normal, underexposed), separated by white
  bands; it was split at those bands into three 1500×1000 panels. Its Commons metadata shows a single capture edited in
  Photoshop Elements, so the underexposed panel is an edit, not a real exposure bracket.
- Every pattern: 150 stitches on the longer side, 24 colours, Standard edges, Full range palette.
- **Boundary agreement** compares two patterns of the same photo: the share of neighbouring cell pairs where both
  patterns agree on whether the two cells share a colour. It measures structure, not exact colours (D115).
- **Tonal span** is the count-weighted palette lightness range, OKLab L from the 5th to the 95th percentile.
- **Near-duplicate pairs** are palette colour pairs closer than ΔE 0.03 in OKLab: shades that are hard to tell apart
  as threads.

## Release rule (fixed before measuring)

A mode is released only if all five clauses hold:

| Clause | Requirement |
|---|---|
| Do no harm | Boundary agreement with Off ≥ 0.90 on every well-exposed photo |
| Benefit | Underexposed tree panel beats Off by ≥ 0.03 against the normal panel's Off pattern, or synthetic degradation of the well-exposed photos gains ≥ 0.05 on average |
| Tonal range | Tonal span widens by ≥ 0.05 on at least 60% of the flawed photos |
| No confetti or duplicates | On no flawed photo does confetti rise more than 0.02, or near-duplicate pairs rise by more than 1 |
| Keeps intentional cast | White balance shifts mid-grey chroma by ≤ 0.02 on the sunset |

## Results

| Clause | Auto | Vivid | Portrait |
|---|---|---|---|
| Do no harm | fails | fails | fails |
| Benefit | fails | fails | fails |
| Tonal range | fails (4 of 7) | fails (4 of 7) | passes (5 of 7) |
| No confetti or duplicates | fails (duplicates) | fails (duplicates) | fails (duplicates) |
| Keeps intentional cast | passes (0.016) | passes (0.016) | passes (0.011) |
| **Released** | **no** | **no** | **no** |

### Do no harm: boundary agreement with Off on well-exposed photos

| Photo | Auto | Vivid | Portrait |
|---|---:|---:|---:|
| Mountain lake | 0.872 | 0.866 | 0.867 |
| Road through mountains | 0.955 | 0.950 | 0.953 |
| Winter portrait | 0.933 | 0.922 | 0.931 |
| Headwrap portrait | 0.885 | 0.893 | 0.906 |
| Tree, normal panel | 0.903 | 0.893 | 1.000 |

### Benefit

| Measure | Off | Auto | Vivid | Portrait |
|---|---:|---:|---:|---:|
| Tree recovery: underexposed vs normal panel | 0.873 | 0.887 | 0.888 | 0.871 |
| Synthetic recovery: mean gain over Off | — | +0.004 | +0.000 | −0.002 |

### Flawed photos: tonal span, confetti, near-duplicate pairs (Off → mode)

| Photo | Auto span | Vivid span | Portrait span | Auto near-duplicates | Portrait near-duplicates | Auto confetti |
|---|---|---|---|---|---|---|
| Underexposed sun | 0.36 → 0.40 | 0.36 → 0.41 | 0.36 → 0.42 | 7 → 2 | 7 → 3 | 0.000 → 0.000 |
| Fog, sailboat | 0.53 → 0.73 | 0.53 → 0.72 | 0.53 → 0.69 | 3 → 7 | 3 → 8 | 0.039 → 0.042 |
| Fog, Brofjorden | 0.62 → 0.65 | 0.62 → 0.68 | 0.62 → 0.65 | 8 → 6 | 8 → 6 | 0.000 → 0.001 |
| Fog, eucalypt | 0.65 → 0.76 | 0.65 → 0.75 | 0.65 → 0.71 | 0 → 1 | 0 → 0 | 0.113 → 0.131 |
| Backlit, tower top | 0.67 → 0.58 | 0.67 → 0.61 | 0.67 → 0.61 | 6 → 12 | 6 → 11 | 0.080 → 0.074 |
| Backlit, geyser | 0.61 → 0.69 | 0.61 → 0.66 | 0.61 → 0.67 | 1 → 1 | 1 → 6 | 0.067 → 0.075 |
| Tree, underexposed panel | 0.49 → 0.63 | 0.49 → 0.65 | 0.49 → 0.56 | 0 → 0 | 0 → 0 | 0.189 → 0.208 |

### Metric floor (partial, measured after the domain-expert review)

How much boundary agreement drops for changes nobody would see, on the mountain lake. The run was stopped by low memory
on the Owner's machine after this photo, so the other photos were not measured.

| Change to the photo before an Off pattern | Agreement with the original's Off |
|---|---:|
| None (Off generated again) | 1.000 |
| +1 code value on every channel | 0.883 |
| Exposure ×0.98 in linear light | 0.895 |
| Shift by 1 pixel | 0.857 |
| Seeded ±2 code-value noise | 0.882 |

All three modes scored 0.866–0.872 on this photo. That is the same level an imperceptible change produces: a
24-colour pattern re-bands its smooth areas after any small change. On this photo the 0.90 do-no-harm threshold is above
the metric's own noise, so the clause cannot tell harm from normal re-quantisation.

## What the numbers say

- Enhancement does what it looks like it does on flawed photos: the stitched palette uses a wider lightness range on
  most of them, strongly on the fog and underexposed-tree photos.
- It does not make the pattern's structure more faithful. On the tree's underexposed/normal pair, Auto and Vivid
  move boundary agreement from 0.873 to about 0.887, a third of the required gain; Portrait doesn't move it.
- Synthetic recovery is mixed rather than absent: every mode helps the degraded landscapes a little (up to +0.030) and
  hurts both degraded portraits (down to −0.033 in Vivid), which averages out to about zero.
- Confetti stays within its bound in every mode (largest rise +0.020, Vivid on the tree panel); the fourth clause fails
  on near-duplicate shades alone.
- It adds shades that are hard to tell apart on some photos (backlit tower 6 → 12 near-duplicate pairs in Auto,
  geyser 1 → 6 in Portrait). For stitchers, that means more similar threads to keep apart.
- The do-no-harm failures are not evidence of harm. On the mountain lake every mode sits at the metric's noise floor
  (above). The tree gains of +0.013 to +0.015 are also well inside that noise, so benefit is not shown either way.
- Backlit tower loses tonal span in every mode. The likely cause is midtone gamma lifting a median that sits in the dark
  silhouettes while levels is skipped, a known limit of a single global tone curve on backlit scenes.
- White balance correctly leaves the intentional sunset cast alone.

## Confidence and gaps

- Thirteen photos, one of each situation or a few; the only before/after pair is an edit, not a real exposure bracket. There is no held-out set, so tuning the
  presets against these numbers would fit the test rather than the problem (Codex round 2).
- Boundary agreement's noise floor is measured on one photo only. It is also not corrected for chance (it is a Rand-type
  index), and the agreement between patterns of unrelated photos was not measured.
- Tree panel alignment: panels were cut at their detected white bands, but any residual offset between them was not
  measured, and it would lower every tree agreement score equally.
- Near-duplicate pairs are counted on the Full range palette, without thread snapping, and are not weighted by how many
  stitches each colour covers.
- The M4 Codex review was not possible: the Codex usage limit was reached on 2026-09-13.
- The near-duplicate threshold (ΔE 0.03) and the tonal-span measure are proxies for "harder to stitch" and "less muddy";
  neither has been validated against stitchers' judgement.
- Browser-worker timing (criterion 7) was not re-measured here.

## Domain-expert re-review (M4)

What the review reported. Its sources are listed as it gave them and were not independently re-checked.

- **Releasing nothing is right.** No clause shows benefit.
- **"Doesn't improve structure" is not established.** The metric lacks a floor and a chance correction (Hubert & Arabie
  1985). The floor measurement above confirms this for the lake.
- **The tree panels are an edit.** They come from one Photoshop Elements capture, not a real bracket (Commons metadata).
- **Global tone curves fail on backlit scenes.** They work only when applied per region and fused (Buades et al. 2020).
- **k-means crowds colours into smooth areas.** Centroid density follows data density to the power 3/5 (Gersho 1979),
  which explains near-duplicate shades there.
- **A credible next round needs four things:**
  - a validated metric: measured floor, chance-corrected agreement, alignment check
  - expert-graded references, such as MIT-Adobe FiveK (research use only, kept out of the repository)
  - a held-out set of roughly 30–50 photos per category
  - blinded paired comparisons judged by stitchers
- **Otherwise, narrow the feature** to one conservative exposure fix for photos that are actually flat or dark.

## Photo sources

All retrieved 2026-09-13 from Wikimedia Commons; licences as reported by the Commons API (`LicenseShortName`), not
independently verified beyond that metadata. Two photos show identifiable people and were kept out of the repository.

| Name used here | Commons file | Author | Licence |
|---|---|---|---|
| Tree panels | [Photo of a tree as overexposed - normal - underexposed.jpg](https://commons.wikimedia.org/wiki/File:Photo_of_a_tree_as_overexposed_-_normal_-_underexposed.jpg) | W.carter | CC0 |
| Underexposed sun | [Underexposed Sun.jpg](https://commons.wikimedia.org/wiki/File:Underexposed_Sun.jpg) | Danecarney | CC0 |
| Fog, sailboat | [Sailboat on the Huon River in the fog (landscape).jpg](https://commons.wikimedia.org/wiki/File:Sailboat_on_the_Huon_River_in_the_fog_(landscape).jpg) | JustinH | CC0 |
| Fog, Brofjorden | [Fog rolling in over Brofjorden.jpg](https://commons.wikimedia.org/wiki/File:Fog_rolling_in_over_Brofjorden.jpg) | W.carter | CC0 |
| Fog, eucalypt | [Kunanyi (Mount Wellington) lone eucalypt and fallen tree trunk in the fog (landscape).jpg](https://commons.wikimedia.org/wiki/File:Kunanyi_(Mount_Wellington)_lone_eucalypt_and_fallen_tree_trunk_in_the_fog_(landscape).jpg) | JustinH | CC0 |
| Backlit, tower top | [BacklitMeet@towerTop.jpg](https://commons.wikimedia.org/wiki/File:BacklitMeet@towerTop.jpg) | S. Charles | CC0 |
| Backlit, geyser | [Backlit tourists and steam, Upper Geyser Basin, Yellowstone National Park, 2009.jpg](https://commons.wikimedia.org/wiki/File:Backlit_tourists_and_steam,_Upper_Geyser_Basin,_Yellowstone_National_Park,_2009.jpg) | DimiTalen | CC0 |
| Sunset | [Backlit Margarita Island Sunset in Las Guevaras, Venezuela.jpg](https://commons.wikimedia.org/wiki/File:Backlit_Margarita_Island_Sunset_in_Las_Guevaras,_Venezuela.jpg) | Wilfredor | CC0 |
| Mountain lake | [Mountain lake in the summer (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Mountain_lake_in_the_summer_(Unsplash).jpg) | Jaser Cervantes | CC0 |
| Road through mountains | [Road trip along the green mountains (Unsplash).jpg](https://commons.wikimedia.org/wiki/File:Road_trip_along_the_green_mountains_(Unsplash).jpg) | Paul Hermann | CC0 |
| Winter portrait | [Winter Woman Portrait.jpg](https://commons.wikimedia.org/wiki/File:Winter_Woman_Portrait.jpg) | Petr Kratochvil | CC0 |
| Headwrap portrait | [Woman in a headwrap in Quebec City.jpg](https://commons.wikimedia.org/wiki/File:Woman_in_a_headwrap_in_Quebec_City.jpg) | Wilfredor | CC0 |
