# D070 · Final Crisp palette colors average each protected cell's selected mode, with at most 3 repair rounds
Date: 2026-09-12 · Goal: G-024 M4.7 · Status: active (superseded by: —)
Context: Recomputing palette colors from raw cell averages would pull a correctly chosen black back toward the manufactured boundary gray.
Decision: finalizeCrispPalette uses a protected cell's supporting-mode color at unit weight and ordinary cells' averages otherwise. After each recompute it repairs against the new palette, for at most 3 rounds, stopping early when nothing changes.
Rejected: raw cell colors for protected cells (re-contaminates, toward about 72 in the test instead of under 50); weighting by coverage again (coverage is an assignment preference only); an unbounded fixed-point loop (convergence isn't guaranteed).
Consequence: With an empty layer the function equals the Standard OKLab mean exactly.
Evidence: lib/crisp/crisp-palette-finalization.ts; tests/unit/crisp-palette-finalization.spec.ts; HANDOVER.md D70 as of commit f7bb51c.
