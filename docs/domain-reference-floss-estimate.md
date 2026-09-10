# Domain reference — DMC floss consumption for full cross stitch on Aida

Produced by the `domain-expert` subagent for G-013 (floss-amount estimate),
per STANDARDS.md's "Domain depth" section. Retrieved 2026-09-10. This is
advisory research input to `lib/floss-estimate.ts`'s formula, not a code
audit -- verify against the actual implementation when re-invoking at a
future milestone boundary. Kept as its own file, separate from the
existing `docs/domain-reference.md` (G-001's chart-conventions/colour-
reduction research), since the two cover unrelated domains.

## 1. The error that explains most conflicting community numbers

**A 6-strand skein used 2 strands at a time yields 3x its label length as
working thread.** A DMC skein is 8 m *of the 6-strand bundle* = 48
strand-metres. Separated and stitched with 2 strands, that's 24 m of usable
working thread, not 8 m. Most of the wildly disagreeing "stitches per
skein" numbers found across the web trace back to this factor being applied
inconsistently (or not at all).

## 2. Geometry (Danish method: rows of half-stitches + return pass)

Aida hole pitch = 1/N inch; front diagonal = sqrt(2)/N.

- **Danish method** (standard for filling a block of one color): 2 front
  diagonals + 2 vertical back legs = 2(sqrt(2)+1)/N in ~= 4.828/N in.
- **English method** (complete each X, then travel): (3*sqrt(2)+1)/N in ~=
  5.243/N in -- about 9% more.
- **Isolated/confetti stitch** (no run to travel along): 2*sqrt(2)/N + 1/N
  of path, plus ~1-2 cm of buried tail at each end, which dominates at any
  fabric count.

Caveat (the subagent's own reasoning, uncited): a full cross has 4 fabric
penetrations, each costing roughly one fabric thickness of thread
(~0.4-0.5mm at 14-count) -- this doesn't scale with 1/N, so pure 1/N
scaling slightly under-predicts at fine counts, but is inside the noise for
11-18 count and not worth modeling separately.

## 3. Empirical anchor

Lord Libidan ran a real skein-exhaustion experiment across seven Aida
counts, two technique tiers
(https://lordlibidan.com/how-many-stitches-can-you-get-out-of-a-8m-skein/):

| Count | Inefficient (English, knots) | Efficient (Danish, no knots) |
|---|---|---|
| 10 | 1200 | 1300 |
| 14 | 1650 | 1850 |
| 18 | 2200 | 2300 |
| 22 | 2700 | 2800 |

Strand count isn't stated on that page; the subagent infers 2 strands (3
strands would imply a working length *below* the geometric minimum, which
is impossible). Dividing the table by the corresponding geometry gives a
suspiciously flat ~1.5x ratio across all four counts, suggesting the table
was scaled by 1/N from one or two real measurements rather than measured
independently at every count -- semi-empirical, not seven independent
trials, but a real anchor.

## 4. Recommended overhead multiplier: K = 2.0

- K = 1.5 matches Lord Libidan for efficient, contiguous block stitching.
- **K = 2.0 (chosen)**: the extra 0.5 covers confetti -- this app generates
  photo-derived patterns, which are often scattered single stitches rather
  than clean blocks. Traveling 2-4 squares between scattered same-color
  stitches costs 2/N-4/N (a 40-80% uplift on the 4.83/N base); carries
  beyond ~4-5 squares are actively discouraged (the float shows through the
  fabric), so the realistic alternative is a tie-off/restart costing ~2cm
  of buried tail per stitch. The confetti uplift itself (1.3-1.5x) is the
  subagent's own reasoned estimate, not cited; the carry-length limit is
  cited (Caterpillar Cross Stitch, Studio Koekoek).
- K = 2.5 (pure-confetti worst case) was considered but judged to mostly
  inflate the headline number without changing what anyone actually buys,
  since `ceil()` to whole skeins already dominates for any color with a
  modest stitch count.

## 5. Strand convention by Aida count

| Count | Convention | Sources |
|---|---|---|
| 11 | 3 (some say 4 on light fabric) | needlework-tips-and-techniques.com, Gathered; Lord Libidan is an outlier at 4/6 |
| 14 | 2 (occasionally 3) | as above |
| 16 | 2 | as above |
| 18 | 2 (some prefer 1) | as above |

Strand count enters linearly and inversely -- 3 strands instead of 2 is a
1.5x hit on skein count, larger than the entire K=1.5-vs-2.0 spread. This
project uses: 3 strands at 11-count, 2 strands at 14/16/18-count (the
`STANDARD_AIDA_COUNTS` this app supports, per `lib/finished-size.ts`).

## 6. Formula used (`lib/floss-estimate.ts`)

```
SKEIN_STRAND_CM = 4800        // 8m skein x 6 strands x 100 cm/m
K = 2.0
strands(N) = N <= 11 ? 3 : 2
workingCmPerStitch(N) = 2*(sqrt(2)+1) * 2.54 * K / N   // ~= 24.53/N cm
strandCmPerStitch(N) = strands(N) * workingCmPerStitch(N)
skeinsForColor(stitches, N) = max(1, ceil(stitches * strandCmPerStitch(N) / SKEIN_STRAND_CM))
```

Resulting stitches-per-skein at each supported count:

| Count N | Strands | Strand-cm/stitch | Stitches per skein |
|---|---|---|---|
| 11 | 3 | 6.69 | 718 |
| 14 | 2 | 3.50 | 1370 |
| 16 | 2 | 3.07 | 1566 |
| 18 | 2 | 2.73 | 1761 |

Sanity check: at 14-count this is 26% more conservative than Lord
Libidan's measured "efficient" case (1850 st/skein) and 17% more than the
measured "inefficient" case (1650 st/skein) -- conservative without being
absurd, and consistent with the Owner's "estimate larger amount than
smaller" instruction.

## 7. Confidence and gaps

- **Solid**: the x3 strand-division correction, the Danish/English path
  geometry, and that 3-strand usage at 14-count is ruled out by the Lord
  Libidan data falling below the geometric floor at that assumption.
- **Semi-empirical**: the ~1.5x real-world overhead, resting on one
  stitcher's experiment whose table looks partly interpolated across
  counts. No guild (EGA, Royal School of Needlework) or manufacturer
  publication of thread-consumption rates was found.
- **Subagent's own estimate, uncited**: the confetti uplift from 1.5 to
  2.0, Aida fabric thickness (~0.4-0.5mm), and the ~5cm loss per 45cm tail
  cut.
- **Not covered**: back stitch, half/quarter/fractional stitches, French
  knots -- this app currently only generates full cross stitches, so this
  is not a gap against current scope, but would need a separate term if
  back-stitch outlines are ever added (don't fold it into K).
- **Worth a human double-check**: whether 3 strands at 11-count matches
  this app's intended audience (one source says 4), and whether 2 strands
  at 18-count is right for photo-realistic dense coverage.
- **Product note (not a domain finding)**: dye-lot variation between
  skeins bought at different times is a bigger real-world pain point than
  buying one skein too few -- out of scope for this estimate, worth a
  possible future UI note.

Sources: [Lord Libidan -- stitches per 8m skein](https://lordlibidan.com/how-many-stitches-can-you-get-out-of-a-8m-skein/) *
[Lord Libidan -- how many strands](https://lordlibidan.com/how-many-strands-of-thread-should-you-use/) *
[Needlework Tips & Techniques -- Aida cloth guide](https://www.needlework-tips-and-techniques.com/aida-cloth.html) *
[Gathered -- cross stitch thread](https://www.gathered.how/needlework/cross-stitch/cross-stitch-thread) *
[Tessiland -- DMC Mouline Special specs](https://www.tessiland.com/en/embroidery-yarns/20709-dmc-mouline-special-6-strand-cotton-for-embroidery.html) *
[Caterpillar Cross Stitch -- confetti guide](https://www.caterpillarcrossstitch.com/blogs/blog/cross-stitch-confetti-stitches-guide-for-beginners) *
[Studio Koekoek -- confetti stitches](https://studio-koekoek.com/how-to-make-a-confetti-cross-stitch-cross-stitching-a-lonely-cross-stitch-surrounded-with-blank-cross-stitch-fabric/) *
[Lindy Stitches -- how many skeins](https://www.lindystitches.com/blogs/news/how-many-skeins-of-floss-will-i-need)
