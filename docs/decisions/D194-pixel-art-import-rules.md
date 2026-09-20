# D194 · Pixel art imports exactly, and is refused rather than repaired
Date: 2026-09-20 · Goal: G-049 M1 · Status: active (superseded by: —)
Context: an image whose pixels are already stitches needs no quantization, but it can still be too large, too colourful, half-transparent or smaller than any chart.
Decision: one pixel is one stitch at its own colour, custom, with no thread brand; a transparent pixel is an empty stitch; over 1500 px a side, over 100 colours, or any partial transparency is refused with the real numbers; an image under 10 stitches a side is centred in a chart of 10.
Force: requirement — Owner instructions (2026-09-20): snapping to threads would change a finished sprite's colours, and a chart below `MIN_STITCHES` is a size nothing else was built for.
Rejected: quantizing an over-100-colour image to fit (it would rewrite the user's own work); treating partial alpha as opaque or empty (a stitch is there or it is not).
Consequence: a refusal must happen before anything is created, so an open chart survives it. Colour counting uses a 2 MB bitmap, so the error can always name the true count.
Evidence: lib/editor/pixel-art-import.ts; tests/unit/pixel-art-import.spec.ts
