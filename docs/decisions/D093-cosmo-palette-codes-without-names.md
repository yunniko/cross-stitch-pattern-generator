# D093 · Cosmo colors come from the MIT CosmoToRGB dataset and show codes only
Date: 2026-09-12 · Goal: G-029 M2 · Status: active (superseded by: —)
Context: Cosmo needed real color data. The only independent source samples Cosmo's official 2020 card, and it has codes but no names.
Decision: Use tallcoleman/CosmoToRGB (MIT, 500 unique codes, spot-checked) with every name as an empty string. formatThreadName shows the bare code when a name is empty. A code-name split with no separator treats the whole string as the code. Palette and picker UI map over the registry.
Rejected: inventing names to fit the DMC shape (dishonest data); hardcoding brand buttons (each brand would need UI edits).
Consequence: A new brand with real data needs a data file, a provenance doc, a registry entry and the inline threadBrand union in lib/types.ts widened.
Evidence: docs/cosmo-colors-provenance.md; lib/threads/cosmo-colors.ts; tests/unit/cosmo-colors.spec.ts; tests/unit/thread-brands.spec.ts; HANDOVER.md D93 as of commit f7bb51c.
