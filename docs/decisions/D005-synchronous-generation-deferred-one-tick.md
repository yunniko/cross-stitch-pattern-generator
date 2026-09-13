# D005 · Generation runs on the main thread, deferred one tick
Date: 2026-09-09 · Goal: G-001 · Status: superseded (superseded by: D006)
Context: K-means on a large grid is real work, but the tool processes one image at a time.
Decision: Call buildPattern synchronously after setTimeout(0), so "Generating…" paints first.
Rejected: a Web Worker (more engineering than one-shot k-means justified at the time).
Consequence: This held only while generation was a single k-means pass. D006's iterative optimizer moved generation into a worker.
Evidence: HANDOVER.md D5 as of commit f7bb51c.
