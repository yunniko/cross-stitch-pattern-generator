# D257 · A curated bundle of OFL fonts, served from this site, beside the computer's own
Date: 2026-10-01 · Goal: G-081 M6 · Status: active (superseded by: —)
Context: the Owner asked about Google Fonts for the Text tab; local fonts alone leave Firefox and Safari with generic families only.
Decision: eleven SIL OFL 1.1 fonts (six pixel, five outline) are files in `public/fonts/bundled/`, offered in a "Bundled" group of the Font list, read with a same-origin GET.
Force: requirement — Owner, 2026-10-01: a curated bundle, and fonts and text never leave the browser (so no font CDN).
Rejected: Google's CDN (the visitor's address and choice go to Google); the whole catalogue (thousands of files, a licence record each).
Consequence: each font's `OFL.txt` stays beside it and `LICENSES.md` lists it; a bundled family is stored as `bundled:<name>` so it never clashes with a computer's family of that name. Adding a font means a catalog entry, its files and a licence row; a test checks all three.
Evidence: tests/unit/bundled-fonts.spec.ts; tests/e2e/text-tab.spec.ts; public/fonts/bundled/LICENSES.md
