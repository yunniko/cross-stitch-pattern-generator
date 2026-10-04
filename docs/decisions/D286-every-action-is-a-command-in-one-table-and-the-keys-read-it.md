# D286 · Every action is a command in one table, and the keys read it
Date: 2026-10-05 · Goal: G-093 M2 · Status: active (superseded by: —)
Context: about ninety actions were wired by hand and the shortcut handler named every key itself; Escape, Enter and Delete reached the tools through three special calls.
Decision: a command is data (id, name, group, keys, condition) with a state (available, run): the editor's own in `app/commands/registry.ts`, one per tool from the tool registry, and those a tool module declares for what it holds. `app/hooks/use-keyboard-shortcuts.ts` names no key: a press goes to the first available command on it that takes it.
Force: requirement — G-093's criterion, accepted by the Owner 2026-10-05: one table of commands in code, read by the shortcuts.
Rejected: commands with arguments (per-thread actions, sizes: reached where the value is given); one generic Escape command (the list could not say what it would do).
Consequence: Escape, Enter and Delete may be shared, since only one thing is in hand at a time; a letter, digit or Ctrl key belongs to one command. A new key needs the Owner's yes.
Evidence: tests/unit/commands.spec.ts; scripts/design-brief-commands.ts; lib/editor/commands.ts
