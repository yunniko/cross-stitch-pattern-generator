# D218 · A crash hands over a report, and the test breaks the browser rather than the app
Date: 2026-09-23 · Goal: G-066 M2 · Status: active (superseded by: —)
Context: the workspace had no error boundary, so a throw showed Next's "this page couldn't load" with no stack and nothing to send on (D217). A boundary must also be exercised, and a deliberate-crash button inside the app was found in the production bundle when tried.
Decision: `app/error.tsx` and `app/global-error.tsx` render a screen that names the failure and downloads a report (error, stack, digest, commit, view, tool, brush, zoom and the chart as an editable file, never the photo). The spec crashes the app by replacing `CanvasRenderingContext2D.prototype.fillRect`, so nothing test-only ships.
Force: requirement — a reproduced crash class (a throw under a pointer event) that ended the session with no diagnosis; verified by reintroducing D217 and watching this boundary catch it.
Rejected: a build-flagged crash hook (`NEXT_PUBLIC_CS_TEST_HOOKS`) — the component and its message were in the production chunks.
Consequence: the report names a commit only when the image is built with `APP_COMMIT`; without it, it says "unknown".
Evidence: tests/e2e/crash-boundary.spec.ts; tests/unit/crash-report.spec.ts; lib/editor/crash-report.ts
