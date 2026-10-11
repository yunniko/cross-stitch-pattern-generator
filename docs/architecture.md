# Architecture and placement guide

Status: **target and guide, 2026-10-04 (G-090 M2).** Nothing here has been built; "Today" columns describe the code as it is,
"Target" what it is being prepared for. The Owner's instruction: prepare the architecture for change, do not implement the new
features now. Evidence for the findings is in `docs/reviews/2026-10-04-growth-readiness.md`.

## 1 · The four layers

Each layer may import only from the layers above it in this table.

| Layer | Holds | Today | Target |
|---|---|---|---|
| **Document** | What a chart *is*: its data, how it changes, how it is saved | **Built for one layer (G-094, D289, D290):** `lib/document/`: `types.ts` (a document of layers, a palette, backstitch, properties), `convert.ts` (`flatten`, which for one layer copies nothing), `change.ts` (what differs between two documents, either way), `history.ts` (undo as recorded changes), `migrate.ts` (the file's version and the one step that brings an older file up to date). The tools still read and write the flat chart in `lib/types.ts`, the view of the layer in hand; the file on disk is still one grid | `lib/document/`: a document of **layers**, a palette, metadata; every change is a **command** (apply, invert, label); `flatten()` returns today's `StitchPattern` so generation and every export keep working unchanged; the file has a format version and a migration step |
| **Engine** | Pure operations and the **registries** | `lib/editor/*` (pure, framework-free, lint-enforced), `lib/export/*`, `lib/pipeline/*` | The same modules, plus `lib/registry/`: tools, layer kinds, importers, exporters, generators, commands |
| **Editor shell** | What is open, the tool in hand, selection, view; routes pointer and key events | `app/workspace.tsx` (it composes; `app/components/editor-layout.tsx` alone places the regions, G-095), with `app/tools/use-tools.ts` (routes events to the registered tool), `app/hooks/use-chart-lifecycle.ts` (every way a chart arrives or leaves), `app/commands/shell-commands.ts` (what each command does now) and one hook per piece of state (`use-lit-threads`, `use-chart-fabric`, `use-editor-view`, `use-name-draft`, `use-held-tool`) | `app/editor/`: a shell with **no per-tool code**; it asks the registry for the tool in hand and forwards events to it |
| **Interface** | Everything drawn around the chart | `app/components/*`, wired by hand with 36–37 props | Components that read the registries: the tool list, the options of the tool in hand, the shortcut table and the command list are generated, not hand-kept |

The server side (`processor/`, `rust/`) stays as it is: it receives a flattened chart and knows nothing of layers or tools.

## 2 · The registries (the seams for growth, and for plugins)

A registry is a typed list that modules add themselves to. The contract of each, in outline:

| Registry | An entry declares | Replaces today |
|---|---|---|
| **Tool** (built, G-092, D284: `app/tools/registry.ts`) | id, name, key, group, cursor, outline, traits, handlers for press, move, release, double press and tool change, an optional bar and overlay, its options as data (G-093, D285) and the commands it adds for what it holds (D286). Not yet: which layer kinds it works on | Done: the `Tool` union, the tool list, the shortcut table, the per-event if-chains and the per-tool bars all read the registry |
| **Command** (built, G-093, D286: `app/commands/registry.ts`, pure half in `lib/editor/commands.ts`) | id, name, group, keys, when it is available in words; at run time whether it is available now and what it does. No arguments | Done: the keyboard shortcuts name no key, and the command list (D287) draws the table. Not yet: the bars and the tool list still call their actions directly, and a command is not yet a recorded change to the document (step 4) |
| **Layer kind** | id, how it draws, how it flattens to stitches, how it serialises, which tools apply | Nothing: there is one implicit kind |
| **Importer / exporter** | file types, name pattern, where it runs (device or server), options | `lib/editor/pattern-import.ts` and the export choice list |
| **Generation setting** (built, G-099, D293: `lib/pipeline/generation-settings.ts`) | id, kind, values or range, the words of its refusal, a refused combination, and optionally how it is drawn | Done: the editor's request, the processor's check and the options handed to Rust read the one list; Rust reads each setting in the module that uses it and refuses one nobody reads. Not yet: the stored defaults and the hand-written controls of the fifteen existing settings still name them |
| **Generation stage and overlay** (built, G-099, D293, D294: `rust/cs-core/src/pipeline/`, `overlay.rs`) | A stage: a function over the run's shared state, and its place in the table. An overlay: what it finds in the picture to lay over the stitches | Done: the pipeline is fourteen stages; traced lines and texture strokes are overlays. Not behind a contract: edge modes, quantizers (each is added in its own module) |
| **Dither pattern** (built, G-100, D326–D328: `rust/cs-core/src/dither/`) | A type behind `Pattern` (id, arithmetic, its settings as recorded) and a line in `PATTERNS` declaring its name, group, how it is offered and its own settings by named control | Done: the declarations are written to `lib/pipeline/dither-patterns.ts` and the pictures to `public/dither-previews/`, both checked current in CI; the drawn marks' preview is drawn by the server |

A tool entry receives a narrow **editor API** (read the document, dispatch a command, draw a preview, read the pointer in
stitch coordinates) instead of the workspace's internals. That API is the single thing a tool, and later a plugin, can touch.

## 3 · Placement guide: where a new request goes

Until the target exists, the "today" column is the rule; it is the same guide with more files.

| The request is… | Target: one place | Today: these places |
|---|---|---|
| A new **drawing or editing tool** | One tool module registered in the tool registry; pure logic beside it in `lib/editor/` with unit tests | **The target is in force (G-092):** pure logic in `lib/editor/<name>.ts` with a unit test; one module `app/tools/<name>.ts` exporting its definition (id, label, title, key, group, icon, traits) and `useRuntime(api)`; one line in `app/tools/registry.ts`. Its icon goes in `app/tools/icons.tsx`, its bar or overlay, if any, in `app/components/`. Nothing else is edited. A tool touches the editor only through `EditorApi` (`app/tools/types.ts`); if it needs something that is not there, the API grows, the tool does not reach round it |
| A new **command** (an action with a name, perhaps a key) | One entry in the command registry | **The target is in force (G-093):** an action of the editor itself is one line in `SHELL_COMMANDS` (`app/commands/registry.ts`) and its state in the workspace, which the compiler requires; an action on what a tool holds is declared in that tool's module (`commands`) with its state in the module's runtime. It then appears in the command list, and its key, if it has one, works. Run `npx tsx scripts/design-brief-commands.ts --write` and add the key to the brief. A new key needs the Owner's yes |
| A new **operation on the chart** (flip, merge, resize) | A command in the engine | A pure function in `lib/editor/pattern-edit.ts` or its own module, called through `history.set`; one undo step |
| New **data in the chart** | A layer kind, or a field of the document, with a migration and a flatten rule | **For a property of the chart (as fabric was, G-094):** an optional field in `lib/types.ts`; read, validated and written in `lib/editor/pattern-serialize.ts` and named in `lib/editor/project-store.ts`; written by the Rust editable writer too (`rust/cs-export/src/editable.rs`, pinned against the TypeScript one by `tests/unit/file-migration.spec.ts`); no change to undo, which records any property. Optional and additive, so the version in `lib/document/migrate.ts` stays; a change an older build would misread raises it and adds a migration there. **For data of another shape:** `lib/types.ts`, `pattern-serialize.ts` (read, write, validate, optional so old files open), `project-store.ts`, and, if exports or generation need it, `rust/cs-core` and `rust/cs-export` |
| A new **generation setting** | One declaration, and the Rust module that reads it | **The target is in force (G-099):** declare it in `lib/pipeline/generation-settings.ts` (with a `control` if a plain switch, 0-to-1 slider or choice will do; then nothing else in TypeScript is edited, and it appears under "More" in the photo settings). Read it in the Rust module that uses it, with `settings.flag`, `number` or `text`. Add it to the pinned list in `tests/unit/generation-settings.spec.ts`, and to the brief. A setting that needs a control of its own is declared without `control`, named in `WorkspaceOptions` and the two request types (the compiler says where), and given its control in `app/components/photo-pane.tsx` |
| A new **generation algorithm** | A stage, an overlay, or a mode of an existing family | **Something laid over the stitches:** a Rust module implementing `Overlay`, its `mod` line and its place in `OVERLAYS` (`rust/cs-core/src/overlay.rs`). **A dither pattern:** a module implementing `Pattern` and its line in `PATTERNS` (`rust/cs-core/src/dither/mod.rs`), then `npm run dither-patterns` and `npm run dither-previews` (D328). **An edge mode, a quantizer:** a variant in that family's module with its id, and the value in the TypeScript list the declaration reads. **A new step:** a function in the file of `rust/cs-core/src/pipeline/` it belongs to and a line in `STAGES`. Then, always: `npm run test:goldens:rust` and `npx tsx scripts/measure-generation.ts`, which must show every existing chart unchanged |
| A new **export or import format** | An exporter or importer entry | `lib/export/export-jobs.ts`, `app/components/export-pane.tsx` (its button, and which settings it reads), `use-exports.ts`; on the server `processor/validate-export.ts` and `rust/cs-export` |
| A new **way of looking** (view, overlay, guide) | A view entry; never changes the document | `lib/editor/view.ts` (the switches and which apply, D315), `app/chart-scene.ts`, `use-chart-renderer.ts` |
| New **state of the editor** (something shown, chosen or remembered while editing) | A hook of its own, with its rule as a pure function beside it | **In force (G-098, D291):** the rule in `lib/editor/<name>.ts` with a unit test, the state in `app/hooks/use-<name>.ts`, composed in `app/workspace.tsx`. If another chart arriving must reset it, add the reset to the table in `lib/editor/document-replace.ts` and to the `resets` the workspace hands `use-chart-lifecycle.ts`. Nothing of it is written into the shell |
| A new **way a chart arrives** (another import, a template) | The chart lifecycle | A row in `lib/editor/document-replace.ts` saying what it resets, and a function in `app/hooks/use-chart-lifecycle.ts` that calls `replace` with it |
| A new **feature switch** (G-102, D303) | Nothing: a registry entry is a feature by being registered | A tool, a command, an export kind, a generation setting, a dither pattern, a texture or a brand appears in the feature list by itself; it says `feature: null` to be core, or names another feature it belongs to. A control it adds reads `useFeature` or `useGatedOptions` (`app/features/features-context.tsx`) so that locked greys it and hidden leaves it out. **Under a workspace (G-103, D313, D314):** a command in a workspace's work names it (`workspace` in its definition), a control outside the command table runs a `gatedAction`, and a route that starts processor work joins `REQUEST_WORKSPACES` in `lib/features/request-check.ts`; a unit test fails until it does |
| A new **setting of the application** | The options store, with scope stated | `lib/editor/workspace-storage.ts` and the control, placed by its scope (`docs/interface-placement.md`). **A set-once preference (G-095, D299):** a row in `app/components/preferences.tsx` as well |

**Rules that hold in both columns**

- Logic is a pure function in `lib/`, tested without a browser; `app/` only connects it. `lib/` never imports React (enforced).
- One resize, one merge, one serialiser: a second routine for the same thing is refused in review (D109 is the precedent).
- New chart data is optional in the file, so every older file opens (the existing practice; becomes a versioned migration).
- A module over about 500 lines, or holding two subsystems, is split or carries a decision saying why not (STANDARDS).
- A feature updates the design brief in the same change.

## 4 · Order of preparation

Each step is its own goal, changes no behaviour, and is guarded by the existing suites. Later steps depend on earlier ones.

1. **Editor shell and document lifecycle** (G-091, done 2026-10-04: the replace table D282, one rule for every new document D283, grouped props): replacing the open chart is decided in one place; grouped
   props. Removes the widest file's growth.
2. **Tool registry** (G-092, done 2026-10-04, D284): the fourteen tools are modules behind one contract; the shell has no
   if-chains; the 1,205-line hooks file is split by tool. A new tool is one file and one line. Tool options
   became data in G-093 (D285).
3. **Command registry** (G-093, D286, D287): actions registered once; the shortcuts and a command list read it. Left for
   step 4: a command as a recorded change to the document.
4. **Document module with commands and versioned file** (G-094, done for one layer; see the table in section 1 for what is
   built and `docs/reviews/2026-10-05-undo-and-flatten.md` for the measurements): today's single grid becomes "a document with one stitch layer",
   byte-identical on save and export; undo records changes instead of copies. No visible change, and the point at which
   layers become an addition rather than a rewrite.
5. **Importer, exporter and generator-option registries.** Generation is done (G-099: settings declared once, the
   pipeline as stages, overlays behind a contract). Importers and exporters are not.
6. Only then the features: layers, painting board, object layer, in the order the Owner chooses.

Steps 1–3 are interface-side and low risk. Step 4 is the expensive one (file format, undo, the renderer's input) and is where
measurement comes first: memory and speed of command undo and of flattening at 1500 × 1500.

## 5 · Enforcement

Proposed lint boundaries, added as each layer comes into being (the `lib/` rule shows the pattern works):

- `lib/document` imports nothing from `lib/editor`, `lib/export`, `app`. **In force (G-094):** a lint rule.
- `lib/**` imports nothing from `app/**` or React (exists).
- Tool modules import only the editor API and `lib/`; never `app/workspace` or another tool. **In force (G-092):** a lint rule and `tests/unit/tool-registry.spec.ts`.
- `app/components` do not import tool modules directly; they read registries.
- A check that every registered tool, command and exporter appears in the design brief. **In force for commands (G-093):**
  `scripts/design-brief-commands.ts` (keys against the brief, the command table against `docs/interface-placement.md`).

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
| Heavy computation | WebAssembly and workers run compiled code off the main thread | The generator and exporter are Rust, which could be compiled for the browser (a `cs-wasm` crate did this until G-134 removed it unused, D186); photo decoding and the adjustment preview already run in workers |
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
