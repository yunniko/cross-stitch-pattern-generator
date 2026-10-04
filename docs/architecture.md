# Architecture and placement guide

Status: **target and guide, 2026-10-04 (G-090 M2).** Nothing here has been built; "Today" columns describe the code as it is,
"Target" what it is being prepared for. The Owner's instruction: prepare the architecture for change, do not implement the new
features now. Evidence for the findings is in `docs/reviews/2026-10-04-growth-readiness.md`.

## 1 · The four layers

Each layer may import only from the layers above it in this table.

| Layer | Holds | Today | Target |
|---|---|---|---|
| **Document** | What a chart *is*: its data, how it changes, how it is saved | `lib/types.ts` (one grid, one palette, backstitch list), `lib/editor/pattern-serialize.ts`, full-copy undo in `lib/editor/undo-history.ts` | `lib/document/`: a document of **layers**, a palette, metadata; every change is a **command** (apply, invert, label); `flatten()` returns today's `StitchPattern` so generation and every export keep working unchanged; the file has a format version and a migration step |
| **Engine** | Pure operations and the **registries** | `lib/editor/*` (pure, framework-free, lint-enforced), `lib/export/*`, `lib/pipeline/*` | The same modules, plus `lib/registry/`: tools, layer kinds, importers, exporters, generators, commands |
| **Editor shell** | What is open, the tool in hand, selection, view; routes pointer and key events | `app/workspace.tsx` (1,071 lines), `app/hooks/use-canvas-tools.ts` (seven tools in one file), an if-chain per event | `app/editor/`: a shell with **no per-tool code**; it asks the registry for the tool in hand and forwards events to it |
| **Interface** | Everything drawn around the chart | `app/components/*`, wired by hand with 36–37 props | Components that read the registries: the tool list, the options of the tool in hand, the shortcut table and the command list are generated, not hand-kept |

The server side (`processor/`, `rust/`) stays as it is: it receives a flattened chart and knows nothing of layers or tools.

## 2 · The registries (the seams for growth, and for plugins)

A registry is a typed list that modules add themselves to. The contract of each, in outline:

| Registry | An entry declares | Replaces today |
|---|---|---|
| **Tool** | id, name, key, cursor, which layer kinds it works on, its options (as data: kind, range, default), handlers for press, move, release, key, cancel, and an optional overlay | The `Tool` union, the tool list, the shortcut table, the per-event if-chains, the per-tool bars: seven files per tool |
| **Command** | id, name, key, when it is available, what it does to the document | Actions wired one by one through props (undo, flip, merge, mirror, export…) |
| **Layer kind** | id, how it draws, how it flattens to stitches, how it serialises, which tools apply | Nothing: there is one implicit kind |
| **Importer / exporter** | file types, name pattern, where it runs (device or server), options | `lib/editor/pattern-import.ts` and the export choice list |
| **Generator option** | id, value kind and range, default, how it is sent to the server | Hand-added fields in the options store, the request, the validator and Rust's parser |

A tool entry receives a narrow **editor API** (read the document, dispatch a command, draw a preview, read the pointer in
stitch coordinates) instead of the workspace's internals. That API is the single thing a tool, and later a plugin, can touch.

## 3 · Placement guide: where a new request goes

Until the target exists, the "today" column is the rule; it is the same guide with more files.

| The request is… | Target: one place | Today: these places |
|---|---|---|
| A new **drawing or editing tool** | One tool module registered in the tool registry; pure logic beside it in `lib/editor/` with unit tests | Pure logic in `lib/editor/<name>.ts` + unit test; a hook in `app/hooks/`; then `app/editor-types.ts` (the union), `tool-rail.tsx`, `use-keyboard-shortcuts.ts`, the event chains and the bar in `app/workspace.tsx`. Never add tool logic to `workspace.tsx` or to `use-canvas-tools.ts` |
| A new **operation on the chart** (flip, merge, resize) | A command in the engine | A pure function in `lib/editor/pattern-edit.ts` or its own module, called through `history.set`; one undo step |
| New **data in the chart** | A layer kind, or a field of the document, with a migration and a flatten rule | `lib/types.ts`, `pattern-serialize.ts` (read, write, validate, optional so old files open), `project-store.ts`, and, if exports or generation need it, `rust/cs-core` and `rust/cs-export` |
| A new **generation setting** | A generator option entry | `workspace-storage.ts` (type, default, validation), the request in `use-generation.ts` and `pattern-server.ts`, `processor/validate-settings.ts`, `job-protocol.ts`, `rust/cs-core/src/json.rs`, the setting's control in `photo-pane.tsx` |
| A new **export or import format** | An exporter or importer entry | `lib/export/export-jobs.ts`, `export-controls.tsx`, `use-exports.ts`; on the server `processor/validate-export.ts` and `rust/cs-export` |
| A new **way of looking** (view, overlay, guide) | A view entry; never changes the document | `app/editor-types.ts`, `app/chart-scene.ts`, `use-chart-renderer.ts` |
| A new **setting of the application** | The options store, with scope stated | `workspace-storage.ts` and the control, placed by its scope (see the interface rules, M3) |

**Rules that hold in both columns**

- Logic is a pure function in `lib/`, tested without a browser; `app/` only connects it. `lib/` never imports React (enforced).
- One resize, one merge, one serialiser: a second routine for the same thing is refused in review (D109 is the precedent).
- New chart data is optional in the file, so every older file opens (the existing practice; becomes a versioned migration).
- A module over about 500 lines, or holding two subsystems, is split or carries a decision saying why not (STANDARDS).
- A feature updates the design brief in the same change.

## 4 · Order of preparation

Each step is its own goal, changes no behaviour, and is guarded by the existing suites. Later steps depend on earlier ones.

1. **Editor shell and document lifecycle** (G-091, in progress: the replace table is done, D282): replacing the open chart is decided in one place; grouped
   props. Removes the widest file's growth.
2. **Tool registry**: the fourteen tools become modules behind one contract; the shell loses its if-chains; `use-canvas-tools.ts`
   is split by tool; tool options become data. From here a new tool is one file.
3. **Command registry**: actions registered once; shortcuts and a command list read it.
4. **Document module with commands and versioned file**: today's single grid becomes "a document with one stitch layer",
   byte-identical on save and export; undo records changes instead of copies. No visible change, and the point at which
   layers become an addition rather than a rewrite.
5. **Importer, exporter and generator-option registries.**
6. Only then the features: layers, painting board, object layer, in the order the Owner chooses.

Steps 1–3 are interface-side and low risk. Step 4 is the expensive one (file format, undo, the renderer's input) and is where
measurement comes first: memory and speed of command undo and of flattening at 1500 × 1500.

## 5 · Enforcement

Proposed lint boundaries, added as each layer comes into being (the `lib/` rule shows the pattern works):

- `lib/document` imports nothing from `lib/editor`, `lib/export`, `app`.
- `lib/**` imports nothing from `app/**` or React (exists).
- Tool modules import only the editor API and `lib/`; never `app/workspace` or another tool.
- `app/components` do not import tool modules directly; they read registries.
- A check that every registered tool, command and exporter appears in the design brief.

## 6 · Plugins

The registries are the plugin surface: a plugin is a module that adds entries. What differs is who wrote it.

| | The Owner's own plugins | Other people's plugins |
|---|---|---|
| **What it is** | A folder in the repository (or a private package) that registers tools, commands, layer kinds, exporters | Code the app loads at run time from somewhere else |
| **Trust** | Same as the app's own code | Untrusted: it can be wrong or hostile |
| **Needs** | The registries and the editor API (steps 2–5); a manifest (id, version, what it adds); a rule that plugins use only the public API, lint-enforced; a switch to turn one off | All of the left column, **plus**: isolation (run in a sandboxed frame or worker with no access to the page, cookies, account or network unless granted); a message-only API (data in, commands out, no direct access to the document or the screen); permissions the user grants per plugin; a **stable, versioned API** that cannot change freely any more; loading, updating and removing; resource limits (time, memory); a way to distribute and review them; legal terms and a support burden |
| **Interface** | Appears like built-in features | Needs its own places: an install and permissions screen, plugin-owned panels drawn inside a frame |
| **Server side** | May add Rust or processor code, since it ships with the app | Device-only; nothing of theirs runs on the server |
| **Cost** | Small once the registries exist: mostly discipline | Large and permanent: the API freeze and the security surface are the real price |
| **Reversible?** | Yes | Hard: once others depend on the API, changing it breaks them |

**Decided (Owner, 2026-10-04, D281): own plugins only.** The editor API is still designed as if a stranger would use it
(narrow, data in and out, no reaching into internals), because that costs little now and keeps the right column possible later
without rework. No isolation, permissions, install flow or API freeze is built.

## 7 · Platform: can it stay a browser app?

The Owner's question (2026-10-04): can a large, complex editor stay in the browser, or should it move to, for example, Java?

**Assessment (judgment, from general knowledge of the platform and this codebase; no prototype or benchmark was made):** stay
in the browser. The limits that the growth-readiness review found are in this app's structure, not in the platform.

| Concern for a large editor | In the browser | What this app already has |
|---|---|---|
| Heavy computation | WebAssembly and workers run compiled code off the main thread | The generator and exporter are Rust; a `cs-wasm` crate exists in the workspace; photo decoding and the adjustment preview already run in workers |
| Drawing many objects and layers fast | Canvas 2D for moderate scenes, WebGL or WebGPU when it is not enough | A viewport renderer that paints only what is visible (D135) and stays smooth at 1500 × 1500 |
| Large documents in memory | A tab has a few gigabytes at most, less on phones | The largest chart is about 2 MB of cells; undo by full copy is the first thing that would hit a limit, and it is already scheduled to change |
| Files on disk | Open and download everywhere; direct save-in-place only in Chromium browsers | Download-based saving plus autosave in the browser |
| Working offline | Possible as an installable web app | Not done: generation and most exports need the server today |
| Installation and updates | None: a link, always current | The present way of delivery |

Large editors of this kind are delivered in the browser today (design, image and whiteboard editors with layers, vectors and
plugins), which is evidence that the platform is not the ceiling.

**What a move to Java (or any native toolkit) would cost:** about 13,000 lines of interface code, 16,000 lines of editor
logic and 27,000 lines of tests are TypeScript and would be rewritten; the browser test suite would have no equivalent; every
user would need an installer and updates; the web address stops being the product. It would gain direct file access, more
memory and no server dependence, none of which is a present limit.

**If a desktop app is wanted later**, the cheap path is to wrap this same app in a desktop shell that runs web interfaces
with a native core (the Rust core would run locally, so generation and exports need no server). That reuses everything and
can be decided when there is a reason; nothing in the target architecture blocks it.

**What would change this assessment:** a need the browser cannot meet (very large images held fully in memory, direct access
to devices or to a folder of files in every browser), or a measured rendering limit after layers exist. The document module's
step includes that measurement.
