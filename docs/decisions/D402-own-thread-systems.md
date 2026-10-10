# D402 · A person's own thread systems are rows they own under my- keys, one switch and one limit
Date: 2026-10-10 · Goal: G-132 M4 · Status: active (superseded by: —)
Context: people upload their own systems, private to them and used in generation and editing, gated like palettes.
Decision: an own system is a `ThreadSystem` row with an owner (deleted with the account), keyed `my-<name>` (numbered per owner, fixed at upload); every own system answers to the one switch `threads.custom` and the limit `threads.systems` (10); the server reads a person's rows only for that person; pickers offer own systems in a separate "Yours" list.
Force: requirement — the Owner's answers of 2026-10-10 (private to the owner, generation and editing, gated like palettes, 2,000 threads, CSV or JSON).
Rejected: a switch per own system (hundreds of rows no admin could read); a separate table (the pipeline and pickers would read two shapes); own systems as more segments (ten would not fit).
Consequence: site keys may not begin `my-`; a request naming another person's key resolves to no list: the processor is never handed another person's threads.
Evidence: tests/unit/own-thread-systems.spec.ts; tests/e2e/own-thread-systems.spec.ts
