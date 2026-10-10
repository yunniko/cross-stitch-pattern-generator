# D399 · A thread's system is any name; one not loaded here is kept as written and edited in the common picker
Date: 2026-10-10 · Goal: G-132 M1 · Status: active (superseded by: —)
Context: thread systems are becoming data that can be removed or uploaded, so a chart may name a system this site no longer has, or never had.
Decision: a colour's system is an open string: a loaded system is stored by its id (matched by id or name, any case), any other trimmed as written (1 to 40 characters, no control characters, never "full"); every reader keeps it, every export prints it, and the colour editor opens such a colour in the common colour picker.
Force: requirement — the Owner's request of 2026-10-10: a pattern keeps code, colour, name and system string, and a system not loaded opens the common colour picker.
Rejected: dropping an unknown system on read (loses what the person owns); a placeholder "Unknown" system (the file's own word is the better name).
Consequence: only a loaded system offers its list; generation sends any set colour's system to Rust, which keeps it as a string.
Evidence: lib/threads/thread-brands.ts; tests/unit/thread-system-kept.spec.ts; tests/e2e/thread-system-kept.spec.ts; rust/cs-core/tests/palette_set.rs