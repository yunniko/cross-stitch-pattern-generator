# 05 · Colours and threads

The list of a chart's colours and everything done to them. Sources: `app/components/threads-pane.tsx`, `colors-dock.tsx`, `color-pair.tsx`, `lib/editor/pattern-edit.ts`, `lib/threads/*`, `lib/color/*`; as of 2026-10-02. All on the device. The two drawing colours (foreground and background) are in `04`; backstitch lines and their section of the list are in `06`.

## What a colour is

A palette entry has: a **colour** (RGB), a **name** (unique within the chart), a **one-character symbol** (unique within the chart), how many stitches use it, and optionally the **thread** it is (brand and code). A chart holds **0 to 100** colours; an empty palette is legal only while nothing is stitched. The **empty stitch** is not a palette entry and is never counted.

**Names.** In a free chart each colour gets a unique everyday colour name chosen from a large list by nearest perceived colour. In a thread chart the name is "*code* – *name*" (DMC), or just the code (Cosmo, Anchor, which have no published names).

**Symbols.** Drawn from a fixed, curated set of single characters chosen to look distinct; there are at least as many as colours (100), so every colour has its own.

## Thread brands

| Brand | Threads | Names | Notes |
|---|---|---|---|
| **DMC** | 454 | Code and name | |
| **Cosmo** | 500 | Code only | From an open dataset |
| **Anchor** | 355 | Code only | Derived: each is the documented Anchor equivalent of the nearest DMC thread; the colour shown is the DMC colour; the derivation is disclosed wherever Anchor is chosen |

A chart is either **free** (colours are any RGB) or **brand-locked** (every colour is a real thread of one brand, recorded as the chart's brand). A chart generated in a brand mode is brand-locked. A colour's thread identity is remembered by brand and code, so it survives later changes to the thread tables.

## The thread list

Shown for a chart; "No threads yet" with none.

| Element | Content and behaviour |
|---|---|
| **Summary** | "*n* threads · *m* skeins" (singular when 1): the palette size and the estimated skeins to buy, summed |
| **Entry per colour** | Sorted by stitch count, highest first. Shows: the colour; its symbol; its name; its stitch count; the estimated skeins ("1 skein", "3 skeins"); a thin bar showing the count relative to the busiest colour (at least 4 % wide); and the isolate light |
| **Entry: choose** | A press on the entry makes the colour the foreground; a second press on the same entry empties the foreground. A right press loads the background without changing which is in front. The chosen entry is marked |
| **Entry: colour** | A press opens the colour editor for that colour (below); marked expanded while open |
| **Entry: symbol** | A press opens the symbol choice for that colour |
| **Entry: name** | A double press starts renaming in an editable name; Enter or leaving it commits, Escape cancels; an empty name changes nothing |
| **Entry: drag** | The entry can be dragged onto another entry to merge (below), or onto a stitch of the chart to fill its region (`04`) |
| **"Empty (no stitch)" entry** | Always last. Chosen like a thread to paint stitches away; accepts a dropped colour to merge into empty. Never counted or listed in exports |
| **Backstitch section** | Under the crosses, only when the chart has backstitch; see `06` |

**Skein estimate.** Per colour: stitches × working length per stitch, divided by the strand length of one skein (8 m × 6 strands = 4800 cm), rounded up, at least 1 for any stitch. Working length per stitch is 2·(√2 + 1)·2.54 cm × 2 ÷ count, with 3 strands at 11 count and 2 strands at 14 and above; the factor 2 is a deliberate overestimate. A thread carrying only backstitch contributes no skeins here.

## Add a colour

| | |
|---|---|
| **Control** | "+ Add" above the list; unavailable with no chart |
| **Free chart** | Opens a colour choice (default `#808080`) with Add and Cancel; adds the colour with a generated name and the first unused symbol |
| **Brand chart** | Opens the thread choice for the chart's brand (all of its threads as swatches, with search by code or name); choosing one adds that thread; Cancel |
| **Refusals** | "Cannot add another color -- already at the maximum of 100." and "No unused symbol available." |
| **A chart with no colours** | The list says: "This chart has no colors yet. Press "+ Add" to pick the first one, then click it and paint on the picture." |

## Colour editor (opens under a entry)

Opens from a colour's swatch; picks apply at once and it stays open until **Done** (keeps), **Cancel** (restores the colour exactly as when opened, including its thread identity), Escape, or a press outside it. A drag through a colour area is one undo step.

| Control | Kind and values | Available when | Effects |
|---|---|---|---|
| **Mode** | Choice among **Full range**, **DMC**, **Cosmo**, **Anchor** | A free chart. A brand chart shows a notice instead: "This pattern is in *Brand* mode -- pick a real *Brand* thread color." plus the Anchor derivation note | Opens on the colour's own mode: a colour that is a thread opens on its brand with its swatch marked and centred in view |
| **Colour area** (Full range) | A colour choice, applied live while dragging | Full range | Changes the RGB only; the name is left alone |
| **Thread grid** (brands) | Every thread of the brand as a swatch, ten across, with a search box (matches code or name, ignoring case; "No colors match that search.") | Brand mode | Choosing a thread changes the colour to it and renames it "*code* – *name*"; choosing the thread it already is changes nothing. In a free chart it does not make the chart brand-locked |
| **Comparison text** | Text | Brand mode | Pointing at or focusing a swatch shows its name and how much lighter or darker, and more or less saturated, it is than the current colour, in percentage points ("*n*% lighter", "*n*% less saturated"); with none the line reads "Hover or focus a swatch to compare it with the current color on screen." |
| **Done / Cancel** | Actions | | |

## Symbol choice

Opens under a entry. Shows every available symbol as a grid; the colour's own is marked, symbols used by other colours are marked as taken and give the other colour's name when pointed at ("Swap with *name*"). Choosing a symbol sets it; choosing one already used **swaps** the two colours' symbols. "Close" leaves it unchanged. The note says: "Picking a symbol already used by another color swaps the two colors' symbols."

## Merge

Dragging a entry onto another entry merges the first into the second at any distance: its stitches take the target colour, it is removed from the palette, the palette is renumbered, and **its backstitch goes with it** (to the target's thread). Dragging onto "Empty" turns its stitches empty and deletes its backstitch (a line cannot be no colour). One undo step. A merge empties the copied piece and the lit threads, because a renumbered palette would otherwise point at different threads.

## Isolate

| | |
|---|---|
| **Purpose** | See some threads clearly by dimming the others, as a way of looking and not a tool |
| **Switch** | "Isolate": on or off, with the number of lit threads; default off; not kept |
| **Per-thread light** | At the right end of each entry: lit or not lit. Each section of the list lights its own layer: a cross entry lights that thread's stitches, a backstitch entry lights its lines; a thread in both sections has a light in each |
| **Effect** | With the switch on, everything not lit is dimmed in both layers as soon as anything is lit anywhere. It stays on while painting with any tool. With nothing lit, nothing is dimmed |
| **Resets** | The lit set is emptied by a merge and when another chart replaces the open one |

The names and counts here feed the legends of the exports (`08`).
