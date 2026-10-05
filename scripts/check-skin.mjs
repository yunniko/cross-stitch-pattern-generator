// Holds the interface to what makes it skinnable (G-095, D295): every colour through a named value of app/globals.css,
// every icon through the one set. Fails, naming the line, when a component reaches past either.
// Usage: node scripts/check-skin.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const ROOT = "app";

/** Files that draw the chart, a picture of a thread or a stitch, or a preview of one: what they colour is content, not interface. */
const DRAWS_CONTENT = new Map([
  ["app/chart-scene.ts", "the chart's own guide colour, drawn on the chart"],
  ["app/editor-geometry.ts", "marks drawn over the chart, which must read on any chart whatever the skin"],
  ["app/components/crop-overlay.tsx", "the crop frame and the dimming outside it, drawn over the chart"],
  ["app/components/colors-dock.tsx", "a symbol on a thread's own colour, and the grey a new colour starts from"],
  ["app/components/palette-setup.tsx", "the grey a new colour starts from"],
  ["app/components/stamp-painter.tsx", "the four tones a dither stamp is painted in"],
  ["app/components/text-pane.tsx", "the lettering preview, drawn in thread colours"],
  ["app/components/rulers.tsx", "reads the named values; the literals are what it falls back to before the page has styles"],
]);

/** Where an icon may be drawn: the set, the tools' own icons, and the picture of a stitch type (a picture of content). */
const DRAWS_ICONS = new Set(["app/skin/icons.tsx", "app/tools/icons.tsx", "app/tools/options.tsx"]);

const PALETTE_CLASS =
  /(?<![\w-])(?:bg|text|border|ring|outline|decoration|fill|stroke|accent|caret|from|via|to|divide|placeholder|shadow)-(?:white|black|zinc|slate|gray|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|pink|rose|fuchsia)(?:-\d+)?(?![\w-])/;
const LITERAL_COLOUR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-zA-Z])|\brgba?\(\s*\d/;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.tsx?$/.test(name)) yield path;
  }
}

const problems = [];
for (const path of files(ROOT)) {
  const file = relative(".", path).split(sep).join("/");
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, index) => {
    // A comment may name a colour; only code can use one.
    const code = line.replace(/\/\/.*$/, "").replace(/\{\/\*.*?\*\/\}/g, "");
    if (/^\s*(\*|\/\*)/.test(code)) return;
    const at = `${file}:${index + 1}`;
    const palette = code.match(PALETTE_CLASS);
    if (palette) problems.push(`${at}  "${palette[0]}" names a palette colour; use a named value (bg-surface, text-danger, ...).`);
    if (!DRAWS_CONTENT.has(file) && LITERAL_COLOUR.test(code)) {
      problems.push(`${at}  a colour written out; use a named value, or list the file in DRAWS_CONTENT with the reason.`);
    }
    if (!DRAWS_ICONS.has(file) && /<svg[\s>]/.test(code)) {
      problems.push(`${at}  an icon drawn in place; add it to app/skin/icons.tsx and draw it with <SkinIcon>.`);
    }
  });
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  console.error(`check-skin: ${problems.length} problem${problems.length === 1 ? "" : "s"}`);
  process.exit(1);
}
console.log("check-skin: ok (colours by name, icons from the set)");
