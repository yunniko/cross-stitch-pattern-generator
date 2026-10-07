import type { ComponentType, ReactNode } from "react";

/**
 * The interface's own icons, by name (G-095, D295): the one set every icon outside a tool is drawn from. A tool supplies its
 * own icon with its definition (`app/tools/`), under the name `tool:<id>`; a skin may replace any of either kind
 * (`app/skin/skin.tsx`). Nothing draws an icon inline any more, which `scripts/check-skin.mjs` holds the interface to.
 *
 * Every icon takes the size it is drawn at as a class and its colour from the text colour around it, so a state (lit,
 * chosen, disabled) is the caller's to show and an icon never names a colour. The one exception is the guide line of the
 * mirror and symmetry icons, which is the chart's own guide colour.
 */

export interface IconProps {
  /** Its size, as a class; each icon has the size it was first drawn at as its default. */
  className?: string;
}

export type IconComponent = ComponentType<IconProps>;

function outline(defaultClass: string, strokeWidth: number, children: ReactNode): IconComponent {
  return function OutlineIcon({ className }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        className={className ?? defaultClass}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };
}

const GUIDE = { stroke: "var(--at-guide)", strokeWidth: 1.4, strokeDasharray: "2 1.5" } as const;

/** A quick mirror: the part that is copied, shaded, in the chart's outline, with the lines it is copied across. */
function mirror(source: ReactNode, lines: { vertical?: boolean; horizontal?: boolean; diagonal?: boolean }): IconComponent {
  return function MirrorIcon({ className }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" className={className ?? "h-3.5 w-3.5"} fill="none" aria-hidden="true">
        <g fill="currentColor" opacity="0.45">
          {source}
        </g>
        <rect x="4" y="4" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="1.4" opacity="0.6" />
        {lines.vertical && <line x1="12" y1="4" x2="12" y2="20" {...GUIDE} />}
        {lines.horizontal && <line x1="4" y1="12" x2="20" y2="12" {...GUIDE} />}
        {lines.diagonal && <line x1="4" y1="4" x2="20" y2="20" {...GUIDE} />}
      </svg>
    );
  };
}

/** A symmetry axis: the chart's outline with the guide line that symmetry paints along it. */
function axis(x1: number, y1: number, x2: number, y2: number): IconComponent {
  return function AxisIcon({ className }: IconProps) {
    return (
      <svg viewBox="0 0 24 24" className={className ?? "h-3.5 w-3.5"} fill="none" strokeLinecap="round" aria-hidden="true">
        <rect x="4" y="4" width="16" height="16" rx="1" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--at-guide)" strokeWidth="2.2" />
      </svg>
    );
  };
}

function flip(vertical: boolean): IconComponent {
  return outline(
    "h-4 w-4",
    1.6,
    <>
      {vertical ? (
        <line x1="3" y1="12" x2="21" y2="12" strokeDasharray="3 2" />
      ) : (
        <line x1="12" y1="3" x2="12" y2="21" strokeDasharray="3 2" />
      )}
      {vertical ? <path d="M7 9.5 12 5l5 4.5z" /> : <path d="M9.5 7 5 12l4.5 5z" />}
      {vertical ? (
        <path d="M7 14.5 12 19l5-4.5z" fill="currentColor" opacity="0.35" />
      ) : (
        <path d="M14.5 7 19 12l-4.5 5z" fill="currentColor" opacity="0.35" />
      )}
    </>
  );
}

function rotate(clockwise: boolean): IconComponent {
  return outline(
    "h-4 w-4",
    1.6,
    <g transform={clockwise ? undefined : "scale(-1 1) translate(-24 0)"}>
      <path d="M5 12a7 7 0 1 1 2.5 5.4" />
      <path d="M5 6.5V12h5.5" />
    </g>
  );
}

/** Four stitches of a sprite: the import that keeps every pixel. */
function PixelArtIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-[22px] w-[22px]"} aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1" fill="currentColor" opacity="0.85" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

export const INTERFACE_ICONS = {
  new: outline(
    "h-[18px] w-[18px]",
    1.7,
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" />
      <path d="M12 8.5v7M8.5 12h7" />
    </>
  ),
  /** Preferences: what is set once. */
  settings: outline(
    "h-[18px] w-[18px]",
    1.7,
    <>
      <path d="M4 7h10M18 7h2M4 12h3M11 12h9M4 17h12M20 17h0" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="18" cy="17" r="2" />
    </>
  ),
  commands: outline(
    "h-[18px] w-[18px]",
    1.7,
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l5 5" />
    </>
  ),
  "mirror-left-half": mirror(<rect x="4" y="4" width="8" height="16" />, { vertical: true }),
  "mirror-upper-half": mirror(<rect x="4" y="4" width="16" height="8" />, { horizontal: true }),
  "mirror-upper-left-corner": mirror(<rect x="4" y="4" width="8" height="8" />, { vertical: true, horizontal: true }),
  "mirror-upper-left-half-corner": mirror(<polygon points="4,4 4,12 12,12" />, { vertical: true, horizontal: true, diagonal: true }),
  "axis-vertical": axis(12, 3, 12, 21),
  "axis-horizontal": axis(3, 12, 21, 12),
  "axis-diagonal": axis(4, 4, 20, 20),
  "axis-antidiagonal": axis(20, 4, 4, 20),
  /** Isolate, and a thread's own light. */
  eye: outline(
    "h-[15px] w-[15px]",
    1.7,
    <>
      <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  lock: outline(
    "h-[15px] w-[15px]",
    1.7,
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  "lock-open": outline(
    "h-[15px] w-[15px]",
    1.7,
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-2" />
    </>
  ),
  photo: outline(
    "h-[15px] w-[15px]",
    1.7,
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.8" />
      <path d="M4 18l5-5 4 4 3-3 4 4" />
    </>
  ),
  grid: outline(
    "h-[22px] w-[22px]",
    1.6,
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </>
  ),
  "pixel-art": PixelArtIcon,
  folder: outline(
    "h-[22px] w-[22px]",
    1.6,
    <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h5l2 3h6A1.5 1.5 0 0 1 20 8.5v10A1.5 1.5 0 0 1 18.5 20h-13A1.5 1.5 0 0 1 4 18.5Z" />
  ),
  download: outline(
    "h-[15px] w-[15px]",
    1.7,
    <>
      <path d="M12 4v10" />
      <path d="M8 11l4 4 4-4" />
      <path d="M4 17.5V19a1.5 1.5 0 0 0 1.5 1.5h13A1.5 1.5 0 0 0 20 19v-1.5" />
    </>
  ),
  /** Keeps a try while the others come and go. */
  pin: outline(
    "h-3.5 w-3.5",
    1.7,
    <>
      <path d="M9 4h6l-1 6 3 3H7l3-3z" />
      <path d="M12 13v7" />
    </>
  ),
  delete: outline(
    "h-3.5 w-3.5",
    1.7,
    <>
      <path d="M5 7h14" />
      <path d="M10 7V5h4v2" />
      <path d="M7 7l1 12h8l1-12" />
    </>
  ),
  copy: outline(
    "h-4 w-4",
    1.6,
    <>
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H5.5A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
    </>
  ),
  paste: outline(
    "h-4 w-4",
    1.6,
    <>
      <path d="M9 4h6v3H9z" />
      <path d="M9 5.5H6.5A1.5 1.5 0 0 0 5 7v12.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15" />
    </>
  ),
  duplicate: outline(
    "h-4 w-4",
    1.6,
    <>
      <rect x="4" y="4" width="11" height="11" rx="1.5" />
      <rect x="9" y="9" width="11" height="11" rx="1.5" />
    </>
  ),
  "fill-piece": outline(
    "h-4 w-4",
    1.6,
    <>
      <rect x="4" y="4" width="16" height="16" rx="1.5" />
      <path d="M7 14.5 14.5 7M7 18.5 18.5 7M10.5 19 19 10.5" />
    </>
  ),
  "flip-horizontal": flip(false),
  "flip-vertical": flip(true),
  "rotate-right": rotate(true),
  "rotate-left": rotate(false),
  "crop-to-piece": outline(
    "h-4 w-4",
    1.6,
    <>
      <path d="M7 2.5V17h14" />
      <path d="M3 7h14v14.5" />
    </>
  ),
  cancel: outline(
    "h-4 w-4",
    1.6,
    <>
      <circle cx="12" cy="12" r="8.5" />
      <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
      <line x1="15.5" y1="8.5" x2="8.5" y2="15.5" />
    </>
  ),
  apply: outline(
    "h-4 w-4",
    1.6,
    <>
      <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="4 3" />
      <path d="M8.5 12.5 11 15l4.5-5.5" />
    </>
  ),
  // The selection modes (G-116): the selection's dashed box alone, or with what a new area does to it.
  "select-replace": outline("h-3.5 w-3.5", 1.8, <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="4 3" />),
  "select-add": outline(
    "h-3.5 w-3.5",
    1.8,
    <>
      <rect x="3" y="3" width="13" height="13" rx="1" strokeDasharray="3.5 2.5" />
      <path d="M18.5 14v8M14.5 18h8" />
    </>
  ),
  "select-subtract": outline(
    "h-3.5 w-3.5",
    1.8,
    <>
      <rect x="3" y="3" width="13" height="13" rx="1" strokeDasharray="3.5 2.5" />
      <path d="M14.5 18.5h8" />
    </>
  ),
  /** Everything but the selection: the chart's edge solid, the selection's dashed box inside it hollow. */
  "invert-selection": outline(
    "h-4 w-4",
    1.6,
    <>
      <path d="M3 3h18v18H3z M8 8v8h8V8z" fill="currentColor" fillOpacity={0.3} fillRule="evenodd" />
      <rect x="8" y="8" width="8" height="8" strokeDasharray="2.5 2" />
    </>
  ),
  /**
   * How a click finds its region (G-118, the Region switches as pictures). One language for all four: a filled stitch is in
   * the region, a hollow one is not. Diagonal: the eight around the middle; Edges only: the four that share a side.
   */
  "region-diagonal": outline(
    "h-3.5 w-3.5",
    1.5,
    <g fill="currentColor">
      <rect x="2.5" y="2.5" width="5.5" height="5.5" rx="0.8" />
      <rect x="9.25" y="2.5" width="5.5" height="5.5" rx="0.8" />
      <rect x="16" y="2.5" width="5.5" height="5.5" rx="0.8" />
      <rect x="2.5" y="9.25" width="5.5" height="5.5" rx="0.8" />
      <rect x="9.25" y="9.25" width="5.5" height="5.5" rx="0.8" />
      <rect x="16" y="9.25" width="5.5" height="5.5" rx="0.8" />
      <rect x="2.5" y="16" width="5.5" height="5.5" rx="0.8" />
      <rect x="9.25" y="16" width="5.5" height="5.5" rx="0.8" />
      <rect x="16" y="16" width="5.5" height="5.5" rx="0.8" />
    </g>
  ),
  "region-edges": outline(
    "h-3.5 w-3.5",
    1.5,
    <>
      <g fill="currentColor">
        <rect x="9.25" y="2.5" width="5.5" height="5.5" rx="0.8" />
        <rect x="2.5" y="9.25" width="5.5" height="5.5" rx="0.8" />
        <rect x="9.25" y="9.25" width="5.5" height="5.5" rx="0.8" />
        <rect x="16" y="9.25" width="5.5" height="5.5" rx="0.8" />
        <rect x="9.25" y="16" width="5.5" height="5.5" rx="0.8" />
      </g>
      <g strokeWidth="1.1">
        <rect x="3" y="3" width="4.5" height="4.5" rx="0.8" />
        <rect x="16.5" y="3" width="4.5" height="4.5" rx="0.8" />
        <rect x="3" y="16.5" width="4.5" height="4.5" rx="0.8" />
        <rect x="16.5" y="16.5" width="4.5" height="4.5" rx="0.8" />
      </g>
    </>
  ),
  /** A whole stitch and a half stitch of one colour: Color and type takes only the whole one, Color only takes both. */
  "region-color-and-type": outline(
    "h-3.5 w-3.5",
    1.6,
    <>
      <rect x="2" y="6" width="10" height="10" rx="1" fill="currentColor" />
      <path d="M14 16 L22 16 L22 8 Z" />
    </>
  ),
  "region-color-only": outline(
    "h-3.5 w-3.5",
    1.6,
    <>
      <rect x="2" y="6" width="10" height="10" rx="1" fill="currentColor" />
      <path d="M14 16 L22 16 L22 8 Z" fill="currentColor" />
    </>
  ),
  /** A compact control on the quick bar opens its choices (G-118). */
  "chevron-down": outline("h-3 w-3", 2, <path d="m6 9 6 6 6-6" />),
  /** The quick bar's More: what did not fit (G-118). */
  more: outline(
    "h-4 w-4",
    2,
    <>
      <circle cx="5" cy="12" r="0.9" fill="currentColor" />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" />
      <circle cx="19" cy="12" r="0.9" fill="currentColor" />
    </>
  ),
  /** Swap the two drawing colours (X). */
  "swap-colours": outline("h-3.5 w-3.5", 1.8, <path d="M7 4 4 7l3 3M4 7h11a4 4 0 0 1 4 4v1M17 20l3-3-3-3M20 17H9a4 4 0 0 1-4-4v-1" />),
} as const satisfies Record<string, IconComponent>;

export type InterfaceIconName = keyof typeof INTERFACE_ICONS;
