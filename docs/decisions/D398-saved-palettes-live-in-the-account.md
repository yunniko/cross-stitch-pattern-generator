# D398 · Saved palettes live in the account, one per name, limited by count; signed out, a file only
Date: 2026-10-10 · Goal: G-131 M4 · Status: active (superseded by: —)
Context: palettes were kept in one browser's storage (at most 50); the Owner asked for them in the account, on both pages.
Decision: a `Palette` table keeps each person's palettes, one per name, as the palette file's data read back with `parseSet`; saving under a kept name replaces it; `palettes.account` gates it and `palettes.count` (default 100) limits it; browser palettes are offered once for moving in, a taken name getting " (2)".
Force: requirement — the Owner's answers of 2026-10-10: account only with a one-time move offer, signed out file only, gated like stamps with a default of 100.
Rejected: keeping the browser list beside the account's (two lists to explain); refusing a taken name on save (the browser list replaced by name).
Consequence: the account's list is read once per page load and shared by both pages through `PaletteAccountProvider`; the browser list is only read for the move.
Evidence: lib/palettes/palette.ts; tests/unit/account-palettes.spec.ts; tests/e2e/palette-account.spec.ts; prisma/migrations/20261010090000_palettes/migration.sql