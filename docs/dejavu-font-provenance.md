# `public/fonts/DejaVuSans.ttf` — data provenance and license

Chosen for G-026 M1 (Pattern Keeper-compatible PDF export) as the embedded
font for real, vector, selectable text in the exported PDF's stitch symbols
and legend. Recorded here per STANDARDS.md's "record the attribution where
the asset is used."

## Source and license

**DejaVu Fonts, version 2.37** (the current official release as of
2026-09-12), downloaded from the authoritative SourceForge release archive:
`https://sourceforge.net/projects/dejavu/files/dejavu/2.37/dejavu-fonts-ttf-2.37.tar.bz2`
(confirmed as the current release via the project's own
`https://dejavu-fonts.github.io/Download.html`, not an arbitrary GitHub
mirror). `ttf/DejaVuSans.ttf` was extracted from that archive unmodified.

SHA-256 of the file as committed:
`7da195a74c55bef988d0d48f9508bd5d849425c1770dba5d7bfc6ce9ed848954`

**License**: the Bitstream Vera Fonts license (the license DejaVu is built
under; full text in `public/fonts/DejaVuSans-LICENSE.txt`, copied verbatim
from the official release archive's own `LICENSE` file). Key terms:
free-of-charge use, reproduction, distribution, merging, and embedding in a
larger software package (explicitly permitted: "The Font Software may be
sold as part of a larger software package"); the only real obligation is
keeping the copyright/trademark notice with the font file itself (satisfied
by keeping `DejaVuSans-LICENSE.txt` alongside it, unmodified) — no
obligation on this project's own code license, no royalty, no attribution
requirement inside the generated PDF documents themselves. DejaVu's own
changes on top of Bitstream Vera are dedicated to the public domain.

## Why this font, verified rather than assumed

`lib/symbols.ts`'s full 100-symbol set spans several different Unicode
blocks (Basic Latin, Latin-1 Supplement, Arrows, Mathematical Operators,
Miscellaneous Technical, Geometric Shapes, Miscellaneous Symbols, Dingbats).
Rather than trust a general reputation for "broad symbol coverage," every
one of the 100 symbols' exact codepoints was checked programmatically
against this font's own `cmap` table using `fontkit`
(`glyphForCodePoint(cp).id !== 0` for all 100) — confirmed **zero missing
glyphs**, so a single font file covers the entire symbol set with no
fallback-font routing needed in the PDF generator.

## Regenerating / updating this file

If `lib/symbols.ts`'s symbol set ever changes to include a codepoint outside
DejaVu Sans's coverage, re-run the same `fontkit`-based coverage check
against candidate fonts before choosing a replacement or a second embedded
font — do not assume coverage from a font's general reputation.
