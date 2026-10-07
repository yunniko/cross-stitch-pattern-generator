# D336 · HSTS and a frame-ancestors-only Content-Security-Policy on every response
Date: 2026-10-07 · Goal: G-117 M1 · Status: active (superseded by: —)
Context: the site sent no HSTS and could be framed by any page, and it named its framework in `X-Powered-By`.
Decision: `next.config.ts` adds `Strict-Transport-Security` (one year, subdomains), `Content-Security-Policy: frame-ancestors 'none'`, `X-Frame-Options: DENY`, and turns `poweredByHeader` off.
Force: requirement — Owner, 2026-10-07: "fix issues" from the security review kept outside this repository.
Rejected: a full script-src policy now (Next's inline scripts need a per-request nonce, which makes every page dynamic — its own goal if wanted); setting the headers in nginx (needs root, and the app is then unprotected anywhere else it runs).
Consequence: an embed of this site in another page will not load; adding `script-src` later needs the nonce work.
Evidence: next.config.ts
