# D150 · The server decodes photos with @napi-rs/canvas
Date: 2026-09-17 · Goal: G-034 M1 · Status: active (superseded by: —)
Context: a server decoder that differs from Chrome produces different pixels, and so a different pattern, for the same photo. The plan required measuring `@napi-rs/canvas` against `sharp` before choosing.
Decision: decode with `@napi-rs/canvas`. Against Chrome's `createImageBitmap` path it matched exactly on all five cases measured — plain JPEG, EXIF orientation 6, an ICC profile with swapped primaries, alpha PNG, and 12 MP — no pixel differing. It also supplies the 2D canvas the exports need.
Rejected: `sharp`, which failed two: EXIF orientation 6 came back 240×160 where Chrome gives 160×240, and the ICC case left 100 % of pixels differing by a mean of 71 levels. Its faster 12 MP decode (25 ms against 54 ms) does not outweigh producing a different pattern from the same photo, and it would still need a second library for canvas work.
Consequence: one new runtime dependency, prebuilt for the container's platform. Decode parity gets a regression test before the server path ships.
Evidence: docs/reviews/2026-09-17-server-processing-capacity.md; tests/e2e/decode-parity.spec.ts; GOALS.md G-034 progress log
