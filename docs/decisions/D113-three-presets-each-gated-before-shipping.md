# D113 · Auto, Vivid and Portrait are built, and each ships in the UI only after passing calibration gates
Date: 2026-09-13 · Goal: G-032 M1 · Status: partly superseded (superseded by: D118)
Context: The Owner's plan names three modes; its open question on cutting to Auto went unanswered. Codex recommended shipping only Off and Auto. Vivid is the riskiest: strongest local contrast and vibrance, both threats to confetti and thread separation.
Decision: Implement all three presets as data in ENHANCEMENT_PRESETS. A mode appears in the UI only if, on the calibration set, it keeps confetti and flat-region importance within bounds of Off, keeps the Crisp negative controls passing, and in brand palettes stays within bounds on near-duplicate thread pairs and coverage-weighted snap error. A failing mode stays hidden, measurements logged.
Rejected: Auto only (drops two Owner-planned modes before measuring them); exposing all three unconditionally (ships an uncalibrated risk).
Consequence: "Recognized" (saved files and preferences keep any mode) is separate from "released" (offered for new generation). Gates measure benefit and retained detail, run across DMC, Cosmo and Anchor, and record which operations actually ran. Portrait is described as gentle and skin-aware, never face-specific.
Evidence: lib/pipeline/enhance.ts; GOALS.md G-032; docs/domain-reference-photo-enhancement.md
