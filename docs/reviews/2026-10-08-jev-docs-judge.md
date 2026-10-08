# docs-judge calibration on cross-stitch (2026-10-08)

`COMPANY/scripts/docs-judge.mjs` asks Jev (`jev-1.13.0`) two kinds of question that `docs-lint` cannot check:
- **Force:** does each `Force: requirement` decision, and each "Rules in force" line, name what compels it?
- **History:** is each `HANDOVER.md` sentence present state or history?

Cross-stitch is the calibration corpus because it has the most decisions with a `Force:` line (143
requirements; every other project has at most 3). The Owner approved adding the checker as an advisory
check-in step on 2026-10-08.

## What changed while calibrating

- **First form:** five ways a claim can be compelled (Owner, measurement, external limit, safety,
  earlier decision) or "nothing external". It flagged 13 of 143 decisions and **142 of 154 rules** at
  p ≥ 0.3. Cross-stitch's rules are mostly code invariants ("a line has no partial form"), which are real
  but had no option of their own. The handover was also split line by line, which cut hard-wrapped
  sentences.
- **Second form:** adds `technical_necessity` ("doing otherwise would break the code, data or output") and
  narrows "nothing" to preference, usability judgment or consistency. Paragraphs are joined before they are
  split into sentences. This form ships.

## Second form on cross-stitch

There were 522 questions: 143 decisions, 84 rules and 295 sentences. They used about 184k input tokens
(≈ $0.008). Answers are cached, so a re-run is free.

| check | p ≥ 0.3 | p ≥ 0.4 | p ≥ 0.5 | p ≥ 0.6 |
|---|---|---|---|---|
| decisions: nothing compels it | 5 | **2** | 1 | 1 |
| rules: nothing compels it | 6 | **4** | 3 | 3 |
| sentences: history | — | 13 | **10** | 6 |

The shipped thresholds are in bold: 0.4 for Force and rules, 0.5 for history. They give 16 warnings.
JulAI read each of them:
- **Decisions:** D236 ("drawing with a finger means dragging") is a judgment. D213 is borderline. 2 of 2
  are worth a look.
- **Rules:** lines 298, 303, 313 and 321 are interface conventions that name no reason. Line 321 ("a
  disabled control wears one of exactly two looks") is a consistency choice. 4 of 4 are worth a look.
- **History:** lines 69, 371, 379, 383, 392 and 395 are history. Lines 15 and 86 are present status;
  376 and 386 are open items. 6 of 10 agree.

That makes 12 of 16 warnings useful. The four misses are history false alarms on dated status lines.

The other projects' handovers (when-we-meet 41 questions, listing-studio 30, crochet-sim 24,
acoustic-fractal-lab 25) gave no warnings. Their highest history score was 0.46, and the highest
nothing-compels score was 0.33.

## Limits

- One corpus, one model version, and the reading is JulAI's, not hand labels made beforehand. Expect
  false alarms around dated status lines.
- Re-calibrate with `--json` if `jev-latest` moves to a new version. The cache is keyed on the alias, not
  the version, so clear `~/.cache/docs-judge/` then.
- Advisory only: it never fails a check-in. Old files are fixed when a goal next touches them, not swept.
