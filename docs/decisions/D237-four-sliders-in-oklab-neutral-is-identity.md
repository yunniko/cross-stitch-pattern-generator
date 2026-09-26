# D237 · Four sliders in OKLab, and neutral means untouched
Date: 2026-09-26 · Goal: G-074 M1 · Status: active (superseded by: —)
Context: the five enhancement modes analysed a photo and decided for the reader. The Owner asked for brightness, contrast, saturation and warmth instead, working in the browser.
Decision: each slider runs −100..100 as a fixed per-pixel transform in OKLab — brightness pulls towards white or black, contrast turns about the measured L of sRGB 128, saturation scales a and b, warmth shifts them — written once in TypeScript and mirrored in Rust, with neutral returning the source buffer itself.
Force: requirement — "it should work in browser" rules out per-photo analysis, and criterion 4 with the D107 goldens requires that centred sliders reach generation as the decoded bytes.
Rejected: reusing the modes' adaptive analysis (a slider the photo also moves is not a slider); working in sRGB (brightness would drag saturation with it); one implementation called from both (no WASM in this project, and the pipeline is a separate binary).
Consequence: the four reach constants are chosen, not measured — change either copy and the parity suite fails, which is the intended cost.
Evidence: tests/unit/photo-adjust.spec.ts; scripts/rust-photo-adjust.ts
