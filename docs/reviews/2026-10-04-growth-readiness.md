# Is the app ready to grow into a large editor? (G-090 M1)

Date: 2026-10-04 · at commit 19692ed · Owner's four questions: architecture, interface, speed of development, QA.
Measured figures are from this machine today; everything marked *judgment* is The Company's conclusion, not a measurement.

## The short answers

1. **Architecture: no, not for layers, a vector editor or plugins.** It is sound for what it is (a single-grid chart editor) and
   well tested, but three things are closed where growth needs them open: the document model, the tool set, and the workspace
   that wires everything. The Owner's feeling that requests are "squeezed in" is measurable (below).
2. **Interface: the same cause.** There is no rule for where a control goes, so each feature picked the nearest free place. The
   fix is a placement model first, then a redesign against it; the design brief (G-088) is the inventory for that.
3. **Speed: the tests are not the main cost.** Type-check, unit tests and build are each 20–35 s. The time goes to running
   everything for every change, a production build before any browser test, a deploy per small change, and paperwork per goal.
4. **QA: yes, as a periodic exploratory pass, not as a gate on every change.**

## 1 · Architecture

### What was measured

| Fact | Figure |
|---|---|
| Code | app 12,970 lines (82 files), lib 16,280 (103), Rust 18,841 (62), processor 1,601; tests 27,024 lines (183 files) |
| `app/workspace.tsx` | 1,071 lines, 36 hook calls. It was 754 lines on 2026-09-24: **+42 % in ten days**. 30 of the 201 commits since then touch it |
| Props | `ImageWindow` 37, `ContextBar` 36 (31 and 30 on 2026-09-24) |
| Tools | A closed list of 14 in one type; **46 places** in 8 files branch on which tool is in hand |
| Adding one tool (Crop, G-089) | 3 new files, and edits to 7 existing ones: the tool type, the tool list, the shortcut table, the viewer, the selection bar, the Chart tab and the workspace (+53 lines) |
| Largest modules | `use-canvas-tools.ts` 1,205 lines (seven tools in one file), `pattern-edit.ts` 815, `use-chart-renderer.ts` 683; the standard's trigger is about 500 |
| Document model | One grid of stitches (one byte per cell, 255 = empty), one palette of at most 100 colours (the symbol set's size), a list of backstitch lines. No layers, no objects, no groups |
| Undo | A full copy of the chart per step, 50 deep (about 1 MB per step at the largest size) |
| The model's readers | The editor, the editable file, OXS, and the Rust generator and exporter each read the model directly: a new field is changed in up to four places and two languages |

### What that means for each planned direction (*judgment*)

| Direction | Fit today | What it needs |
|---|---|---|
| More pixel-art features, more tools | Fits the model; does not fit the wiring | A tool registry: a tool is one module that declares its name, key, cursor, options and handlers. Today that knowledge is spread over seven files |
| Painting board (free colour, no thread limit) | Does not fit: one byte per cell and 100 colours are built into the grid, the file and Rust | A second kind of raster with its own colour depth, beside the stitch grid, not inside it |
| Layers | Does not fit: every tool, the renderer, undo, the file formats and every export assume one grid | A document of layers with one flattening step that produces today's chart for exports. Undo by full copy stops scaling (layers × 1 MB × 50), so undo moves to recorded changes |
| Vector editor | Does not fit: nothing holds shapes; backstitch is the only non-cell data and is a flat list | An object layer (shapes with style) rendered to stitches on demand; backstitch becomes its first citizen |
| Plugins | Nothing to plug into | The registries above (tools, layer kinds, exporters, generators) are the plugin surface. Third-party code also needs isolation, which is a later and separate decision |

The existing strengths carry over: `lib/` is framework-free and lint-enforced, edits are pure functions, the Rust exporter is
proven against goldens, and the test base is large. The work is to open three closed points, not to rewrite.

### The architecture to move to (*judgment*)

Four layers, each allowed to know only the ones below it:

1. **Document**: layers (stitch raster, free raster, objects, backstitch), palette, metadata; changes as recorded commands; one
   `flatten()` giving the chart the exporters already understand. The file format gets a version and a migration step.
2. **Engine**: pure operations on the document (today's `lib/editor`), plus registries: tools, layer kinds, importers,
   exporters, generators.
3. **Editor shell**: what is open, the tool in hand, selection, view; routes pointer and key events to the registered tool; has
   no per-tool code. This replaces the wide workspace (the draft goal G-069 is its first step).
4. **Interface**: reads the registries to build the tool list, the options of the tool in hand and the shortcut table.

A placement guide then answers "where does a new request go" with a table: new operation → engine module + command; new tool →
one tool module; new document data → a layer kind and a migration; new output → an exporter. That guide is short and belongs in
`docs/architecture.md`, enforced by lint boundaries the way `lib/` already is.

## 2 · Interface

**Finding:** controls sit where there was room. Examples from the brief's inventory: canvas size sat with print settings until
G-089; Isolate is with the view controls while its lights are in the thread list; "Double-click fills a region", a brush
behaviour, is among chart settings; export settings are split between the Chart tab and the export control; photo-only settings
and chart-wide settings share one column that is replaced, not complemented, by the tool in hand's bar.

**Recommendation (*judgment*):** adopt four placement rules before any visual work, then redesign against them:

1. **By scope.** Every control belongs to exactly one of: the application, the document, a layer, the selection, the tool in
   hand, the view. Its place follows from its scope, never from free space.
2. **Tool options travel with the tool.** One region shows the options of the tool in hand and nothing else (Crop already
   works this way).
3. **Progressive disclosure.** A feature's controls appear when its precondition holds and are absent, not disabled, when it
   cannot apply; rare settings sit behind the feature that uses them.
4. **One command list.** Every action is registered once with a name, a key and a condition, which gives a searchable command
   palette and consistent shortcuts for free, and is what keeps a large tool set usable.

The design brief already lists every control with its conditions; adding a "scope" column to it turns it into the redesign's
checklist. The visual redesign itself is the Owner's planned work; these rules are what make it stay tidy afterwards.

## 3 · Speed of development

### Measured

| Step | Time |
|---|---|
| Type-check | 21 s |
| Unit tests (1,000) | 22 s |
| Lint | 22 s (corrected in M4: the 70 s first written here was measured while other work was running, and the guessed cause was wrong; see `docs/development-loop.md`) |
| Production build | 35 s |
| Browser tests, whole suite (533 cases, 4 at once) | about 4.5 min, after the build and two servers are started by hand |
| Deploy and live check | several minutes; a live spec that generates more than 6 charts a minute is refused by the site's own rate limit |
| Known unstable | 2 admin-stats cases fail in every full run and pass alone; reported as noise in every check-in |

### Where the time goes (*judgment*, from this session)

- Each browser check needs a production build and a server restart, because the suite runs against `next build` (D102). A
  one-line interface change costs about a minute before the first test runs.
- The whole suite is run for changes that can affect a few specs. The `test-affected` skill exists and was not used.
- Small follow-ups were each built, fully tested, deployed and verified live separately (three deploys for three small palette
  requests on 2026-10-02).
- Per-goal paperwork: goal log, handover, deploy log, decision files, design brief, archive. Valuable for large goals, heavy
  for a ten-line change.

### Recommendations

1. **A fast lane for small changes** (needs the Owner's approval, since it relaxes the charter for this project): a change that
   touches no document data, no export and no server code is verified with type-check, unit tests and the affected specs, and
   logged as one line; full suite and deploy happen once per batch or per day.
2. **Run affected tests by default**; the full suite before a deploy and in CI, where it already runs.
3. **Make the browser loop fast**: keep the servers running in watch mode for development specs, or split specs that need no
   server (most editing specs open a saved chart) from those that generate.
4. **Fix the noise**: the two admin-stats cases (done in M4), the lint time, and live checks that stay under the rate limit.
5. **Move tests down**: with tools as modules, most tool behaviour is testable as unit tests in milliseconds; today it is
   reachable only through the browser because the logic lives in hooks.

Expected effect (*estimate, not measured*): a small interface change goes from roughly 8–10 minutes of machine time to 1–2.

## 4 · QA

**Yes, in a specific form.** The automated suite checks what was thought of. What it missed in the last three days was found by
the Owner or by accident: a recoloured backstitch line turning the others dashed, a photo drop that does nothing, a Generate
that ignores the recommended colour count when pressed early, a crop label colliding with a new tool. Those are exploratory
finds.

Recommended (*judgment*): an exploratory QA pass (the Company's `qa-review` skill: boundary values, malformed files, usability)
on the changed areas **at each goal's last milestone**, and a full pass before any public launch or after an architectural
step. Its findings go to a triage list, not straight into work. Not recommended: a QA gate on every change, which would add to
question 3's problem.

## What is not known

- No profiling was done of memory or speed with layers; the undo figure is arithmetic, not a measurement.
- The interface findings come from the control inventory, not from watching anyone use the app.
- The expected speed-up is an estimate.
- Plugin isolation (running third-party code safely) was not examined.
