# D257 · A curated bundle of openly licensed fonts, served from this site, beside the computer's own
Date: 2026-10-01 · Goal: G-081 M6 · Status: active (superseded by: —)
Context: the Owner asked about Google Fonts for the Text tab, then supplied two pixel-font downloads; local fonts alone leave Firefox and Safari with generic families only.
Decision: 31 font families (OFL, CC0, or public domain by the publisher's statement; 26 pixel, 5 outline) are files in `public/fonts/bundled/`, offered in "bundled" groups of the Font list and read with a same-origin GET.
Force: requirement — Owner, 2026-10-01: a curated bundle, fonts and text never leave the browser, and licences are checked before reuse (VALUES.md).
Rejected: Google's CDN (the visitor's address and choice go to Google); fonts labelled only Freeware, BY-SA or BY-ND, or whose file contradicts its label (redistribution not allowed or unsettled); the whole Google catalogue (thousands of files).
Consequence: each font's licence stays beside it and in `LICENSES.md`; a bundled family is stored as `bundled:<name>`. Adding one needs a catalog entry, files and a licence row, and a test checks all three. The review lists what was left out and why.
Evidence: tests/unit/bundled-fonts.spec.ts; tests/e2e/text-tab.spec.ts; docs/reviews/2026-10-01-bundled-font-licences.md
