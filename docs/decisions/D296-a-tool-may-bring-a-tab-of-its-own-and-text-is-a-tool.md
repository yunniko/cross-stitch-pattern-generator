# D296 · A tool may bring a tab of its own, and Text is a tool
Date: 2026-10-05 · Goal: G-095 M2 · Status: active (superseded by: —)
Context: Text was a settings tab; the Owner doubted its controls would fit among a tool's quick options.
Decision: a tool's definition may declare `tab`, and its runtime gives the tab's contents (`panel`). The tab is first, marked by colour alone, opens each time the tool is picked, gives way to a tab chosen instead, and goes when the tool is put down, leaving the tab last chosen. Text is the first such tool; a press on the chart also places the lettering.
Force: requirement — Owner, 2026-10-05: quick options, an extended tab, or both; the tab first, opened on picking, the last tab restored after.
Rejected: keeping Text in hand after Add (the piece needs Select to be moved); offsetting a second Add from the first (the first is applied when Text is picked again, wherever it was moved).
Consequence: picking Text applies a piece in hand. The tab's state is one number (`lib/editor/tool-tab.ts`). What a tool asks of other tools arrives with the event (`ToolShell`).
Evidence: tests/unit/tool-tab.spec.ts; tests/e2e/text-tab.spec.ts; tests/e2e/text-add.spec.ts
