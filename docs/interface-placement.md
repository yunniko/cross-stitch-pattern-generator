# Interface placement: where every control belongs (G-090 M3)

Date: 2026-10-04 · at commit 67fcc2c. The behaviour of every control is in `docs/design-brief/`; this document adds the one
thing the brief leaves out on purpose: **where each control is today, what its scope is, and whether the two agree.** It is the
checklist for the redesign and the rule for placing anything new. Present places were read from the interface code; nobody was
observed using the app, so "misplaced" means "breaks the rule", not "users were seen to struggle".

## The rules

1. **Scope decides place.** Every control has exactly one scope:

   | Scope | Means | Lives |
   |---|---|---|
   | **Application** | True whatever chart is open: new, open, account, preferences | One fixed application area, always present |
   | **Document** | A property of the chart, saved with it: name, size, palette, fabric | The document's own area |
   | **Layer** *(future)* | A property of one layer | With the layer list |
   | **Selection** | Acts on the piece or lines in hand | Appears with a selection, beside it |
   | **Tool** | An option of the tool in hand | One tool-options region that shows the current tool's options and nothing else |
   | **View** | Changes how the chart is shown, never the chart | One view area, **always available**, whatever tool is in hand |
   | **Action parameters** | Settings read by one action (Generate, an export) | With that action, shown when the action is being prepared |

2. **Tool options travel with the tool**; a tool's options never sit in a general settings list.
3. **Absent, not disabled**, when a feature cannot apply; disabled only when it applies but is waiting on something the person can do.
4. **One command list**: every action is registered once (name, key, when available). The interface, the shortcuts and a
   searchable command list all read that list. **Built (G-093):** the keys and the command list read one table.
5. **Where it is saved follows the scope**: document scope is saved in the chart; application and view scope in the browser.

## Every control, by scope

"Now" is the present place: **L** the tool list on the left, **T** the bar above the chart (replaced entirely by the selection,
backstitch-edit or crop bar while those tools are in hand), **P/C/Th/Tx** the Photo, Chart, Threads and Text tabs on the right,
**F** the foot of the right column, **S** the status line, **St** the start screen.

| Control (brief file) | Scope | Now | Agrees? | By the rules |
|---|---|---|---|---|
| Command list (`04`) | Application | L, under New | Yes | |
| New chart; Choose photo, Empty grid, Open, Import pixel art (`08`) | Application | L (New), St | Partly: "New" sits among tools | Application area |
| Log in / account (out of scope of the brief) | Application | Above L | Yes | Application area |
| Undo, Redo (`04`) | Application | T, and repeated in each of the three replacement bars | No: four copies, one per bar | One fixed place |
| Export choice, Export, Export all (`08`) | Application (commands on the document) | F, only while the Threads tab is up | **No**: hidden behind an unrelated tab | Application area, always reachable |
| Autosave state (`03`) | Application | S | Yes | |
| Name (`03`) | Document | C | Yes | Document area |
| Size (crop, grow) (`04`) | Tool (Crop) | Crop's own bar | Yes (since G-089) | |
| Fabric count, Unit (`03`) | Document (they decide the finished size and every export) | C, and on St for an empty grid | Yes. Saved in the chart since G-094 (D290); the browser keeps the last choice as the start for a new chart | |
| Author name (`08`) | Action parameters (exports) | C | No | With exports; arguably document metadata |
| A4 cell size, A4/PDF overlap, Canvas in exported preview (`08`) | Action parameters (exports) | C | **No**: the export control is in another tab | With the export they belong to, shown when that export is chosen |
| Thread list: choose, rename, symbol, colour editor, merge, add (`05`) | Document (palette) | Th | Yes | Document area |
| Summary: threads, skeins (`05`) | Document | Th | Yes | |
| Canvas colour, Canvas texture, Stitch texture (`03`) | View (the last also an export parameter) | C | No | View area |
| The five views; photo behind the chart (`03`) | View | T | **No**: they vanish while Select, Lasso, Backstitch edit or Crop is in hand | View area, always available |
| Isolate switch (`05`) | View | T (vanishes as above) | No | View area |
| Isolate lights per thread (`05`) | View | Th, per thread | Acceptable: they are per thread | Stay with the thread, but the switch must be reachable from there |
| Zoom, reset zoom (`03`) | View | S | Yes | View area |
| Rulers, pointer readout, size and finished size (`03`) | View | Around the chart, S | Yes | |
| Tool choice (`04`) | Application | L | Yes | |
| The two drawing colours, swap (`04`) | Tool (all painting tools) | T (vanishes as above; right for Crop, wrong for Backstitch edit's Recolour, which needs to show it) | Mostly | Tool options |
| Brush size, shape (`04`) | Tool (Brush, Line, outlines) | T, shown for every tool including Fill, Move, Pan, Zoom, which ignore it | No: shown when it cannot apply | Tool options of the tools that use it |
| Shape fill (`04`) | Tool (Rectangle, Oval) | T, only with those tools | Yes | |
| Stitch type (`06`) | Tool (painting tools) | T, only with those tools | Yes | |
| Double-press fills a region (`04`) | Tool (Brush) | C | **No** | Brush options |
| Lock transparency (`04`) | Tool (all painting tools) | T, among the view controls | No | Tool options |
| Symmetry axes (`04`) | Tool modifier while drawing; saved in the chart | T, shown for tools that ignore it (Select, Move); absent in the replacement bars | Partly | Tool options of the tools that obey it |
| Quick mirror, four actions (`04`) | Document commands | L, under the tools | No: they are commands, not tools | Command list / document area |
| Selection actions: copy … crop to selection, apply, cancel (`04`) | Selection | Replacement bar | Scope yes; it displaces view and undo | Selection area that adds to, not replaces |
| Backstitch-edit actions (`06`) | Selection (lines in hand) | Replacement bar | As above | As above |
| Crop numbers, Apply, Cancel (`04`) | Tool | Replacement bar | Scope yes; displaces view controls | Tool options |
| Text: font, size, weight, colour, text, preview, Add (`07`) | Tool (it makes a piece, like Paste) | Tx, a tab beside document settings | No: it is a tool shown as a settings page | A Text tool with these as its options |
| Generation: size, colours and hint, palette mode, set-up palette, algorithm, colour detail, edges, dither and texture, lines, strokes (`02`) | Action parameters (Generate) | P | Yes | With Generate |
| Photo adjustment (`02`) | Action parameters (Generate), previewed live | P | Yes | With Generate |
| Generate / Regenerate (`02`) | Application command with parameters | F while P is up | Yes | |
| Compare with original (`03`) | View | Under the photo | Yes | |
| Messages (`09`) | By what caused them | A strip under T; generation errors inside P; resize errors in the crop readout | Mixed | One message area, plus notes beside the control that caused them |

### What the table shows

- **20 of 36 rows break a rule: 12 outright, 8 in part.** Three kinds:
  1. *Settings parked in the Chart tab* that belong to a tool, the view or an export: double-press fill, canvas colour and
     cloth, stitch texture, A4 cell size, overlap, canvas-in-preview, author.
  2. *A bar that is replaced wholesale.* Selection, backstitch editing and Crop each swap the bar, which removes the views,
     Isolate, the colours and (for two of them) symmetry while they are in hand. View and application controls must not
     depend on the tool.
  3. *Commands filed as something else:* quick mirror among tools, Text as a tab, exports behind the Threads tab, New among
     tools, four copies of Undo.
- **One scope mismatch in the data:** symmetry is a tool modifier saved in the chart. (Fabric count and unit were document
  facts saved in the browser, a real defect for anyone moving a chart between browsers; G-094 moved them into the chart.)
- What already follows the rules: the thread list, generation settings, Crop's options, stitch type and shape fill (shown
  only with the tools that use them).

## The command list

Every command the editor has, as registered in code (`app/commands/registry.ts` and the tool modules; G-093, D286). The table
below is written by `npx tsx scripts/design-brief-commands.ts --write` and checked by the same script without `--write`; it is
not edited by hand.

<!-- commands:begin (generated by scripts/design-brief-commands.ts --write) -->
| Group | Command | Key | Available when |
|---|---|---|---|
| File | New chart | — | The start screen is not already up |
|  | Choose a photo | — | Not while a photo is being read or a chart generated |
|  | Open a pattern file | — | Always |
|  | Import pixel art | — | Always |
|  | Export in the chosen kind | — | A chart; no export running |
|  | Export all kinds | — | A chart; no export running |
|  | Export the editable file | — | A chart; no export running |
| Generate | Generate or regenerate the chart | — | A photo; nothing generating |
|  | Cancel generating | — | A chart is being generated |
|  | Reset the photo adjustment | — | A photo; a value off neutral |
| Edit | Undo | Ctrl+Z | A step back exists; no piece in hand |
|  | Redo | Ctrl+Y, Ctrl+Shift+Z | A step forward exists; no piece in hand |
|  | Cancel the shape being drawn | Escape | A line, rectangle or oval is being dragged |
|  | Cancel the lasso fill being drawn | Escape | A lasso fill is being drawn |
| Tools | Brush tool | B | A chart |
|  | Fill tool | F | A chart |
|  | Line tool | L | A chart |
|  | Rectangle tool | R | A chart |
|  | Oval tool | O | A chart |
|  | Lasso fill tool | G | A chart |
|  | Backstitch tool | K | A chart |
|  | BS edit tool | J | A chart |
|  | Select tool | S | A chart |
|  | Lasso tool | Q | A chart |
|  | Crop tool | C | A chart |
|  | Move tool | V | A chart |
|  | Pan tool | H | A chart |
|  | Zoom tool | Z | A chart |
| Selection | Copy the piece | Ctrl+C | A piece in hand |
|  | Paste the copied piece | Ctrl+V | Select or Lasso in hand; a piece was copied |
|  | Duplicate the piece | Ctrl+D | A piece in hand |
|  | Fill the piece with the colour in hand | — | A piece and a colour in hand |
|  | Flip the piece left to right | — | A piece in hand |
|  | Flip the piece top to bottom | — | A piece in hand |
|  | Turn the piece right | — | A piece in hand |
|  | Turn the piece left | — | A piece in hand |
|  | Crop the chart to the piece | — | A piece in hand |
|  | Apply the piece where it sits | Enter | A piece in hand |
|  | Cancel the piece | Escape | A piece in hand |
| Backstitch | End the run being drawn, without its pending line | Escape | A backstitch run is being drawn |
|  | Copy the backstitch in hand | Ctrl+C | Lines in hand |
|  | Paste backstitch | Ctrl+V | Backstitch edit in hand; lines were copied |
|  | Duplicate the backstitch in hand | Ctrl+D | Lines in hand |
|  | Mirror the backstitch left to right | — | Lines in hand |
|  | Mirror the backstitch top to bottom | — | Lines in hand |
|  | Turn the backstitch right | — | Lines in hand |
|  | Turn the backstitch left | — | Lines in hand |
|  | Recolour the backstitch in hand | — | Lines and a colour in hand |
|  | Delete the backstitch in hand | Delete, Backspace | Lines in hand |
|  | Put the backstitch in hand down | Escape | Lines in hand |
| Crop | Apply the crop frame | Enter | A crop frame that differs from the chart and is valid |
|  | Put the crop frame back over the whole chart | Escape | A crop frame that differs from the chart |
| Colours | Swap the two drawing colours | X | A chart |
|  | Isolate the lit threads | — | A chart |
| Chart | Mirror the left half | — | A chart |
|  | Mirror the upper half | — | A chart |
|  | Mirror the upper-left corner | — | A chart |
|  | Mirror the upper-left half corner | — | A square chart |
|  | Vertical symmetry on or off | — | A chart |
|  | Horizontal symmetry on or off | — | A chart |
|  | Diagonal symmetry ↘ on or off | — | A square chart |
|  | Diagonal symmetry ↙ on or off | — | A square chart |
|  | Transparency lock on or off | — | A chart |
| View | Color view | 1 | A chart |
|  | Black & white view | 2 | A chart |
|  | Stitched view | 3 | A chart |
|  | Grid + photo view | 4 | A chart with a photo |
|  | Original photo view | 5 | A chart with a photo |
|  | Zoom in | — | A chart |
|  | Zoom out | — | A chart |
|  | Reset zoom to 100% | — | A chart |
|  | Open the command list | Ctrl+K | The start screen does not cover a chart |
|  | Pan while the key is held | Space (held) | A chart |
| Keyboard cursor | Move the outlined stitch by one | Arrow keys | A painting tool, an editable view, no piece in hand |
|  | Move the outlined stitch by ten | Shift+Arrow keys | A painting tool, an editable view, no piece in hand |
|  | The pen: paint, or hold to draw | Enter | A painting tool, an editable view, no piece in hand |
<!-- commands:end -->

**Not commands, because each needs a value:** New empty grid (a size); the export kind; the colour count and "use the suggested
count"; the palette set-up actions (fill with predicted colours, clear, save, load, delete, load a file); per-thread actions
(add, edit, change symbol, rename, merge into, light or unlight); rename the chart; compare with the original; the Text
actions. They are reached where their value is given, and the brief describes each.

**What the table shows:** about a third of the commands have a key. Escape and Enter are shared on purpose: each means
"whatever is in hand", only one thing can be in hand at a time, and the first command that takes the press ends it. Copy,
paste and duplicate share Ctrl+C, Ctrl+V and Ctrl+D between the piece and the backstitch in hand for the same reason. Every
tool has a key since D288. A new key is a change of behaviour and is the Owner's to approve, one by one.

## How to place something new

1. Name its scope from the table of rules. If it seems to have two, it is two controls (as stitch texture is a view setting
   *and* an export parameter).
2. Put it where that scope lives; never in the nearest free space.
3. Register its command with a name and a condition (`docs/architecture.md`, placement guide); a key only if it is used
   repeatedly, and only with the Owner's yes.
4. Decide where it is saved from its scope (rule 5).
5. Add it to the design brief and to this table in the same change.

## What this does not decide

The look, the layout, and which region goes where on the screen: those are the redesign's. Both changes of behaviour this document
once left open are made: fabric count is in the chart file (G-094) and every tool has a key (D288).
