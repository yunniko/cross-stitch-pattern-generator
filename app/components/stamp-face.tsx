import type { ReactNode } from "react";
import { stampFacts, stampPreviewHref } from "@/lib/stamps/stamp";

/**
 * A stamp as a card shows it (G-119), in the account's Stamps and in the editor's gallery alike: its square preview, with
 * whatever the card puts over it, then its name, its facts and its threads.
 */

export interface StampFaceStamp {
  id: string;
  name: string;
  width: number;
  height: number;
  colors: number;
  swatches: readonly string[];
  backstitch: boolean;
  version: number;
}

/** The threads shown as swatches before the rest are counted. */
const SWATCHES_SHOWN = 8;

export function StampPreview({ stamp, children }: { stamp: StampFaceStamp; children?: ReactNode }) {
  return (
    // A span, not a div: in the editor's gallery the whole card is a button, which may hold only phrasing content.
    <span className="at-well relative flex aspect-square items-center justify-center border-b border-line p-1.5">
      {/* Scaled up to fill the square at its own proportions: the image has one pixel per stitch, so a size cap alone left a speck. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- one pixel per stitch shown pixelated, private to its owner; nothing to optimise. */}
      <img
        src={stampPreviewHref(stamp.id, stamp.version)}
        alt={`Preview of ${stamp.name}`}
        data-testid="stamp-preview"
        className="h-full w-full object-contain [image-rendering:pixelated]"
      />
      {children}
    </span>
  );
}

export function StampFacts({ stamp }: { stamp: StampFaceStamp }) {
  const more = stamp.swatches.length - SWATCHES_SHOWN;
  return (
    <>
      <span className="font-mono text-[11px] text-muted" data-testid="stamp-facts">
        {stampFacts(stamp)}
      </span>
      <span className="flex flex-wrap items-center gap-1" aria-hidden="true">
        {stamp.swatches.slice(0, SWATCHES_SHOWN).map((colour, i) => (
          <span key={i} className="h-3 w-3 rounded-sm border border-line" style={{ background: colour }} />
        ))}
        {more > 0 && <span className="font-mono text-[10px] text-faint">+{more}</span>}
      </span>
    </>
  );
}
