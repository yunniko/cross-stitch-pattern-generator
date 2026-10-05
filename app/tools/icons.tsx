// The tools' icons, drawn like the rest of the interface's: a 24-box outline. Each tool module names its own (G-092).

const TOOL_ICON_PROPS = {
  viewBox: "0 0 24 24",
  className: "h-[19px] w-[19px]",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function BrushIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M17.4 3.6l3 3-8.2 8.2-3-3z" />
      <path d="M9.2 11.8 7.6 16.4l4.6-1.6" />
      <path d="M3.4 17.6l3.2 3.2" />
      <path d="M6.6 17.6l-3.2 3.2" />
    </svg>
  );
}

export function FillIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M6 7A6 4 0 0 1 18 7" />
      <path d="M5.5 7 6.9 18.3A1.6 1.6 0 0 0 8.5 20h7a1.6 1.6 0 0 0 1.6-1.7L18.5 7Z" />
    </svg>
  );
}

export function SelectIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="4 3" />
    </svg>
  );
}

/** The same line with its ends ringed: those are the zones that grab an end. */
export function BackstitchSelectIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M6 18 18 6" strokeWidth={2.6} />
      <circle cx="6" cy="18" r="2.8" />
      <circle cx="18" cy="6" r="2.8" />
    </svg>
  );
}

/** A line running corner to corner across a cell, with the corners it can land on marked. */
export function BackstitchIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M4 20 13 11l7-7" strokeWidth={2.6} />
      <circle cx="4" cy="20" r="1.6" fill="currentColor" />
      <circle cx="20" cy="4" r="1.6" fill="currentColor" />
    </svg>
  );
}

/** The lasso loop again, this time solid and shaded: the area it encloses is what gets painted. */
export function LassoFillIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M12 4c4.4 0 8 2.4 8 5.5S16.4 15 12 15 4 12.6 4 9.5 7.6 4 12 4Z" fill="currentColor" fillOpacity={0.25} />
      <path d="M8.6 14.4v3.1a2 2 0 1 0 2 2" />
    </svg>
  );
}

/** A dashed loop closing on itself, with the tail it was drawn from: the shape a lasso leaves behind. */
export function LassoIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M12 4c4.4 0 8 2.4 8 5.5S16.4 15 12 15 4 12.6 4 9.5 7.6 4 12 4Z" strokeDasharray="3 2.5" />
      <path d="M8.6 14.4v3.1a2 2 0 1 0 2 2" />
    </svg>
  );
}

export function CropIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M7 3v14a1 1 0 0 0 1 1h13" />
      <path d="M3 7h14a1 1 0 0 1 1 1v13" />
    </svg>
  );
}

export function MoveIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <line x1="12" y1="3" x2="12" y2="21" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M9 6l3-3 3 3" />
      <path d="M9 18l3 3 3-3" />
      <path d="M6 9l-3 3 3 3" />
      <path d="M18 9l3 3-3 3" />
    </svg>
  );
}

export function LineIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <line x1="4" y1="20" x2="20" y2="4" />
      <circle cx="4" cy="20" r="1.6" fill="currentColor" />
      <circle cx="20" cy="4" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function RectIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <rect x="4" y="6" width="16" height="12" rx="1" />
    </svg>
  );
}

export function OvalIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <ellipse cx="12" cy="12" rx="8" ry="6" />
    </svg>
  );
}

export function PanIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M7 11V6a1.5 1.5 0 0 1 3 0v4" />
      <path d="M10 10.5V5a1.5 1.5 0 0 1 3 0v5.5" />
      <path d="M13 10.5V6a1.5 1.5 0 0 1 3 0v6" />
      <path d="M16 12V9a1.5 1.5 0 0 1 3 0v6c0 3.5-2 6-6 6h-1c-3 0-4.5-1-6-3l-2.2-3.3c-.6-.9 0-2.2 1.2-2.2.6 0 1.1.3 1.4.8L7 16" />
    </svg>
  );
}

export function ZoomIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <line x1="20" y1="20" x2="15.5" y2="15.5" />
    </svg>
  );
}

/** A capital T, as the letter a font would set. */
export function TextIcon() {
  return (
    <svg {...TOOL_ICON_PROPS}>
      <path d="M5 7V5h14v2" />
      <path d="M12 5v14" />
      <path d="M9 19h6" />
    </svg>
  );
}
