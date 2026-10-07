# The development loop

How a change is checked, and how long each step takes. First written in G-090 M4 (2026-10-04); rewritten with new
measurements in G-096 (2026-10-05, at commit 2c30b26 and after, on the Owner's machine: 12 logical processors, Windows 11).

## Which lane

| The change… | Lane |
|---|---|
| touches only the interface: no chart data or file format, no export, no generation, nothing in `processor/`, `rust/` or the account code | **Fast lane** (D280) |
| anything else, or any doubt | **Normal goal**: milestones, full suite, deploy, handover |

## Fast lane, step by step

1. Make the change. Logic goes in `lib/` with a unit test; see `docs/architecture.md` for where.
2. `npm run check:fast`: type-check, the unit tests related to the changed files, lint and the formatter with their caches, and the release
   note: a change under `app/` (but `app/admin/`), `lib/`, `rust/` or `public/` carries a file in `release-notes/next/`,
   of kind `new`, `changed` or `fixed`, or `internal` when nothing a user sees changes (D309; how to write one:
   `release-notes/README.md`). CI checks the same over every push.
3. If the interface changed, run only the specs the change can affect, against one of two servers:
   - **`npm run e2e:dev`** (the development server): up in 3 s, no build to wait for, and an edit is picked up without
     restarting it. Use it while working on one spec or a few.
   - **`npm run e2e:servers`** (a production build, 25 s to build and start; run it again after a change): what the result
     is taken from before a commit.
   Then, for example, `npx playwright test tests/e2e/crop-tool.spec.ts`.
4. Commit, the note with it, and one line under "Small changes" in `GOALS.md`.
5. **Batch deploy**, once per batch or day: `npm run test:e2e` on a production build (the whole suite), then
   `npm run release` (the notes gathered into the release's file, the number raised, a commit and the tag `v<version>`;
   D310), deploy with `git push --follow-tags`, the affected specs against the live site, the broad live check below,
   and the deploy-log row the release printed, its last column filled in. The design brief and handover are updated
   once.

A **normal goal** carries its notes the same way: each commit that changes what a user sees adds or edits a note, so a
milestone ends with its notes written, and the goal's deploy is a release cut the same way.

## Writing a spec: open the saved chart

A spec that needs a chart and is **not about generating one** opens the saved sample chart:

```ts
import { openSmallChart } from "./helpers/app";
await openSmallChart(page);
```

It is the chart `generateSmallPattern` makes (50 × 31 stitches, 16 colours, its photo inside), saved as
`tests/e2e/fixtures/sample_editable.json`. Nothing is asked of the server for the chart, so the case cannot fail on a busy
processor and does not spend one of the live site's six jobs a minute. `generateSmallPattern` is for specs about generation,
or about what generating leaves behind (usage counts, the size choice). When generation is changed on purpose, make the
file again: generate the small pattern, export the editable file, replace the fixture.

## Checking the live site

| Check | Command | What it is |
|---|---|---|
| A few cases of what was just deployed | `npx playwright test -c scripts/playwright.live.config.ts <spec> -g "<names>" --workers=1` | Any spec. Generation and server exports are limited to six jobs a minute for one address, and choosing a photo spends one as well, so run **at most three generating cases at a time** |
| The broad check | `npx playwright test -c scripts/playwright.live-free.config.ts` | **199 cases in 31 spec files, 3 min, all passing on 2026-10-05.** Every spec none of whose cases generates, exports through the server or signs anyone in; the list and its rule are in that file |

Never run against the live site: the account and admin specs (they register users, which there would be real accounts).

## Measured (2026-10-05)

| Step | Time | Note |
|---|---|---|
| Type-check | 21 s | Measured 2026-10-04 |
| Unit tests, all 1,096 | 14 to 22 s | |
| Unit tests related to the change (`vitest run --changed`) | 4 s | Measured 2026-10-04 |
| Lint, cold | 29 s | 22 s on 2026-10-04 with fewer files. Most of it is reading and parsing the files, not any one rule: see "The lint rule" |
| Lint, cached (the `lint` script) | 6.5 s | Measured 2026-10-04 |
| Production build and start (`npm run e2e:servers`) | 25 s | With the build cache warm |
| Development server up (`npm run e2e:dev`) | 3 s | The first page then takes 6 s to compile |
| One spec file (crop tool, 16 cases) on the build | 12 s | |
| The same on the development server | 18 s | Also 18 s straight after an edit to a component, with nothing rebuilt by hand |
| Whole browser suite, 564 cases, 6 workers | 245 to 286 s over five runs | 562 in parallel, then the 2 site-counter cases alone |

**One spec after an edit:** build path 25 + 12 = **37 s**; development server **18 s**.

### The suite's time, and why opening a saved chart did not shorten it

| | Before G-096 | After |
|---|---|---|
| Generations the suite asks the server for, one run | 245 | 67 |
| Server exports, one run | 40 | 40 |
| Wall time, 6 workers | 271 s (one run) | 245, 264, 264, 276, 286 s |
| Cases passing | 564 | 564 |

The cases add up to about 1,500 s of work, and six browsers finish that in about 250 s whatever the server is asked for:
generating the small chart takes well under a second, and what a case spends its time on is the browser. The conversion
was worth doing for the live site and for not depending on a busy processor, not for speed. Two cases that were slow for
no reason were fixed on the way (one handed four million pixels across to compare them, 59 s; one made a check per pixel,
43 s); together they are now under 5 s. One case alone is 174 s: exports of a 1,000-stitch chart, which is what it tests.

**More workers do not help:** nine workers took 264 s against 245 s for six in back-to-back runs. The one app process and
the processor's three concurrent jobs are the limit, not the browsers.

### The development server for the whole suite: no

Run once in full on the development server: **776 s, 5 failed, 1 flaky**, against about 260 s and none on a build. Three
of the failures were the development server's own badge sitting over the Mirror actions and taking their presses; it is
now turned off (`devIndicators` in `next.config.ts`, which only the development server reads). Two cases still fail there
and pass on a build:

- `autosave.spec.ts`, "a project autosaved by the previous localStorage build is migrated on first load". Cause, read
  from the code and not yet confirmed by an experiment: the development server mounts everything twice, the restore then
  runs twice at once, and the run whose result is kept can find the old slot already emptied by the other. The chart is
  not lost (it is in the new store and comes back on the next load). A production build mounts once.
- `a4-export.spec.ts`, "the A4/PDF overlap setting … persists across a reload": the chart is not back within 15 s of the
  reload. Cause not found.

So the development server is for working on a spec. **What a commit, a batch or a milestone is verified on is a
production build**, as D102 decided and as STANDARDS requires ("verified means the path production runs").

### The lint rule

`react-hooks/static-components` was reported in G-090 as "17 of 22 s". That was a misreading: ESLint's timing table gives
each rule's share of the time spent **in rules**, and that rule is 63 % of 10 s of rule time (6.3 s), not of the run.
Turning it off everywhere takes a cold lint from 29 s to 25 s, and the cached lint that is actually used is 6.5 s. It was
left as it is.

## Flaky cases

Seen during G-098 and G-096, with what was done:

| Case | Cause | Outcome |
|---|---|---|
| `photo-sliders.spec.ts`, "each slider moves the thing it names" | Read the preview once, before it was painted | Fixed: waits for the picture. 48 of 48 with eight workers |
| `photo-sliders.spec.ts`, "moving a slider changes the photo on screen…" | Asserted that moving a slider asks the server for nothing. Since G-087 it asks for a colour recommendation a moment later; the case passed only because it ended first. On a busy machine it did not | Fixed: the case now says what is true (nothing but the recommendation), and counts from after the photo's own requests |
| `backstitch-draw.spec.ts`, "letting go of Ctrl ends a chain where it is" | Not found: once in a full run, then 60 of 60 and 96 of 96 | Recorded |
| `photo-sliders-generate.spec.ts`, "a chart saved with the sliders opens with them set…" | Not found: once in a full run, then 64 of 64. A guess, not checked: the colour count is read before a late recommendation changes it | Recorded |
| `canvas-texture.spec.ts`, "the exported preview carries the canvas only when asked…" | Not found: once with eight workers and eight repeats of three files, then 24 of 24 | Recorded |

## What was fixed in the tooling earlier (G-090)

- **The two always-failing cases.** The admin statistics specs read site-wide counters, so any spec generating at the same
  moment moved them. They are tagged `@alone`, and `npm run test:e2e` runs them after the rest, one at a time.
- **Lint cache** on by default; **`npm run e2e:servers`**; **`npm run check:fast`**.
- 2026-10-05: the project's own test database runs on port 54324 with its migrations applied, and `npx playwright test`
  starts its own servers when none are running. `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db` needs `AUTH_SECRET` in the environment even
  though the database does not use it; Playwright's configuration supplies it.

## Still open

| Item | What it needs |
|---|---|
| The restore run twice at once (above) | An application change, so not part of G-096: make the restore safe to start twice. Low priority: production mounts once |
| Many spec files mix cases that need the server with cases that do not, and are left out of the broad live check whole | Tag the cases instead of listing files, if the broad check is wanted wider than 199 cases |
| The 174 s export case | Nothing, unless the suite's time becomes a problem: it could run beside the others from the start |

## QA

An exploratory pass (`/qa-review`) runs at each goal's last milestone (Owner, 2026-10-04), scoped to what the goal changed;
its report goes to `docs/qa-review/` and its findings to a triage table for the Owner. It is not a gate on fast-lane changes.
A goal that changes no application behaviour (as G-096) has nothing for it to exercise, and says so instead.
