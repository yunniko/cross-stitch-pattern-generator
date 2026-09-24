# What is actually wrong with `app/workspace.tsx`, and what would fix it

Date: 2026-09-24 · Follow-up to G-067 M4, at 753 lines · Owner asked for ways to improve it.

## The measurement first

| | |
|---|---|
| Total | 754 lines — **465 logic, 289 JSX** |
| Hook calls | 41 |
| `useState` / `useRef` | 14 |
| Functions | 19, every one between 4 and 18 lines (176 lines together) |
| Props to `ImageWindow` | **31** |
| Props to `ContextBar` | **30** |
| Props to `ToolRail` | 23 |
| Props to `SelectionBar` | 19 |

The first finding is that **the file is not complex, it is wide**. There is no long function, no deep nesting, no
tangled conditional. Nineteen small, cohesive functions and a great deal of wiring. "Split the god component" is the
wrong instruction, because the problem is not that it does too much thinking — it is that it is the only thing that
knows how everything connects.

That matters for what to fix: extracting more state into hooks (what G-067 M4 did) shortens the logic half but does
nothing about the 289 lines of JSX or the 31-prop interfaces, which is where the coupling lives.

## What the remaining logic clusters into

- **Document lifecycle**, ~67 lines: `resetDocumentView`, `loadPatternIntoWorkspace`, `startNewChart`,
  `discardForNewChart`, `handleImageFile`, `handleOpenPattern`, `createBlankChart`, `importPixelArt`. One subject —
  what it means to replace the open chart — spread across eight functions and touching six pieces of state.
- **Pointer dispatch**, ~43 lines: `handleCanvasPointerDown/Move/Up/DoubleClick/Drop`, `updateHoverOutline`,
  `switchTool`. Pure routing: which tool hook gets this event.
- **Chart edits**, ~32 lines: `handleMergeColors`, `applyMirror`, `toggleLit`, `applyResize`.

## Three options

**A · Group the props.** `ImageWindow` takes 31 flat props; most fall into three groups it already treats
separately — what to draw (`pattern`, `cellSize`, `viewMode`, `previewError`), what the pointer does (six handlers),
and the photo-pane state. Passing `chart={…}` and `pointer={…}` objects instead cuts the JSX sharply and turns an
undifferentiated list into named seams. Mechanical, type-checked, no behaviour change, no new indirection.

**B · A workspace context.** Panes read what they need from a provider instead of being handed it. Removes the
drilling outright — and makes the data flow implicit, so a component can no longer be rendered in a test with plain
arguments. This codebase tests components directly; that is worth keeping.

**C · Extract the remaining state clusters**, chiefly `useEditorDocument` for the lifecycle group. Continues what
M4 started and is the one change that removes *decisions*, not just lines: "what happens to symmetry, zoom, the
colour slots and the lit set when the chart is replaced" would live in one place instead of being re-stated in eight
functions.

## Recommendation

**C first, then A. Not B.**

C is where the bugs live. Every one of those eight lifecycle functions has to remember the same list of things to
reset, and that list has grown with every goal — it is exactly the shape of mistake that produced D217, where one
place knew about a renumbering and another did not.

A is worth doing after, because it is safe and it makes the seams legible, but it is cosmetics by comparison: 31
props grouped into 5 is easier to read, not harder to get wrong.

B trades explicitness for brevity in a codebase whose components are unit-tested in isolation. That is a bad trade
here.

**What it is not worth doing:** hitting a line-count target. G-067's criterion 3 said "under 300 lines", and meeting
it mechanically would mean a shell component taking 38 props — the same coupling with one more layer between it and
the reader. The honest measure is whether adding a tool touches one hook and one component. After M4 that is true
for a colour and for a symmetry axis; it is not yet true for a document lifecycle change.
