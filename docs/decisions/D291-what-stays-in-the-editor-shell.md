# D291 · What stays in the editor shell
Date: 2026-10-05 · Goal: G-098 M4 · Status: active (superseded by: —)
Context: `app/workspace.tsx` had grown to 957 lines holding the chart's lifecycle, the command states, loose state and the layout; STANDARDS asks a module over about 500 lines to be split or to say why not.
Decision: the lifecycle, the command states and each piece of loose state moved to modules of their own. The shell, at 665 lines, keeps the order the hooks are composed in, the resets it hands the lifecycle, the five handlers that join two owners, and the layout. It stays one file.
Force: judgment — what is left has one job, composing, and half of it is the layout that G-095 rewrites.
Rejected: a store or context every part reads (hides who changes what; D284 rejected the same for tools); cutting the layout into region components now (the redesign would redo it).
Consequence: new state gets its own hook with its rule beside it; a new command is a line in `app/commands/shell-commands.ts`; a new way in goes through the lifecycle hook. Logic is not written into the shell.
Evidence: tests/unit/shell-commands.spec.ts; tests/unit/editor-state-rules.spec.ts; docs/qa-review/qa-review-2026-10-05-g098.md
