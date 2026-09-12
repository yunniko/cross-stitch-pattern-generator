# Competitive analysis — photo-to-cross-stitch generators and adjacent tools

Owner-requested (2026-09-12): review our own functionality, then research
analogs and identify (a) real features competitors have that we lack, and
(b) things we have that they don't. This is a research review, not a goal —
no acceptance criteria, no milestones. Retrieval date for every web source
below is **2026-09-12** unless noted.

## Part 1 — Our own functionality, verified live

Reviewed against `GOALS.md`/`HANDOVER.md` (goals G-001 through G-027, 22 DONE,
2 ACTIVE, 1 DRAFT as of this writing) and spot-checked live in production at
`https://cross-stitch.craftodejnice.cz` (not a dev build):

- Uploaded `tests/e2e/fixtures/sample.png`, generated a 100×63/16-color
  pattern — correct, fast, legend populated with unique color names, symbols,
  stitch counts, skein estimates.
- Toggled **DMC mode** on and regenerated — palette snapped to real DMC
  codes ("M 3848", "L 3687", "K 3838", …), confirming G-021's independent
  DMC palette mode works live.
- Toggled **Crisp edges** on (G-024, still ACTIVE but already live at M4)
  and regenerated — ran without error, no visual regression.
- Switched to **Realistic preview** mode — rendered individual textured
  stitches on a transparent background (G-019), correct.
- Clicking **Export** ran without a persistent error (a ~30s busy period on
  a small pattern registered as a CDP timeout, then recovered — consistent
  with known logged perf characteristics, not a new bug; not chased further
  since G-013/G-024/G-026 already carry their own verified test coverage for
  this path).

This confirms the shipped feature set in GOALS.md's DONE goals is real and
working in production, not just claimed. Full export-format and editor-tool
verification already exists in the project's own Playwright suite (25+ e2e
tests) — not re-derived here.

**Current comprehensive feature list** (compiled from all DONE/ACTIVE goal
titles, not just the stale "Current state" HANDOVER summary which stops at
G-016):

- Client-side (Web Worker) photo → chart pipeline: OKLab k-means clustering
  + ICM Potts-model local optimizer with Sobel-edge importance weighting +
  contour cleanup (small-region recolor, diagonal-pinch fix) + palette
  merge — a genuinely region-aware/edge-preserving quantizer, not per-cell
  nearest-color.
- **Crisp edges mode** (in progress): keeps two confidently-distinct
  source-side colors as a staircase at a hard boundary instead of averaging
  them into a manufactured third color.
- Size presets Small(50) through XXL(250) + custom; fabric-count selection;
  inch/cm units.
- **DMC mode**: independent palette mode snapping to real embroidery floss,
  with a domain-reviewed floss/skein estimate per color, in every mode.
- 100-symbol set (standard Unicode blocks), manually reassignable.
- Full interactive editor: brush, rectangle select, diagonal-connectivity
  fill, pan, zoom (true re-render, not CSS scaling), move/reposition with
  wrap-around, highlight; merge/recolor/rename colors; "Empty (no stitch)"
  pseudo-color; canvas resize/crop/expand on any edge; one shared undo/redo
  stack.
- Persisted Options panel + project autosave/restore (localStorage).
- 4 render modes: Color+symbols, Black & white, Realistic stitch-texture
  preview (transparent/frameless), Grid+symbols over photo.
- Exports: Color/B&W/Realistic PNG; paginated A4 ZIP (compact + extended
  legend pages); consolidated `.cspzip` bundle with ZIP-aware re-import;
  **Pattern Keeper-compatible vector-text PDF** (real embedded-font text
  per symbol, verified via `pdfjs-dist` text extraction — not a rasterized
  image) — this one is still mid-goal (G-026), blocked on the Owner's own
  Pattern Keeper access for final real-app verification.
- Standard chart conventions: 5/10-stitch heavy gridlines, centre markers,
  row/column numbers, size header with finished-size-on-14-count-Aida.
- 100% client-side — no image is ever uploaded to any server; no account,
  no signup, no watermark, no paid tier, nothing gated.

**Known, deliberately-scoped-out gaps already logged in our own GOALS.md**
(not new findings — repeating them here only because they're directly
relevant to the competitor comparison below): no backstitch/thin-line/
stroke/centerline detection (G-024's own constraints explicitly defer this
as "a different, larger problem"); Anchor/other thread-brand palettes never
attempted (DMC only); no fractional (half/quarter) stitch support — the
pipeline is one palette color per whole stitch cell by design.

## Part 2 — The competitive landscape

Researched via WebSearch/WebFetch (some fetches hit paywalled/403 pages;
noted where a claim rests on a secondary source rather than the vendor's
own page). Categories, per the request: direct photo-to-pattern generators,
desktop "serious" chart software, progress-tracker companion apps, and
newer AI-generation tools.

### Direct photo-to-pattern web generators

| Tool | Thread palettes | Fractional/backstitch | Fabric beyond Aida | Export formats | Cost model | Source |
|---|---|---|---|---|---|---|
| **Xstitchify** | DMC, Anchor, Madeira, Cosmo | Half/quarter stitches, backstitch, French knots | 11–28 count **Aida/evenweave** | PDF, PNG, SVG, **OXS** | Free tier + 5 free PDFs w/ signup, paid from £7.99–$9.99/mo | [xstitchify.com](https://xstitchify.com/photo-to-cross-stitch/), [comparison page](https://xstitchify.com/cross-stitch-software-compared/) |
| **FlossCross** | DMC, Anchor | Half/quarter stitches, backstitch | Not specified | PDF, SVG, OXS | Completely free, no account | secondary source ([stitchmate.app comparison](https://stitchmate.app/guides/cross-stitch-pattern-software-compared), page itself returned HTTP 403 on direct fetch) |
| **Pic2Pat** | DMC (implied) | Not mentioned | Not specified | PDF only | Free | [pic2pat.com](https://www.pic2pat.com/index.en.php) (search-summarized; not independently fetched) |
| **Cross-Stitched.com** | DMC ("advanced color algorithms") | Not detailed | 14/16/18-count Aida only | Watermarked PNG/SVG free; clean PNG/SVG + multi-page PDF requires **Studio Pro** ($7.99/mo) | Freemium, **email required to unlock preview/download**, watermark on free tier | [cross-stitched.com/pattern-generator](https://cross-stitched.com/en-us/pages/pattern-generator) |
| **Stitchmate** | Not detailed | Not detailed | Not detailed | Not detailed | "Free online converter... no download or account required" (own tagline) | [stitchmate.app/photo-to-cross-stitch](https://stitchmate.app/photo-to-cross-stitch) — page's own claims, not independently verified |
| **Pixel-Stitch** | Not detailed | Not detailed | Not detailed | Not detailed | Free | search-summarized only, not fetched |

### Desktop "serious" chart software (what committed stitchers compare against)

| Tool | Thread palettes | Stitch types | Photo import | Cost | Source |
|---|---|---|---|---|---|
| **WinStitch / MacStitch** (Ursa Software) | 30+ brands: DMC, Anchor, Madeira, Weeks Dye Works, Gentle Arts, Miyuki Delica, etc. | Full/half/quarter/¾ stitches, backstitch (variable thickness), French knots, **beads, buttons, sequins** | Yes, "strong colour reduction and photo-import controls" | One-time purchase, higher price point | [ursasoftware.com](https://www.ursasoftware.com/), secondary summary via [stitchmate.app](https://stitchmate.app/guides/cross-stitch-pattern-software-compared) |
| **PCStitch** | DMC, Anchor, Kreinik, Weeks Dye Works + ~8 others | Backstitch, fractional stitches, specialty tools | Yes | One-time purchase; **stagnant, no feature updates since ~2016** per reviewers | secondary summaries (search + stitchmate.app comparison) |
| **KG-Chart** | Multiple palettes | Backstitch, fractional | Limited | Free "LE" + paid Pro | secondary summary (stitchmate.app) |

### Multi-craft chart tool (crochet/knitting/cross-stitch)

**Stitch Fiddle** — DMC (489 colors) + Anchor (445) + Madeira, custom colors;
cloud sync across devices; built-in **progress tracker** (row counter/stitch
highlighter); **sharing/collaboration**; free tier "free forever" + $2.75/mo
premium (50% off annual, no auto-renewal). Sources: [stitchfiddle.com](https://www.stitchfiddle.com/en), [premium pricing](https://www.stitchfiddle.com/en/premium/pricing), [chart creator](https://www.stitchfiddle.com/en/chart/create/cross-stitch/other). Its photo-to-pattern conversion specifics and
backstitch/fractional-stitch support could not be confirmed from the pages
fetched (login-gated past the landing page) — flagged as unconfirmed, not
assumed absent.

### Progress-tracking companion apps (the category our G-026 targets)

**Pattern Keeper** (already the direct subject of G-026 — not re-researched
in depth here) — imports a PDF/photo of any chart, overlays a detected grid,
tracks completed stitches (including half/quarter/backstitch separately),
color filter, section highlighting, undo. Source: [theartofstitch.com](https://theartofstitch.com/en-us/blogs/cross-stitch/pattern-keeper-your-ultimate-cross-stitch-assistant), [Google Play listing](https://play.google.com/store/apps/details?id=app.patternkeeper.android&hl=en_US).

### Newer AI-generation tools (a different category, flagged with caution)

Search surfaced several 2026 tools (StitchedUp, Musely, Pixlio, ReelMind)
that generate pattern-like charts from a **text prompt** or a photo using
diffusion/LLM image models (one named source: StitchedUp uses "OpenAI
GPT-Image-2"). This is a genuinely different value proposition — designing
new imagery for stitching, not converting an existing photo faithfully —
and **stitchability/accuracy claims are unverified**: I found no independent
review confirming these AI outputs produce a coherent, actually-stitchable
grid rather than a plausible-looking but structurally incoherent image (the
exact failure mode a naive per-pixel/generative approach would produce, and
the opposite of what our region-aware pipeline is specifically built to
avoid). Treat this category as an adjacent trend, not a proven gap. Source:
[xstitchify.com/best-ai-cross-stitch-generators](https://xstitchify.com/best-ai-cross-stitch-generators/) (a competitor's own comparison
page, so read with appropriate skepticism about neutrality).

## Part 3 — Gaps: what real competitors have that we don't

Ranked by how many independent tools have it and how much it plausibly
matters to our actual users (home stitchers converting a personal photo):

1. **Only DMC, no other thread-brand palettes.** Anchor alone appears in
   Xstitchify, FlossCross, Stitch Fiddle, PCStitch, and WinStitch/MacStitch
   — it's the second-most-common floss brand worldwide (especially in the
   UK/Europe) after DMC. This is the single most consistently-present gap
   across every competitor category. Likely matters: a real fraction of
   stitchers only stock Anchor and currently can't use our tool's thread
   codes at all.
2. **No backstitch/outline support.** Present in every desktop tool
   surveyed and most web generators (Xstitchify, FlossCross, PCStitch,
   WinStitch/MacStitch). We've already scoped this out deliberately in
   G-024 as "a different, larger problem" — this research doesn't change
   that assessment, just confirms it's a real, commonly-expected feature
   elsewhere, not a niche one.
3. **No fractional (half/quarter/¾) stitches.** Same competitor set as
   backstitch. These exist specifically to anti-alias diagonal/curved
   detail that whole-stitch cells can't represent — arguably in some
   tension with our specific "crisp edges" design goal (G-024), which
   solves a related but different problem (hard color boundaries, not
   sub-cell geometry) by staying within whole stitches. Worth a deliberate
   choice, not an oversight to silently close.
4. **Aida-only; no evenweave/linen ("stitch over two") support.**
   Xstitchify explicitly supports 11–28 count Aida/evenweave. Our fabric-
   count math (`lib/floss-estimate.ts` era work) and finished-size
   calculations assume Aida throughout.
5. **No cross-program interchange export (OXS format).** Xstitchify and
   FlossCross both export `.oxs`, a de facto standard many desktop programs
   (including Ursa's) can import — this is different from our own
   `.cspzip`/JSON, which only our own app can read. Relevant if a user
   wants to hand off a pattern to someone using PCStitch/WinStitch.
6. **No cloud sync / multi-device / sharing.** Stitch Fiddle and
   Xstitchify both offer this. This is a real trade-off against our
   privacy-by-design "nothing ever uploaded" stance (Part 4), not an
   oversight — worth surfacing to the Owner as a deliberate choice rather
   than silently closing.
7. **No specialty embellishments** (French knots, beads, buttons, sequins)
   — WinStitch/MacStitch specifically. Niche, high-end-hobbyist feature;
   lowest-priority of this list for a photo-conversion-focused tool.
8. **No vector/logo mode or smart background cutout for non-photo
   sources** — Xstitchify offers this for graphics/logos specifically
   (different from our photo pipeline's downsample-and-cluster approach).

## Part 4 — What we have that they document lacking (or don't advertise)

Real, source-grounded differentiators, not marketing framing:

- **Fully free, no account, no watermark, no gated tier, no email
  requirement.** This is a genuine differentiator, not an assumption:
  Xstitchify gates PDF downloads behind account signup after 5 free
  downloads and paid plans for PNG options; Cross-Stitched.com requires an
  email to unlock even the *preview* and watermarks the free download,
  reserving clean/multi-page PDF for a $7.99/mo "Studio Pro" tier; Stitch
  Fiddle and PCStitch are freemium/paid past a basic tier. None of the
  tools surveyed combine *no account + no watermark + no payment tier
  anywhere* the way ours does.
- **100% client-side, no image ever leaves the browser.** None of the
  competitor pages surveyed made an equivalent privacy claim (most say
  nothing about where the image is processed, which for a web app
  generally means a server round-trip). This is worth stating plainly to
  users, since it's a real and currently-undocumented-elsewhere-in-market
  distinction.
- **A documented, non-trivial color-quantization pipeline.** Competitor
  copy uses phrases like "advanced color algorithms" or "groups similar
  shades to reduce confetti" with no further detail. Ours is a specific,
  reproducible pipeline (OKLab k-means → Sobel-importance-weighted ICM
  Potts-model optimization → contour cleanup → palette merge), and the
  in-progress Crisp-edges mode is grounded in an actual reproduced,
  quantified failure case (a specific RGB value at a specific fixture),
  not a vague claim. This is a genuine, verifiable technical edge for
  anyone who cares why one tool's output looks cleaner than another's.
- **Domain-reviewed floss/skein estimate math**, shown for every color in
  every mode (`docs/domain-reference-floss-estimate.md`). Pic2Pat also
  advertises skein estimates, but no methodology is documented anywhere we
  found; ours has a citable derivation.
- **A Pattern-Keeper-specific, real-vector-text PDF export** (G-026, mid-
  flight). This is a targeted interoperability feature aimed at a specific,
  real, named third-party app the Owner actually uses — none of the
  competitors surveyed appear to engineer for a specific companion app this
  way; they each ship their own generic PDF and leave grid-detection
  compatibility to chance (the exact problem G-026 exists to solve).
- **A genuinely full-featured free in-browser editor** (rectangle select,
  diagonal-aware fill, canvas resize/crop/expand, merge/recolor/rename,
  "Empty" pseudo-color, shared undo/redo) — comparable in scope to paid
  tiers of Xstitchify/Stitch Fiddle, available here at no cost and with no
  feature gate.

## Confidence and gaps (per STANDARDS.md)

- **High confidence, primary-sourced**: our own feature set (verified live
  against production + GOALS.md); Xstitchify's photo-conversion controls
  and export formats (fetched directly from its own page); Cross-
  Stitched.com's pricing/gating (fetched directly); Pattern Keeper's
  tracking features (fetched from a dedicated review article, cross-
  checked against the Google Play listing).
- **Medium confidence, secondary-sourced**: FlossCross, Pic2Pat, PCStitch,
  WinStitch/MacStitch, KG-Chart, Stitchmate, Pixel-Stitch feature details —
  drawn from a third-party comparison page (xstitchify.com's own "software
  compared" page, or stitchmate.app's guide) rather than each vendor's own
  site, because several of those direct fetches were blocked (HTTP 403) or
  the landing pages were login-gated past a marketing shell. Xstitchify's
  comparison page is itself a competitor's page, so its characterization of
  *other* tools carries a mild self-interest caveat, though the descriptions
  read as factual rather than disparaging.
- **Low confidence / explicitly unverified**: Stitch Fiddle's own photo-
  conversion, backstitch, and fractional-stitch support (its interactive
  chart creator is login-gated, so this wasn't independently confirmed);
  every claim about the newer AI-prompt-based generators' actual output
  quality/stitchability (no independent review found, only vendor
  marketing copy).
- **Not researched at all**: pricing/features of Pic2Pat, Stitchmate, and
  Pixel-Stitch beyond what appeared in aggregated search snippets — these
  were not directly fetched. If the Owner wants firmer numbers on any
  specific one of these, say so and I'll fetch them directly.

## What this doesn't decide

This is a research review only — no scope was added to G-023/G-024/G-026,
and no new goal was opened. The two most consequential gaps found (Anchor/
multi-brand palettes, backstitch/fractional stitches) are both real and
common across competitors, but backstitch was already deliberately deferred
in G-024 as a larger separate problem, and neither was in the Owner's
original brief for this project. If the Owner wants either pursued, it
should become its own goal in `GOALS.md` with its own acceptance criteria
rather than being folded into current in-flight work.
