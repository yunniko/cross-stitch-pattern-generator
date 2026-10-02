# 04 · Editing

Drawing and changing a chart. Sources: `app/hooks/use-canvas-tools.ts`, `use-keyboard-shortcuts.ts`, `use-keyboard-cursor.ts`, `lib/editor/*`, `app/components/tool-rail.tsx`, `context-bar.tsx`, `panels.tsx`; as of 2026-10-02. All of it runs on the device and works with no connection. Backstitch tools are in `06`, lettering in `07`, the thread list in `05`.

## When editing is possible

Editing needs a chart, shown in a view that can be edited (Color, Black & white, Grid + photo). It is unavailable with no chart, over the starting point, and in the two looking-only views (Stitched, Original photo), where only panning and zooming act. Every tool control is unavailable (not hidden) while there is no chart.

Every change to a chart is **one undo step**, however many stitches it touches: a stroke from press to release, a fill, a shape, an applied selection, a merge, a rename, a colour edit, a resize, a quick mirror.

## Tools

Thirteen tools; exactly one is in hand, chosen by its control or its key. Brush is in hand when a chart opens; the choice is not kept between visits.

| Tool | Key | What it does | Uses brush size/shape | Uses stitch type | Uses symmetry |
|---|---|---|---|---|---|
| **Brush** | B | Paints stitches under the pointer while it is pressed and moves, one stroke = one undo step. A double press fills the whole region under it instead, as one undo step, when "double-press fills a region" is on | Yes | Yes | Yes |
| **Fill** | F | One press fills the connected same-coloured region under the pointer (stitches touching at corners count as connected), and the mirrored regions | No | Yes | Yes |
| **Line** | L | Drag from one stitch to another to draw a straight line of stitches as thick as the brush; follows the pointer until released; Escape drops it | Thickness | Yes | Yes |
| **Rectangle** | R | Drag from one corner stitch to the opposite; outlined (as thick as the brush) or filled (exactly the shape, whatever the brush size) | Outline only | Yes | Yes |
| **Oval** | O | Drag a box; draws the oval that fits it, outlined or filled as above | Outline only | Yes | Yes |
| **Lasso fill** | G | Draw freehand around an area; on release everything enclosed is filled with the colour in hand, one undo step | No | Yes | Yes: every filled stitch is mirrored |
| **Backstitch** | K | See `06` | | | Yes |
| **Backstitch edit** (labelled "BS edit") | J | See `06` | | | Yes |
| **Select** | | Drag a rectangle; the stitches inside are lifted as a piece in hand | No | No | **Ignores** |
| **Lasso** | Q | Draw freehand around the stitches wanted; they are lifted as a piece in hand | No | No | **Ignores** |
| **Move** | | Drag to shift the whole design within the canvas; stitches that pass an edge wrap round to the other side so none is lost; the photo behind the chart moves by the same amount; backstitch lines move with it and a line pushed off the chart is removed | No | No | **Ignores** |
| **Pan** | (Space held) | Drag to scroll the chart | | | |
| **Zoom** | | Press to zoom in, with Shift to zoom out | | | |

Changing tool puts down what the old one held: leaving Select or Lasso for any other tool than the other selection tool applies the piece in hand; a half-drawn shape, Lasso fill path, backstitch run or lines in hand are dropped.

Shape tools (Line, Rectangle, Oval) share one gesture: press at the start, the shape follows the pointer, release to make it, **Escape** to drop it. Nothing is smoothed: every stitch a tool touches holds exactly the colour chosen, never a blend.

Lasso and Lasso fill smooth the wobble of a hand-drawn line and close the loop; a path drawn as a few deliberate corners keeps its corners; crossing your own line carves a hole.

## The two colours

| | |
|---|---|
| **Drawing colours** | A pair: a foreground and a background, each a palette colour, or the empty stitch, or nothing |
| **Left press** paints with the foreground; **right press** with the background. A stroke keeps the colour it started with |
| **Choose** | A press on a thread's entry in the thread list makes it the foreground (a second press on the same entry releases it: no colour in hand); a right press on a entry loads the background and does not change which is in front; a press on the background square makes it the foreground |
| **Swap** | Action, key **X**: swaps the roles without moving either colour |
| **Empty stitch as colour** | "Empty (no stitch)" is chosen like a thread and paints stitches away |
| **Unavailable states** | With no colour in hand (shown as "No thread chosen"), tools that paint do nothing; a colour that has been merged away counts as no colour in hand |
| **Kept** | Not kept |

## Brush options

| Control | Values | Default | Kept | Shown when |
|---|---|---|---|---|
| **Brush size** | **1, 3, 5, 7, 9, 11, 13, 15** stitches across (odd only, so every press has a centre) | 1 | Browser | Whenever a chart is edited with a drawing tool |
| **Brush shape** | **Round** (the disc that fits the size) or **Square** (the whole block) | Round | Browser | With brush size |
| **Shape fill** | **Outline** or **Filled** | Outline | Browser | Only with Rectangle and Oval |
| **Stitch type** | **Whole stitch**, **Half stitch "/"**, **Half stitch "\\"** (three exclusive choices, each shown as the shape of the stitch) | Whole | Browser | Only with Brush, Fill, Line, Rectangle, Oval and Lasso fill. Each cell holds one kind. See `06` |
| **Double-press fills a region** | Switch (a chart setting, `03`) | On | Browser | Off: a double press paints the two stitches pressed |

**Outline of what a press will cover:** under the pointer, the stitches the tool in hand would cover are outlined, in the brush's size and shape (a disc for round, a block for square; one stitch for a filled rectangle or oval, whatever the brush size); it follows the pointer and leaves with it; the system pointer is hidden over the chart for these tools, and a small dot marks the exact place in the outlined stitch.

## Selection and the piece in hand

Choosing a region with Select or Lasso (or pasting, or placing lettering from `07`) puts a **piece in hand**: it floats over the chart, which is unchanged underneath until the piece is applied.

| Action | Available when | Effect |
|---|---|---|
| **Move** (drag the piece) | A piece is in hand | Repositions it; stitches under it are not lost until it is applied |
| **Copy** | A piece | Keeps a copy to paste |
| **Paste** | A copy exists | A new piece in hand |
| **Duplicate** | A piece | Leaves the piece where it is and takes a copy in hand |
| **Fill selection** | A piece, and a colour in hand | Paints the whole selected area in the colour in hand (with the transparency lock, only the stitches that are not empty) |
| **Flip horizontal / Flip vertical** | A piece | Mirrors it; half stitches swap diagonal where a mirror needs it |
| **Rotate right / left** | A piece | A quarter turn clockwise / anticlockwise; half stitches swap diagonal |
| **Crop** | A piece | Cuts the chart down to the piece's rectangle, discarding everything outside it (the piece is applied first); the photo behind keeps its alignment |
| **Apply here** (Enter) | A piece | Merges the piece into the chart where it sits |
| **Cancel** (Escape) | A piece | Puts the chart back as it was when this selection started, discarding the piece and its changes |
| Selection readout | A piece | "*w* × *h* at *x*, *y*"; with none, "Drag a rectangle on the chart to select it." (Select) or "Draw around the stitches you want." (Lasso) |

A lasso piece is a **shape**: stitches outside the shape inside its box are not in the piece, are never stamped, vacated or filled; copy, move, flip and rotate carry the shape. A backstitch line is taken by a rectangle or lasso only when **both** its ends are inside.

While a piece is in hand, **Undo and Redo are unavailable** (with the reason "Apply or cancel the selection first") and the key presses for them are ignored.

## Undo and redo

| | |
|---|---|
| **Undo / Redo** | Actions; Ctrl+Z, and Ctrl+Y or Ctrl+Shift+Z (Cmd on Mac) |
| **Depth** | 50 steps; older steps drop off |
| **Available when** | A step exists in that direction and no piece is in hand |
| **Resets** | When a new chart replaces the open one (generation, opening a file, a blank chart): the new chart is the start of history |

## Symmetry and quick mirror

| Control | Values | Default | Available when | Effects |
|---|---|---|---|---|
| **Symmetry axes** | Four switches: **vertical** (left–right mirror about the centre line), **horizontal** (top–bottom), **diagonal** (top-left to bottom-right) and **anti-diagonal** (top-right to bottom-left); any combination, so a stitch has 1, 2, 4 or 8 copies | All off | A chart; the two diagonals only on a **square** canvas (otherwise unavailable with "Needs a square canvas.") | While on, every stroke, fill, shape and lasso fill also lands on the mirrored stitches. A stitch on an axis is not doubled. Saved in the editable file (an optional field); not kept otherwise. Diagonals turn off if the canvas becomes non-square. Select, Lasso and Move ignore it |
| **Quick mirror** | Four actions: **Mirror left half** (onto the right half), **Mirror upper half** (onto the lower), **Mirror upper-left corner** (the upper-left quarter onto the other three), **Mirror upper-left half corner** (the triangle along the left edge of the upper-left quarter across its diagonal, then to the other quarters) | | A chart; the last two only on a square canvas ("Needs a square canvas.") | Any piece in hand is applied first; the mirror is one undo step |

## Transparency lock

| | |
|---|---|
| **Purpose** | Stop drawing from turning empty stitches into colour, or colour into empty |
| **Kind** | Switch |
| **Default** | Off. Kept in the browser |
| **Effects while on** | Brush, shape tools, Fill, double-press fill and Lasso fill cannot change whether a stitch is empty; Fill selection paints only stitches that are not empty. Selecting, moving and dragging act as they do without it |

## Dragging a colour from the thread list

Dragging a thread's entry onto a stitch fills the connected region (stitches not touching at corners) under it with that colour, with symmetry, as one undo step; unavailable in looking-only views. Dragging a entry onto another entry merges colours (`05`).

## Keyboard cell cursor

| | |
|---|---|
| **Purpose** | Draw without a pointing device |
| **Arrow keys** | Move the outlined stitch by one (with Shift, ten) |
| **Enter** | The pen: press to paint, hold while moving to draw a stroke or stretch a line, rectangle or oval, release to finish |
| **Available when** | A chart in an editable view, a tool that paints (Brush, Fill, Line, Rectangle, Oval), no piece in hand; arrow keys do nothing while a field, choice list or similar control has the focus and uses them itself |
| **Interaction** | Works through the same paths as the pointer, so the lock, outline, rulers' marker and status readout behave identically; a real pointer move hands control back to the pointer |

## Keyboard shortcuts

Keys act when no text entry has the focus and a chart is open.

| Key | Does |
|---|---|
| B, F, L, R, O, Q, G, K, J | Brush, Fill, Line, Rectangle, Oval, Lasso, Lasso fill, Backstitch, Backstitch edit |
| X | Swap the two drawing colours |
| 1, 2, 3 | Color, Black & white, Stitched view |
| 4, 5 | Grid + photo, Original photo (only with a photo) |
| Space (held) | Pan temporarily |
| Escape | Cancels the piece or shape in hand |
| Enter | Applies the piece in hand (Select and Lasso) |
| Delete or Backspace | Deletes the backstitch in hand (Backstitch edit only) |
| Ctrl/Cmd + Z; Ctrl/Cmd + Y or Shift + Z | Undo; redo |
| Arrow keys, Enter | Keyboard cell cursor (above) |

## Chart-level changes made while editing

| Change | Where described |
|---|---|
| Resize or crop the canvas, rename the chart | `03` |
| Merge, recolour, rename, change symbol, add a colour | `05` |
