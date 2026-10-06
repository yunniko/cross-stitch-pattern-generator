# D312 · A workspace is an ordinary feature; its switch closes the workspace, not each feature inside it
Date: 2026-10-06 · Goal: G-103 M1 · Status: active (superseded by: —)
Context: G-103 makes Photo, Edit and Export switchable; the architecture review first proposed a parent relation, so that a workspace off would turn every feature inside it off.
Decision: each `WORKSPACES` entry declares `workspace.photo`, `workspace.edit` or `workspace.export`, listed first in a "Workspaces" group; a workspace off closes its ways in (tab, landing, commands, tool, server requests), and the features inside keep their own states.
Force: requirement — the Owner's answer that a control belongs to the workspace whose tab it is on (2026-10-06): a feature offered on two tabs would have two parents, so a parent relation cannot express it.
Rejected: a parent relation in `lib/features/` (two parents; an admin would no longer see a feature's own state); a switch for Generate inside Photo (Owner accepted (d): Generate is Photo's).
Consequence: every way into a workspace's work goes through `workspaceOpen` or `workspaceShown` in `lib/editor/workspaces.ts`; a new road in must use them.
Evidence: tests/unit/workspaces.spec.ts; tests/unit/features.spec.ts; tests/e2e/admin-features.spec.ts
