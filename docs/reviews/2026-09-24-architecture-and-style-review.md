# Architecture and code-style review — cross-stitch-pattern-generator

Date: 2026-09-24 · Reviewed at 5d95bf1 · Owner-requested, strict pass over structure and style.

Measurements were taken from the tree, not recalled. Sizes: `app` 6,969 lines, `lib` 18,131, `processor` 1,690,
`rust` 13,233, `tests` 30,118, `scripts` 3,768.

## What holds up

These are real and worth not breaking.

- **Type discipline is close to exemplary.** Across `app`, `lib` and `processor`: one `as any`, zero `@ts-ignore`,
  zero placeholder markers, three `eslint-disable` lines of which two carry a reason.
- **No inverted dependencies.** Nothing in `lib/` or `processor/` imports from `app/`. The framework stays in the
  framework layer, with the two exceptions in A8 below.
- **Comments explain why, and cite the decision that settled it.** 15% comment lines (3,939 of 25,100), and the
  house style is a reason plus a `Dnnn` reference rather than a restatement of the code.
- **The test suite is substantial and is mostly about behaviour**: 1,312 unit tests and 380 end-to-end, 30k lines of
  test against 25k of source.

## A1 — CI verifies the implementation production does not run · **critical**

`Dockerfile:19,55` builds `cs-job` and copies it into the processor image. `processor/rust-jobs.ts:28` turns Rust on
whenever `CS_JOB !== "0"` and that binary exists — which is always true in the image. So **every generation and every
server export in production runs the Rust sidecar.**

`.github/workflows/ci.yml` runs lint, typegen, `tsc`, `build:processor`, unit and e2e. It never installs a Rust
toolchain, never runs `cargo test`, never sets `CS_JOB_BINARY`, and never runs `compare:rust`. With no binary
present, `rustAvailable()` is false, so **CI exercises the TypeScript fallback exclusively.**

The byte-identity invariant between the two implementations — the thing that makes shipping two of them defensible —
is checked only when someone remembers to run `npm run compare:rust` by hand.

The consequence is not theoretical: a pipeline change can be written in TypeScript only, pass a green CI, and deploy,
while the code that actually serves users is stale or divergent. The suite would still be green, because it is
testing the other implementation.

**Fix.** Add a CI job that installs Rust, runs `cargo test --release`, builds `cs-job`, runs `npm run compare:rust`,
and runs at least the generation and export e2e specs with `CS_JOB_BINARY` set. Make it a required check. If the full
parity corpus is too slow for every push, run the golden-hash subset per push and the full corpus nightly — but the
production path must be exercised on every merge.

**Also worth the Owner's judgment:** two full implementations of one pipeline (≈9,000 lines of Rust against ≈4,900 of
TypeScript pipeline), held to *bit-exact* float equality, is a standing tax — it required porting V8's own maths
(`rust/cs-core/src/jsmath.rs`, `fdlibm.rs`) to keep results identical. G-061/G-062 alone touched five Rust files to
mirror one TypeScript feature. That was a deliberate, signed-off trade (G-048) and the performance case was real. It
deserves a written exit condition: either the TypeScript becomes a thin reference used only by the parity harness, or
byte-identity relaxes to a tolerance, or the fallback is retired. Carrying both forever, at bit-exactness, is the
most expensive option and nothing currently says when it ends.

## A2 — `app/workspace.tsx` is a god component · **high**

775 lines, 32 hook calls, 19 locally defined functions, 38 `onX` props handed to children. It owns the pattern and
its history, the colour slots, the tool state, the view mode, the zoom, isolate, symmetry, the source photo, the
generation lifecycle, every file input, and the wiring of every pane.

This is where features go to accumulate, and where they break. Today's crash (D217) lived here: the merge handler and
the paint-colour selector are neighbours in this file, and the invariant between them was not visible from either.

**Fix.** Extract by concern into hooks that own their own state and expose an interface:
`useEditorDocument` (pattern, history, autosave, restore), `useDrawingColours` (slots, the palette-index invariant of
D217), `useToolState` (active tool, per-tool options, the shape/brush stamp). The target is a `workspace.tsx` that
composes and routes, under about 250 lines, where adding a tool touches one hook and one component rather than five
places in one file.

## A3 — No formatter, here or anywhere in the portfolio · **high**

`STANDARDS.md` requires a shared formatter config and the dominant community standard ("Prettier defaults"). The
project has `eslint.config.mjs` — a linter — and no Prettier, no `.editorconfig`. **None of the ~25 TypeScript
projects under `projects/` has one either.** The rule has never been implemented anywhere.

Measured here: 393 source lines over 140 characters, 38 over 200, longest 381. Line breaking is per-author taste, so
diffs carry reformatting noise and review reads harder than it should.

**Fix.** One canonical config at Company level (see R2), added to this project with `npm run format:check` in CI, and
a single mechanical formatting commit so the history break is one commit rather than a slow drift.

## A4 — The documentation rules push in the wrong direction · **medium-high**

`HANDOVER.md` has a hard 300-line cap that `docs-lint` fails on. Beside it, uncapped and unstructured:
`docs/goals-archive.md` at **10,279 lines**, `docs/decisions/` at **218 files** behind a flat 229-line index.

The cap is on the one document that must stay short, and nothing governs the two that grow without bound. The effect
is perverse and observable: in this session I deleted *accurate, current* content from `HANDOVER.md` three separate
times — a settled infrastructure note, a dithering caveat, a deploy-log row — purely to make room, while the 10k-line
archive absorbed everything unchecked. Squeezing true statements out of the snapshot to satisfy a line count is not
maintenance; it is a word game the rule forces.

**Fix in the project.** Split `docs/goals-archive.md` per year or per goal range. Group the decision index by
subsystem with each entry's status, so 218 files are navigable without reading the list.

**Fix in the rules.** R3 below.

## A5 — End-to-end helpers are copy-pasted across the suite · **medium**

`tests/unit/helpers/` exists. `tests/e2e/` has no helpers module: `generateSmallPattern` is redefined in **15** spec
files and a download/export helper in **21**.

The cost was paid today and is measurable. Adding a second `<canvas>` in G-065 made `getByRole("main").locator("canvas")`
ambiguous, and because every spec had its own copy, **27 files needed the same mechanical edit**. With one shared
locator it would have been one line.

**Fix.** `tests/e2e/helpers/` holding `generateSmallPattern`, `blankChartWithColors`, `exportChart` and the shared
element locators. Specs import them; a selector for a shared element is written once.

## A6 — `lib/export/render.ts` is four modules in one file · **medium**

962 lines, and its exports span chart rasterising (`drawChart`, `drawCell`, `drawChartOutline`), highlight overlays,
text utilities (`headerText`, `truncateToWidth`), legend and page layout maths (`legendCanvasExtent`,
`findChartLayout`), navigator pixels and stitch-preview pixels. It is imported by the editor, the export pipeline and
the server backend alike, so every consumer depends on all of it.

**Fix.** Split along the seams already visible in the export list: `render/chart.ts`, `render/cell.ts`,
`render/text.ts`, `render/layout.ts`, `render/preview.ts`, keeping `render.ts` as the re-export so call sites move in
their own commit.

## A7 — The palette-index invariant is assumed at five sites and stated at none · **medium**

`lib/export/render.ts:173,300,432,533` and `lib/export/stitch-texture.ts:75` dereference `palette[paletteIndex]`
without a guard. This is exactly what turned a one-byte state bug into a dead page yesterday: a `254` in the chart
made `palette[254].rgb` throw inside a pointer handler (D217).

D217 fixed the *source* — nothing writes a bad index now — which was the right call, and the renderers are
deliberately strict so that a bad index is found rather than painted around. But the assumption those five sites rest
on is written down in a decision file, not at the sites.

**Fix.** One accessor, `colorAt(palette, index)`, that throws a named error naming the index and the palette length.
Same strictness, but the failure says what is wrong, and a crash report (D218) carries that instead of
`undefined.rgb`.

## A8 — Hooks live in two places · **low-medium**

`app/hooks/` holds twelve. `lib/editor/` holds two more — `use-project-autosave.ts` and `use-undo-history.ts` — which
are the only React-dependent files under `lib/`, an otherwise framework-free layer.

**Fix.** Move both to `app/hooks/`, leaving their non-React logic in `lib/editor/` if any. Then "`lib/` imports no
framework" is a rule a linter can enforce rather than a tendency.

## A9 — Repository hygiene · **low**

- `projects/cross-stitch-pattern-generator` — the directory the charter tells a newcomer to read first — is **150
  commits behind** `origin/master`. Its README and HANDOVER describe a state four goals old.
- All work happens in `worktrees/cross-stitch-g034m2` on branch `g034-m2`, named for a milestone of G-034, a goal
  archived long ago. That branch now carries the history of G-046 through G-066.
- A third worktree is registered under another session's scratchpad (`.../scratchpad/cs-g038`). Corrected
  2026-09-24: that directory still exists, so `git worktree prune` rightly leaves it alone — it is abandoned,
  not stale. Its branch `g-038-crisp-plus` is fully merged into master, so nothing is lost by removing it, but
  it belongs to another session's workspace and is not this goal's to delete.

**Fix.** Fast-forward the main checkout, retire the branch name, `git worktree prune`. Lifecycle rule in R7.
Done 2026-09-24: the main checkout is fast-forwarded to `origin/master` and now shows shipped code. The
worktree itself stays until G-065 and G-067 are signed off, which is what R7 asks.

## A10 — `lib/experimental/` is on the production import graph · **low**

`lib/pipeline/pattern.ts:32` imports `runContourRefinement` from `lib/experimental/`. It is opt-in, off by default,
and guarded with an explicit refusal (D068), so the behaviour is right — but the arrangement is incidental rather
than stated, and the next import from that folder may not be so careful.

**Fix.** State it: an `experimental/` module may be imported only behind a flag that is off by default and refuses
loudly when combined with something it cannot support. That is what this one already does.

## Company rules — proposed changes

Each names the finding it prevents. These are proposals; the charter is the Owner's.

**R1 · "Verified" means the path production runs.** `STANDARDS.md` → Software says changes are verified by running
them. Add: *where a project ships more than one implementation of the same behaviour, CI must exercise the one
production runs, and the harness proving their equivalence is a merge gate, not a manual step.* (A1)

**R2 · A formatter is mandatory, and shared.** Replace the aspirational sentence with a concrete one: *every project
in a language with a dominant formatter runs it in CI (`format:check`). The config lives once, at
`COMPANY/configs/`, and projects copy or extend it — a project without a formatter is not conforming.* Retrofitting
~25 projects is a portfolio goal of its own, not a side effect of this review. (A3)

**R3 · A cap must never force deleting something true.** `STANDARDS.md` → Documentation makes `HANDOVER.md` fail over
300 lines. Change to: *per-section caps, with the lint naming the section that overflowed; and when the snapshot is
condensed, the milestone check-in says what moved and where it went. Content that is still true moves to the
archive, the decision file, or the review — it is not deleted to fit.* Add: *`docs/goals-archive.md` is split when it
passes 2,000 lines, and the decision index is grouped by subsystem once it passes 50 entries.* (A4)

**R4 · One home per shared test affordance.** `STANDARDS.md` → Software: *a helper or selector used by more than two
specs lives in a `helpers/` module beside them. A locator for a shared UI element is defined once.* (A5)

**R5 · A module has one job, and size is the trigger to check.** *A source file over roughly 500 lines, or exporting
what are plainly two subsystems, is split — or carries a `Dnnn` saying why it should not be.* Size alone is not a
defect; an unexamined 962-line shared module is. (A2, A6)

**R6 · An invariant is enforced where it is assumed.** *Where code assumes an index or key is valid, either the type
makes it so or there is one accessor that fails with a named error. "The caller guarantees it" is only acceptable
with a guard that says so when the caller is wrong.* (A7)

**R7 · Worktree and branch lifecycle.** `OPERATIONS.md` §3 covers one session per tree. Add: *a worktree is created
per goal and named for it; at sign-off the main checkout is fast-forwarded and the worktree removed, so the project
directory always shows shipped code. Stale worktrees are pruned at the same time.* (A9)

**R8 · Nothing test-only ships.** Learned the hard way in G-066: a crash hook behind `NEXT_PUBLIC_CS_TEST_HOOKS` was
found whole in the production chunks. *A test affordance compiled behind a flag is verified absent from the
production bundle by a check in CI, not by trusting the flag.* (D218 records the instance; this makes it portfolio-wide.)

## Priority

1. **A1** — the production path is untested. Everything else is cosmetic beside it.
2. **A3/R2** — a formatter, once, portfolio-wide.
3. **A2** — split `workspace.tsx` before the next feature lands in it.
4. **A4/R3** — stop the cap forcing deletions; split the archive.
5. **A5, A6, A7** — mechanical, low risk, each removes a class of future edit.
