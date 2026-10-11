# D396 · Every key prints System and Number columns, filled from each colour's own thread; the Pattern Keeper PDF re-pinned
Date: 2026-10-10 · Goal: G-131 M2 · Status: active in part (superseded by: D410)
Context: with any system's thread in any chart (D395), the keys printed a code column only for charts matched to one brand, and Rust and TypeScript disagreed on when.
Decision: the skein table, the colour key and the Pattern Keeper PDF always print System and Number from each colour's `source` (blank for none); legends without columns print "System Number - Name"; the Thread detail lists the systems in use; OXS writes typed numbers.
Force: requirement — G-131 AC3 (Owner, 2026-10-10) names the Pattern Keeper PDF, which narrows D264's "untouched" pin.
Rejected: columns only when a colour has a thread (the layout would still change with the systems); the system inside the name column (unsortable when read).
Consequence: `pattern_keeper_pinned.rs` pins the new bytes; Pattern Keeper's reading of the PDF with the new columns has not been checked in the app itself. Printing rules live in `Color::printed_thread` and lib/threads/printed-thread.ts (removed by D410).
Evidence: tests/unit/printed-thread.spec.ts; tests/unit/oxs-rust-parity.spec.ts; rust/cs-export/src/a4.rs tests; rust/cs-export/tests/pattern_keeper_pinned.rs