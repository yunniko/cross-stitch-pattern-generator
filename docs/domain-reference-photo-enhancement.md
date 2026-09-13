# Photo enhancement before chart generation: domain reference and G-032 plan review

Prepared 2026-09-13 by the domain-expert review for G-032 M1 (photographic image processing and colour science, with cross-stitch practice as a secondary domain). Advisory input: every constant here is a starting point to calibrate, and the decisions actually taken are in `docs/decisions/`. Web sources were retrieved on 2026-09-13 unless marked otherwise.

**Key to claim types:**
- **[S]** A source says it. The citation is linked.
- **[S-snippet]** Only a search-engine summary was seen, not the primary page. Lower confidence.
- **[R]** Recalled knowledge not sourced live this session. Verify before relying on it.
- **[D]** Derived by arithmetic from the cited formulas and `lib/color/color.ts`. Check it in a unit test.
- **[C]** A conclusion or engineering judgement from the review, not a sourced fact.

## 1. Facts about the OKLab code the plan relies on

- **OKLab's LMS stage is described by its author as "approximate cone responses".** The post does not say how matrix M1 was derived and does not mention chromatic adaptation, CAT02/CAT16 or von Kries. [S] ([Ottosson, "A perceptual color space for image processing"](https://bottosson.github.io/posts/oklab/))
- **Each row of M1 in `lib/color/color.ts` sums to 1.0000,** so linear-sRGB white maps to l = m = s = 1, and the L row of M2 also sums to 1. For a neutral grey of relative luminance Y, **OKLab L = ∛Y exactly**. [D]
  - Middle grey (Y = 0.184, CIE L\* 50) is OKLab L ≈ 0.569, sRGB 118. sRGB 128 is L ≈ 0.600.
  - L 0.45 is Y 0.091, sRGB ≈ 85, L\* ≈ 36. L 0.50 is Y 0.125, sRGB ≈ 99, L\* ≈ 42. [D]
- **Scaling linear l by g equals scaling the cube-root value by ∛g,** so a von Kries step can be applied at either stage. [D]
- **A 1.3× gain on l alone** shifts a mid-grey (L 0.6) by Δa ≈ +0.108, ΔL ≈ +0.012, about 5× the CSS gamut-mapping JND of 0.02 ΔEOK. [D]
- **Lightness scale.** Ottosson's later "toe" lightness L_r exists because plain OKLab L predicts lightness worse than CIELAB L\* near black; Okhsv/Okhsl saturation scales chroma by lightness (C·L_r/L). [S] ([Ottosson, "Okhsv and Okhsl"](https://bottosson.github.io/posts/colorpicker/))
- **`oklabToRgb` clips each channel independently,** which shifts hue for an out-of-gamut colour. [C, code read]

## 2. Automatic white balance

### What sources say

- **Grey-world** (Buchsbaum 1980) assumes the scene average is achromatic; **white-patch / max-RGB** (Land & McCann 1971) assumes channel maxima show the illuminant. [R]
- **Shades-of-grey** unifies both as a Minkowski norm e = (mean ρᵖ)^(1/p); **p = 6 worked best overall** on a large calibrated dataset. [S] ([Finlayson & Trezzi 2004, CIC 12](https://library.imaging.org/cic/articles/12/1/art00008))
- **Grey-edge** applies the idea to image derivatives. [S, title only] ([van de Weijer, Gevers & Gijsenij 2007](https://www.researchgate.net/publication/6055124_Edge-Based_Color_Constancy))
- **Bright pixels** as a set work much better than a single maximum. [S] ([Joze, Drew, Finlayson & Troncoso Rey 2012, CIC 20](https://library.imaging.org/cic/articles/20/1/art00008))
- **Survey:** Gijsenij, Gevers & van de Weijer, IEEE TIP 20:2475–2489, 2011. [S, citation] ([PubMed](https://pubmed.ncbi.nlm.nih.gov/21342844/))
- **Failure modes:** grey-world gives false colour when the scene average isn't grey [S-snippet] ([The Refracted Light](http://therefractedlight.blogspot.com/2011/09/white-balance-part-2-gray-world.html)); practical AWB restricts statistics to near-grey pixels [S-snippet] ([Huo et al.](https://www.researchgate.net/publication/3181400_Robust_Automatic_White_Balance_Algorithm_using_Gray_Color_Points_in_Images)); some systems constrain estimates to the Planckian locus [S-snippet] ([Mazin, Delon & Gousseau 2012](https://link.springer.com/chapter/10.1007/978-3-642-33868-7_37)); white-patch fails on clipped or specular highlights [R].
- **Partial correction is established:** CIECAM02/CAM16 include a degree of adaptation D between 0 and 1. [R] (CIE 159:2004; Li et al. 2017, Color Res. Appl. 42(6))

### Adaptation space

- Spectrally sharpened transforms (Sharp CAT, CMCCAT2000) performed best on corresponding-colour datasets, though many transforms perform about equally. [S-snippet] ([Süsstrunk, Holm & Finlayson 2001](https://ui.adsabs.harvard.edu/abs/2000SPIE.4300..172S/abstract); [EPFL IVRL](https://www.epfl.ch/labs/ivrl/research/previous/page-65575-en-html/))
- OKLab's M1 is not sharpened and was fitted for uniformity, not adaptation. [C] But input is a display-referred JPEG whose camera AWB is already applied, and with gains capped near 1.3 the space matters less than the estimation error. [C]
- **Verdict:** diagonal scaling in OKLab LMS is an acceptable approximation, not a principled adaptation space; CAT16 or Bradford is the defensible upgrade. [C]

### Assessment of the plan's WB step

| Plan element | Verdict | Notes |
|---|---|---|
| Grey-world blended with bright-neutral estimate | Grounded concept | Shades-of-grey p≈6 is the published compromise, one parameter instead of a blend weight. |
| Gain cap | Reasonable approximation | No source gives a value; 1.3 on one channel still allows a strong tint (Δa ≈ 0.11). |
| "Cap protects a sunset / red flower" | Risky as sole guard | A cap only limits a wrong estimate. Real protection: estimate only from near-neutral pixels and skip WB when too few exist. |
| Greyscale stays grey | Grounded | Holds if statistics are linear and gains normalised. |
| Which values are averaged | Gap | Use linear RGB/LMS; exclude clipped pixels (any channel ≥ ~250). |
| Sepia/toned prints | Product gap | An intentionally toned print gets "corrected"; the estimator can't tell it from a faded cast. |

## 3. Auto levels

- Photoshop's Auto Contrast/Tone clips a percentage of darkest and lightest pixels; the default is described as 0.1%, with 0–1% suggested. [S-snippet] ([Photoshop Training Channel](https://photoshoptrainingchannel.com/tips/auto-color-correction-options/); [Photoshop Essentials](https://www.photoshopessentials.com/photo-editing/the-improved-auto-levels-adjustment-in-photoshop/))
- Failure modes: stretching deliberate low-key/high-key images removes mood; large stretches of 8-bit data comb the histogram; percentiles are unstable on tiny or flat images. [R]
- **Assessment:** L-only stretch in OKLab keeps hue (reasonable). Stretching L at fixed a,b pushes dark saturated pixels out of gamut, so gamut mapping must end the whole chain. 0.5/99.5 is within the sourced range but aggressive. **Add a stretch-gain cap and a deadband** (skip when p_low ≤ ~0.05 and p_high ≥ ~0.95). Combing is not a practical problem here: Sobel sees ~4 units per level against `NOISE_FLOOR = 40`, and downsampling averages it away. [C/D]

## 4. Midtone gamma

- A power curve is the standard global tone adjustment (scikit-image `adjust_gamma`, out = in^γ). [S] ([scikit-image exposure API](https://scikit-image.org/docs/stable/api/skimage.exposure.html)) Photoshop's "Snap Neutral Midtones" targets RGB 128 [S-snippet]; reflected-light metering aims at ~12–18% grey [R].
- **The plan's target L ≈ 0.45–0.50 is too dark:** it is sRGB 85–99, below middle grey (L 0.57), so it would darken normal photos. [D/C]
- **Use a band:** adjust only if median L is outside ≈ [0.50, 0.64], move it to the nearest edge, clamp γ. A second pass then does nothing. [C]
- **Chroma under tone changes:** lifting shadows at constant a,b looks washed out; darkening at constant chroma looks oversaturated. A common remedy scales C by (L′/L)^k, k ≈ 0.5–1, capped. [C]

## 5. CLAHE on L

### What sources say

- Zuiderveld, "Contrast Limited Adaptive Histogram Equalization", *Graphics Gems IV* (1994): clipping limits the mapping slope to control noise over-amplification in homogeneous regions; output is a bilinear interpolation of the four nearest tile mappings. [S] ([dblp](https://dblp.org/rec/books/el/94/Zuiderveld94.html))
- Reference code: 2–16 regions per axis; `clipLimit = fCliplimit * tilePixels / nBins`; a limit below 1 is plain AHE. [S] ([`gemsiv/clahe.c`](https://github.com/erich666/GraphicsGems/blob/master/gemsiv/clahe.c))
- OpenCV: same clip formula, uniform redistribution, bilinear LUT interpolation; defaults clipLimit 40, 8×8 tiles. [S] ([`clahe.cpp`](https://github.com/opencv/opencv/blob/master/modules/imgproc/src/clahe.cpp); [class reference](https://docs.opencv.org/3.4.20/d6/db6/classcv_1_1CLAHE.html))
- scikit-image `equalize_adapthist`: 8×8 tiles, `clip_limit` 0.01, 256 bins. [S] ([API](https://scikit-image.org/docs/stable/api/skimage.exposure.html); [source](https://github.com/scikit-image/scikit-image/blob/v0.24.0/skimage/exposure/_adapthist.py))
- MATLAB `adapthisteq`: 8×8, ClipLimit 0.01, 256 bins; without the limit results can be worse than the original. [S] ([MathWorks](https://www.mathworks.com/help/images/ref/adapthisteq.html))
- Failure modes: noise amplification, excessive skin enhancement [S-snippet] ([IA-CLAHE](https://arxiv.org/pdf/2604.16010)), JPEG blocking visible in flat areas [S-snippet], tile-scale halos [R].

### What the numbers mean [D]

- In Zuiderveld/OpenCV units a clip limit c caps each bin at c× the uniform height, so the tile mapping slope is at most about c (+1 from redistribution), and flat-region noise is multiplied by up to ~c.
- scikit-image's 0.01 equals c ≈ 2.56; OpenCV's default 40 is effectively unlimited for photos. **Photo consensus: 8×8 tiles, c ≈ 2–3.**

### Interaction with this pipeline — the most important finding

- `lib/pipeline/edge-map.ts` uses an absolute `NOISE_FLOOR = 40` raw Sobel units calibrated on un-enhanced input. For i.i.d. noise σ the Sobel magnitude is Rayleigh distributed: P(M > 40) = exp(−40²/(24σ²)). At σ = 3, P ≈ 0.06%; after a local gain of 2 (σ = 6), P ≈ 16%. Cell importance takes the **maximum** edge in each cell, so nearly every flat noisy cell gains importance. [D]
- This recreates the low-contrast half of the A4 failure: confetti suppression weakens in flat areas. The damage lands in importance and edge evidence, not cell colours (downsampling averages noise away). [C, predicted — measure it]
- Options: (1) compute Sobel importance and pair-edge evidence from the original luminance and use enhanced colours everywhere colour is used; (2) scale `NOISE_FLOOR` by the measured tone gain; (3) keep c ≤ 2 and rely on confetti calibration. [C]
- Denoise thresholds (`RIDGE_STRENGTH_FLOOR = 0.05`, `ALLY_MATCH_DISTANCE_SQUARED = 0.0005`, D051) were calibrated on un-enhanced cells; a 2× L stretch quadruples squared L differences. Re-measure with enhancement on. [D/C]
- Flat tiles are not a problem: redistribution keeps a uniform tile near identity. [D]
- At 60–200 stitches across, each of 8 tiles spans 8–25 stitches, so only tile-scale tone mapping survives downsampling — a further reason for low c. [C]

### Portrait

Skipping CLAHE in Portrait is reasonably grounded (skin texture; face confetti per `docs/domain-reference.md` §6.6). Backlit portraits benefit most from local tone mapping; a very mild candidate (4×4, c ≈ 1.3) is worth calibrating against off. [C]

## 6. Vibrance and skin protection

- Lightroom vibrance changes low-saturation colours more than saturated ones and prevents skin over-saturation. [S-snippet] ([Adobe help](https://helpx.adobe.com/in/lightroom-classic/help/image-tone-color.html))
- RawTherapee separates pastel and saturated tones, protects skin, and its skin hue curve covers Lab hue −0.05 to 1.6 rad. [S] ([RawPedia](https://rawpedia.rawtherapee.com/Vibrance); [pixls.us](https://discuss.pixls.us/t/rawtherapee-vibrance-skin-tones-h-values/25522))
- darktable color balance rgb: vibrance prioritises low-chroma colours at constant hue and luminance, with soft saturation clipping. [S] ([darktable 4.6 manual](https://docs.darktable.org/usermanual/4.6/en/module-reference/processing-modules/color-balance-rgb/))
- Skin: mean CIELAB hue ≈ 56–60°, generally 45–90°; ethnic variation is mainly in b\*. [S-snippet] ([Wang et al. 2017](https://eprints.whiterose.ac.uk/id/eprint/116965/3/CRA-WYZ-fullpaper-Luo.pdf/1000); [Xiao et al. 2017](https://onlinelibrary.wiley.com/doi/full/10.1111/srt.12295)) In this region OKLCh hue ≈ CIELAB hue − 4–5°, so **h_ok ≈ 40–70°**. [D, two swatches — confirm with a swatch test]
- **Assessment:** vibrance in OKLCh with a skin band is sound. Weighting by absolute chroma is wrong — cyan's gamut cusp is far lower than blue's — so weight by relative saturation s = C / C_max(L, h). Add a low-chroma ramp so JPEG chroma noise isn't boosted most. Protect skin in all modes. The band also protects oranges, wood and sand; accept and document. [C]

## 7. Gamut mapping

- Ottosson lists keep-L chroma reduction, projection toward L = 0.5, and an adaptive blend; keep-L can almost fully desaturate bright yellows and dark blues. [S] ([Ottosson, "sRGB gamut clipping"](https://bottosson.github.io/posts/gamutclipping/))
- CSS Color 4 (Color.js): OKLCh, L ≥ 1 → white, L ≤ 0 → black, binary search on chroma at constant L,h, accepting the per-channel-clipped colour once it is within **JND 0.02 ΔEOK**, stopping at **ε = 0.0001**. [S] ([`toGamut.js`](https://github.com/color-js/color.js/blob/main/src/toGamut.js); [docs](https://colorjs.io/docs/gamut-mapping))
- **Assessment:** constant-L,h chroma reduction is grounded; adopt the JND-clip hybrid; apply once at the end of the chain on float intermediates; test in-gamut first and map only out-of-gamut pixels for performance. [C]

## 8. Plan assessment

| # | Plan element | Verdict |
|---|---|---|
| 1 | Placement on source pixels | Grounded for colour; incomplete for edges (absolute noise floors, §5) |
| 2 | Order WB → levels → gamma → CLAHE → vibrance → gamut | Grounded; each step should measure the previous step's output |
| 3 | All in OKLab/OKLCh | Reasonable, with the toe and tone-saturation caveats |
| 4 | Von Kries in OKLab LMS | Acceptable approximation, not principled |
| 5 | Grey-world + bright neutral, 1.3× cap | Concept grounded; add near-neutral selection, confidence gate, deadband, partial strength |
| 6 | Levels 0.5/99.5 | Reasonable, slightly aggressive; add cap and deadband |
| 7 | Midtone target 0.45–0.5 | Wrong as stated; use band ≈ [0.50, 0.64] |
| 8 | CLAHE calibrated on confetti | Method grounded; also measure importance distribution in flat regions |
| 9 | CLAHE off in Portrait | Reasonable; calibrate a very mild candidate |
| 10 | CLAHE skipped for small images | Reasonable (≥ 2 regions per axis; ~32 px minimum tile is a choice) |
| 11 | Vibrance skin band only in Portrait | Scope wrong; protect skin in all modes; weight by relative saturation |
| 12 | Constant-hue gamut mapping | Grounded; add JND clip; whole chain |
| 13 | Exclusions | Well reasoned |
| 14 | Recovery test on degraded fixtures | Useful but partly circular; degrade in linear light; real photos are the actual evidence |
| 15 | Near-identity on a well-exposed fixture | Fails unless CLAHE is gated by a flatness statistic |
| 16 | Idempotence | Not achievable as stated; make steps target-seeking and assert a drift bound |
| 17 | Vivid keeps ≥ 90% distinct DMC threads | Weak alone; also track snap error and near-duplicate thread pairs |
| 18 | Preview at ≤ 1200 px vs full resolution | Consistency risk; compute parameters once on an analysis image and apply identically |

## 9. Recommended starting constants

All are starting points to calibrate in M2/M4.

| Parameter | Auto | Vivid | Portrait | Basis |
|---|---|---|---|---|
| WB estimator | Shades-of-grey p = 6 on linear LMS, near-neutral pixels (C < 0.05), excluding any channel ≥ 250 and L < 0.10 | same | same | Finlayson & Trezzi [S]; thresholds [C] |
| WB bright blend | 0.3 on top 3% L of eligible pixels | 0.3 | 0.2 | Joze et al. idea [S]; value [C] |
| WB confidence gate | skip if < 5% eligible | same | same | [C] |
| WB deadband | skip if neutral estimate chroma < 0.010 | same | same | half CSS JND [C] |
| WB strength | 0.7 | 0.7 | 0.5 | degree of adaptation [R]; value [C] |
| WB cap | channel gain ratio ≤ 1.25, correction ≤ 0.05 chroma at mid-grey | same | ≤ 1.15 / ≤ 0.03 | [D/C] |
| Levels percentiles | 0.5 / 99.5 | 0.5 / 99.5 | 0.2 / 99.8 | [S-snippet/C] |
| Levels deadband | skip if p_low ≤ 0.05 and p_high ≥ 0.95 | same | same | [C] |
| Levels max stretch | 2.5× | 2.5× | 1.8× | [D/C] |
| Midtone band | [0.50, 0.64] | [0.50, 0.64] | [0.52, 0.66] | middle grey L 0.569 [D] |
| γ clamp | [0.67, 1.5] | [0.67, 1.5] | [0.8, 1.25] | [C] |
| Chroma compensation | C × (L′/L)^0.5, clamped [0.8, 1.3] | same | same | okhsv [S]; exponent [C] |
| CLAHE tiles | 8×8, min tile 32 px | 8×8 | off (candidate 4×4) | defaults [S] |
| CLAHE clip limit | 1.8 | 2.5 | off (candidate 1.3) | photo convention [S/D]; below 2 for the edge floor [C] |
| CLAHE bins | 256 | 256 | 256 | [S] |
| CLAHE gate | only if L p5–p95 spread < 0.60, else scale c toward 1 | same | — | [C] |
| Vibrance amount v (C′ = C·(1 + v·w)) | 0.20 | 0.40 | 0.15 | [C] |
| Vibrance weight w | (1 − s)² · ramp(C 0.01→0.03) · (1 − skin), s = C / C_max(L,h) | same | same | Adobe, darktable [S]; formula [C] |
| Skin band (OKLCh) | full protection h 40–70°, falloff to 25° and 85°; C ∈ [0.02, 0.16], L ∈ [0.30, 0.92]; strength 0.7 | 0.7 | 1.0 | [S-snippet/D/C] |
| Vibrance deadband | skip if mean s over non-skin pixels > 0.45 | same | same | [C] |
| Gamut map | OKLCh constant L,h; JND 0.02, ε 1e-4; once at chain end | same | same | CSS Color 4 [S] |

## 10. Craft implications

- DMC's solid range is about 489 colours [S-snippet] ([Stitchmate](https://stitchmate.app/tools/dmc-color-chart)); this project's 454-entry table is a community approximation (`docs/dmc-colors-provenance.md`). No published spectrophotometric floss gamut was found.
- Craft guides say flat, low-contrast photos give muddy patterns [S-snippet, vendor blog] ([Cross Stitched](https://cross-stitched.com/en-us/blogs/what-is-cross-stitch/how-to-make-cross-stitch-patterns-from-photos)); face charts work best at 15–30 colours, ~40 at most (`docs/domain-reference.md` §6.6).
- **Conclusions [C]:**
  1. Enhancement redistributes a fixed palette budget. CLAHE adds lightness variation within regions, which after snapping tends to produce adjacent shades of one thread family — the hardest threads to tell apart, especially in faces.
  2. Vibrance past the thread gamut collapses colours onto one thread, or snaps to a thread with the wrong lightness or hue. Mitigation: a per-(hue, L) chroma envelope from the thread tables limiting vibrance in brand modes.
  3. Local contrast gains raise gradient noise, lowering confetti suppression through importance. Measure confetti **and** flat-region importance.
  4. A distinct-count gate misses the opposite failure: more near-duplicate threads. Count close thread pairs too.
  5. Stretching black/white points maps deep shadows to DMC 310 blocks; keep the stretch cap and avoid forcing exact 0/1.
  6. Stitched thread may read lighter than the chart (hypothesis, unsourced); don't use it to justify stronger presets.

## 11. Calibration photo sources

| Source | Licence | Good for | Caveats |
|---|---|---|---|
| [Smithsonian Open Access](https://www.si.edu/openaccess/faq) | CC0 for items marked Open Access [S] | Well-exposed objects, animals | Mostly studio-lit; check the CC0 flag per item |
| [USFWS National Digital Library](https://digitalibra.omeka.net/items/show/57) | Public domain, credit requested [S] | Landscapes, fog, backlight | Check third-party credit per item |
| [NPS NPGallery](https://www.nps.gov/aboutus/disclaimer.htm) | Generally public domain; check per image [S] | Landscapes, haze, overcast | Some contributed items are copyrighted |
| Library of Congress FSA/OWI colour photographs | "No known restrictions" [R — verify] | Real casts and fading, portraits | Verify rights per item |
| [Wikimedia Commons](https://commons.wikimedia.org/) via [Openverse](https://openverse.org/about) CC0/PDM filter | Per-file CC0/PDM | Casual underexposed and cast photos | The filter is not a rights clearance; verify each file |
| [Kodak Lossless True Color Image Suite](https://github.com/MohamedBakrAli/Kodak-Lossless-True-Color-Image-Suite) | "Unrestricted usage" [S, mirror README] | Well-exposed reference | No formal licence text; 768×512 scans |
| Pexels, Unsplash, Pixabay | Not CC0; anti-redistribution terms [S] | Realistic phone photos | Committing a set could be redistribution; local measurement only |
| Colour-constancy datasets (Gehler–Shi, Cube+) | Research or unclear [R] | WB against measured illuminants | Mask the ColorChecker; don't commit unless licensed |

Portraits involve identifiable people: prefer public-domain portraits, record sources, keep only what calibration needs (`COMPANY/VALUES.md`).

## 12. Confidence and gaps

- **High confidence** (primary sources read): CLAHE mechanics and defaults, CSS Color 4 constants, Ottosson's gamut and saturation constructions, shades-of-grey p = 6, RawTherapee skin range, darktable vibrance, the Smithsonian/USFWS/NPS/Pexels licence terms.
- **Medium** (summaries only): Adobe vibrance wording and 0.1% clip default, Süsstrunk et al. rankings, skin hue means, Unsplash/Pixabay terms.
- **Derived, needs a unit test:** L = ∛Y for neutrals, the 1.3× gain figure, the OKLCh skin hue offset, Sobel noise exceedance, the scikit-image clip-limit equivalence.
- **Recalled, not verified:** Buchsbaum, Land & McCann, CAT16/CAM16 degree of adaptation, ISO 2720, OpenCV tutorial c = 2.0, LoC FSA/OWI rights.
- **Gaps:** no published floss gamut; no authoritative WB cap, CLAHE gate or vibrance weights; the §5 noise-floor effect is a prediction to measure.
- **For a human expert to check:** skin protection across darker skin tones; whether sepia/toned images should skip WB; the CLAHE clip limit on real noisy phone JPEGs judged by stitchers.
