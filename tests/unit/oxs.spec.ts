import { describe, expect, it } from "vitest";
import { looksLikeOxs, oxsImportNotice, parseOxs, parseThreadNumber, serializeOxs, summarizeOxsImport } from "@/lib/editor/oxs";
import { readXmlTags, type XmlTag } from "@/lib/editor/oxs-xml";
import { formatThreadName, THREAD_BRANDS } from "@/lib/threads/thread-brands";
import { EMPTY_CELL, MAX_STITCHES, type PaletteColor, type RGB, type StitchPattern, type ThreadSwatchRef } from "@/lib/types";

/**
 * G-028 M1: OXS import and export (D119). Every fixture here is self-authored; the real files studied are described in
 * docs/reviews/2026-09-13-oxs-format-evidence.md and are not in the repository.
 */

function makePattern(
  colors: Array<{ rgb: RGB; name: string; source?: ThreadSwatchRef }>,
  width: number,
  height: number,
  cells: number[],
  extra: Partial<StitchPattern> = {}
): StitchPattern {
  const counts = colors.map((_, i) => cells.filter((c) => c === i).length);
  const palette: PaletteColor[] = colors.map((c, i) => {
    const color: PaletteColor = { index: i, rgb: c.rgb, symbol: ["×", "●", "A", "7"][i], name: c.name, count: counts[i] };
    return c.source ? { ...color, source: c.source } : color;
  });
  return { width, height, cellPalette: Uint8Array.from(cells), palette, isLandscape: width >= height, ...extra };
}

function tagsOf(text: string): XmlTag[] {
  const tags: XmlTag[] = [];
  readXmlTags(text, (tag) => tags.push(tag));
  return tags;
}

const dmc = (code: string) => THREAD_BRANDS.dmc.colors.find((t) => t.code === code)!;

/** A chart in the shape real writers produce, with sections given as raw XML. */
function chart({
  properties = 'chartwidth="3" chartheight="2"',
  palette = "",
  full = "",
  part = "",
  back = "",
  objects = "",
  comments = "",
  extra = "",
}: Record<string, string>): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<chart>
<properties ${properties}/>
<palette>${palette}</palette>
<fullstitches>${full}</fullstitches>
${part ? `<partstitches>${part}</partstitches>` : ""}
${back ? `<backstitches>${back}</backstitches>` : ""}
${objects ? `<ornaments_inc_knots_and_beads>${objects}</ornaments_inc_knots_and_beads>` : ""}
${comments ? `<commentboxes>${comments}</commentboxes>` : ""}
${extra}
</chart>`;
}

const CLOTH = '<palette_item index="0" number="cloth" name="cloth" color="FFFFFF"/>';
const ONE_COLOR = { palette: CLOTH + '<palette_item index="1" name="A" color="111111"/>', full: '<stitch x="0" y="0" palindex="1"/>' };

describe("serializeOxs", () => {
  it("writes the cloth at index 0, each colour at its position plus one, 0-based stitches and every section", () => {
    const pattern = makePattern(
      [
        { rgb: [200, 30, 40], name: "Warm red" },
        { rgb: [10, 20, 30], name: "Ink" },
      ],
      3,
      2,
      [0, EMPTY_CELL, 1, 1, 0, EMPTY_CELL],
      { name: 'Tom & "Jerry" <3' }
    );
    const tags = tagsOf(serializeOxs(pattern, { authorName: "Jo", aidaCount: 16 }));
    const byName = (name: string) => tags.filter((t) => t.name === name);

    expect(byName("properties")[0].attributes).toMatchObject({
      oxs: "1.0",
      chartwidth: "3",
      chartheight: "2",
      charttitle: 'Tom & "Jerry" <3',
      author: "Jo",
      stitchesperinch: "16",
      stitchesperinch_y: "16",
      palettecount: "2",
    });
    expect(byName("palette_item").map((t) => [t.attributes.index, t.attributes.number, t.attributes.name, t.attributes.color])).toEqual([
      ["0", "cloth", "cloth", "FFFFFF"],
      ["1", "", "Warm red", "C81E28"],
      ["2", "", "Ink", "0A141E"],
    ]);
    expect(byName("stitch").map((t) => [t.attributes.x, t.attributes.y, t.attributes.palindex])).toEqual([
      ["0", "0", "1"],
      ["2", "0", "2"],
      ["0", "1", "2"],
      ["1", "1", "1"],
    ]);
    for (const section of ["partstitches", "backstitches", "ornaments_inc_knots_and_beads", "commentboxes"])
      expect(byName(section)).toHaveLength(1);
  });

  it("round-trips a full-range pattern: size, empty cells, colours and names (symbols are reassigned)", () => {
    const pattern = makePattern(
      [
        { rgb: [200, 30, 40], name: "Warm red" },
        { rgb: [10, 20, 30], name: "Ink" },
        { rgb: [240, 240, 200], name: "Cream & butter" },
      ],
      4,
      3,
      [0, 1, 2, EMPTY_CELL, 2, 2, EMPTY_CELL, 0, 1, 1, 0, 2],
      { name: "Round trip" }
    );
    const { pattern: back, report } = parseOxs(serializeOxs(pattern));
    expect([back.width, back.height]).toEqual([4, 3]);
    expect(Array.from(back.cellPalette)).toEqual(Array.from(pattern.cellPalette));
    expect(back.palette.map((c) => [c.rgb, c.name, c.count])).toEqual(pattern.palette.map((c) => [c.rgb, c.name, c.count]));
    expect(back.name).toBe("Round trip");
    expect(back.threadBrand).toBeUndefined();
    expect(report).toMatchObject({
      approximatedPartStitches: 0,
      droppedLines: {},
      droppedObjects: {},
      unknownElements: {},
      unusedPaletteEntries: 0,
      stitchesPerInch: 14,
    });
  });

  it("round-trips a DMC pattern as DMC thread numbers with the file's colours, keeping the brand and thread names", () => {
    const pattern = makePattern(
      [
        { rgb: dmc("310").rgb, name: formatThreadName(dmc("310")), source: { brand: "dmc", code: "310" } },
        { rgb: [190, 20, 40], name: formatThreadName(dmc("321")), source: { brand: "dmc", code: "321" } },
      ],
      2,
      1,
      [0, 1],
      { threadBrand: "dmc" }
    );
    const text = serializeOxs(pattern);
    expect(
      tagsOf(text)
        .filter((t) => t.name === "palette_item")
        .map((t) => t.attributes.number)
    ).toEqual(["cloth", "DMC 310", "DMC 321"]);
    const { pattern: back } = parseOxs(text);
    expect(back.threadBrand).toBe("dmc");
    expect(back.palette.map((c) => [c.name, c.rgb])).toEqual(pattern.palette.map((c) => [c.name, c.rgb]));
  });

  it("exports custom colours named like the cloth or a thread code without them being read back as either", () => {
    const pattern = makePattern(
      [
        { rgb: [250, 250, 250], name: "cloth" },
        { rgb: [5, 5, 5], name: "DMC 310" },
      ],
      2,
      1,
      [0, 1]
    );
    const { pattern: back, report } = parseOxs(serializeOxs(pattern));
    expect(back.palette.map((c) => c.name)).toEqual(["cloth", "DMC 310"]);
    expect(back.threadBrand).toBeUndefined();
    expect(report.clothStitches).toBe(0);
  });
});

describe("parseOxs", () => {
  it("reads a file shaped like real writers' output: no cloth entry, any attribute order, chatTitle, spaced numbers, lower-case hex, placeholders", () => {
    const text = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<chart>
<properties chatTitle="Butterflies " chartheight="2" chartwidth="2" palettecount="2"/>
<palette>
<palette_item color="000000" index="1" name="Black" number="DMC    310" strands="2"/>
<palette_item color="c72b3b" index="2" name="Red" number="DMC  321" strands="2"/>
</palette>
<fullstitches>
<stitch marked="false" palindex="1" x="0" y="0"/>
<stitch marked="true" palindex="2" x="1" y="1"/>
</fullstitches>
<partstitches><partstitch /></partstitches>
<ornaments_inc_knots_and_beads><object /></ornaments_inc_knots_and_beads>
</chart>`;
    expect(looksLikeOxs(text)).toBe(true);
    const { pattern, report } = parseOxs(text);
    expect(pattern.name).toBe("Butterflies");
    expect(Array.from(pattern.cellPalette)).toEqual([0, EMPTY_CELL, EMPTY_CELL, 1]);
    expect(pattern.palette.map((c) => [c.name, c.rgb])).toEqual([
      [formatThreadName(dmc("310")), [0, 0, 0]],
      [formatThreadName(dmc("321")), [199, 43, 59]],
    ]);
    expect(pattern.threadBrand).toBe("dmc");
    expect(report).toMatchObject({
      approximatedPartStitches: 0,
      droppedObjects: {},
      unknownElements: {},
      unreadableStitches: 0,
      completionMarks: 1,
    });
    expect(new Set(pattern.palette.map((c) => c.symbol)).size).toBe(2);
  });

  it("approximates part stitches with their first colour, falls back only past the cloth, and lets full stitches win whatever the section order", () => {
    const text = chart({
      palette: CLOTH + '<palette_item index="1" name="Blue" color="0000FF"/><palette_item index="2" name="Green" color="00FF00"/>',
      part: [
        '<partstitch x="0" y="0" palindex1="0" palindex2="2" direction="1"/>',
        '<partstitch x="1" y="0" palindex1="1" palindex2="2" direction="3"/>',
        '<partstitch x="1" y="0" palindex1="2" palindex2="0" direction="4"/>',
        '<partstitch x="2" y="0" palindex1="7" palindex2="2" direction="2"/>',
        '<partstitch x="2" y="1" palindex1="1" palindex2="0" direction="2"/>',
      ].join(""),
      objects: '<object x1="2" y1="1" palindex="2" objecttype="fullcross"/>',
    });
    const { pattern, report } = parseOxs(text);
    const at = (x: number, y: number) => pattern.palette[pattern.cellPalette[y * 3 + x]]?.name;
    expect([at(0, 0), at(1, 0), at(2, 0), at(2, 1)]).toEqual(["Green", "Blue", undefined, "Green"]);
    expect(report.approximatedPartStitches).toBe(2);
    expect(report.twoColorPartStitches).toBe(1);
    expect(report.hiddenPartStitches).toBe(2);
    expect(report.unreadableStitches).toBe(1);
  });

  it("imports grid-aligned full crosses exactly, approximates off-grid ones and part-type objects, and counts everything else by type", () => {
    const text = chart({
      palette:
        CLOTH +
        '<palette_item index="1" name="Rose" color="FF8080"/><palette_item index="2" name="Leaf" color="208020"/><palette_item index="3" name="Gold" color="D4AF37"/>',
      objects: [
        '<object x1="0" y1="0" palindex="1" objecttype="fullcross"/>',
        '<object x1="1.5" y1="0" palindex="2" objecttype="fullcross"/>',
        '<object x1="2.5" y1="0.5" palindex="2" objecttype="tent"/>',
        '<object x1="2" y1="1" palindex="3" objecttype="knot"/>',
        '<object x1="2" y1="1" palindex="3" objecttype="knot"/>',
        '<object x1="1" y1="1" palindex="3" objecttype="bead3mm"/>',
      ].join(""),
      back: '<backstitch x1="0" y1="0" x2="2" y2="2" palindex="1" objecttype="backstitch"/><backstitch x1="0" y1="0" x2="1" y2="1" palindex="1" objecttype="daisy"/>',
      comments: '<commentbox boxleft="0" boxtop="0" boxwidth="3" boxheight="1" boxwords="Start here"/>',
    });
    const { pattern, report } = parseOxs(text);
    expect(pattern.palette.map((c) => [c.name, c.count])).toEqual([
      ["Rose", 1],
      ["Leaf", 2],
    ]);
    expect(report.approximatedPartStitches).toBe(2);
    expect(report.droppedObjects).toEqual({ knot: 2, bead3mm: 1 });
    // A straight corner-to-corner backstitch is imported from G-073 on; the daisy still has no representation.
    expect(report.droppedLines).toEqual({ daisy: 1 });
    expect(pattern.backstitch).toEqual([{ x1: 0, y1: 0, x2: 2, y2: 2, paletteIndex: 0 }]);
    expect(report.droppedCommentBoxes).toBe(1);
    expect(report.colorsOnlyInDroppedContent).toBe(1);
    expect(report.unusedPaletteEntries).toBe(0);
  });

  it("reports what the pattern can't keep: completion marks, cloth colour, credits, strand counts, blends, unknown elements", () => {
    const text = chart({
      properties: 'chartwidth="3" chartheight="2" author="Jo" copyright="© Jo 2026" instructions="Use two strands"',
      palette:
        '<palette_item index="0" number="cloth" name="cloth" color="1A2B3C"/>' +
        '<palette_item index="1" number="DMC 310" name="Black" color="000000" blendcolor="FFFFFF"/>' +
        '<palette_item index="2" name="Leaf" color="208020" strands="3"><blend number="DMC 310"/><blend number="DMC 321"/></palette_item>' +
        '<palette_item index="3" name="Sky" color="80C0FF" blendcolor="nil" strands="2"/>',
      full: '<stitch x="0" y="0" palindex="1" marked="true"/><stitch x="1" y="0" palindex="2" marked="true"/><stitch x="2" y="0" palindex="3"/><stitch x="0" y="1" palindex="0"/>',
      extra: '<layers><layer name="top"/></layers><fullstitches_extension/>',
    });
    const { pattern, report } = parseOxs(text);
    expect(report).toMatchObject({
      completionMarks: 2,
      clothColor: [26, 43, 60],
      author: "Jo",
      copyright: "© Jo 2026",
      instructions: "Use two strands",
      blendedColors: 2,
      colorsWithOtherStrands: 1,
      clothStitches: 1,
      unknownElements: { layers: 1, layer: 1, fullstitches_extension: 1 },
    });
    // A blended entry is never read as a single DMC thread.
    expect(pattern.threadBrand).toBeUndefined();
    expect(pattern.palette[0].name).toBe("DMC 310 - Black");
  });

  it("ignores a stitch element nested inside an unknown element instead of placing it", () => {
    const text = chart({ ...ONE_COLOR, extra: '<fullstitches_old><stitch x="2" y="1" palindex="1"/></fullstitches_old>' });
    const { pattern, report } = parseOxs(text);
    expect(pattern.palette[0].count).toBe(1);
    expect(report.unknownElements).toEqual({ fullstitches_old: 1, stitch: 1 });
  });

  it("counts stitches outside the chart, on a missing colour or unreadable, and keeps the last of duplicate full stitches", () => {
    const text = chart({
      palette:
        CLOTH +
        '<palette_item index="1" name="A" color="111111"/><palette_item index="2" name="B" color="EEEEEE"/><palette_item index="3" name="C" color="not-a-colour"/><palette_item index="4" name="D" color="444444"/>',
      full: '<stitch x="3" y="0" palindex="1"/><stitch x="0" y="5" palindex="1"/><stitch x="1" y="0" palindex="9"/><stitch x="1" y="1" palindex="3"/><stitch x="2" y="0" palindex="1"/><stitch x="2" y="0" palindex="2"/><stitch x="12junk" y="0" palindex="1"/>',
    });
    const { pattern, report } = parseOxs(text);
    expect(report.outOfGridStitches).toBe(2);
    expect(report.unreadableStitches).toBe(3);
    expect(report.duplicateFullStitches).toBe(1);
    expect(pattern.palette.map((c) => c.name)).toEqual(["B"]);
    expect(report.unusedPaletteEntries).toBe(3);
  });

  it("refuses a file using more than 100 colours, naming the count, but opens one that lists many and uses few", () => {
    const items = (n: number) =>
      Array.from(
        { length: n },
        (_, i) => `<palette_item index="${i + 1}" name="C${i + 1}" color="${(i % 256).toString(16).padStart(2, "0")}8040"/>`
      ).join("");
    const stitches = (n: number) =>
      Array.from({ length: n }, (_, i) => `<stitch x="${i % 20}" y="${Math.floor(i / 20)}" palindex="${i + 1}"/>`).join("");
    const properties = 'chartwidth="20" chartheight="10"';
    expect(() => parseOxs(chart({ properties, palette: CLOTH + items(101), full: stitches(101) }))).toThrow(
      "This OXS file uses 101 colours; this app supports at most 100."
    );
    const { pattern, report } = parseOxs(chart({ properties, palette: CLOTH + items(150), full: stitches(3) }));
    expect(pattern.palette).toHaveLength(3);
    expect(report.unusedPaletteEntries).toBe(147);
  });

  it("keeps each colour's thread identity in its name when the colours aren't all one brand's, and merges repeated threads of a brand", () => {
    const mixed = parseOxs(
      chart({
        palette:
          CLOTH +
          '<palette_item index="1" number="dmc 310" name="Noir" color="000000"/><palette_item index="2" number="Madeira 2400" name="White" color="FFFFFF"/><palette_item index="3" number="" name="" color="808080"/>',
        full: '<stitch x="0" y="0" palindex="1"/><stitch x="1" y="0" palindex="2"/><stitch x="2" y="0" palindex="3"/>',
      })
    );
    expect(mixed.pattern.threadBrand).toBeUndefined();
    expect(mixed.pattern.palette.map((c) => c.name)).toEqual([`DMC 310 - ${dmc("310").name}`, "Madeira 2400 - White", "Color 3"]);

    const repeated = parseOxs(
      chart({
        palette:
          CLOTH +
          '<palette_item index="1" number="DMC 310" name="Black" color="000000"/><palette_item index="2" number="DMC 310" name="Black again" color="010101"/>',
        full: '<stitch x="0" y="0" palindex="1"/><stitch x="1" y="0" palindex="2"/>',
      })
    );
    expect(repeated.pattern.palette).toHaveLength(1);
    expect(repeated.pattern.palette[0].count).toBe(2);
    expect(repeated.report.mergedDuplicateColors).toBe(1);
  });

  it("reports the fabric count, and a different vertical count only when stated", () => {
    expect(
      parseOxs(chart({ ...ONE_COLOR, properties: 'chartwidth="3" chartheight="2" stitchesperinch="18" stitchesperinch_y="18"' })).report
    ).toMatchObject({ stitchesPerInch: 18 });
    expect(
      parseOxs(chart({ ...ONE_COLOR, properties: 'chartwidth="3" chartheight="2" stitchesperinch="18" stitchesperinch_y="18"' })).report
        .stitchesPerInchY
    ).toBeUndefined();
    expect(
      parseOxs(chart({ ...ONE_COLOR, properties: 'chartwidth="3" chartheight="2" stitchesperinch="14" stitchesperinch_y="16"' })).report
    ).toMatchObject({ stitchesPerInch: 14, stitchesPerInchY: 16 });
  });

  it.each([
    [
      "a chart larger than the maximum per side",
      chart({ ...ONE_COLOR, properties: `chartwidth="${MAX_STITCHES + 1}" chartheight="2"` }),
      `larger than the maximum of ${MAX_STITCHES}`,
    ],
    ["a chart without a stated size", chart({ ...ONE_COLOR, properties: 'charttitle="x"' }), "valid chart width and height"],
    ["a file whose root isn't chart", '<?xml version="1.0"?><svg width="1"/>', "isn't an OXS chart"],
    ["a chart with no stitches", chart({ palette: CLOTH }), "no stitches this app can show."],
    [
      "a chart holding only knots and a backstitch it cannot place",
      chart({
        palette: CLOTH + '<palette_item index="1" name="A" color="111111"/>',
        // Half-cell coordinates: a real backstitch, but not one that runs corner to corner, so still dropped.
        back: '<backstitch x1="0.5" y1="0" x2="1" y2="1" palindex="1" objecttype="backstitch"/>',
        objects: '<object x1="0" y1="0" palindex="1" objecttype="knot"/>',
      }),
      "it holds only 1 backstitch line, 1 knot",
    ],
    [
      "a palette listing an index twice",
      chart({ palette: '<palette_item index="1" name="A" color="111111"/><palette_item index="1" name="B" color="222222"/>' }),
      "twice",
    ],
    ["broken XML", "<chart><palette></chart>", "couldn't be read"],
  ])("refuses %s with a clear error", (_label, text, message) => {
    expect(() => parseOxs(text)).toThrow(message);
  });
});

describe("summarizeOxsImport and oxsImportNotice", () => {
  const STANDARD = [11, 14, 16, 18];

  it("describes every kind of loss in plain sentences", () => {
    const { report } = parseOxs(
      chart({
        properties: 'chartwidth="3" chartheight="2" author="Jo" stitchesperinch="14" stitchesperinch_y="16"',
        palette:
          '<palette_item index="0" number="cloth" name="cloth" color="1A2B3C"/><palette_item index="1" name="A" color="111111" strands="1"/><palette_item index="2" name="B" color="EEEEEE" blendcolor="000000"/><palette_item index="3" name="C" color="777777"/>',
        full: '<stitch x="0" y="0" palindex="1" marked="true"/><stitch x="0" y="0" palindex="1"/><stitch x="9" y="9" palindex="1"/><stitch x="1" y="1" palindex="0"/>',
        part: '<partstitch x="1" y="0" palindex1="1" palindex2="2" direction="1"/><partstitch x="0" y="0" palindex1="2" palindex2="0" direction="1"/>',
        back: '<backstitch x1="0" y1="0" x2="1" y2="1" palindex="3" objecttype="backstitch"/>',
        objects: '<object x1="2" y1="1" palindex="1" objecttype="knot"/>',
        comments: '<commentbox boxwords="hi"/>',
        extra: "<layers/>",
      })
    );
    expect(summarizeOxsImport(report)).toEqual([
      "1 part stitch is shown as full stitches (1 of them lost its second colour).",
      "1 part stitch was left out under other stitches.",
      "Not imported: 1 knot.",
      "1 comment box wasn't imported.",
      "1 stitch was marked as done; stitching progress isn't kept.",
      "1 colour uses a strand count other than 2, which isn't kept.",
      "The fabric colour (#1A2B3C) isn't kept.",
      "Not kept from the file: author.",
      "1 stitch in the fabric colour is left empty.",
      "1 stitch lies outside the chart and was left out.",
      "1 cell had more than one full stitch; the last one is kept.",
      "1 unused palette colour was left out.",
      "Unrecognised content was skipped: 1 layers.",
      "The file states 14 stitches per inch across and 16 down; this app uses one count.",
    ]);
  });

  it("applies a fabric count the app offers, keeps the current one otherwise, and says when nothing was lost", () => {
    const clean = parseOxs(chart({ ...ONE_COLOR, properties: 'chartwidth="3" chartheight="2" stitchesperinch="18"' })).report;
    expect(oxsImportNotice(clean, 14, STANDARD)).toEqual({
      text: "Opened the OXS chart. Fabric count set to 18-count, as the file states.",
      aidaCount: 18,
    });
    expect(oxsImportNotice(clean, 18, STANDARD)).toEqual({
      text: "Opened the OXS chart; everything in it came across.",
      aidaCount: undefined,
    });
    const odd = parseOxs(chart({ ...ONE_COLOR, properties: 'chartwidth="3" chartheight="2" stitchesperinch="22"' })).report;
    expect(oxsImportNotice(odd, 14, STANDARD).text).toBe(
      "Opened the OXS chart. The file's fabric count (22) isn't one this app offers; 14-count is kept."
    );
  });
});

describe("helpers", () => {
  it("recognises OXS by its first element, not by extension or text", () => {
    expect(looksLikeOxs('﻿<?xml version="1.0"?>\n<!-- c -->\n<chart>')).toBe(true);
    expect(looksLikeOxs("<chart/>")).toBe(true);
    expect(looksLikeOxs('{"width": 2}')).toBe(false);
    expect(looksLikeOxs('<?xml version="1.0"?><svg/>')).toBe(false);
    expect(looksLikeOxs("<chartx/>")).toBe(false);
  });

  it("parses brand thread numbers with any spacing and case", () => {
    expect(parseThreadNumber("DMC    943")).toEqual({ brand: "dmc", code: "943" });
    expect(parseThreadNumber("anchor 403")).toEqual({ brand: "anchor", code: "403" });
    expect(parseThreadNumber("DMC B5200")).toEqual({ brand: "dmc", code: "B5200" });
    expect(parseThreadNumber("Madeira 2400")).toBeNull();
    expect(parseThreadNumber("cloth")).toBeNull();
  });
});
