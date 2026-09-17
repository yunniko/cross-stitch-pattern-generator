# D149 · The processor runs three workers inside a 3-CPU, 2 GiB cap
Date: 2026-09-17 · Goal: G-034 M1 · Status: active (superseded by: —)
Context: the plan sized the move from laptop benchmarks scaled by a synthetic probe. Measured on the host inside a capped container, the pipeline is ~3.4× slower per core, not 2.0×, and per-job memory is lower than assumed (`docs/reviews/2026-09-17-server-processing-capacity.md`).
Decision: a `processor` service capped at `cpus: 3.0` / `mem_limit: 2g` runs three workers, one job each; `app` is capped at `cpus: 1.0` / `mem_limit: 768m`, leaving ~2 vCPU for the other sites. Three concurrent jobs measured 13.8–13.9 s against 12.1 s solo (~15 % contention), peaking at 209–235 MB each. The queue holds 12, answering 503 with `Retry-After` when full; deadlines are 45 s per job, 150 s for Export all.
Rejected: four or more workers (only ~2 vCPU remain for twenty other sites); no caps, as the app runs today (a CPU-heavy pipeline would starve them).
Consequence: throughput is about 12–13 large generations a minute, not 18, so the client shows queue position. Export costs are unmeasured and may change the deadlines.
Evidence: docs/reviews/2026-09-17-server-processing-capacity.md; scripts/capacity-probe.ts; GOALS.md G-034 progress log
