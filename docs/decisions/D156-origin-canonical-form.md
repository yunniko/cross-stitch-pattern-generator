# D156 · Loopback spellings are one origin, and APP_URL has no default
Date: 2026-09-18 · Goal: G-044 M1 · Status: active (superseded by: —)
Context: The Origin check compared raw strings, so a site served on 127.0.0.1 and opened as localhost refused its own requests. Separately, the compose default was http://localhost:3000, which the deploy .env overrides in production; losing that one untracked file would have left a page on a visitor's own machine trusted.
Decision: origins are compared in a canonical form that folds localhost, 127.0.0.1 and [::1] into one host while leaving scheme and port significant, and APP_URL defaults to empty, so nothing beyond the origin a request arrived at is trusted unless it is configured.
Rejected: defaulting to the production URL, which bakes one site into a compose file meant to serve any deployment; accepting any loopback port, which would trust every other application on the same machine.
Consequence: an origin that cannot be parsed, including the literal "null" a sandboxed frame sends, is dropped rather than compared, so it can never widen what is allowed. A deployment that needs an origin other than the one it is addressed at must set APP_URL.
Evidence: tests/unit/request-guard.spec.ts
