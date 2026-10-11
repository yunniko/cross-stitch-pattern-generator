import type { ExportChoice } from "./export-request";

/**
 * What can be exported, as the Export workspace offers it (G-095 M5) and as the feature list names it (G-102): three
 * groups of kinds. A printed kind comes in colour or in black and white; the two are one kind with a switch, not six
 * kinds in a list.
 */

export type Tone = "color" | "bw";
export type PrintFormat = "a4" | "pdf" | "png";

export interface ExportKind {
  /** What it is called. */
  label: string;
  /** What the file is, for someone deciding. */
  note: string;
  /** A printed kind, which has a tone; or one export choice. */
  format?: PrintFormat;
  choice?: ExportChoice;
}

export const EXPORT_KIND_GROUPS: ReadonlyArray<{ heading: string; kinds: readonly ExportKind[] }> = [
  {
    heading: "To print",
    kinds: [
      {
        format: "a4",
        label: "A4 pages (ZIP)",
        note: "The chart cut into printable pages, with a page map, a skein table and a colour key",
      },
      { format: "pdf", label: "PDF for Pattern Keeper", note: "A PDF whose symbols are real text, laid out for the Pattern Keeper app" },
      { format: "png", label: "Full chart PNG", note: "The whole chart as one picture, with its legend" },
    ],
  },
  {
    heading: "A picture",
    kinds: [
      {
        choice: "png-realistic",
        label: "Realistic preview PNG",
        note: "The finished stitching, drawn in the stitch texture chosen for the view",
      },
      { choice: "pixel-art", label: "Pixel art PNG (1 px per stitch)", note: "One pixel a stitch, in the true colours" },
    ],
  },
  {
    heading: "A file",
    kinds: [
      {
        choice: "editable",
        label: "Editable pattern (.json)",
        note: "Everything, to open here again. Save in the bar above makes the same file",
      },
      {
        choice: "oxs",
        label: "OXS chart for other programs (.oxs)",
        note: "Colours, stitches and backstitch for other cross-stitch programs",
      },
      { choice: "palette", label: "Palette file (.json)", note: "The chart's colours, to generate another chart from" },
    ],
  },
];

/** The feature a kind is: `export.a4`, `export.pdf`, `export.png`, `export.png-realistic`, ... */
export function exportKindFeature(kind: ExportKind): string {
  return `export.${kind.format ?? kind.choice}`;
}

/** The feature an export choice asks for, which is what a request for it is checked against. */
export function exportChoiceFeature(choice: ExportChoice | "all"): string {
  if (choice === "all") return "export.all";
  const format = choice.split("-")[0];
  return (choice.endsWith("-color") || choice.endsWith("-bw")) && (format === "a4" || format === "pdf" || format === "png")
    ? `export.${format}`
    : `export.${choice}`;
}
