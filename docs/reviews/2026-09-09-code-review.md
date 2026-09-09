# Cross-stitch project review — 2026-09-09

Reviewed `cross-stitch-pattern-generator` at commit `772f7ca`. The hub index and project inventory contain one dedicated cross-stitch project. Crochet simulation and the other craft calculators were outside this review.

The core pipeline has useful separation into testable modules, deterministic generation, and a working browser worker. The main weaknesses are image/job ownership, export reliability, and gaps between the algorithm's stated objective and its implementation. Application code was not changed during this review.

Validation: 96 unit tests passed; ESLint, TypeScript, and the production build passed. Both existing Playwright tests passed against a separately started local production build with retries disabled. The normal development-server test run passed both test assertions but its process did not finish teardown; it was interrupted. Additional scratch probes exercised image replacement, invalid files, fractional sizes, clipped text, texture failures, encoding failures, worker cancellation, downsampling, and palette error. Browser testing used Chromium on Windows, including a 390-pixel viewport.

**Findings, in recommended repair order**

1. **P1 — A completed job can attach the previous image's chart to the newly selected filename.**

   Source: [app/page.tsx:46](E:/CLAUDE/projects/cross-stitch-pattern-generator/app/page.tsx:46), [app/page.tsx:86](E:/CLAUDE/projects/cross-stitch-pattern-generator/app/page.tsx:86), [app/page.tsx:132](E:/CLAUDE/projects/cross-stitch-pattern-generator/app/page.tsx:132).

   Selecting a file clears `pattern` but does not cancel generation or invalidate the pending result. The file input remains enabled during generation. `handleGenerate` later calls `setPattern(result)` unconditionally, while downloading uses the current `sourceFileName`.

   Reproduced using a real worker with delivery of its completed result temporarily held: start a landscape image at 50 stitches, select an 80×160 portrait named `replacement.png`, then deliver the old result. The page says `Loaded: replacement.png` but shows `50 × 31 stitches`; the download is `replacement-color.png`. The replacement should generate a 25×50 chart. This can cause someone to save or stitch the wrong pattern.

   A related failure was reproduced: after selecting a corrupt replacement, generation stays enabled with the previous pixel buffer and filename. There is also no request identity on concurrent image reads, so a slow earlier decode can overwrite a newer selection.

   Fix: make file decoding and generation carry a source revision; accept a result only for the current revision. Store the source filename and generation settings with the resulting pattern. Clear or explicitly retain a previous source on read failure, with consistent UI. Cancel obsolete work and disable generation while the replacement is loading.

2. **P2 — Resizing is not an area-weighted box filter and introduces spatial bias.**

   Source: [lib/downsample.ts:55](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/downsample.ts:55).

   Every source pixel is assigned wholly to one destination cell using `floor(x * gridWidth / srcWidth)`. At a nonintegral scale, a pixel crossing a destination-cell boundary should contribute to both cells. Whole-pixel binning instead gives unequal sampling areas and favors one side of a detail.

   Reproduced directly: a symmetric three-pixel black/white/black stripe resized to two cells becomes gray 188 followed by black 0. Area-weighted linear-light averaging gives gray 156 in both cells. This occurs before clustering, so later palette changes cannot recover the correct cell colors. Existing averaging tests use integral ratios or a uniform upscale and miss it.

   Fix: integrate fractional pixel coverage, preferably with a separable area filter, retaining linear-light averaging. Add nonintegral-ratio and reflection-symmetry cases; use a consistent footprint when aggregating the importance map.

3. **P2 — Palette recomputation does not minimize the error the optimizer measures.**

   Source: [lib/quantize.ts:18](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/quantize.ts:18), [lib/quantize.ts:122](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/quantize.ts:122), [lib/pattern.ts:79](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/pattern.ts:79).

   Assignment and diagnostics use squared OKLab distance, but reported palette colors are means in linear RGB. A mean minimizes squared error in the coordinate system where it is computed; the linear-RGB mean is not a Lloyd update for OKLab. The final-update comment claiming a guaranteed accuracy improvement is therefore incorrect. Linear-light averaging remains appropriate for the spatial downsample; that does not establish it as the correct palette centroid.

   Reproduced on a 100×60 grayscale ramp through the default two-color pipeline: its palette is `[71,71,71]` and `[194,194,194]`. Recomputing the same final memberships in OKLab gives `[58,58,58]` and `[189,189,189]`, reducing mean squared OKLab error from 0.0191245 to 0.0178015, about 6.9%, without moving a stitch. A simpler equal black/white cluster gives error 0.33716 at the linear-RGB mean versus 0.25000 at the rounded OKLab mean.

   Fix: select one objective for palette refinement and use its centroid consistently, with gamut handling when converting to RGB. If the brightness bias from linear RGB is a desired aesthetic decision, document that tradeoff and remove the monotonic-improvement claim. Revalidate both generation modes on varied images before changing defaults. The [OKLab author's explanation](https://bottosson.github.io/posts/oklab/) provides the underlying distinction between perceptual and linear RGB coordinates.

4. **P2 — The canvas limit does not cover the complete export or its memory use.**

   Source: [lib/render.ts:70](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/render.ts:70), [lib/render.ts:347](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/render.ts:347), [lib/load-image.ts:24](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/load-image.ts:24).

   The 12,000-pixel clamp applies to the stitch grid only. Header, legend, and margins are added afterward, and no total-area budget is checked. A supported 1000×1000 one-color pattern requests a 12,238×12,078 chart: 591,242,256 bytes, approximately 564 MiB, for one RGBA surface before encoder/browser overhead. This was measured by executing the layout with a stub drawing context, deliberately avoiding the huge allocation.

   The hardcoded limit is also not portable. [MDN documents browser-dependent canvas limits](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas#maximum_canvas_size), including a 4096×4096 limit on iOS, and notes that exceeding a dimension or area limit makes drawing unusable. Actual iOS failure was not tested here. Large input images are also decoded into an unrestricted full-resolution canvas before reaching the worker.

   Fix: budget the complete output dimensions and pixel area; validate input dimensions; detect allocation/encoding failure. Paginated exports or tiled rendering would preserve readable stitch cells without requiring one enormous bitmap. Benchmark ordinary high-resolution phone photos as well as maximum stitch grids.

5. **P2 — Small chart headers are clipped in both preview and download.**

   Source: [lib/render.ts:201](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/render.ts:201), [lib/render.ts:347](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/render.ts:347).

   `drawHeader` receives `canvasWidth` and discards it. For the bundled fixture at the supported custom size 10, the generated chart is 10×6 stitches and the canvas is 292 pixels wide. The finished-size header extends to x=333.98, cutting off the fabric-count text. Confirmed through actual canvas text measurements and a screenshot; preview and export use the same renderer.

   Fix: include measured header width in layout or wrap the header and reserve its resulting height. Cover minimum size, portrait, landscape, long color names, and dense legends with rendering tests.

6. **P2 — A failed texture request permanently breaks realistic preview until reload, without explaining it.**

   Source: [lib/stitch-texture.ts:15](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/stitch-texture.ts:15), [app/page.tsx:113](E:/CLAUDE/projects/cross-stitch-pattern-generator/app/page.tsx:113).

   The texture loader caches its promise even after rejection. The preview effect has no rejection handler. Blocking `/stitch-texture.png` once produces an unhandled error, leaves the previous color chart visible while “Realistic preview” is selected, and displays no error. Switching away and back after allowing requests again produces another rejection from the same cached promise; it does not fetch again.

   Fix: clear the rejected cache, catch preview/render failures, show which mode failed, and offer a retry. Treat the old preview as stale until the selected render succeeds. The download handler also needs to catch rendering rejection.

7. **P2 — Download completion and encoding failure are not tracked.**

   Source: [lib/render.ts:422](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/render.ts:422), [app/page.tsx:126](E:/CLAUDE/projects/cross-stitch-pattern-generator/app/page.tsx:126).

   `downloadCanvasAsPng` starts asynchronous `toBlob` encoding and immediately returns. The caller then clears `isDownloading`. Delaying the real callback interface reproduced enabled download buttons while encoding was still pending. Returning `null` to the callback silently produces no file and no error. This failure result is part of the [documented `toBlob` contract](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob#parameters).

   Fix: return a promise that resolves after successful encoding/download initiation and rejects on `null`; await it in the handler and display failure. Keep “Preparing…” active throughout encoding to prevent repeat large allocations.

8. **P2 — Fractional stitch counts bypass validation and fail inside generation.**

   Source: [app/page.tsx:65](E:/CLAUDE/projects/cross-stitch-pattern-generator/app/page.tsx:65), [lib/downsample.ts:9](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/downsample.ts:9).

   The size check only compares lower and upper bounds. The number field accepts typed decimals; this button is not using form submission to enforce native step validation. Entering 10.5 reaches `buildPattern`, where fractional grid dimensions produce `RangeError: Invalid array length`. The UI blames the image: “Couldn't generate a pattern from that image.”

   Fix: validate finite integers at the UI and pipeline boundary; keep the message about stitch count. Test decimals, empty input, and nonfinite direct API values alongside the existing out-of-range case.

9. **P3 — Cancelling a worker leaves the old job promise pending forever.**

   Source: [lib/pattern-client.ts:29](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/pattern-client.ts:29).

   Terminating the worker clears the active ID but does not resolve or reject the promise returned for the cancelled job. A mocked-worker probe confirmed that a superseded first job remains pending after the second resolves. The current UI does not call cancellation on file changes, so this is an API defect to address when fixing finding 1, rather than a separate currently exposed Cancel-button failure.

   Fix: retain the active rejection callback or use an abort contract, reject cancellation with a recognizable reason, and clean up worker handlers. Component unmount should cancel owned work as well.

**Questionable decisions and improvements**

- **Make printing a first-class workflow.** PNG-only export was explicitly accepted, so lack of PDF is not an unimplemented requirement. It has become a practical constraint alongside the supported 1000-stitch size. Add paginated print/PDF with readable fixed stitch size, overlap, page coordinates, and a repeated legend. Separate chart zoom/pan from the whole-page preview so symbols and legend text can be inspected without relying on one fitted image. [Current export decision](E:/CLAUDE/projects/cross-stitch-pattern-generator/HANDOVER.md:1296).
- **Prioritize previously acknowledged optimizer gaps.** Luminance-only edges and dominant fixed smoothness weights were already recorded as deferred, not discovered anew here. They directly affect thin or low-contrast details. Revisit those against measured examples before adding more quantizer heuristics. `runMultiScaleOptimizer` runs two weight schedules on the same-resolution grid; call that accurately or implement an actual image pyramid if scale separation is required. Also audit squared-distance units: `costCeiling: 0.02` is compared to a squared-error increase while its comment calls it approximately one JND, even though the project's own reference uses 0.02 as an unsquared distance. [Deferred issues](E:/CLAUDE/projects/cross-stitch-pattern-generator/HANDOVER.md:641), [two-pass implementation](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/local-optimizer.ts:121), [cost ceiling](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/contour-cleanup.ts:17).
- **Treat generation as an inspectable, recoverable document.** Show the source thumbnail, the settings that produced the current result, and a clear indication when controls have changed since generation. Allow saving/reopening the pattern and palette. Retain the two algorithms requested by the Owner, but explain them through their behavior and offer side-by-side comparison. Brand-neutral names were also explicitly requested; optional mapping to a user's thread inventory would be an extension, not a correction to that decision. [Current state model](E:/CLAUDE/projects/cross-stitch-pattern-generator/app/page.tsx:27).
- **Measure allocation costs before increasing limits.** The worker boundary copies the source pixel buffer; edge normalization sorts a full source-resolution array; several passes recreate arrays of OKLab triples; final membership indexing creates further arrays. This contradicts some of the handover's broad “cheap on GC” reassurance. Reuse typed buffers and color conversions, transfer worker-owned buffers where ownership permits, and benchmark decoding, generation, rendering, and encoding separately. [Worker copy](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/pattern-client.ts:69), [source sort](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/edge-map.ts:62), [per-pass color allocation](E:/CLAUDE/projects/cross-stitch-pattern-generator/lib/local-optimizer.ts:55).
- **Add a `.dockerignore`.** There is none. `COPY . .` can overlay the Linux dependency tree from the dependency stage with local Windows `node_modules`, and includes local build output and repository data in the build context. Fresh server clones avoid some of this accidentally; local builds should be deterministic too. Exclude at least `node_modules`, `.next`, `.git`, and test output. Docker was inspected but not built during this review. [Dockerfile:12](E:/CLAUDE/projects/cross-stitch-pattern-generator/Dockerfile:12).
- **Expand tests around user-visible failure modes.** Current end-to-end checks assert a preview and download filenames; they do not inspect the downloaded image, exercise realistic preview, verify fabric/unit changes, or test competing uploads. Add those plus rendering bounds, encoding failures, and fractional resampling. For algorithm regression, retain synthetic invariants but add permission-cleared representative photos and salient-detail masks; the current edge-preservation assertion only requires more than one component and a positive score. No CI workflow exists in this repository. [Browser tests](E:/CLAUDE/projects/cross-stitch-pattern-generator/tests/e2e/generate-pattern.spec.ts:6), [edge regression](E:/CLAUDE/projects/cross-stitch-pattern-generator/tests/unit/regression.spec.ts:164).
- **Expose control state accessibly and simplify mobile layout.** The unit and algorithm buttons express selection only through CSS; give them `aria-pressed` or radio-group semantics. Announce progress and errors. At 390 pixels the page stays within the viewport, but preview controls and the three download buttons wrap into cramped stacks; let those groups stack intentionally. [Unit buttons](E:/CLAUDE/projects/cross-stitch-pattern-generator/app/page.tsx:221), [algorithm buttons](E:/CLAUDE/projects/cross-stitch-pattern-generator/app/page.tsx:265).
- **Repair the current documentation summary.** README still describes a fixed 14-count estimate and omits later preview/mode features. HANDOVER's current-state paragraph says 84 tests and unfinished M9 polish; its “Next steps” still lists M6–M9a as remaining despite completed goals and later implementation records. Keep the historical decisions, but maintain one accurate present-tense summary. [README:21](E:/CLAUDE/projects/cross-stitch-pattern-generator/README.md:21), [HANDOVER:9](E:/CLAUDE/projects/cross-stitch-pattern-generator/HANDOVER.md:9), [HANDOVER:1287](E:/CLAUDE/projects/cross-stitch-pattern-generator/HANDOVER.md:1287).

Suggested sequence: fix source/job ownership and failure reporting first; repair chart layout and size budgeting next; then correct resampling and evaluate a consistent palette objective against a broader image corpus. Larger product extensions can follow those reliability fixes.

**Evidence and limits**

Scratch probes and browser evidence are in [E:/CLAUDE/.review-scratch/cross-stitch](E:/CLAUDE/.review-scratch/cross-stitch): `browser-review.cjs`, `browser-results.json`, `core-review.cjs`, `worker-review.cjs`, `small-chart.png`, and `mobile.png`. The probes do not modify application source. Worker delivery, failed requests, and encoder callbacks were controlled to make timing/error cases deterministic; successful generation itself used the actual production application.

Confidence is high for the directly reproduced findings. The large-canvas arithmetic is confirmed, but a maximum-size allocation, actual iOS behavior, Docker build, and representative real-photo quality were not verified. Alpha/importance and upscaling probes did not produce a visible regression on the fixtures tried, so those were not promoted to confirmed defects. The deployed public instance was not changed or checked for commit parity. Public reference pages were retrieved on 2026-09-09.
