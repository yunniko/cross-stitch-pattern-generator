# Bundled fonts: what was considered and why (2026-10-01)

The Owner supplied two downloads: the Fontspace collection "pixel fonts free commercial use" (63 fonts) and the Nb Pixel Font
Bundle v1.0 (20 fonts). Bundling means serving the font files to every visitor, which is redistribution, so each font needed a
licence that allows it. The collection's own `info.txt` gives only the label Fontspace shows; each font file's embedded licence
field was read as well (fontTools name table, ids 0, 13 and 14).

## Finding: the collection's labels are not reliable

Three fonts labelled "SIL Open Font License" carry other licences inside the file: Beef'd (embedded CC BY-ND 3.0), Creeper Pixel
and Gothic Pixel (embedded CC BY-SA 3.0). They were left out, and the same distrust applies to every label.

## Used from the collection (the file itself states the licence)

3x3 Mono and Public Pixel (CC0 1.0 in the file); Pixeloid Mono, Sans and Sans Bold, and Quinque Five (OFL 1.1 in the file, with
the licence text in the download); Old English Gothic Pixel (OFL 1.1, licence text in the download). Press Start 2P was already
bundled from Google Fonts.

## Left out of the collection, and why

- **Labelled "Freeware"** (about 38 fonts, for example Fipps, Pokemon GB, Pixel Emulator): freeware normally permits use, not
  redistribution of the file, and no licence text allows serving it. Not used.
- **CC BY-ND** (BPdots, F77 Minecraft, Pixellium, Pixgamer; Beef'd by its file): attribution, no changes. Serving the file
  unchanged may be allowed, but whether turning its letters into stitches is a derivative is unsettled. Not used without the
  Owner's decision.
- **CC BY-SA** (Glasstown NBP, Hachicro Undertale, Pixel Script, Pixelmix; Creeper Pixel and Gothic Pixel by their files):
  share-alike, the same question. Not used without the Owner's decision.
- **Public domain by label only** (Boxpixies, Earls Revenge, LCD, LCD Solid, Lo-Sumires): nothing in the files says so, LCD
  Solid's notice reads "Public domain / GNU GPL", and Lo-Sumires' notice names a game's authors. Not used.
- **Freeware, Non-Commercial** (Tiny Islanders): not allowed.
- **DatCub** (OFL in the file): drawn as a dotted pattern at every size, and no size comes out as whole stitches. **Connection III**
  (OFL): no clean size either. Left out as no use for stitching, not for licence.

## Used from the Nb bundle

Fourteen of the 20, public domain by the bundle's README (a statement by the publisher; the files carry no licence field, so it
rests on that statement alone). Left out: Zicons and Unknown (symbols, not letters), BasicChineseLine (Chinese characters only),
MMXSNES and Habbo (named for a game and a game's hotel, where a public-domain claim is doubtful), TinyPixie2 (no size comes out as
whole stitches).

## Clean sizes (measured)

Every bundled pixel font was drawn at every size from 4 to 64 and the share of half-covered pixels counted on straight-stroked
letters ("HILTEFNZ"); a size is listed when it is under 0.4%. Results: the Nb fonts at multiples of 16; Silkscreen, Press Start
2P, Tiny5 and Public Pixel at multiples of 8; 3x3 Mono at multiples of 4; Pixeloid at multiples of 9; Quinque Five at 10 to 35 in
fives; Old English Gothic Pixel at 20 only; Pixelify Sans, Jersey 10 and VT323 at none. `tests/unit/bundled-fonts.spec.ts`
re-measures the smallest and largest listed size of each.

## The "PixelFonts" download (78 folders, many authors)

Checked the same way: the included licence or readme text of every folder and each font file's embedded notice, then every
candidate was drawn and its clean sizes measured. 15 families passed; 10 are bundled and the 5 greyer ones are held back for the Owner (below); the rest were left out.

**Bundled:** OFL with its text (Coolville, Jacquard 12, Jacquarda Bastarda 9, Micro 5, PixelArmy, PXFX Tall, Zenimini Pixel); MIT
(Tiny); codeman38's permission to bundle (Manaspace, PC Senior). **Held back, not bundled:** Brian Kent's freeware terms
(Homespun, Jupiter Crash) and the 1001fonts "Free For Commercial Use" licence with its web-embedding clause (BitPap, Chava,
EXE Pixel Perfect). They passed the checks but rest on the readings below, and the Owner has not yet confirmed them.

**The two greyer groups (held back; to be bundled only if the Owner confirms; the files are in the Owner's download):**
- *Brian Kent* allows offering the fonts "go right ahead" with his text file kept intact, but forbids selling or distributing them
  "for profit". The project is not monetised; if that ever changes these two (and any like them) must go.
- *1001fonts FFC* allows embedding in a web app that does not offer the font as a download. A web font is a file the browser
  fetches, so it can be fetched by address; the app offers no download. This reading is mine, not the licensor's.

**Left out, by licence:**
- *Copyleft or share-alike*: Progenisis (GPL 2), Graph 35+ pix, Thirteen Pixel Fonts, Scream When You're Ready To Die, Minercraftory
  (CC BY-SA), VTF Mister Pixel (Velvetyne Black Licence: share-alike, no direct trade).
- *Redistribution refused or not granted*: Game Over (non-commercial, "may not sell or distribute"), Hydrophilia (may not be
  redistributed), Jazzy HuitBits (may not be republished), Habesha Pixels and Steve (not without permission), Millennia (workstation
  EULA), Unicode 00xx Square (FontStruct commercial EULA), Charybdis, Origami Mommy, Ponderosa (Tepid Monkey: "the terms on the
  website override", unchecked), Cayetano, So, Templo (use "as is", no redistribution stated), Megapixel and Pix PixelFJVerdana
  12pt (1001fonts FFC without the embedding clause), Bitmgothic (no redistribution stated), Quantasm (public domain by
  1001fonts' text but "all rights reserved" in the file).
- *No licence text, or only "free" with no statement on redistribution*: BitGameFont, BitPotion, Digital Drip, Geet, Racquetball,
  Retro Bound, Skeleboom, Wendy Neue, XC Robot, PIXY, Groutpix Flow and Pix Pixls (a website licence), PXFX Disco and Shadow.
- *Not letters*: Yarndings (symbols); the Charted variants of Jacquard and Micro (coloured chart-grid glyphs, up to 2.2 MB).
**Left out, no clean size** (drawn blurred at every size, so useless for stitches): 8-bit Limit, Unlearned, Boo City, Bulky Pixels,
Fat Pixels, Crumbled Pixels, Hardpixel, Librium, Libritabs, Wellbutrin, Lilliput Steps, Medodica, Pixel (utopiafonts), UA Squared,
Binary (symbols). Only a 40-stitch size was clean for Acknowledge, AE Systematic, Alpha Beta, Setback, Simpletown and Jacquard 24,
and 27 or 32 for Retron2000 and Script Screen: too large to be useful, so not bundled.
