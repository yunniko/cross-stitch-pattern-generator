# D265 · The Color # column is printed whenever a thread has a code, not only for a one-brand chart
Date: 2026-10-01 · Goal: G-083 follow-up · Status: active (superseded by: —)
Context: the legends printed Color # only when the chart had a `threadBrand`, which the editor clears once threads of several brands or custom colours are mixed. Such a chart's Pattern Keeper PDF had no number column, only names with the number inside, and Pattern Keeper stopped importing its colours (Owner, 2026-10-01).
Decision: the legends print Color # when `thread_brand` is set or any colour has a thread source; in a mixed chart the name column carries the brand ("DMC Red") and a custom colour has an empty code.
Force: requirement — the Owner's Pattern Keeper import fails without the column; the same Rust drawing serves the A4 legends.
Rejected: printing the brand inside the code cell (too wide for 18 mm); changing the editor to keep `threadBrand` (it means every colour is one brand).
Consequence: `Pattern::has_thread_codes` decides; a chart with no sources and no brand prints exactly what it did, which `pattern_keeper_pinned` still pins. The TypeScript A4 legend keeps the old rule (not the production path).
Evidence: rust/cs-export/src/a4.rs (`code_column_tests`); rust/cs-export/tests/pattern_keeper_pinned.rs
