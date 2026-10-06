# 06 · Backstitch and stitch types

Lines over the stitches, and half stitches. Sources: `lib/editor/backstitch.ts`, `backstitch-style.ts`, `stitch-kind.ts`, `app/hooks/use-canvas-tools.ts`, `app/components/panels.tsx`, `threads-pane.tsx`; as of 2026-10-02. All on the device. Lines can also be made by the generator (`02`, "Lines" and "Texture strokes").

## Backstitch: what it is

A **line** is a straight segment from one **grid corner** to another, drawn over the stitches, with no width setting and no curve. A chart with *w* × *h* stitches has corners numbered 0 to *w* across and 0 to *h* down (a line along the top of the first stitch runs from corner (0,0) to (1,0)); lines may be at any slope. Its length is in stitches: a diagonal across one stitch counts √2. Drawing the same line twice makes one; a line has a colour from the palette and is the same line whichever way round it was drawn. Lines belong to the chart, to its undo history, to selection (below), to the exports, and to the OXS file.

A drawn line is a fifth of a stitch wide in the views that show it (Color: solid or dashed by thread, see below; Stitched: a plain solid coloured line).

## Drawing tool (Backstitch)

| | |
|---|---|
| **Choose** | Tool, key K |
| **Colour used** | The colour in hand (foreground; with a secondary press, the background). No colour in hand: nothing is drawn |
| **Make a line** | Press at the first corner and press at the second, or drag from the first to the second and release there; a press and release at the same corner counts as a press only. The pressed corner is the nearest grid corner to the pointer. While placing, the line-to-be follows the pointer |
| **Make a run (an outline)** | Hold **Ctrl** (or **Cmd**) while placing a line's end: that end becomes the start of the next line. Without it, two presses make one line and the run is over. A double press or Escape ends a run held open |
| **Undo** | Each line is its own undo step |
| **Symmetry** | Lines are mirrored by the active axes as stitches are |
| **Available when** | A chart in an editable view |

## Editing tool (Backstitch edit)

| | |
|---|---|
| **Choose** | Tool, key J |
| **Pick up a line** | A press on a line takes it into hand wherever on it the press lands; drag to move it. The line in hand is marked |
| **Re-aim an end** | Only for a line already in hand: a press within a short zone at one end (never more than a third of the line, so even a one-stitch line has a body to hold) drags that end |
| **Take a whole run** | A double press takes every line joined to it end to end in the same thread (a line merely crossing another's middle is a separate stroke). With more than one line in hand no end can be grabbed: a drag moves them all, and a press on a line in hand carries everything in hand |
| **Moving** | A drag moves the lines in hand, snapped to corners; a movement that would take any line off the chart is declined as a whole |
| **Delete** | The Delete or Backspace key, or the Delete action |
| **Escape / Deselect** | Puts the lines down |

While this tool is in hand its own set of actions is offered in place of the usual ones. Edits here are committed as they happen, so undo and redo stay usable (they are never unavailable the way they are with a selection piece in hand).

| Action | Available when | Effect |
|---|---|---|
| Undo, Redo | A step exists | |
| Copy | At least one line in hand | Keeps a copy |
| Paste | A copy exists | New lines in hand |
| Duplicate | A line in hand | Leaves it and takes a copy in hand |
| Mirror left to right / top to bottom | A line in hand | |
| Turn a quarter turn left / right | A line in hand | |
| Recolour | A line in hand and a colour in hand (otherwise unavailable: "Pick a thread in the list first — there is no colour to use") | Gives the line the colour in hand |
| Delete | A line in hand | |
| Deselect | A line in hand | |
| Count | | "none selected" or "*n* selected" |

## Lines and selections

A rectangle or lasso selection takes a line only when **both** its ends are inside the piece (for a lasso, a corner is inside when any kept stitch meets it). Carried lines move, flip, turn and apply with the stitches; the originals are removed when the piece is applied. A move of the whole design carries the lines with it and removes any line pushed off the chart; a canvas resize removes a line the canvas no longer contains, entirely.

## Backstitch in the thread list

One palette, listed twice. A thread used for lines appears in a **Backstitch** section under the crosses (absent when there are no lines), with the same name and colour as its cross entry, so renaming, recolouring and merging show in both. The section header gives the total length; each entry gives the thread's line length in centimetres or inches at the fabric count, longest first, with a bar relative to the longest; a entry press makes that thread the foreground; a entry can be dragged onto another entry to merge; each entry has its own light for Isolate (a cross entry lights stitches, a backstitch entry lights its lines).

## How lines are told apart in print

Five line styles, given to threads in order of how much line they carry (the thread with the most line is **solid**), then reused: solid, dashed, dotted, dash-dot, long dash. A thread keeps its style by its rank among threads that carry backstitch, so a style can change between exports if another thread gains lines. A line of five stitches or longer also carries the thread's symbol on small beads at regular spacing; shorter lines carry none. Both the on-screen Color view and print use these styles; the Stitched view uses plain solid lines in the thread's colour.

## Half stitches

A stitch is **whole**, or a **half stitch slanting "/"**, or a **half stitch slanting "\\"**. Each cell holds one kind; an empty cell holds none. A chart with no half stitch carries no kind data at all.

| Aspect | Behaviour |
|---|---|
| **Choosing what to lay** | The Stitch type choice (`04`): three exclusive choices, each drawn as the shape of the stitch, shown only with Brush, Fill, Line, Rectangle, Oval and Lasso fill; kept in the browser; default whole |
| **How drawn** | A half stitch is its cell with two opposite corners cut away (each cut is 60 % of the side, so what is left is a diagonal band) |
| **Flips, turns, symmetry, quick mirror** | A "/" becomes "\\" where a mirror image needs it |
| **Counts** | The stitch count counts whole and half stitches together; the legend's details table gives the whole-stitch count and the half-stitch count separately when the chart has half stitches |
| **Exports** | The Pattern Keeper PDF and the OXS file carry a half stitch as a whole stitch (`08`); the chart images and A4 pages draw them as half stitches and list every stitch type and thread in the colour key |
| **Generation** | Never makes half stitches |
