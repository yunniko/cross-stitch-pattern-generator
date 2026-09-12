# `lib/cosmo-colors.ts` — data provenance and license

`COSMO_COLORS` (500 entries: Cosmo (Lecien) floss code and an RGB
approximation of the physical thread color) was built for G-029 M2
(Cosmo palette mode). Recorded here per STANDARDS.md's "record the
attribution where the asset is used."

## Source and license

The data is copied unmodified from
[tallcoleman/CosmoToRGB](https://github.com/tallcoleman/CosmoToRGB)
(`Cosmo_2020–500.csv`), **MIT licensed** (`LICENSE`: `Copyright (c) 2021
Ben Coleman`, confirmed both by reading the file directly and via GitHub's
own API, `license.key: "mit"`). Per that repository's own README, the
author explicitly rejected DMC-conversion shortcuts and instead sampled
RGB values directly from Cosmo's own official
[2020 color-card PDF](https://www.gela.ru/upload/iblock/1ef/leaflet_cosmo-size-25-embroidery-floss_-renewal-2020-ver.-500-solid-colors-_1_.pdf)
(500 solid colors) using GIMP — a genuinely independent, documented
methodology, retrieved and verified 2026-09-12.

Fetched via `curl` from the repository's raw CSV
(`Cosmo_2020–500.csv`, columns `Colour, Cosmo_Floss_#, R, G, B, RGB_Hex,
CC_Column, CC_Row, CC_Index`), keeping only the `Cosmo_Floss_#` code and
`R, G, B` values -- the `Colour`/`RGB_Hex` columns are the same RGB
re-encoded as hex (redundant), and `CC_Column`/`CC_Row`/`CC_Index` are
the color card's own physical layout position, not needed here.

## No descriptive names — an honest gap, not filled in

Unlike DMC (`docs/dmc-colors-provenance.md`), Cosmo's source data has
**no descriptive color name column at all** — only a numeric/alphanumeric
code (e.g. `"352"`, `"480A"`) and RGB. Every `COSMO_COLORS` entry's
`name` field is therefore a deliberate empty string, not a fabricated
name invented to match DMC's shape (VALUES.md Honesty: "never smoothed
over to look like success"). `lib/thread-brands.ts`'s `formatThreadName`
falls back to showing just the code when a brand's color has no name,
so a Cosmo-matched pattern's legend shows e.g. `"352"` rather than a
misleading `"352 - "` or an invented descriptive name.

## Verification performed before use (not assumed)

- **Row count**: exactly 500 rows, matching the dataset's own name and
  README description.
- **Uniqueness**: all 500 `Cosmo_Floss_#` codes are unique (no
  duplicates) — checked directly against the parsed CSV, not assumed.
- **Spot check against known reference data**: code `"600"` resolves to
  RGB `[16, 17, 19]` (near-black) — consistent with Cosmo 600 being
  documented elsewhere in the needlework community as their standard
  black thread. No exact pure white (`[255,255,255]`) exists in the
  line; the lightest entries (`"110"`: `[252,252,242]`, `"500"`:
  `[247,247,247]`) are off-white, which is plausible for a real
  physical thread line (unlike DMC's B5200, which genuinely is
  manufactured/measured as pure white).

## RGB values are approximations, not Cosmo's own published data

Same caveat as `docs/dmc-colors-provenance.md`: Cosmo (the manufacturer)
does not publish official digital RGB values for its thread line: this
data is a scanned/photographed approximation of a printed color card,
sampled by a third party. Fine for this app's purpose (visually matching
a generated palette to the nearest real, buyable thread color); not a
guarantee of pixel-perfect accuracy against the physical skein under
every monitor/lighting condition.

## Regenerating this file

If Cosmo's line changes or a corrected/more complete dataset (with real
names) becomes available, rebuild by re-fetching
`Cosmo_2020–500.csv` (or its successor) from the same or an equivalent
MIT-licensed source, keeping the same `{ code, name, rgb }` shape --
`name` stays `""` unless a real source of descriptive names is found.
