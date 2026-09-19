import type { PDFContentStream, PDFPage, PDFRef } from "pdf-lib";

/**
 * Releases a finished page's drawing before the document is saved (G-046 M2, D169).
 *
 * pdf-lib holds every page's operators as objects until `save()`: about eleven per stitch — a fill and a symbol — which
 * reached 1.68 GB for a 1000-stitch Pattern Keeper PDF against a worker's 1048 MB heap (D155). Replacing a finished
 * page's content stream with the deflated stream `save()` would have written anyway — the same bytes, at the same
 * object number — lets those objects go, so the heap holds one page's operators however large the chart.
 *
 * pdf-lib 1.17.1 keeps the stream on two private fields. tests/unit/pdf-page-flush.spec.ts fails if an upgrade moves
 * them, rather than letting the flush become a silent no-op while memory grows back.
 */
interface PageInternals {
  contentStream?: PDFContentStream;
  contentStreamRef?: PDFRef;
}

/** Call only once a page is completely drawn: anything pushed to it afterwards would start a second content stream. */
export function flushFinishedPage(page: PDFPage): void {
  const internals = page as unknown as PageInternals;
  const stream = internals.contentStream;
  const ref = internals.contentStreamRef;
  if (!stream || !ref) return; // nothing was drawn on this page
  const { context } = page.doc;
  context.assign(ref, context.flateStream(stream.getUnencodedContents()));
  internals.contentStream = undefined;
  internals.contentStreamRef = undefined;
}
