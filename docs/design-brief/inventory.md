# Working inventory of controls (G-088 M1)

Raw, machine-extracted list of every labelled or constrained element in the interface code, per file with line numbers, so the feature documents can be checked against it. It is a checklist, not a deliverable: it is deleted at M5 once each line is accounted for in a document. The accounts, the admin area and the profile (`account/`, `auth/`, `app/account`, `app/admin`, `app/login`, `app/register`) are out of scope.

## app/components/canvas-color-field.tsx (70 lines, 5 entries)

- 36: `aria-label="Canvas color"`
- 50: `role="dialog"`
- 51: `aria-label="Canvas color picker"`
- 56: `type="text"`
- 57: `aria-label="Canvas color hex"`

## app/components/canvas-picker.tsx (63 lines, 7 entries)

- 17: `const CHOICES: Array<{ id: CanvasTextureChoice; label: string }> = [`
- 18: `{ id: CANVAS_TEXTURE_OFF, label: "Off" },`
- 35: `<div role="radiogroup" aria-label="Canvas texture" className="flex flex-wrap gap-2">`
- 42: `role="radio"`
- 43: `aria-checked={selected}`
- 44: `title={id === CANVAS_TEXTURE_OFF ? "Plain canvas colour, no texture" : '${label} canvas texture'}`
- 51: `data-testid={'canvas-swatch-${id}'}`

## app/components/chart-pane.tsx (273 lines, 29 entries)

- 29: `const EDGES: Array<{ key: keyof CanvasResizeDelta; label: string }> = [`
- 30: `{ key: "top", label: "top" },`
- 31: `{ key: "right", label: "right" },`
- 32: `{ key: "bottom", label: "bottom" },`
- 33: `{ key: "left", label: "left" },`
- 47: `title="How big one stitch is printed on the A4 pages, in millimetres. The symbol and the lines grow with it. The full-size chart picture is not affected."`
- 51: `type="number"`
- 52: `aria-label="A4 cell size in millimetres"`
- 53: `min={MIN_EXPORT_CELL_MM}`
- 54: `max={MAX_EXPORT_CELL_MM}`
- 55: `step={0.25}`
- 99: `type="text"`
- 106: `disabled={pattern === null}`
- 107: `aria-label="Pattern name"`
- 119: `type="number"`
- 121: `disabled={pattern === null}`
- 122: `aria-label={label.charAt(0).toUpperCase() + label.slice(1)}`
- 174: `{ value: "in", label: "in" },`
- 175: `{ value: "cm", label: "cm" },`
- 184: `title="Shown behind empty stitches in Color/B&W view and behind the realistic preview. It goes into an exported preview only with Canvas in exported preview tic`
- 192: `title="The cloth under the Stitched view, over the whole viewer, tinted by the canvas colour. Off shows the colour alone."`
- 202: `<div className="flex flex-col gap-1.5" title="The stitch texture of the Stitched view and of the exported realistic preview">`
- 214: `title="On: double-clicking with the Brush fills the whole region under the pointer, as one undo step. Off: a double-click just paints the two stitches you click`
- 218: `type="checkbox"`
- 231: `type="text"`
- 234: `placeholder="(shown on exported charts)"`
- 240: `title="On: the exported realistic preview (alone and inside Export all) sits on the canvas, with its colour and texture, instead of a transparent background. Wi`
- 244: `type="checkbox"`
- 253: `title="How many stitches of overlap the A4/PDF page exports repeat between adjacent pages, so they can be lined up when printed"`

## app/components/color-pair.tsx (79 lines, 10 entries)

- 22: `function swatchColor(pattern: ColorPairProps["pattern"], index: number | null): { label: string; style?: string; empty: boolean } {`
- 23: `if (index === null) return { label: "No thread chosen", empty: false };`
- 24: `if (index === EMPTY_CELL) return { label: "Empty (no stitch)", empty: true };`
- 26: `return { label: color?.name ?? "No thread chosen", style: color ? rgbToHex(color.rgb) : undefined, empty: false };`
- 39: `aria-label={'${isFront ? "Foreground" : "Background"} colour: ${shown.label}'}`
- 40: `aria-pressed={isFront}`
- 41: `title={isFront ? 'Foreground — ${shown.label}' : 'Background — ${shown.label}. Click to draw with it.'}`
- 43: `data-testid={'color-slot-${slot}'}`
- 60: `<div className="relative h-[26px] w-[26px] shrink-0" role="group" aria-label="Drawing colours">`
- 70: `title="Swap the two colours — X"`

## app/components/colors-dock.tsx (572 lines, 21 entries)

- 78: `type="text"`
- 81: `placeholder="Search by code or name…"`
- 82: `aria-label={'Search ${label} threads'}`
- 85: `<div ref={gridRef} data-testid="swatch-grid" className="relative grid max-h-64 grid-cols-10 gap-1 overflow-y-auto p-1">`
- 98: `aria-label={threadLabel}`
- 99: `aria-pressed={compareWith !== undefined ? isCurrent : undefined}`
- 120: `<p data-testid="swatch-comparison" aria-live="polite" className="min-h-[2.5em] text-xs text-muted">`
- 338: `role="dialog"`
- 339: `aria-label={'Change symbol for ${pattern.palette[editingSymbolIndex].name}'}`
- 352: `title={holder && !isCurrent ? 'Swap with ${holder.name}' : undefined}`
- 374: `<div ref={editorPanelRef} role="dialog" aria-label={'Edit color ${current.name}'} className={PANEL}>`
- 381: `{ value: "full" as const, label: "Full range" },`
- 382: `...THREAD_BRAND_IDS.map((brand) => ({ value: brand, label: THREAD_BRANDS[brand].label })),`
- 431: `disabled={!pattern}`
- 439: `<span data-testid="empty-palette-note">`
- 469: `title={`
- 481: `title={`
- 543: `function ThreadLight({ lit, label, title, onToggle }: { lit: boolean; label: string; title: string; onToggle: () => void }) {`
- 551: `aria-pressed={lit}`
- 552: `aria-label={label}`
- 553: `title={title}`

## app/components/confirm-new-chart.tsx (89 lines, 1 entries)

- 37: `role="dialog"`

## app/components/context-bar.tsx (412 lines, 41 entries)

- 25: `const CHART_VIEWS: Array<{ value: ChartView; label: string; title: string }> = [`
- 26: `{ value: "color", label: "Color", title: "The chart in its thread colors" },`
- 27: `{ value: "bw", label: "B&W", title: "The chart in black and white, as it prints" },`
- 28: `{ value: "realistic", label: "Stitched", title: "A realistic preview of the finished stitching" },`
- 56: `const SYMMETRY_TOGGLES: Array<{ axis: SymmetryAxis; label: string; title: string }> = [`
- 57: `{ axis: "vertical", label: "Vertical symmetry", title: "Paint mirrored across the vertical centre line" },`
- 58: `{ axis: "horizontal", label: "Horizontal symmetry", title: "Paint mirrored across the horizontal centre line" },`
- 59: `{ axis: "diagonal", label: "Diagonal symmetry ↘", title: "Paint mirrored across the diagonal from top left to bottom right" },`
- 60: `{ axis: "antidiagonal", label: "Diagonal symmetry ↙", title: "Paint mirrored across the diagonal from top right to bottom left" },`
- 108: `{ value: "outline", label: "Outline", title: "Draw the shape as its outline, as thick as the brush" },`
- 109: `{ value: "filled", label: "Filled", title: "Draw the shape solid. A filled shape is exactly the shape, whatever the brush size" },`
- 113: `{ value: "round", label: "●", title: "Round: the disc that fits the size" },`
- 114: `{ value: "square", label: "■", title: "Square: the whole block" },`
- 170: `<PillButton size="xs" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">`
- 173: `<PillButton size="xs" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y or Ctrl+Shift+Z">`
- 190: `title="Go back to the chart you were editing"`
- 228: `<div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Brush">`
- 231: `aria-label="Brush size in stitches"`
- 234: `title="How many stitches across one press covers"`
- 250: `<div role="radiogroup" aria-label="Stitch type" className="flex items-center gap-0.5 rounded-lg border border-line p-0.5">`
- 255: `role="radio"`
- 256: `aria-checked={stitchKind === kind}`
- 257: `aria-label={STITCH_KIND_LABELS[kind]}`
- 258: `title={STITCH_KIND_LABELS[kind]}`
- 275: `<div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Shape">`
- 283: `<div role="group" aria-label="Symmetry — mirrored drawing" className="flex shrink-0 items-center gap-1.5">`
- 286: `title="While on, every stroke and fill also lands on the mirrored stitches"`
- 297: `disabled={needsSquare}`
- 298: `title={needsSquare ? '${title}. Needs a square canvas.' : title}`
- 299: `aria-label={label}`
- 300: `aria-pressed={symmetry[axis]}`
- 316: `aria-pressed={isolate}`
- 317: `aria-label="Isolate lit threads"`
- 318: `title="Isolate: dim every thread except the ones lit in the Threads list. Stays on while you paint."`
- 341: `aria-pressed={lockTransparency}`
- 342: `aria-label="Lock transparency"`
- 343: `title={`
- 376: `disabled={!pattern.sourceImage}`
- 377: `aria-pressed={photoActive}`
- 378: `aria-label="Show the photo behind the chart"`
- 379: `title={`

## app/components/crash-screen.tsx (87 lines, 2 entries)

- 38: `<div role="alert" data-testid="crash-screen" className="flex min-h-screen items-center justify-center bg-app p-6 font-sans text-ink">`
- 47: `data-testid="crash-message"`

## app/components/dither-preview.tsx (97 lines, 4 entries)

- 69: `data-testid="texture-swatch"`
- 70: `aria-label="Pattern preview"`
- 76: `<div className="flex items-start gap-3" data-testid="dither-preview">`
- 81: `title="Draw the same texture again with the marks in different places"`

## app/components/export-controls.tsx (125 lines, 18 entries)

- 13: `const EXPORT_KIND_TOP_OPTIONS: Array<{ value: ExportChoice; label: string }> = [`
- 14: `{ value: "editable", label: "Editable pattern (.json)" },`
- 15: `{ value: "oxs", label: "OXS chart for other programs (.oxs)" },`
- 16: `{ value: "png-realistic", label: "Realistic preview PNG" },`
- 17: `{ value: "pixel-art", label: "Pixel art PNG (1 px per stitch)" },`
- 18: `{ value: "palette", label: "Palette file (.json)" },`
- 21: `const EXPORT_KIND_GROUPS: Array<{ heading: string; options: Array<{ value: ExportChoice; label: string }> }> = [`
- 25: `{ value: "png-color", label: "Full chart PNG" },`
- 26: `{ value: "a4-color", label: "A4 pages (ZIP)" },`
- 27: `{ value: "pdf-color", label: "PDF for Pattern Keeper" },`
- 33: `{ value: "png-bw", label: "Full chart PNG" },`
- 34: `{ value: "a4-bw", label: "A4 pages (ZIP)" },`
- 35: `{ value: "pdf-bw", label: "PDF for Pattern Keeper" },`
- 67: `aria-label="Export"`
- 91: `disabled={!hasPattern || busy}`
- 92: `title="Download just the file chosen on the left -- quick, and the editable .json doubles as your save file"`
- 101: `disabled={!hasPattern || busy}`
- 103: `title="One .cspzip with everything: editable JSON, an OXS chart, color/B&W/realistic PNGs, the Pattern Keeper PDF, and A4_color/A4_bw subfolders of A4 page PNGs`

## app/components/first-run.tsx (266 lines, 11 entries)

- 96: `label: string;`
- 107: `<button type="button" aria-label={down} onClick={() => onChange(clamp(value - 1))} className={'border-r ${STEP}'}>`
- 111: `type="number"`
- 112: `min={MIN_STITCHES}`
- 113: `max={MAX_STITCHES}`
- 115: `aria-label={'${label} in stitches'}`
- 119: `<button type="button" aria-label={up} onClick={() => onChange(clamp(value + 1))} className={'border-l ${STEP}'}>`
- 165: `disabled={busy}`
- 202: `aria-label="Fabric count"`
- 217: `disabled={problem !== null}`
- 221: `<p className="m-0 w-full font-mono text-[11px] leading-4 text-muted" data-testid="new-chart-size">`

## app/components/image-window.tsx (250 lines, 10 entries)

- 142: `data-testid="viewer"`
- 167: `data-testid="adjusted-photo"`
- 170: `role="img"`
- 171: `aria-label="Adjusted photo"`
- 184: `<PillButton size="xs" aria-pressed={showOriginal} onClick={() => setShowOriginal((shown) => !shown)}>`
- 211: `role="img"`
- 212: `aria-label={'Pattern, ${VIEW_MODE_LABELS[viewMode]} view'}`
- 213: `data-testid="chart-frame"`
- 233: `<canvas ref={canvasRef} data-testid="chart-canvas" aria-hidden="true" className="pointer-events-none absolute top-0 left-0" />`
- 237: `data-testid="brush-outline"`

## app/components/inspector.tsx (76 lines, 9 entries)

- 29: `const TABS: Array<{ id: InspectorTab; label: string }> = [`
- 30: `{ id: "photo", label: "Photo" },`
- 31: `{ id: "chart", label: "Chart" },`
- 32: `{ id: "threads", label: "Threads" },`
- 33: `{ id: "text", label: "Text" },`
- 40: `<div role="tablist" aria-label="Inspector" className="flex h-11 shrink-0 items-stretch border-b border-line">`
- 48: `role="tab"`
- 53: `disabled={isDisabled}`
- 65: `role="tabpanel"`

## app/components/palette-setup.tsx (305 lines, 21 entries)

- 97: `<div className="flex flex-col gap-2.5 rounded-lg border border-line bg-app p-3" data-testid="palette-setup">`
- 100: `<span className="font-mono text-[13px] text-ink" data-testid="palette-set-count">`
- 108: `<ul className="flex flex-wrap" aria-label="Chosen colours">`
- 113: `title={colorLabel(c)}`
- 142: `role="img"`
- 143: `aria-label={'${colorLabel(c)}, position ${i + 1} of ${set.colors.length}; Alt and arrow keys move it'}`
- 150: `aria-label={'Remove ${colorLabel(c)}'}`
- 187: `type="color"`
- 190: `aria-label="Colour to add"`
- 202: `disabled={!prediction}`
- 203: `title={`
- 214: `<PillButton size="xs" disabled={set.colors.length === 0} onClick={() => onChange({ mode: set.mode, colors: [] })}>`
- 220: `<p className="text-[11px] leading-4 text-muted" data-testid="palette-coverage">`
- 232: `placeholder="Name to save as"`
- 233: `aria-label="Palette name"`
- 246: `aria-label="Saved palettes"`
- 258: `disabled={!chosen}`
- 272: `disabled={!chosen}`
- 285: `type="file"`
- 287: `aria-label="Palette file"`
- 297: `<p className="text-[11px] leading-4 text-muted" role="status" data-testid="palette-note">`

## app/components/panels.tsx (456 lines, 23 entries)

- 40: `role="alert"`
- 41: `data-testid="restore-failure"`
- 66: `<span data-testid="open-notice">{openNotice}</span>`
- 272: `<PillButton size="xs" onClick={onUndo} disabled={!canUndo} title="Ctrl+Z">`
- 275: `<PillButton size="xs" onClick={onRedo} disabled={!canRedo} title="Ctrl+Y or Ctrl+Shift+Z">`
- 281: `<PillButton size="xs" onClick={onCopy} disabled={none} title="Copy the selected line">`
- 284: `<PillButton size="xs" onClick={onPaste} disabled={!hasClipboard} title="Paste the copied line">`
- 287: `<PillButton size="xs" onClick={onDuplicate} disabled={none} title="Leave this line and take a copy of it">`
- 293: `<PillButton size="xs" onClick={onMirrorHorizontal} disabled={none} title="Mirror left to right">`
- 296: `<PillButton size="xs" onClick={onMirrorVertical} disabled={none} title="Mirror top to bottom">`
- 299: `<PillButton size="xs" onClick={onRotateAnticlockwise} disabled={none} title="Turn a quarter turn left">`
- 302: `<PillButton size="xs" onClick={onRotateClockwise} disabled={none} title="Turn a quarter turn right">`
- 310: `disabled={none || !canRecolour}`
- 311: `title={canRecolour ? "Give the selected line the colour in hand" : "Pick a thread in the list first — there is no colour to use"}`
- 315: `<PillButton size="xs" onClick={onDelete} disabled={none} title="Delete the selected line (Delete)">`
- 321: `<PillButton size="xs" onClick={onDeselect} disabled={none} title="Escape">`
- 367: `disabled={!canUndo || hasSelection}`
- 368: `title={hasSelection ? "Apply or cancel the selection first" : "Ctrl+Z"}`
- 375: `disabled={!canRedo || hasSelection}`
- 376: `title={hasSelection ? "Apply or cancel the selection first" : "Ctrl+Y or Ctrl+Shift+Z"}`
- 441: `aria-label={label}`
- 442: `title={title}`
- 444: `disabled={isDisabled}`

## app/components/photo-pane.tsx (638 lines, 69 entries)

- 36: `const ADJUST_SLIDERS: ReadonlyArray<{ key: keyof PhotoAdjust; label: string; hint: string }> = [`
- 37: `{ key: "brightness", label: "Brightness", hint: "Lighter or darker, without blowing out what is already white" },`
- 38: `{ key: "contrast", label: "Contrast", hint: "Pushes light and dark apart, or flattens them together" },`
- 39: `{ key: "saturation", label: "Saturation", hint: "How colourful: all the way down is grey" },`
- 40: `{ key: "temperature", label: "Warm / cool", hint: "Right is warmer (amber), left is cooler (blue)" },`
- 48: `{ value: "latest", label: "Refined", title: "The current color-picking algorithm: it spends spare colors on small distinct details" },`
- 51: `label: "Classic",`
- 52: `title: "The algorithm this project first shipped with: colors follow how much of the photo uses them",`
- 57: `{ value: "full", label: "Full range", title: "Whatever colors the chosen algorithm finds" },`
- 65: `title: derivationNote`
- 75: `{ value: "averaged", label: "Averaged", title: "Today's default: a stitch is the average of the pixels it covers" },`
- 78: `label: "Vivid",`
- 79: `title:`
- 85: `{ value: "standard", label: "Standard", title: "Today's default -- averages colors across a boundary" },`
- 88: `label: "Crisp",`
- 89: `title: "Preserves hard color boundaries instead of blending them into a manufactured intermediate color (G-024)",`
- 93: `label: "Crisp+",`
- 94: `title:`
- 128: `{ value: "lines-horizontal", label: "—", title: "Horizontal lines" },`
- 129: `{ value: "lines-vertical", label: "|", title: "Vertical lines" },`
- 130: `{ value: "lines-diagonal", label: "/", title: "Diagonal lines, rising" },`
- 131: `{ value: "lines-anti-diagonal", label: "\\", title: "Diagonal lines, falling" },`
- 135: `const DITHER_GROUPS: Array<{ label: string; modes: readonly DitherMode[]; withLines?: boolean }> = [`
- 136: `{ label: "Screens — fewest single stitches", modes: SCREEN_MODES, withLines: true },`
- 137: `{ label: "Scattered — closer to the photo", modes: SCATTERED_MODES },`
- 138: `{ label: "Error diffusion — closest, never worse", modes: DIFFUSION_DITHER_MODES },`
- 139: `{ label: "Drawn — marks, not a pattern", modes: DRAWN_DITHER_MODES },`
- 169: `{ value: "auto", label: "Automatic", title: "The colors are chosen from the picture, as many as the Colors slider says" },`
- 170: `{ value: "setup", label: "Set up palette", title: "You choose the colors; the chart is made from those and no others" },`
- 302: `role="radio"`
- 303: `aria-checked={chosen}`
- 304: `aria-label={'${SIZE_PRESET_LABELS[preset]} (${SIZE_PRESETS[preset]})'}`
- 318: `role="radio"`
- 319: `aria-checked={options.sizePreset === "custom"}`
- 320: `aria-label="Custom"`
- 329: `aria-label="One stitch fewer"`
- 336: `type="number"`
- 337: `min={MIN_STITCHES}`
- 338: `max={MAX_STITCHES}`
- 340: `aria-label="Custom size in stitches"`
- 346: `aria-label="One stitch more"`
- 376: `aria-label="One color fewer"`
- 377: `title="One color fewer"`
- 385: `type="range"`
- 386: `min={MIN_COLORS}`
- 387: `max={countMax}`
- 389: `aria-label="Number of colors"`
- 395: `aria-label="One color more"`
- 396: `title="One color more"`
- 404: `<p className="text-[11px] leading-4 text-muted" data-testid="color-count-hint">`
- 441: `title="Finds thin lines in a drawing (outlines, whiskers, lettering; dark, light or coloured) and stitches them as backstitch instead of a ragged row of stitche`
- 445: `type="checkbox"`
- 454: `title="A photograph is full of faint fine detail, so only its strongest long thin lines (a branch, a wire, a fence rail) are traced, and few of them. Drawings a`
- 458: `type="checkbox"`
- 475: `type="range"`
- 476: `min={0}`
- 477: `max={10}`
- 479: `aria-label="Line sensitivity"`
- 496: `title="Lays short backstitch strokes over the stitches where the picture has fine texture, such as fur, feathers, hair, bark or grass, along the way the texture`
- 500: `type="checkbox"`
- 516: `type="range"`
- 517: `min={0}`
- 518: `max={10}`
- 520: `aria-label="Stroke density"`
- 607: `disabled={isNeutralAdjust(options.photoAdjust)}`
- 609: `aria-label="Put the photo sliders back to neutral"`
- 610: `title="Put all four sliders back in the middle"`
- 622: `min={-100}`
- 623: `max={100}`

## app/components/pointer-readout.tsx (78 lines, 2 entries)

- 70: `<span title="The stitch under the pointer, counted from 1 at the top left: across, then down" className="flex items-center gap-1.5">`
- 72: `<span ref={output} data-testid="pointer-stitch" className="inline-block min-w-[5.5rem] text-ink">`

## app/components/rulers.tsx (260 lines, 2 entries)

- 29: `const TICK: Record<MarkSize, number> = { edge: 12, label: 10, ten: 8, five: 5, unit: 3 };`
- 112: `data-testid={'ruler-${side}'}`

## app/components/stamp-painter.tsx (136 lines, 12 entries)

- 62: `<div className="flex flex-col gap-2" data-testid="stamp-painter">`
- 69: `role="radio"`
- 70: `aria-checked={current.size === size}`
- 71: `aria-label={'${size} by ${size}'}`
- 84: `data-testid="stamp-grid"`
- 92: `aria-label={'Stitch ${(index % current.size) + 1}, ${Math.floor(index / current.size) + 1}${value > 0 ? ', step ${value}' : ""}'}`
- 93: `aria-pressed={value > 0}`
- 110: `role="radio"`
- 111: `aria-checked={step === value}`
- 112: `aria-label={'Step ${value}'}`
- 122: `<PillButton onClick={() => onChange(undefined)} title="Clear every stitch of the stamp">`
- 127: `<span className="text-[11px] leading-4 text-amber-300" data-testid="stamp-clipped-notice">`

## app/components/status-bar.tsx (108 lines, 8 entries)

- 68: `<span title="Finished size on the chosen fabric count">`
- 79: `role="status"`
- 80: `data-testid="autosave-status"`
- 88: `<button type="button" onClick={onZoomOut} className={'${ZOOM_BUTTON} text-sm'} aria-label="Zoom out" disabled={!hasPattern}>`
- 94: `disabled={!hasPattern}`
- 96: `aria-label="Reset zoom to 100%"`
- 97: `title="Reset zoom to 100%"`
- 101: `<button type="button" onClick={onZoomIn} className={'${ZOOM_BUTTON} text-sm'} aria-label="Zoom in" disabled={!hasPattern}>`

## app/components/text-pane.tsx (453 lines, 46 entries)

- 196: `disabled={asking}`
- 197: `title="Your browser asks first. The fonts are read here and never leave this computer."`
- 203: `<p role="status" data-testid="fonts-fallback" className="text-xs leading-4 text-muted">`
- 208: `aria-label="Font"`
- 238: `<p data-testid="pixel-hint" className="text-xs leading-4 text-muted">`
- 244: `type="text"`
- 245: `aria-label="Font name"`
- 246: `placeholder="or type the name of an installed font"`
- 259: `<select aria-label="Font type" value={chosen.style} onChange={(e) => onChange("textStyle", e.target.value)} className={FIELD}>`
- 274: `aria-label="Reset size"`
- 275: `title={'Reset to ${best}, the size this font reads best at'}`
- 276: `disabled={options.textSize === best}`
- 286: `aria-label="Smaller size"`
- 287: `disabled={options.textSize <= MIN_SIZE}`
- 294: `type="number"`
- 295: `aria-label="Font size in stitches"`
- 296: `min={MIN_SIZE}`
- 297: `max={MAX_SIZE}`
- 309: `aria-label="Larger size"`
- 310: `disabled={options.textSize >= MAX_SIZE}`
- 318: `<div className="flex flex-col gap-1.5" title="Lighter letters cut at a higher coverage, heavier ones at a lower.">`
- 322: `<output data-testid="weight-value" className="ml-1 font-mono text-xs text-muted">`
- 328: `aria-label="Reset weight"`
- 329: `disabled={options.textWeight === DEFAULT_WEIGHT}`
- 339: `aria-label="Lighter"`
- 340: `disabled={options.textWeight <= 0}`
- 347: `type="range"`
- 348: `aria-label="Weight"`
- 349: `min={0}`
- 350: `max={100}`
- 357: `aria-label="Heavier"`
- 358: `disabled={options.textWeight >= 100}`
- 373: `<div role="radiogroup" aria-label="Text colour" className="flex flex-wrap gap-1.5">`
- 378: `role="radio"`
- 379: `aria-checked={index === colourIndex}`
- 380: `aria-label={'Thread ${color.symbol} ${color.name}'}`
- 381: `title={'${color.symbol} ${color.name}'}`
- 395: `type="text"`
- 396: `aria-label="Text"`
- 400: `placeholder="One line of text"`
- 412: `data-testid="text-preview"`
- 417: `role="img"`
- 418: `aria-label={'Lettering, ${bitmap.width} by ${bitmap.height} stitches'}`
- 426: `<p className="font-mono text-xs text-muted" data-testid="text-size">`
- 431: `<ul data-testid="text-warnings" className="flex flex-col gap-1 text-xs leading-4 text-amber-200">`
- 443: `disabled={!onAdd || problem !== null}`

## app/components/texture-editor.tsx (257 lines, 40 entries)

- 22: `const PRESETS: Array<{ label: string; texture: DitherTexture }> = [`
- 23: `{ label: "Default", texture: DEFAULT_DITHER_TEXTURE },`
- 24: `{ label: "Rings", texture: { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0.8, 0.2, 0, 0, 0], sweep: 0.4 } },`
- 25: `{ label: "Stipple", texture: { ...DEFAULT_DITHER_TEXTURE, shapeWeights: [0, 0, 0.6, 0.4, 0], spacing: 4, wobble: 0.6 } },`
- 26: `{ label: "Coarse", texture: { ...DEFAULT_DITHER_TEXTURE, spacing: 11, radiusMin: 0.3, radiusSpan: 0.12 } },`
- 49: `label: string;`
- 61: `<label className="text-[11px] text-muted" htmlFor={id} title={hint}>`
- 68: `type="range"`
- 69: `min={min}`
- 70: `max={max}`
- 71: `step={step}`
- 73: `aria-label={label}`
- 82: `function Switch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {`
- 86: `role="switch"`
- 87: `aria-checked={checked}`
- 88: `aria-label={'${label}: ${hint}'}`
- 89: `title={hint}`
- 132: `<section className="flex flex-col gap-2" data-testid="texture-editor">`
- 150: `title={'Set every knob to ${preset.label.toLowerCase()}'}`
- 161: `min={DITHER_TEXTURE_RANGES.spacing[0]}`
- 162: `max={DITHER_TEXTURE_RANGES.spacing[1]}`
- 163: `step={1}`
- 170: `min={DITHER_TEXTURE_RANGES.radiusMin[0]}`
- 171: `max={DITHER_TEXTURE_RANGES.radiusMin[1]}`
- 172: `step={0.01}`
- 185: `min={DITHER_TEXTURE_RANGES.radiusSpan[0]}`
- 186: `max={DITHER_TEXTURE_RANGES.radiusSpan[1]}`
- 187: `step={0.01}`
- 194: `min={DITHER_TEXTURE_RANGES.sweep[0]}`
- 195: `max={DITHER_TEXTURE_RANGES.sweep[1]}`
- 196: `step={0.01}`
- 209: `min={DITHER_TEXTURE_RANGES.wobble[0]}`
- 210: `max={DITHER_TEXTURE_RANGES.wobble[1]}`
- 211: `step={0.01}`
- 229: `min={0}`
- 230: `max={1}`
- 231: `step={0.01}`
- 240: `min={0}`
- 241: `max={1}`
- 242: `step={0.01}`

## app/components/texture-picker.tsx (109 lines, 4 entries)

- 86: `<div role="radiogroup" aria-label="Stitch texture" className="flex flex-wrap gap-2">`
- 93: `role="radio"`
- 94: `aria-checked={selected}`
- 95: `title={'${texture.label} stitch texture'}`

## app/components/threads-pane.tsx (332 lines, 13 entries)

- 110: `data-testid="legend-color-row"`
- 134: `aria-label={'Edit ${color.name}'}`
- 148: `title="Click to change this color's symbol"`
- 168: `data-testid="legend-color-name"`
- 174: `title="Double-click to rename"`
- 184: `<span data-testid="legend-color-count" className="text-muted">`
- 187: `<span className="text-faint" title="Estimated floss needed, biased to overestimate -- see docs/domain-reference.md">`
- 209: `title="No stitch -- marks cells that shouldn't be stitched at all. Never appears in the legend or exports' stitch counts. Drag a color here to merge it into emp`
- 265: `<div data-testid="backstitch-section" className="mt-1 flex flex-col">`
- 277: `data-testid="backstitch-color-row"`
- 296: `<span data-testid="backstitch-color-name" className="truncate text-[13px]">`
- 304: `data-testid="backstitch-color-length"`
- 306: `title="Length of this thread's backstitch on the chart"`

## app/components/tool-rail.tsx (368 lines, 41 entries)

- 160: `label: "Brush",`
- 161: `title: "Paint the selected color -- click a color in the Threads list first (B). Double-click to flood-fill instead.",`
- 166: `label: "Fill",`
- 167: `title: "Click a color, then click a cell to flood-fill its same-colored region (F)",`
- 172: `label: "Line",`
- 173: `title: "Drag from one stitch to another to draw a straight line, as thick as the brush (L)",`
- 178: `label: "Rectangle",`
- 179: `title: "Drag from one corner to another to draw a rectangle, outlined or filled (R)",`
- 182: `{ tool: "oval" as const, label: "Oval", title: "Drag a box to draw the oval that fits it, outlined or filled (O)", Icon: OvalIcon },`
- 185: `label: "Lasso fill",`
- 186: `title: "Draw around an area (G); letting go fills everything inside it with the colour in hand, in one step.",`
- 191: `label: "Backstitch",`
- 192: `title:`
- 198: `label: "BS edit",`
- 199: `title: "Edit backstitch (J). Drag a line anywhere to move it; once it is in hand, drag either end to re-aim it.",`
- 206: `label: "Select",`
- 207: `title: "Drag a rectangle to select it, then copy, paste, move or flip it before it merges back. Ignores symmetry.",`
- 212: `label: "Lasso",`
- 213: `title: "Draw around the stitches you want (Q). The piece then copies, moves and flips like any other. Ignores symmetry.",`
- 218: `label: "Move",`
- 219: `title: "Drag to reposition the whole design within the canvas. Ignores symmetry.",`
- 224: `{ tool: "pan" as const, label: "Pan", title: "Drag to scroll the chart (or hold Space with any tool active)", Icon: PanIcon },`
- 227: `label: "Zoom",`
- 228: `title: "Click to zoom in, Shift-click to zoom out (the wheel always zooms too)",`
- 256: `const MIRROR_ACTIONS: Array<{ kind: QuickMirror; label: string; title: string }> = [`
- 257: `{ kind: "left-half", label: "Mirror left half", title: "Mirror the left half onto the right half" },`
- 258: `{ kind: "upper-half", label: "Mirror upper half", title: "Mirror the upper half onto the lower half" },`
- 259: `{ kind: "upper-left-corner", label: "Mirror upper-left corner", title: "Mirror the upper-left quarter to the other three quarters" },`
- 262: `label: "Mirror upper-left half corner",`
- 263: `title: "Mirror the triangle along the left edge of the upper-left quarter across its diagonal, then to the other quarters",`
- 286: `disabled={newChartDisabled}`
- 287: `aria-label="New chart"`
- 288: `title="New chart — opens the start screen, where you pick a photo, an empty grid or a saved file"`
- 320: `disabled={disabled}`
- 321: `title={title}`
- 322: `aria-label={label}`
- 323: `aria-pressed={active}`
- 347: `<div role="group" aria-labelledby="mirror-heading" className="grid grid-cols-2 gap-1 px-2 pt-1">`
- 355: `disabled={disabled || needsSquare}`
- 356: `title={needsSquare ? '${title}. Needs a square canvas.' : title}`
- 357: `aria-label={label}`

## app/components/ui.tsx (210 lines, 14 entries)

- 53: `label: ReactNode;`
- 97: `title={option.title}`
- 98: `disabled={option.disabled}`
- 99: `aria-pressed={selected}`
- 112: `label: string;`
- 139: `<label className="text-[11px] text-muted" htmlFor={id} title={hint}>`
- 146: `type="range"`
- 147: `min={min}`
- 148: `max={max}`
- 150: `disabled={disabled}`
- 151: `title={hint}`
- 152: `aria-label={label}`
- 171: `aria-label={label}`
- 172: `title={label}`

## app/workspace.tsx (1035 lines, 11 entries)

- 698: `disabled={!pattern || startingNew}`
- 711: `<label className="hidden" title="Import pixel art as a chart">`
- 716: `type="file"`
- 725: `<label className="hidden" title="Choose a photo to generate a chart from">`
- 730: `type="file"`
- 737: `disabled={source.isLoading || generation.isProcessing}`
- 742: `type="file"`
- 743: `aria-label="Open pattern file"`
- 922: `disabled={{`
- 1013: `disabled={!source.hasPhoto || generation.isProcessing || source.isLoading}`
- 1030: `<canvas ref={navigatorCanvasRef} data-testid="navigator-raster" />`

## app/hooks/use-keyboard-cursor.ts (176 lines, 1 entries)

- 36: `'[role="slider"], [role="radio"], [role="tab"], [role="listbox"], [role="menu"], [role="spinbutton"], [role="combobox"]';`
