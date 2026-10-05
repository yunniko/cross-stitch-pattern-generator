import { pageLetter, type PageRange } from "@/lib/export/a4-layout";

/**
 * Where the pages of a paged export fall on the chart (G-095 M5): each page's own stitches outlined, over the chart
 * in the Export workspace, with the letter the printed A4 page carries (the PDF's pages carry none, so none is shown). With an overlap the outlines overlap by that many stitches, which is the overlap.
 *
 * It sits beside the chart's frame as the crop frame does, and takes no press: the chart under it pans and zooms as ever.
 */
export function PageCuts({ pages, cellSize, lettered }: { pages: readonly PageRange[]; cellSize: number; lettered: boolean }) {
  return (
    <div className="pointer-events-none absolute top-px left-px" data-testid="page-cuts" aria-hidden="true">
      {pages.map((page, index) => (
        <div
          key={index}
          data-page={index + 1}
          className="absolute rounded-[1px] border border-dashed border-accent"
          style={{
            left: page.startX * cellSize,
            top: page.startY * cellSize,
            width: (page.endX - page.startX) * cellSize,
            height: (page.endY - page.startY) * cellSize,
          }}
        >
          {lettered && (
            <span className="absolute top-1 right-1 rounded bg-accent px-1.5 py-px font-mono text-[11px] leading-4 text-on-accent">
              {pageLetter(index)}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
