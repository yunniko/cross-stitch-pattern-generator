# D401 · A thread system is a file of rows the admin keeps; its switch is made from its row
Date: 2026-10-10 · Goal: G-132 M3 · Status: active (superseded by: —)
Context: the admin adds, edits and deletes site systems, so neither their lists nor their switches can be declared in code.
Decision: a system is read from CSV (number, name, #rrggbb) or JSON by one pure reader shared by the admin and, later, a person's upload; its key is fixed at creation; its switch `brand.<key>` is made from the row wherever the feature lists are drawn, and deleting the system deletes its switch rows.
Force: requirement — the Owner's request of 2026-10-10 (managed in the admin panel, users upload their own; a plugin is data only).
Rejected: a server route for downloads (the page already holds the lists, a few hundred KB at most); renaming a key (charts store it, so a rename would orphan their colours); a switch row kept after delete (a stale id no list shows).
Consequence: request-check no longer names systems; the jobs route refuses a switched-off system by its row's name (`systemRefusal`). Downloads read back unchanged.
Evidence: tests/unit/thread-list-file.spec.ts; tests/unit/features-resolve.spec.ts; tests/e2e/admin-thread-systems.spec.ts