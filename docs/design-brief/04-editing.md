# 04 · Editing

Drawing and changing a chart. Sources: `app/tools/*`, `app/commands/registry.ts`, `app/hooks/use-keyboard-shortcuts.ts`, `use-keyboard-cursor.ts`, `lib/editor/*`, `app/components/tool-rail.tsx`, `context-bar.tsx`, `panels.tsx`, `selection-actions.tsx`, `command-list.tsx`; as of 2026-10-05. All of it runs on the device and works with no connection. Backstitch tools are in `06`, lettering in `07`, the thread list in `05`.

## When editing is possible

Editing needs a chart, shown in a view that can be edited (Color or Black & white, with or without symbols, and over the photo while the pattern is at least 5 % visible; `03`). It is unavailable with no chart, over the starting point, and in a looking-only view (Stitched, or the pattern below 5 % over the photo), where only panning and zooming act. Every tool control is unavailable (not hidden) while there is no chart.

Every change to a chart is **one undo step**, however many stitches it touches: a stroke from press to release, a fill, a shape, an applied selection, a merge, a rename, a colour edit, a resize, a quick mirror.

## Tools

Sixteen tools; exactly one is in hand, chosen by its control or its key. Brush is in hand when a chart opens; the choice is not kept between visits.

| Tool | Key | What it does | Uses brush size/shape | Uses stitch type | Uses symmetry |
|---|---|---|---|---|---|
| **Brush** | B | Paints stitches under the pointer while it is pressed and moves, one stroke = one undo step. A double press is two presses. With no thread chosen for the press, it gives the stitches it crosses the stitch type chosen and keeps their colour; empty stitches are left alone, and a stroke that changes nothing is no undo step | Yes | Yes | Yes |
| **Fill** | F | One press fills the region under the pointer, and the mirrored regions: the touching stitches of the pressed one's colour and stitch type, with the colour and the stitch type chosen; with **Color only**, every touching stitch of that colour of any type, which keeps its type. Stitches touching at a corner count as touching while **Diagonal neighbours** is on | No | Yes | Yes |
| **Line** | L | Drag from one stitch to another to draw a straight line of stitches as thick as the brush; follows the pointer until released; Escape drops it | Thickness | Yes | Yes |
| **Rectangle** | R | Drag from one corner stitch to the opposite; outlined (as thick as the brush) or filled (exactly the shape, whatever the brush size) | Outline only | Yes | Yes |
| **Oval** | O | Drag a box; draws the oval that fits it, outlined or filled as above | Outline only | Yes | Yes |
| **Lasso fill** | G | Draw freehand around an area; on release everything enclosed is filled with the colour in hand, one undo step | No | Yes | Yes: every filled stitch is mirrored |
| **Picker** (the colour picker) | I (or Alt held) | A left press takes the colour under the pointer as the foreground, a right press as the background (see The two colours). On a backstitch line it takes the line's thread, elsewhere the stitch's; an empty cell gives the empty stitch. Paints nothing and is no undo step | No | No | **Ignores** |
| **Text** | none | See `07`: a press puts the lettering that is set up on the chart as a piece in hand | No | No | **Ignores** |
| **Backstitch** | K | See `06` | | | Yes |
| **Backstitch edit** (labelled "BS edit") | J | See `06` | | | Yes |
| **Crop** | C | Cuts the chart down, or grows it, with a frame whose four edges are the four numbers of the Crop section below; applied on request, one undo step | No | No | **Ignores** |
| **Select** | S | Drag a rectangle; the stitches inside are lifted as a piece in hand | No | No | **Ignores** |
| **Lasso** | Q | Draw freehand around the stitches wanted; they are lifted as a piece in hand | No | No | **Ignores** |
| **Magic wand** | W | One press selects the region under the pointer, found exactly as Fill finds it, with its own **Diagonal neighbours** and **Color only** choices (kept apart from Fill's); on an empty stitch, the touching empty stitches. A press on a backstitch line selects every line of its colour, and no stitches. The selection is lifted as a piece in hand | No | No | **Ignores** |
| **Move** | V | Drag to shift the whole design within the canvas; stitches that pass an edge wrap round to the other side so none is lost; the photo behind the chart moves by the same amount; backstitch lines move with it and a line pushed off the chart is removed | No | No | **Ignores** |
| **Pan** | H (or Space held) | Drag to scroll the chart | | | |
| **Zoom** | Z | A press zooms the way **Zoom direction** says; a right press, or Shift or Alt with a press, zooms the other way (both together: the way chosen). The pointer shows the way a press zooms | | | |

Changing tool puts down what the old one held: leaving Select, Lasso or Magic wand for a tool that is not one of them applies the piece in hand; a half-drawn shape, Lasso fill path, backstitch run or lines in hand are dropped.

**Alt held** lends the Picker to the tools that paint (Brush, Fill, Line, Rectangle, Oval, Lasso fill; D318): while Alt is down the picker is in hand and the cursor is a dropper; when it comes up the tool it borrowed from is back, unless another tool was chosen meanwhile, which then stays (D319). Alt works wherever the focus is outside a text entry. With any other tool Alt does what it did before: Zoom keeps it as its own zoom out. Switching to another program while Alt is down gives the tool back.

Shape tools (Line, Rectangle, Oval) share one gesture: press at the start, the shape follows the pointer, release to make it, **Escape** to drop it. Nothing is smoothed: every stitch a tool touches holds exactly the colour chosen, never a blend.

Lasso and Lasso fill smooth the wobble of a hand-drawn line and close the loop; a path drawn as a few deliberate corners keeps its corners; crossing your own line carves a hole.

## The two colours

| | |
|---|---|
| **Drawing colours** | A pair: a foreground and a background, each a palette colour, or the empty stitch, or nothing |
| **Left press** paints with the foreground; **right press** with the background. A stroke keeps the colour it started with |
| **Pick** | The Picker (I, or Alt held with a tool that paints) takes a colour off the chart: a left press as the foreground, a right press as the background |
| **Choose** | A press on a thread's entry in the thread list makes it the foreground (a second press on the same entry releases it: no colour in hand); a right press on a entry loads the background and does not change which is in front; a press on the background square makes it the foreground |
| **Swap** | Action, key **X**, also offered with the pair: swaps the roles without moving either colour |
| **Names** | Each colour's square gives its thread's name when pointed at; the names are not written beside the pair (Owner, 2026-10-07) |
| **Empty stitch as colour** | "Empty (no stitch)" is chosen like a thread and paints stitches away |
| **Unavailable states** | With no colour in hand (shown as "No thread chosen"), tools that paint do nothing, except the Brush, which sets the stitch type; a colour that has been merged away counts as no colour in hand |
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
| **Brush size** | **1, 3, 5, 7, 9, 11, 13, 15** stitches across (odd only, so every press has a centre) | 1 | Browser | Only with the tools that draw with the brush: Brush, Line, Rectangle and Oval |
| **Brush shape** | **Round** (the disc that fits the size) or **Square** (the whole block) | Round | Browser | With brush size |
| **Shape fill** | **Outline** or **Filled** | Outline | Browser | Only with Rectangle and Oval |
| **Stitch type** | **Whole stitch**, **Half stitch "/"**, **Half stitch "\\"** (three exclusive choices, each shown as the shape of the stitch) | Whole | Browser | Only with Brush, Fill, Line, Rectangle, Oval and Lasso fill. Each cell holds one kind. See `06` |
| **Diagonal neighbours** | **Diagonal** (stitches touching at a corner are filled too) or **Edges only** (only above, below, left and right), each shown as a picture of the stitches it reaches and named when pointed at | Diagonal | Browser | Only with Fill |
| **Color only** | **Color and type** (the region is one colour and one stitch type, and gets the stitch type chosen) or **Color only** (the region is one colour of any type; each stitch keeps its type; an empty stitch stays whole), each shown as a picture and named when pointed at | Color and type | Browser | Only with Fill |
| **Zoom direction** | **In** (a press zooms in) or **Out** (a press zooms out) | In | Browser | Only with Zoom |

**Outline of what a press will cover:** under the pointer, the stitches the tool in hand would cover are outlined, in the brush's size and shape (a disc for round, a block for square; one stitch for a filled rectangle or oval, whatever the brush size); it follows the pointer and leaves with it; the system pointer is hidden over the chart for these tools, and a small dot marks the exact place in the outlined stitch.

## Selection and the piece in hand

Choosing a region with Select, Lasso or the Magic wand (or pasting, or placing lettering from `07`) puts a **piece in hand**: it floats over the chart, which is unchanged underneath until the piece is applied.

**Selection mode** (one choice for every selection tool, kept between visits; default Select):

| Mode | A new area… |
|---|---|
| **Select** | replaces the selection. Pressing on the piece moves it instead |
| **Select +** | is added to the selection, cells and backstitch lines alike |
| **Select −** | is taken out of the selection, even when drawn inside it |

Under Select + and Select − a press always starts a new area. A piece that has been moved, flipped or turned is applied where it sits before a new area is added to it or taken from it; the selection is then the area on the chart.

**Transparency as colour** (one switch for every selection tool, kept between visits; default **Off**; each choice shown as a picture and named when pointed at): **On**, the piece's empty stitches cover what they land on, as any colour does. **Off**, what lies under them stays, in the preview and when the piece is applied. Turning it changes the piece already in hand. Either way, the place a piece was lifted from is emptied when it is applied, and backstitch under a piece is never removed.

| Action | Available when | Effect |
|---|---|---|
| **Move** (drag the piece) | A piece is in hand | Repositions it; stitches under it are not lost until it is applied |
| **Cut** (Ctrl/Cmd + X) | A piece | Takes the piece off the chart, emptying where it was lifted from, as one undo step, and keeps it to paste |
| **Copy** | A piece | Keeps a copy to paste |
| **Paste** | A copy exists | A new piece in hand on the layer being worked on: a cut piece, or a copy pasted on another layer, in the place it was taken from; a copy pasted on its own layer beside the original |
| **Duplicate** | A piece | Leaves the piece where it is and takes a copy in hand |
| **Fill selection** | A piece, and a colour in hand | Paints the whole selected area in the colour in hand (with the transparency lock, only the stitches that are not empty) |
| **Flip horizontal / Flip vertical** | A piece | Mirrors it; half stitches swap diagonal where a mirror needs it |
| **Rotate right / left** | A piece | A quarter turn clockwise / anticlockwise; half stitches swap diagonal |
| **Crop to selection** | A piece | Cuts the chart down to the piece's rectangle, discarding everything outside it on every layer (the piece is applied first), as one undo step; the photo behind keeps its alignment |
| **Save as stamp** | A piece, signed in | Asks for a name (**Save stamp**, or **Cancel**; an empty name is kept as "Untitled stamp"), then keeps the piece with the account as a stamp: its stitches, stitch types, shape and backstitch, and only the threads it uses. The piece stays in hand. "Saved “Rose” to your stamps." or the refusal (the count limit, `09`). Signed out it is greyed, with "Sign in to keep pieces as stamps and place them in other charts." below; switched off for someone, greyed with the feature's note |
| **Add stamp** | Signed in, with stamps, a chart open in Edit | A gallery of the account's stamps, pinned first then the newest, with the count and a search by name; each card shows its preview, name, size and threads. The stamp chosen arrives as a piece in hand three stitches in from the corner of the part of the chart in view, as lettering does: each of its threads is matched in the chart (by brand and code; a custom colour by its colour), and those the chart lacks are added to the palette, in the same undo step. Refused in the gallery, with the reason, when the chart is smaller than the stamp, the palette has no room for the threads it lacks (`09`), or a chart of one brand would take another brand's thread or a custom colour. Greyed, with the reason, when signed out, with no stamps, or with no chart in Edit; switched off for someone, greyed with the feature's note, or absent |
| **Apply here** (Enter) | A piece | Merges the piece into the chart where it sits |
| **Cancel** (Escape) | A piece | Puts the chart back as it was when this selection started, discarding the piece and its changes |
| **Invert selection** | Select, Lasso or Magic wand | Selects every cell and backstitch line the selection leaves out (the piece is applied first); with nothing selected, the whole chart. Inverting twice gives the same selection |


On a chart of more than one layer a selection takes only the active layer's stitches, and a paste goes onto it; the Selection group says so, naming the layer: "Selects from Layer 2, the layer you are working on; choose another layer to select its stitches."

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
| **Effects while on** | Brush, shape tools, Fill and Lasso fill cannot change whether a stitch is empty; Fill selection paints only stitches that are not empty. Selecting, moving and dragging act as they do without it |

## Dragging a colour from the thread list

Dragging a thread's entry onto a stitch fills the connected region (stitches not touching at corners) under it with that colour, with symmetry, as one undo step; unavailable in looking-only views. Dragging a entry onto another entry merges colours (`05`).

## Keyboard cell cursor

| | |
|---|---|
| **Purpose** | Draw without a pointing device |
| **Arrow keys** | Move the outlined stitch by one (with Shift, ten) |
| **Enter** | The pen: press to paint, hold while moving to draw a stroke or stretch a line, rectangle or oval, release to finish. Not while typing in a field, where Enter commits what was typed |
| **Available when** | A chart in an editable view, a tool that paints (Brush, Fill, Line, Rectangle, Oval), no piece in hand; arrow keys do nothing while a field, choice list or similar control has the focus and uses them itself |
| **Interaction** | Works through the same paths as the pointer, so the lock, outline, rulers' marker and status readout behave identically; a real pointer move hands control back to the pointer |

## Keyboard shortcuts

Keys act when no text entry has the focus, and not while the command list is open. Each key belongs to a command (below); a command that is not available does nothing when its key is pressed.

| Key | Does |
|---|---|
| B, F, L, R, O, Q, G, I, C, K, J, S, W, V, H, Z | Brush, Fill, Line, Rectangle, Oval, Lasso, Lasso fill, Picker, Crop, Backstitch, Backstitch edit, Select, Magic wand, Move, Pan, Zoom |
| X | Swap the two drawing colours |
| 1, 2, 3 | Color, Black & white, Stitched pattern |
| Y | Symbols on or off (Color and Black & white) |
| P | Photo under the pattern on or off (Color and Black & white, with a photo) |
| 4, 5 | The photo with the pattern half visible, the photo alone (only with a photo) |
| Space (held) | Pan temporarily |
| Alt (held) | The Picker while held, with a tool that paints in hand |
| Escape | Cancels the piece, the shape, the lasso fill or the backstitch run in hand; puts down the backstitch in hand; or puts the crop frame back over the whole chart. Only one of these can be in hand at a time |
| Enter | Applies the piece in hand (Select, Lasso and Magic wand), or the crop frame (Crop); otherwise the pen of the keyboard cell cursor (above) |
| Delete, Backspace | Deletes the backstitch in hand (Backstitch edit only) |
| Ctrl/Cmd + X | Cuts the piece in hand |
| Ctrl/Cmd + C | Copies the piece in hand, or the backstitch in hand |
| Ctrl/Cmd + V | Pastes the copied piece (Select, Lasso or Magic wand in hand), or the copied backstitch (Backstitch edit in hand) |
| Ctrl/Cmd + D | Duplicates the piece in hand, or the backstitch in hand |
| Ctrl/Cmd + K | Opens the command list, and closes it |
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
| **Opening** | From one control that is always present, next to New chart, or with Ctrl/Cmd + K, which also closes it. Unavailable while the start screen covers a chart |
| **While open** | The chart's keys do not act; whatever is typed goes to the search |
| **Not in it** | An action that needs a value (which thread, what size, which export kind, the text to add) is not a command; it is reached where the value is given |

## Layers

A chart is a stack of layers, bottom to top; a new chart (generated, blank, opened from a file of one layer) has one, **Layer 1**. Exactly one layer is **active** at a time. The **Layers** list is offered in Edit only, beside the chart settings and the thread list.

| Control | Effect | Undo step |
|---|---|---|
| **A row** (top layer first) | A press makes its layer the active one, marked by its outline; Enter or Space does the same from the keyboard | No |
| **Eye** at the row's start | Shows or hides the layer; a hidden layer's name is dimmed | Yes |
| **Name** | Double-click or F2 renames it; Enter or leaving the field keeps the new name, Escape or an empty name keeps the old | Yes |
| **Drag a row** | While dragging, every other row shows a **Merge** box. Let go on a box: the dragged layer is merged into that one. Let go anywhere else: it moves to the gap nearest the pointer, shown as a line | Yes, one per drop |
| **Add layer** | A new empty layer, **Layer 2**, **Layer 3**…, above the active one, and made active. At most 32 | Yes |
| **Move up / Move down** | The active layer one place up or down | Yes |
| **Merge down** | The active layer into the one below | Yes |
| **Delete layer** | Deletes the active layer; the one below becomes active (the one above, for the bottom layer). With one layer it is unavailable, with the note "A chart always has at least one layer, so its only layer can't be deleted." | Yes |

A merge keeps the lower-in-the-drop layer's place, name and visibility (the target's); where both have a stitch, the upper layer's wins. A piece in hand is put down on its own layer before any of these changes. Undoing a step that removed the active layer leaves the top layer active, so a chart is never without one.

Every drawing tool (Brush and its eraser, Fill, Line, Rectangle, Oval, Lasso fill, Text, Select, Lasso, Magic wand, stamps) and the quick mirrors change the active layer only. A drawing in progress is shown among the other layers: what lies above stays above it, and erasing shows the layer below. Fill and the Magic wand find their area in the active layer's stitches alone. With the active layer hidden, these refuse to draw, with the note "Layer 2 is hidden: show it to draw on it." under the view controls. The Picker takes the stitch on top of what is shown, whichever layer it is on. Backstitch lies above every layer and is drawn whichever layer is active. Move and Crop act on every layer. What the chart shows is what it counts: the thread list's counts and skeins (`05`) and every export (`08`) take the top stitch of the visible layers, and a hidden layer counts nowhere.

## Chart-level changes made while editing

| Change | Where described |
|---|---|
| Resize or crop the canvas | The Crop tool, above |
| Rename the chart | `03` |
| Merge, recolour, rename, change symbol, add a colour | `05` |
