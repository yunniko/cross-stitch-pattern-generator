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
   searchable command palette all read that list.
5. **Where it is saved follows the scope**: document scope is saved in the chart; application and view scope in the browser.

## Every control, by scope

"Now" is the present place: **L** the tool list on the left, **T** the bar above the chart (replaced entirely by the selection,
backstitch-edit or crop bar while those tools are in hand), **P/C/Th/Tx** the Photo, Chart, Threads and Text tabs on the right,
**F** the foot of the right column, **S** the status line, **St** the start screen.

| Control (brief file) | Scope | Now | Agrees? | By the rules |
|---|---|---|---|---|
| New chart; Choose photo, Empty grid, Open, Import pixel art (`08`) | Application | L (New), St | Partly: "New" sits among tools | Application area |
| Log in / account (out of scope of the brief) | Application | Above L | Yes | Application area |
| Undo, Redo (`04`) | Application | T, and repeated in each of the three replacement bars | No: four copies, one per bar | One fixed place |
| Export choice, Export, Export all (`08`) | Application (commands on the document) | F, only while the Threads tab is up | **No**: hidden behind an unrelated tab | Application area, always reachable |
| Autosave state (`03`) | Application | S | Yes | |
| Name (`03`) | Document | C | Yes | Document area |
| Size (crop, grow) (`04`) | Tool (Crop) | Crop's own bar | Yes (since G-089) | |
| Fabric count, Unit (`03`) | Document (they decide the finished size and every export) | C, and on St for an empty grid | Place yes; **saving no**: kept in the browser, not in the chart, so a chart opened elsewhere takes that browser's count | Document area, saved with the chart |
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
- **Two scope mismatches in the data:** fabric count and unit are document facts saved in the browser; symmetry is a tool
  modifier saved in the chart. The first is a real defect for anyone moving a chart between browsers.
- What already follows the rules: the thread list, generation settings, Crop's options, stitch type and shape fill (shown
  only with the tools that use them).

## The command list

Every action the app has, as it would be registered: name, key today, when available. Collected from the brief; no command is
new. Keys marked — have none today.

| Group | Command | Key | Available when |
|---|---|---|---|
| File | New chart | — | Always |
| | Choose photo | — | Not while reading a photo or generating |
| | New empty grid | — | Valid size |
| | Open pattern file | — | Always |
| | Import pixel art | — | Always |
| | Export (chosen kind) | — | A chart; no export running |
| | Export all | — | A chart; no export running |
| | Export editable file | — | A chart |
| Generate | Generate / Regenerate | — | A photo; nothing generating |
| | Cancel generation | — | Generating |
| | Use suggested colour count | — | A recommendation differs from the count |
| | Reset photo adjustment | — | Any value off neutral |
| | Fill palette with predicted colours; Clear; Save; Load; Delete; Load file | — | Set-up mode, and each one's own condition (`02`) |
| Edit | Undo | Ctrl+Z | A step back exists; no piece in hand |
| | Redo | Ctrl+Y, Ctrl+Shift+Z | A step forward exists; no piece in hand |
| | Apply piece / crop | Enter | A piece in hand; or a crop frame that can be applied |
| | Cancel piece / shape / crop | Escape | One is in hand |
| Tools | Brush, Fill, Line, Rectangle, Oval, Lasso fill | B, F, L, R, O, G | A chart, editable view |
| | Backstitch, Backstitch edit | K, J | As above |
| | Select, Lasso, Crop, Move | —, Q, C, — | As above |
| | Pan (temporary), Zoom | Space (held), — | A chart |
| Selection | Copy, Paste, Duplicate | — | A piece; a copy exists (Paste) |
| | Fill selection | — | A piece and a colour in hand |
| | Flip horizontal, Flip vertical, Rotate right, Rotate left | — | A piece |
| | Crop to selection | — | A piece |
| Backstitch | Copy, Paste, Duplicate, Mirror ×2, Turn ×2, Recolour, Delete, Deselect | Delete (Delete/Backspace), Deselect (Escape) | Lines in hand; a colour in hand (Recolour) |
| Colours | Swap drawing colours | X | A chart |
| | Add colour; Edit colour; Change symbol; Rename; Merge into…; Merge into empty | — | A chart; each per thread |
| | Toggle Isolate; Light / unlight thread | — | A chart |
| Chart | Mirror left half, upper half, upper-left corner, upper-left half corner | — | A chart; the last two need a square canvas |
| | Toggle symmetry: vertical, horizontal, two diagonals | — | A chart; diagonals need a square canvas |
| | Toggle transparency lock | — | A chart |
| | Rename chart | — | A chart |
| View | Color, Black & white, Stitched | 1, 2, 3 | A chart |
| | Grid + photo, Original photo | 4, 5 | A chart with a photo |
| | Zoom in, Zoom out, Reset zoom | Wheel; — | A chart |
| | Compare with original | — | Photo adjusted, no chart yet |
| Text | Use my computer's fonts; Add lettering | — | Its conditions (`07`) |
| Keyboard cursor | Move stitch, move ten, pen | Arrows, Shift+arrows, Enter | A painting tool, editable view, no piece in hand |

**Findings from the list:** roughly 90 commands, about a quarter with a key. Enter and Escape each mean three things depending on what is in
hand, which works because only one can be in hand at a time, and must stay true. Select, Move and Zoom have no key; neither do
undo-adjacent commands people repeat most (copy, paste, duplicate have no Ctrl+C / Ctrl+V / Ctrl+D). A command registry makes
these gaps visible and fixable in one table.

## How to place something new

1. Name its scope from the table of rules. If it seems to have two, it is two controls (as stitch texture is a view setting
   *and* an export parameter).
2. Put it where that scope lives; never in the nearest free space.
3. Register its command with a name and a condition; add a key only if it is used repeatedly.
4. Decide where it is saved from its scope (rule 5).
5. Add it to the design brief and to this table in the same change.

## What this does not decide

The look, the layout, and which region goes where on the screen: those are the redesign's. Whether fabric count moves into
the chart file, and the missing shortcuts, are changes of behaviour and would be goals of their own.
