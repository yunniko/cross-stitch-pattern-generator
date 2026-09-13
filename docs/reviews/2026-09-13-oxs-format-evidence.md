# OXS format evidence — 2026-09-13

What real `.oxs` files look like, gathered for G-028 before designing the reader and writer. The spec is the primary
source; the files show what real writers actually emit. None of the files below is committed to this repository: they
are third-party content, and some are copyrighted patterns or GPL-licensed repositories. Test fixtures are
self-authored.

## The spec

Ursa Software, "Open Cross Stitch File Format", version 1.0, <https://www.ursasoftware.com/OXSFormat/>, retrieved
2026-09-13.

- UTF-8 XML with a root `<chart>` holding `format`, `properties`, `palette`, `fullstitches`, `partstitches`,
  `backstitches`, `ornaments_inc_knots_and_beads` and `commentboxes`. The spec says properties, fullstitches and
  backstitches "should be considered mandatory, even if empty".
- Palette index 0 is the cloth. `palette_item` carries `index`, `number` (for example "DMC 781"), `name`, `color`
  (RRGGBB hex), `strands`, `symbol` and several optional fields, and may contain `<blend>` children.
- "Only actual stitches need be recorded": an empty cell has no `stitch` element.
- `partstitch` has `palindex1` (left colour), `palindex2` (right colour) and `direction`: 1 is a diagonal from top-left
  to bottom-right, 2 from bottom-left to top-right, 3 the top half, 4 the bottom half. Tent stitches may appear as
  objects in files from 2025 on.
- `backstitch` lines have decimal coordinates and an `objecttype` of backstitch, daisy or bugle. Objects include knots,
  beads, buttons, sequins, tent, quarter and half stitches, and larger crosses.
- Unknown attributes are to be ignored.

## Real files

Retrieved 2026-09-13 through the GitHub API into the session scratchpad and summarized by script.

| Writer | Source | Size | Cloth at index 0 | Coordinates | Notable |
|---|---|---|---|---|---|
| Ursa Software | embroidery-space/embroiderly, `app/public/demo/Piggies.oxs` | 69×73 | yes | 0-based (6–64, 4–72 within the grid) | 55 part stitches (directions 1 and 2), 1105 backstitches, 10 knots, 8 beads; numbers like "DMC    943"; numeric symbols |
| FlossCross | EmilHvitfeldt/data-crossstitch, `patterns/stacks/stacks.oxs` | 59×68 | yes | 0-based | lower-case hex; empty placeholder `<partstitch />` and `<object />` elements with no attributes |
| Embroidery Studio (Embroiderly) | embroidery-space/embroiderly, `testdata/patterns/rainbow.oxs` | 7×7 | yes | 0-based | `kind` and `blendscount` attributes |
| Cross-Stitcher | rr-h/42x09_Cross-Stitcher, `fixtures/simple.oxs` | 5×5 | yes | 0-based | only `format`, `properties`, `palette` and `fullstitches` present |
| Wesnoth Stitch | gemlad/wesnoth_stitch, `uat/chart.oxs` | 39×31 | yes | 0-based | 31 DMC colours |
| PDF-to-OXS conversion | Mickey1992/stitch-pdf2oxs, `test.oxs` | 999×749, 47 MB | no (starts at 1) | 0-based | 237 colours; attributes in alphabetical order; `chatTitle` instead of `charttitle`; only properties, palette and fullstitches present |

Across all six, no full stitch uses palindex 0, and every palindex matches a palette item's `index` attribute. Five
files use `oxsversion` rather than the spec's `oxs` attribute.

## A second implementation

Embroiderly's reader and writer (`crates/embroiderly-parsers/src/oxs.rs` in embroidery-space/embroiderly, GPL-3.0,
retrieved 2026-09-13; read for format behaviour only, no code reused):

- The writer puts the cloth at index 0 and writes each colour's palindex as its position plus one.
- The writer puts `symbol` as the symbol character's numeric code point plus a `fontname` attribute (default
  "Ursasoftware"), and the reader parses it the same way.
- Part stitches: directions 3 and 4 become a half stitch in palindex1, or palindex2 when palindex1 is absent.
  Directions 1 and 2 become two quarter stitches, palindex1 in one corner and palindex2 in the opposite corner.
- Stitches whose palindex falls outside the palette are dropped.
- A thread `number` is split at its last space into brand and code.
- Missing `stitchesperinch_y` falls back to `stitchesperinch`.

## Import results on the real files

This app's importer (G-028), run on the six files on 2026-09-13:

| File | Result | Reported |
|---|---|---|
| Ursa Piggies | 69×73, 4 DMC colours, 1,055 stitches | 55 part stitches shown as full stitches; 1,105 backstitch lines, 10 knots and 8 beads not imported; 3 colours used only by that content; copyright not kept |
| FlossCross stacks | 59×68, 9 DMC colours, 3,008 stitches | cloth colour and instructions not kept |
| Embroiderly rainbow | 7×7, 7 DMC colours, 49 stitches | an unrecognised `special_stitch_models` element |
| Cross-Stitcher simple | 5×5, 2 DMC colours, 25 stitches | cloth colour and author not kept |
| Wesnoth Stitch chart | 39×31, 31 DMC colours, 830 stitches | cloth colour, copyright and instructions not kept |
| PDF-to-OXS conversion | refused | "This OXS file uses 237 colours; this app supports at most 100." |

## What a reader must tolerate

- Missing sections, including ones the spec calls mandatory.
- A missing cloth entry.
- Attributes in any order, extra attributes, and the `chatTitle` spelling.
- Thread numbers with variable spacing, and lower-case hex colours.
- Symbols given either as numeric font codes or as characters.
- Placeholder elements without attributes, which carry no content.
- Very large files: 750,000 stitch elements in 47 MB.
