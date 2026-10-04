# 04 · Editing

Drawing and changing a chart. Sources: `app/tools/*`, `app/commands/registry.ts`, `app/hooks/use-keyboard-shortcuts.ts`, `use-keyboard-cursor.ts`, `lib/editor/*`, `app/components/tool-rail.tsx`, `context-bar.tsx`, `panels.tsx`, `command-list.tsx`; as of 2026-10-05. All of it runs on the device and works with no connection. Backstitch tools are in `06`, lettering in `07`, the thread list in `05`.

## When editing is possible

Editing needs a chart, shown in a view that can be edited (Color, Black & white, Grid + photo). It is unavailable with no chart, over the starting point, and in the two looking-only views (Stitched, Original photo), where only panning and zooming act. Every tool control is unavailable (not hidden) while there is no chart.

Every change to a chart is **one undo step**, however many stitches it touches: a stroke from press to release, a fill, a shape, an applied selection, a merge, a rename, a colour edit, a resize, a quick mirror.

## Tools

Fourteen tools; exactly one is in hand, chosen by its control or its key. Brush is in hand when a chart opens; the choice is not kept between visits.

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
| **Crop** | C | Cuts the chart down, or grows it, with a frame whose four edges are the four numbers of the Crop section below; applied on request, one undo step | No | No | **Ignores** |
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

## Crop tool

A frame is drawn over the chart, and the four numbers that say where its edges are, are the same thing: typing a number moves its edge, dragging an edge changes its number. The chart changes only when the frame is applied.

| Control | Kind and values | Default | Available when | Effects and messages |
|---|---|---|---|---|
| **Top, Right, Bottom, Left** | Whole numbers, each the number of stitches that edge moves **in**: positive cuts that many stitches off the edge, negative adds that many empty stitches. Typed (a minus sign allowed) or set by the frame; a typed value that is not a whole number is marked and not used | 0 | The Crop tool is open (it is chosen, or Pan or Zoom is temporarily in hand) | The frame moves as the characters arrive. If the result would leave nothing the readout says "Can't crop away the entire pattern."; if a side would pass 1500 stitches it says "The resized pattern (*w*×*h*) would exceed the maximum supported size of 1500 stitches per side."; in both cases Apply is unavailable and nothing changes |
| **Frame** | A rectangle over the chart with a grab point on each of its four edges and four corners; dragging one moves its edge or edges in whole stitches; with a grab point focused, the arrow keys move it by one stitch (Shift: ten) | The whole chart | A chart in an editable view | A drag never leaves less than one stitch and never more than 1500 on a side. The stitches that would be cut away are dimmed; stitches that would be added are shown hatched. Room is made around the chart so the frame can be dragged outward; to grow further, type a negative number or zoom out |
| **Readout** | Text | | Always while open | "*w* × *h* → *w'* × *h'* · finished size" in the chosen unit and fabric count; or the message above |
| **Apply** | Action; Enter | | The frame is not the whole chart, can be applied, and no number entry holds text that is not a whole number | Resizes the chart: stitches, palette counts, half stitches, backstitch (moved with the chart; a line the new chart does not contain is removed whole) and the photo's alignment behind the chart, exactly as the earlier canvas-size numbers did; added stitches are empty and add no colour; one undo step; the frame then starts again over the new chart |
| **Cancel** | Action; Escape | | The frame is not the whole chart | Puts the frame back over the whole chart; the tool stays in hand; the chart is untouched. Inside a number entry, Escape first puts that number back to what it was when the entry was entered; a second Escape puts the whole frame back |
| Undo, Redo | Actions | | Always while open | As elsewhere |

Choosing any tool other than Pan or Zoom drops the frame without changing the chart; another chart arriving, or an undo or redo that changes the chart's size, gives the tool a fresh frame over the whole chart. In a looking-only view the frame and its numbers are put away and come back unchanged with an editable view; choosing Crop again keeps the frame. A piece in hand is applied when the tool is chosen. The tool is unavailable with no chart and in looking-only views. While it is open the usual editing options (colours, symmetry, brush) are not offered.

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
| **Crop to selection** | A piece | Cuts the chart down to the piece's rectangle, discarding everything outside it (the piece is applied first); the photo behind keeps its alignment |
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

Keys act when no text entry has the focus, and not while the command list is open. Each key belongs to a command (below); a command that is not available does nothing when its key is pressed.

| Key | Does |
|---|---|
| B, F, L, R, O, Q, G, C, K, J | Brush, Fill, Line, Rectangle, Oval, Lasso, Lasso fill, Crop, Backstitch, Backstitch edit |
| X | Swap the two drawing colours |
| 1, 2, 3 | Color, Black & white, Stitched view |
| 4, 5 | Grid + photo, Original photo (only with a photo) |
| Space (held) | Pan temporarily |
| Escape | Cancels the piece, the shape, the lasso fill or the backstitch run in hand; puts down the backstitch in hand; or puts the crop frame back over the whole chart. Only one of these can be in hand at a time |
| Enter | Applies the piece in hand (Select and Lasso), or the crop frame (Crop); otherwise the pen of the keyboard cell cursor (above) |
| Delete, Backspace | Deletes the backstitch in hand (Backstitch edit only) |
| Ctrl/Cmd + Z | Undo. Does nothing with a piece in hand |
| Ctrl/Cmd + Y, Ctrl/Cmd + Shift + Z | Redo. Does nothing with a piece in hand |
| Arrow keys, Shift + Arrow keys | Keyboard cell cursor (above): by one stitch, by ten |

## Command list

| | |
|---|---|
| **Purpose** | Find any command by name, see its key, and run it |
| **Contents** | Every command of the editor: its group, its name, its key if it has one, and whether it can be used now. Groups, in order: File, Generate, Edit, Tools, Selection, Backstitch, Crop, Colours, Chart, View, Keyboard cursor. The commands are the ones `docs/interface-placement.md` lists |
| **Search** | Free text, empty each time the list is opened. Shows the commands whose group, name or key contains every word typed, in the same order as the full list, with a count of shown against all; "No command matches." when there is none |
| **States of a command** | *Usable*: can be run. *Not usable now*: shown with the condition it waits for (for example "A piece in hand"), and cannot be run. *Keyboard only*: a key that acts while held, or in the middle of a drag, or belongs to the keyboard cell cursor; shown with its key and "From the keyboard only", and cannot be run from the list |
| **Running** | Choosing a usable command closes the list and runs it. From the keyboard: up and down move through the usable commands shown, wrapping round; Enter runs the marked one (the first, until moved); Escape closes without running anything |
| **Opening** | From one control that is always present, next to New chart. It has no key. Unavailable while the start screen covers a chart |
| **While open** | The chart's keys do not act; whatever is typed goes to the search |
| **Not in it** | An action that needs a value (which thread, what size, which export kind, the text to add) is not a command; it is reached where the value is given |

## Chart-level changes made while editing

| Change | Where described |
|---|---|
| Resize or crop the canvas | The Crop tool, above |
| Rename the chart | `03` |
| Merge, recolour, rename, change symbol, add a colour | `05` |
