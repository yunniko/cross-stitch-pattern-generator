# D119 · OXS is read by a dedicated XML reader and written with the cloth at index 0; losses are counted, never silently dropped
Date: 2026-09-13 · Goal: G-028 M1 · Status: active (superseded by: —)
Context: OXS import must read real writers' files (six studied, the largest 47 MB) in the browser and in Node tests, and exported files must open in other programs.
Decision: A non-validating reader (`lib/editor/oxs-xml.ts`) dispatches on exact element paths and refuses DOCTYPE, undefined entities and invalid characters. Import keeps the file's colours, uses thread tables only for names, resolves full stitches before part stitches, applies the 100-colour cap to final colours, and counts every loss by category. Export writes the cloth at index 0, colours at position plus one, an empty number for custom colours, and literal Unicode symbols.
Rejected: DOMParser (browser only; a 750,000-node DOM); a SAX library (a dependency for a small XML subset); table RGB for detected brands (recolours Anchor round trips); "Color n" numbers for custom colours (reimport renames every colour).
Consequence: Symbol portability stays unverified until M4 opens an export in a real consumer. The loader returns the report with the pattern (M2).
Evidence: tests/unit/oxs.spec.ts; tests/unit/oxs-xml.spec.ts; docs/reviews/2026-09-13-oxs-format-evidence.md
