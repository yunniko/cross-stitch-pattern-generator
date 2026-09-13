# D116 · The photo preview has its own worker; unreleased modes appear only in the test build
Date: 2026-09-13 · Goal: G-032 M3 · Status: partly superseded (superseded by: D118 for the test-build flag)
Context: The enhanced preview shown before Generate must not cancel or wait behind a generation, and must match generation closely. No mode is released yet (D115), yet its UI needs end-to-end tests.
Decision: A lazily created preview worker keeps the last photo (sent once per photo), analyses the full photo once per mode and applies those parameters to a copy downscaled to at most 1200 px. The client supersedes an in-flight request and ignores stale replies. The released-mode list includes every recognized mode only when NEXT_PUBLIC_ENHANCEMENT_PREVIEW=1, which only the Playwright build sets.
Rejected: sharing the pattern worker (one active job, so a preview would cancel generation); analysing the downscaled copy (preview parameters would differ from generation); exposing unreleased modes in production for testing.
Consequence: The preview approximates downscaling the enhanced full photo, bounded at mean ΔE 0.02 in tests. E2E tests run a build configured differently from production in this one respect.
Evidence: lib/pipeline/enhance-preview-client.ts; tests/unit/enhance-preview.spec.ts; tests/e2e/photo-enhancement.spec.ts; playwright.config.ts
