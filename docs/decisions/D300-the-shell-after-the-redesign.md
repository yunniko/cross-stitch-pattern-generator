# D300 · The editor shell after the redesign stays one file, at 706 lines
Date: 2026-10-05 · Goal: G-095 M6 · Status: active (superseded by: —)
Context: D291 kept `app/workspace.tsx` whole at 665 lines, expecting the redesign to take the layout out of it. G-095 did move placement to `app/components/editor-layout.tsx` and the panel to `workspace-panel.tsx`, and added workspaces, tries and Preferences; the file is 706 lines.
Decision: it stays one file. About 370 lines compose the hooks and 250 hand each region what it shows; no rule of behaviour is written in it.
Force: judgment — splitting the hand-over from the composing would pass some forty values across a file boundary and move no logic.
Rejected: a context every region reads (D284 and D291 rejected it: it hides who changes what); a second component for the regions' props (the same lines in two files).
Consequence: D291's rules stand: new state gets its own hook, a new command a line in the command table. If the file passes 800 lines, or a rule of behaviour appears in it, split by workspace.
Evidence: docs/decisions/D291-what-stays-in-the-editor-shell.md; commit 581f8c7
