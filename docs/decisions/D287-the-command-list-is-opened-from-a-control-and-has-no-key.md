# D287 · The command list is opened from a control and has no key
Date: 2026-10-05 · Goal: G-093 M3 · Status: active (superseded in part by: D288, which gives it the key Ctrl+K)
Context: the command table needed a place where every command can be found, read with its key and run.
Decision: `app/components/command-list.tsx` draws the table, searchable; it is opened from a control under New. While it is open the chart's keys and the keyboard cell cursor are off and the focus stays in the search. Closing without running returns the focus to the control; after a command it is left on the page.
Force: judgment — placed with New because both are application scope (`docs/interface-placement.md`, rule 1). That it has no key is a requirement: G-093's constraint, new shortcuts need the Owner's yes.
Rejected: returning the focus to the control after a command too (the next Enter or Space would reopen the list, not act on the chart); offering it over the start screen (the chart's commands would act on a chart that is covered).
Consequence: a command appears in the list by being registered; nothing is added to the list itself.
Evidence: tests/e2e/command-list.spec.ts
