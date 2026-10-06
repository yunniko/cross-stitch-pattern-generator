# A new dither pattern as one module and one declaration — the proof (G-100 M4, 2026-10-07)

G-100's acceptance asks for a new pattern added as one Rust module and one declaration, shown by a temporary one and then removed. The temporary pattern was "Proof stripes": a threshold that climbs one step a stitch along `x + 2y`, period 7. It was added on top of 6626b00 and removed before M4 was committed further; nothing of it remains in the tree.

## What was written by hand

- a new file, `rust/cs-core/src/dither/proof_stripes.rs` (28 lines): `configure` and the `Pattern` implementation, using the shared `by_thresholds`;
- two lines in `rust/cs-core/src/dither/mod.rs`: `pub mod proof_stripes;` and `alone("proof-stripes", "Proof stripes", &SCATTERED, proof_stripes::configure),` in `PATTERNS`.

No TypeScript, no component and no list was edited.

## What was generated

- `npm run dither-patterns`: `lib/pipeline/dither-patterns.ts` gained one line, the pattern's declaration, so `DITHER_MODES` and the type `DitherMode` gained "proof-stripes";
- `npm run dither-previews`: `public/dither-previews/proof-stripes-tile.png` and `proof-stripes.png`, diagonal stripes over the ramp.

## What it reached

- `npx tsc --noEmit -p .`: passed, so the chooser, the feature list (`dither.proof-stripes`) and the request check took the new id with no edit;
- `cargo test --release`: all passed, among them `dither_declarations.rs` and the settings test that walks `PATTERNS`;
- `cs-job dither-preview` with `"ditherMode":"proof-stripes"` (the server's preview): a 56 × 56 PNG;
- `cs-job generate 60 40` over a grey ramp with `"ditherMode":"proof-stripes"`: a chart, differing from the same request with `bayer-4`;
- `npx vitest run`: 1,335 passed, 7 failed, all 7 in `tests/unit/dither-preview-reference.spec.ts`, which pins the pictures of the 13 patterns that existed at M1 and has no reference for a pattern added later. That spec is meant to fail when the set of patterns changes; a real new pattern would extend the reference in the same commit.

Not done: the chooser was not looked at in a browser with the proof in it; the type check and `tests/unit/dither-declarations.spec.ts` stand for it.

## Removed

The module and the two pictures deleted, `mod.rs` and `dither-patterns.ts` restored from 6626b00, the release build rebuilt; the tree was then clean, and the full checks were run on it (recorded in the progress log).
