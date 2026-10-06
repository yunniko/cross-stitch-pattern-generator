# D314 · The server maps each request to its workspace in one list, checked before the request's own features
Date: 2026-10-06 · Goal: G-103 M3 · Status: active (superseded by: —)
Context: a workspace switched off must be refused by the server too, since the interface is not the only client.
Decision: `REQUEST_WORKSPACES` in `lib/features/request-check.ts` names the workspace of each route that starts work on the processor (jobs, predictions, photos: Photo; exports: Export); each route calls `workspaceRefusal` with its own address before its feature check, and refuses with the workspace's name.
Force: requirement — G-103's acceptance (server routes refused by name) and D312 (a workspace off wins over the features inside).
Rejected: a check written into each route by workspace id (four copies of one rule); a middleware by path (the routes already read the person's states, and a second read would differ in timing only).
Consequence: a new route that starts processor work joins the list; a unit test fails until it does, and until the route asks under its own address.
Evidence: tests/unit/features-resolve.spec.ts; tests/e2e/workspace-switches.spec.ts
