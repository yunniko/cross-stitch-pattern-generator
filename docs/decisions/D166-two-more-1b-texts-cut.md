# D166 · Two more 1b texts the Owner cut
Date: 2026-09-18 · Goal: G-045 · Status: active (superseded by: —)
Context: D161 records that a mismatch with the Atelier screens is a defect unless it is written down as a choice. Two more are deliberate.
Decision: the first-run screen drops 1b's subtitle "Three steps, all reversible. Pick where you want to start.", leaving the heading alone above the three cards; and the status bar shows nothing at all while no chart is open, dropping "Editing, undo and autosave stay in this browser". Both are the Owner's call, made 2026-09-18 against the running screens.
Rejected: keeping the half of the status-bar line that warned a new chart replaces the autosaved one — the confirm already says exactly that at the moment it applies, naming the chart and offering the editable save first (D162), and the start screen is often reached with nothing to replace.
Consequence: with no chart open the status bar's left side is empty by design, and the first-run screen carries no explanatory prose. This extends D161's list; check both before restoring anything to match the design.
Evidence: app/components/first-run.tsx; app/components/status-bar.tsx
