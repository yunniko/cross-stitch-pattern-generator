# D025 · Superseded generation jobs reject, and async results are gated by a source revision
Date: 2026-09-10 · Goal: G-010 M1, G-011 · Status: active (superseded by: —)
Context: The 2026-09-09 review found an old generation result shown and downloaded under a newly chosen image's filename.
Decision: cancelPatternJob rejects the pending promise with PatternJobCancelledError. Every async continuation checks a source revision counter bumped on each new file. Choosing a file cancels in-flight generation. G-011 added an optional pattern name that drives download filenames.
Rejected: leaving a cancelled promise pending on a terminated worker (it never settles); relying only on disabling the input (setInputFiles bypasses it).
Consequence: New async work that touches the document must check the revision before applying results.
Evidence: lib/pipeline/pattern-client.ts; tests/unit/pattern-client.spec.ts; app/hooks/use-source-image.ts; HANDOVER.md D25 as of commit f7bb51c.
