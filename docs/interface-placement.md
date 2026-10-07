# Interface placement: where every control belongs

Date: 2026-10-05 · at commit 581f8c7 (G-095 M6; first written for G-090 M3 at 67fcc2c). The behaviour of every control is in
`docs/design-brief/`; this document adds the one thing the brief leaves out on purpose: **where each control is, what its scope
is, and whether the two agree.** It is the rule for placing anything new. Places were read from the interface code and the
pictures `node scripts/look.mjs` takes; nobody was observed using the app, so "agrees" means "follows the rule", not "users were
seen to find it".

## The rules

1. **Scope decides place.** Every control has exactly one scope:

   | Scope | Means | Lives |
   |---|---|---|
   | **Application** | True whatever chart is open: new, open, account, preferences | The bar above, always present |
   | **Document** | A property of the chart, saved with it: name, size, palette, fabric | The Edit workspace's tabs |
   | **Layer** *(future)* | A property of one layer | With the layer list |
   | **Selection** | Acts on the piece or lines in hand | The bar of tool options, added to it while something is in hand |
   | **Tool** | An option of the tool in hand | The bar of tool options, and the tool's own tab when it brings one |
   | **View** | Changes how the chart is shown, never the chart | Over the chart, **in every workspace and with every tool**; a view setting that is set once and left is in Preferences |
   | **Action parameters** | Settings read by one action (Generate, an export) | In that action's workspace, beside the action |

2. **Tool options travel with the tool**; a tool's options never sit in a general settings list.
3. **Absent, not disabled**, when a feature cannot apply; disabled only when it applies but is waiting on something the person can do.
4. **One command list**: every action is registered once (name, key, when available). The interface, the shortcuts and a
   searchable command list all read that list (G-093).
5. **Where it is saved follows the scope**: document scope is saved in the chart; application and view scope in the browser.
6. **A workspace is a kind of work, not a scope** (D297): Photo makes the chart, Edit changes it, Export gets it out. An
   action's parameters live in its workspace; application and view controls are the same in all three.
7. **A control belongs to the workspace it is offered in, and goes with that workspace's switch** (G-103, D312, D313): Save
   and Export-then-start-new are Export's; Choose a photo, a dropped photo and Generate are Photo's; Continue in Edit is
   Edit's. Undo, Redo and the starting choices other than a photo belong to none and stay. A new control or command names
   its workspace; `commandGate` and `gatedAction` read that switch before the control's own.
8. **Q shows controls, not names** (Owner, 2026-10-07, G-118, D339): no tool name, no group headings and no thread names on
   it; each control carries its name for a screen reader and as a title. What commits the tool's work (Apply here, Cancel,
   Crop's pair, Deselect) sits in Q's end, after the options and never over them. Panels and tabs keep their headings.

## Every control, by scope

Places: **A** the bar above (application); **W** the workspace tabs in it; **L** the tools on the left; **Q** the bar of tool
options above the chart; **V** the view controls floating over the foot of the chart; **S** the readout under the chart;
**Ph** the Photo workspace's panel; **C/Th** the Chart and Threads tabs of Edit; **Tt** the tool's own tab, first among Edit's
tabs while its tool is in hand; **X** the Export workspace's panel; **Pr** Preferences; **St** the starting choices.

| Control (brief file) | Scope | Place | Agrees? |
|---|---|---|---|
| Command list (`04`) | Application | A | Yes |
| New chart (`08`) | Application | A; the choices it leads to on St | Yes |
| Save, the editable file (`08`) | Application (a command on the document) | A, in every workspace | Yes |
| Log in / account (outside the brief) | Application | A | Yes |
| Undo, Redo (`04`) | Application | A, once | Yes |
| Workspace: Photo, Edit, Export (`01`) | Application | W | Yes |
| Preferences (`01`): empty grid size, fabric and unit of a new chart, palette for a new photo | Application | Pr | Yes |
| Autosave state (`03`) | Application | S | Yes |
| Name (`03`) | Document | C; shown, not edited, in A | Yes |
| Size (crop, grow) (`04`) | Tool (Crop) | Q and the chart, with Crop | Yes |
| Fabric count, Unit of this chart (`03`) | Document | C; for an empty grid on St, starting from the preference | Yes |
| Thread list: choose, rename, symbol, colour editor, merge, add (`05`) | Document (palette) | Th | Yes |
| Summary: threads, skeins (`05`) | Document | Th | Yes |
| Isolate lights per thread (`05`) | View, per thread | Th, with the thread; the switch is in V | Yes |
| The views; photo behind the chart (`03`) | View | V | Yes |
| Isolate switch (`05`) | View | V | Yes |
| Zoom, reset zoom (`03`) | View | V | Yes |
| Canvas colour, canvas cloth, stitch texture (`03`) | View, set once | Pr (D301; a popover at the end of S for a day, which the Owner did not find) | Yes |
| Rulers, pointer readout, size and finished size (`03`) | View | Around the chart, S | Yes |
| Compare with original (`03`) | View | With the photo, before there is a chart | Yes |
| Tool choice (`04`) | Application | L: three groups, two columns in Edit and one where a workspace offers four tools or fewer (D302); each workspace offers its own tools | Yes |
| The two drawing colours, swap (`04`) | Tool (those that paint) | Q, with the tools that declare them | Yes |
| Brush size, shape (`04`) | Tool (Brush, Line, outlines) | Q, with those tools | Yes |
| Shape fill (`04`) | Tool (Rectangle, Oval) | Q, with those tools | Yes |
| Stitch type (`06`) | Tool (painting tools) | Q, with those tools | Yes |
| Lock transparency (`04`) | Tool (those that paint) | Q, with the tools that declare it | Yes |
| Symmetry axes (`04`) | Tool modifier; saved in the chart | Q, with the tools that declare it | Yes |
| Selection actions: invert, copy … crop to selection, apply, cancel (`04`) | Selection | Tt, the Selection tab of Select, Lasso and the Magic wand, in groups; apply and cancel also on Q, in its end (D333, D339) | Yes, by the Owner's decision (2026-10-07): the bar had no room beside the wand's switches; by rule 1 alone they would be on Q |
| Backstitch-edit actions (`06`) | Selection (lines in hand) | Q, as above | Yes |
| Crop numbers, Apply, Cancel (`04`) | Tool (Crop) | Q | Yes |
| Text: font, size, weight, colour, text, preview, Add (`07`) | Tool (Text) | Tt | Yes |
| Double-press fills a region (`04`) | Application: a set-once preference about the Brush (Owner, 2026-10-05) | Pr | Yes, by the Owner's decision; by rule 2 alone it would be a Brush option |
| Quick mirror, four actions (`04`) | Document commands | L, beneath the tools, in Edit only; also in the command list | By the Owner's choice (2026-10-05: kept as they are); by rule 1 alone they are commands, not tools |
| Generation: size, colours and hint, palette, set-up palette, algorithm, colour detail, edges, dither, lines, texture (`02`) | Action parameters (Generate) | Ph, three tabs | Yes |
| Photo adjustment (`02`) | Action parameters (Generate), previewed live | Ph | Yes |
| Generate / Regenerate, Continue in Edit (`02`) | Command with parameters | Ph, under all three tabs | Yes |
| Tries: go back to one, pin, delete (`02`) | Action results (Generate) | Under the picture, in the Photo workspace | Yes |
| What to export; Export, Export all (`08`) | Command with parameters | X | Yes |
| Colour or black and white, A4 cell size, A4/PDF overlap, Canvas in exported preview (`08`) | Action parameters (exports) | X, each only with a kind that reads it; cell size and overlap also in Pr, the same value | Yes |
| Author name (`08`) | Action parameters (exports); one value for the browser | X and Pr, the same value | Yes |
| Where the pages fall (`08`) | View of an action's result | Over the chart, while a paged kind is chosen in Export | Yes |
| Messages (`09`) | By what caused them | Beside the control that caused them (Generate, the crop readout, a try's pin); otherwise one strip under Q | Yes |

### What the table shows

- **No row breaks a rule; two are placed by the Owner's choice where a rule alone would place them elsewhere,** and say so:
  the quick mirrors beneath the tools, and "Double-press fills" in Preferences. The table G-090 drew of the interface before
  the redesign had 20 of 36 rows breaking a rule (that table is in git at 67fcc2c).
- What moved, in kind: settings that sat in the Chart tab went to the tool, the view or the export they belong to; the three
  bars that replaced the whole bar became additions to one bar, so views, Undo and the colours no longer depend on the tool
  in hand; Text became a tool, the exports a workspace, and Undo is there once.
- **One scope mismatch stays in the data:** symmetry is a tool modifier saved in the chart.
- **One value is shown in two places three times** (author, cell size, overlap): a preference shown again beside the export
  that reads it. They are one value, never copies (D299).

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
| Tools | Pick a color while the key is held | Alt (held) | A drawing tool in hand, in an editable view |
|  | Brush tool | B | A chart, in Edit |
|  | Fill tool | F | A chart, in Edit |
|  | Line tool | L | A chart, in Edit |
|  | Rectangle tool | R | A chart, in Edit |
|  | Oval tool | O | A chart, in Edit |
|  | Lasso fill tool | G | A chart, in Edit |
|  | Picker tool | I | A chart, in Edit |
|  | Text tool | — | A chart, in Edit |
|  | Backstitch tool | K | A chart, in Edit |
|  | BS edit tool | J | A chart, in Edit |
|  | Select tool | S | A chart, in Edit |
|  | Lasso tool | Q | A chart, in Edit |
|  | Magic wand tool | W | A chart, in Edit |
|  | Crop tool | C | A chart, in Edit |
|  | Move tool | V | A chart, in Edit |
|  | Pan tool | H | A chart |
|  | Zoom tool | Z | A chart |
| Selection | Invert the selection | — | Select, Lasso or Magic wand in hand |
|  | Copy the piece | Ctrl+C | A piece in hand |
|  | Paste the copied piece | Ctrl+V | Select, Lasso or Magic wand in hand; a piece was copied |
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
| Chart | Mirror the left half | — | A chart, in Edit |
|  | Mirror the upper half | — | A chart, in Edit |
|  | Mirror the upper-left corner | — | A chart, in Edit |
|  | Mirror the upper-left half corner | — | A square chart, in Edit |
|  | Vertical symmetry on or off | — | A chart, in Edit |
|  | Horizontal symmetry on or off | — | A chart, in Edit |
|  | Diagonal symmetry ↘ on or off | — | A square chart, in Edit |
|  | Diagonal symmetry ↙ on or off | — | A square chart, in Edit |
|  | Transparency lock on or off | — | A chart, in Edit |
| View | Color pattern | 1 | A chart |
|  | Black & white pattern | 2 | A chart |
|  | Stitched pattern | 3 | A chart |
|  | Symbols on or off | Y | A chart in Color or Black & white |
|  | Photo under the pattern on or off | P | A chart with a photo, in Color or Black & white |
|  | Photo with the pattern half visible | 4 | A chart with a photo |
|  | Photo alone | 5 | A chart with a photo |
|  | Photo workspace | — | Not already there |
|  | Edit workspace | — | A chart; not already there |
|  | Export workspace | — | A chart; not already there |
|  | Zoom in | — | A chart |
|  | Zoom out | — | A chart |
|  | Reset zoom to 100% | — | A chart |
|  | Open the command list | Ctrl+K | The start screen does not cover a chart |
|  | Open Preferences | — | Always |
|  | What's new in this version | — | Always |
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

The look: colours, icons and the order of tools are a skin's (D295). A layout for a phone is its own goal (G-101); the regions
are separate components placed by `app/components/editor-layout.tsx` alone so that a second layout can place them differently.
