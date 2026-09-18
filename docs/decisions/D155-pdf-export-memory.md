# D155 · The Pattern Keeper PDF exhausts the worker heap on large charts
Date: 2026-09-18 · Goal: G-034 M5 · Status: active (superseded by: —)
Context: On the server a 1000-stitch chart fails both the Pattern Keeper PDF and Export all with "JS heap out of memory". The PDF adapter pushes three operators per cell onto the page and nothing releases them until the document is saved: 667,000 cells across 154 pages. Both exports worked in the browser, which imposed no such ceiling.
Decision: ship G-034 with the limitation documented rather than fixing it now (Owner, 2026-09-18). D154's raised deadline stays, but the reason it gives is wrong and is corrected here — the bundle never ran out of time.
Rejected: raising the worker heap, measured unbounded and failing alike at 512, 768, 1024 and 1536 MB; refusing oversized exports up front with a clear message; batching same-colour runs into far fewer operators, which remains the real fix.
Consequence: charts near 1000 stitches lose the PDF and Export all, and the reader sees raw engine text rather than a useful message. Setting PROCESSOR_WORKER_HEAP_MB reproduces the failure at any size.
Evidence: GOALS.md, G-034 progress log, 2026-09-18
