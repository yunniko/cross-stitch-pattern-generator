# D234 · One legend to buy from, one to stitch from
Date: 2026-09-25 · Goal: G-073 M5 · Status: active (superseded by: —)
Context: both A4 legends carried the same mixture of identity and quantity, and backstitch needed somewhere to report its length.
Decision: the **simple legend** becomes a thread consumption table headed with the pattern's name and designer — colour cell, colour name, skeins. The **extended legend** drops skeins and gains a per-thread backstitch length, with the chart's total in its details table.
Force: requirement — the Owner specified both pages (criterion 6, 2026-09-25). A thread that carries only backstitch reads "backstitch only" instead of "0 skeins": judgment, because "0" reads as "do not buy this".
Rejected: keeping skeins on both (the split is the point); a separate backstitch legend page (a thread used for both would appear three times).
Consequence: this changes **every** chart's legend pages, so criterion 7's "unchanged byte for byte" holds for chart images and grid pages but not for legend pages — the two criteria conflict, and criterion 6 wins because it asked for the change. Pattern Keeper's PDF gets the same text pages and no grid ink.
Evidence: docs/reviews/2026-09-25-backstitch-samples.md; rust/cs-export/src/a4.rs
