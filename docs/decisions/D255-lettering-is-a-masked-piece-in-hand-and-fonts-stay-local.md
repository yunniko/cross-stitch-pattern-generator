# D255 · Lettering is a masked piece in hand, inserted like Paste; fonts stay in the browser
Date: 2026-10-01 · Goal: G-081 M4 · Status: active (superseded by: —)
Context: the Owner wants text added from a Text tab, handled like any selection, the computer's fonts never leaving it.
Decision: Add builds a `FloatingSelection` whose cells are the chosen thread and whose mask is exactly the glyph stitches, and `select.insert` applies any piece in hand and puts it in hand, as Paste does. Fonts are listed, loaded and drawn in the browser (`lib/editor/local-fonts.ts`); the chart keeps stitches.
Force: requirement — Owner instructions, 2026-10-01 (Paste behaviour; fonts never sent to the server; the text is not remembered).
Rejected: storing text and font in the chart (font names in the file); adding a thread at Add (the Owner chose the chart's colours); keeping the text in the tab (it leaves the page with another tab).
Consequence: nothing about a font or the text may reach a request or a stored chart; `tests/e2e/text-add.spec.ts` records all traffic of a whole add and `local-fonts.spec.ts` guards the file. The font list is Chrome and Edge only; elsewhere a name is typed.
Evidence: tests/e2e/text-add.spec.ts; tests/unit/text-selection.spec.ts; tests/unit/local-fonts.spec.ts
