# D128 · Photos decode in a worker, with the old decode as a logged fallback
Date: 2026-09-14 · Goal: G-035 M3 · Status: active (superseded by: —)
Context: decoding a 12 MP photo through an `<img>` and a DOM canvas blocked the page for about 0.4 s on upload and on reopening a save.
Decision: `lib/editor/decode-image.worker.ts` decodes with `createImageBitmap` (EXIF orientation applied) and `OffscreenCanvas` at the same 4000 px cap, and any worker failure retries once through the original main-thread decode with a console warning.
Rejected: `createImageBitmap` resize options (a different resampler from today's `drawImage`, so decoded pixels would change); no fallback (a format or browser the worker can't handle would stop loading photos that load today).
Consequence: both paths share `decodedSize`, and a change to either must keep the parity spec at zero differing bytes for orientation, colour profile, transparency and the cap.
Evidence: tests/e2e/decode-parity.spec.ts; GOALS.md G-035 M3 progress log
