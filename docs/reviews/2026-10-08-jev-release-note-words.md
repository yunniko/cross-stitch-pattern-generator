# Release notes in a user's words: pattern and Jev (2026-10-08)

`release-notes/README.md` asks that a note a user reads say "what they will notice, not how it was done",
with "no file names, commit ids or goal numbers". The Owner asked for this to be checked (2026-10-08). The
check has two parts (D363):
- **Pattern, a gate:** `developerWords` in `lib/release-notes/rule.ts` finds goal and decision numbers,
  file names and commit ids. `check:fast` and CI refuse a `new`, `changed` or `fixed` note carrying one.
- **Jev, advisory:** `COMPANY/scripts/docs-judge.mjs` asks one noul per waiting note: is it in developers'
  words? It warns at p ≥ 0.5, at check-in.

## Corpus

- **38 good:** every bullet already released in `release-notes/releases/`.
- **27 bad:** implementation-speak with no identifier, written by JulAI for this probe ("Memoised the symbol
  lookup so re-renders are cheaper"). There are 3 more that differ only by an id (G-114, D241, a1b2c3d).
- **17 internal:** every `internal` note in the history, for information only. They are not checked.

The notes and answers are in the session that ran this; the question is the one `docs-judge.mjs` ships.
About 42k input tokens (≈ $0.002).

## Results

| threshold | good flagged (of 38) | bad flagged (of 27) | id-only flagged (of 3) | internal flagged (of 17) |
|---|---|---|---|---|
| 0.4 | 1 | 26 | 0 | 15 |
| **0.5** | **1** | **26** | **0** | 14 |
| 0.6 | 0 | 25 | 0 | 8 |

- **The good note flagged** is 0.18's dither-preview note (p = 0.59). It reads "drawn by the same code
  that makes charts … drawn by the server". That is fair to question.
- **The bad note missed** (p = 0.36) is "returns 429 with a Retry-After header". Jev reads it as something
  a person meets.
- **The id-only notes** scored 0.29–0.39. That is why the ids are matched by a pattern, not judged.
- **The pattern** finds nothing in the 38 released notes. Its unit tests cover versions, percentages,
  keys, thread numbers and colour hex as non-matches.

## Limits

- The bad notes are JulAI's own writing and denser in jargon than a slip would be. Expect lower recall on
  a note that is half user words, half code.
- One project and one model version (`jev-1.13.0`).
