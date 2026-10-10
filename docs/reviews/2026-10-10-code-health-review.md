# Code health review — 2026-10-10 at 244c56e

Owner's request: find code duplication, questionable decisions, temporary patches in logic, bad practices and
antipatterns, and plan the fixes. The plan is draft goal G-134 in `GOALS.md`.

**Method.** Five read-only reviews ran in parallel, one per area: the editor and document core (`lib/editor`,
`lib/document` and nearby), the client UI (`app/` without api/admin/account), export (TS and `rust/cs-export`), the
generation pipeline (`rust/cs-core`, `cs-job`, `cs-wasm`, `processor/`), and the server (`app/api`, auth, billing,
admin, scripts). Each finding was checked against `docs/decisions/`. The lead session re-checked the key claims; those
are marked **verified**. Anything not marked was read in the code by a reviewer but not re-checked.

**Mechanical sweep (verified).** There are no `TODO`/`FIXME`/`HACK` markers, no `@ts-ignore`, no `as any` in
production code, and no empty catch blocks. 11 of the 13 `eslint-disable` lines carry a reason. The one real Rust
`unsafe` (`rust/cs-core/src/pair_evidence.rs`) writes disjoint columns and is documented and sound. The codebase is
disciplined. The debt is structural: dead code from the TS→Rust move, scaffolding copied between modules, and a few
oversized modules. One real defect sits in process management.

## A. Defects and risks (fix first)

| # | Finding | Evidence | Status |
|---|---|---|---|
| A1 | A cancelled or timed-out job leaves its `cs-job` child running. The pool terminates the worker thread, but nothing kills the child, so the 3-CPU cap (D149) is exceeded and a pathological input runs unbounded. The comments citing D193 ("the sidecar dies with it") are false. | `processor/pool.ts:231-237`, `processor/rust-jobs.ts` `run()` keeps no handle; a Node 22 experiment found the child still alive after `worker.terminate()` | **verified** |
| A2 | Predictions and dither previews have no deadline, no kill and no abort handling. Up to 4+4 children run beside the pool's 3. | `processor/server.ts:104-165` | read |
| A3 | The decompression-bomb check runs after `loadImage` has already decoded the raster. | `processor/photo-store.ts:62-67` | **verified** |
| A4 | Rust panic text (stderr that is not JSON) is sent to the browser as the job message. | `processor/rust-jobs.ts:70-75` → `pool.ts` finish | **verified** (code path) |
| A5 | Export requests travel in argv, and `authorName` is uncapped. A long name can exceed the argument limit; generation already moved to stdin for this reason (G-132). | `processor/rust-jobs.ts:177-190`, `processor/validate-export.ts:75` | **verified** (no cap) |
| A6 | `ADMIN_BOOTSTRAP_ENABLED` defaults to `true` in compose (fail-open). Production sets it to `false`, per the handover, so this is a latent risk only. | `docker-compose.yml:68`, `auth.ts:70-80` | **verified** |
| A7 | Registration with mail off runs `findUnique` then `create` without handling P2002. Two submits at once give a 500. | `lib/auth/actions.ts:56-62` | read |
| A8 | The fake billing adapter and its pages ship in the production bundle, with no CI check that they are absent. This breaks the STANDARDS rule "Nothing test-only ships". The runtime gates (localhost only, `notFound()`) hold. `FAKE_WEBHOOK_SECRET` has a public default. | `lib/billing/gateway.ts:2`, `app/billing/fake-*`, `lib/billing/settings.ts:19,32` | read |
| A9 | Float sorts use `partial_cmp().unwrap()` at about 20 sites, so a NaN from a degenerate photo panics the job. | `rust/cs-core/src/{ridges,quantize,lines,texture,stitch_fit,names}.rs`, `crisp/plus.rs`, `pipeline/finish.rs` | read |
| A10 | `from_editable_json` and `parse_color` index unchecked input; wrong lengths or indexes panic. Upstream validation (D099) covers this today. | `rust/cs-export/src/model.rs:185,194,289`, `canvas.rs:32` | read |
| A11 | If the quota give-back fails, the use is only logged, never retried. | `lib/limits/quota-server.ts:57-59` | read |
| A12 | Legacy saved palettes: a corrupt stored list reads as empty, and the next write replaces it. Low impact, because the list is only read to migrate into the account (D398). | `lib/editor/saved-palettes.ts:26-42` | **verified** |

## B. Dead code and stale text left by the TS→Rust move (D221)

- **The TS export engine is unshipped (verified).** The app imports only types from `lib/export/export-jobs.ts`, and `runExportJob` is never called. These modules are reachable only from tests and scripts, and they have drifted from Rust (D264: no map page, marks or skein table): `a4-render.ts` (716 lines), `pdf-canvas-adapter.ts` (497), `pattern-keeper-pdf.ts`, `export-all.ts`, `pdf-page-flush.ts`, `processor/export-backend.ts`, and the export half of `render.ts`. Their specs test behaviour that never ships.
- **Parity scripts that cannot run:** `scripts/export-parity.spec.ts` and `scripts/export-compare.spec.ts` need builds that no longer exist, yet are still wired in `package.json`.
- **Unused generation code:** the app uses only `gridDimensionsFor` from `lib/pipeline/downsample.ts` (257 lines). The gamut and sRGB-table code in `lib/color/color.ts` serves only that module.
- **`rust/cs-wasm`:** no consumer, not built in CI, and it uses `static mut`. Its D186 evidence script no longer exists.
- **Unreferenced scripts:** `design-mockup-shots.mjs`, `measure-dither-preview.ts`, `rust-tables.mjs`.
- **Stale comments:** "or null to fall back" (`rust-jobs.ts:105,146,170`), "falls back to TypeScript" (`cs-job/src/main.rs:13`), `cs-export/src/lib.rs` calling itself a mirror of `runExportJob`, 17 cs-core comments naming "the TypeScript" as a live counterpart, the stale `resolveThreadBrand` doc (`pattern-serialize.ts:461-470`), and D264's 12 mm gutter (the code uses 8 mm).
- **Rust leftovers:** `bundle::add_a4_pages` is unused, and so is `let _ = p` (`a4.rs:691`).

## C. Duplication

- **Server: four account resources** (charts, stamps, palettes, thread-systems) each repeat `refusedResponse`, the sign-in, feature and limit check, and a size-bounded JSON reader.
- **Server: five processor-proxy routes** (`jobs`, `predictions`, `dither-previews`, `photos`, `exports`) repeat guard → size cap → features → refusals → forward → `retry-after` passthrough.
- **Server: admin actions.** About 25 `requireAdmin()` calls are made by hand, and nothing enforces that a new action has one.
- **Client fetches.** `fetch` → `json().catch(()=>null)` → inline `as {…}` cast appears in `palette-account.tsx`, `use-stamps.ts` and `use-account-save.ts`. The response types are not shared with the routes.
- **UI: palette renumber.** History op + `invalidateClipboard` + `colours.forget/reset` + `lit.forget` is repeated in three handlers (`app/workspace.tsx:513-546`). Missing one step corrupts state silently.
- **UI: gestures and canvas.** Drag-gesture boilerplate appears in six places. Canvas `getContext`/DPR/size/clear appears at about 14 sites. Origin→cell math is repeated (`workspace.tsx:195-206` and six `chartOrigin` callers). Four sites use raw `setPointerCapture` instead of `capturePointer`; this is a consistency issue only, because keyboard-cursor events reach Brush and Shape alone (**verified**).
- **Editor: colour helpers.** Hex conversion has four copies (`color.ts`, `oxs.ts` ×2, `palette-set.ts`). There are two `clamp` closures in `color.ts` and a scattered set of clamp helpers. The "absent kinds plane = zeros" rule appears in three places.
- **The `luminance > 140` readable-text rule** appears in TS (`export/a4-render.ts`) and Rust (`a4.rs:907,1222`) instead of in `render::symbol_text_color`. The TS function is also mislabelled: it computes luma on gamma-encoded values, not relative luminance.
- **Rust `a4.rs`:** the overlap label is drawn four times, the "backstitch only" skein rule appears three times, there are three title blocks, two hand-written column structs, and three symbol-in-swatch blocks. Page counting is mirrored by hand in three places (`bundle.rs` ×2, `pdf.rs`).
- **Rust `cs-core`:** the thread renumbering is copied (`lines.rs:333`, `texture.rs:230`), and `BOUND_MARGIN` is defined twice.
- **Format version 7** appears in three places (`rust-jobs.ts:107`, `migrate.ts:22`, `editable.rs:8`). Rust re-declares export defaults that TS owns (`model.rs:9-11,486-509`).

## D. Questionable structure

- **`app/workspace.tsx` (980 lines)** has regrown past D291's 665-line judgment. It passes about 30 props to `useTools` and creates new objects on every render.
- **`app/hooks/use-chart-renderer.ts` (697 lines, 21 inner functions)** holds sizing, navigator, gesture previews, the scene cache and hover. Hover and dot kind are pushed into the renderer by effects, so that state lives twice. `photoErrorRef` is late-bound because of hook order.
- **`rust/cs-export/src/a4.rs` (1521 lines)** does six jobs. `rust/cs-core/src/crisp/plus.rs` (988 lines) does three (snap, prune, refill).
- **`lib/editor/oxs.ts` (756 lines)** has a 300-line `parseOxs`, and the reader, writer and report prose share one file.
- **The worker-thread layer in the processor** only awaits a child process, and it serialises each pattern four times. Removing it would also resolve A1 cleanly.
- **`lib/document/layer-kinds.ts`** is a registry typed through `as unknown as` (×3), so a mis-registered kind still type-checks.
- **Unchecked non-null assertions** (about 10, e.g. `text-raster.ts:133,140`, `oxs.ts:347,563`, `stamp.ts:98`) have no named-error accessor, which the STANDARDS rule "an invariant is enforced where it is assumed" requires.
- **Environment variables are read ad hoc.** `DATABASE_URL` is unchecked, and `PROCESSOR_URL` silently defaults.
- **Rate limits** live in process memory and trust `x-real-ip`. That is sound only behind nginx, and the handover does not say so.
- **D223 records the V8 math port (~1,150 lines) as `requirement`,** but its force is the self-imposed golden floor, so it is a judgment. The jsmath vector test passes silently when its vectors file is missing. Clippy is not run in CI, although D182 says the port is linted by it.
- **Silent catches** hide paint and decode failures (`chart-scene.ts:200`, `use-source-image.ts:73`) and the archive-import cause (`pattern-import.ts:50-70`).
- **Two `exhaustive-deps` suppressions have no reason** (`use-chart-renderer.ts:345`, `use-color-prediction.ts:70`). `palette-setup.tsx:103` re-focuses through `requestAnimationFrame` + `querySelector`.

## Not defects (checked)

- The `as unknown as` casts at the canvas, Prisma and pdf-lib boundaries are contained, and `pdf-page-flush` has a test that fails if pdf-lib changes.
- `json.rs` is serde glue, not a hand-written parser.
- `expect` calls on embedded fonts, zip and deflate operate on internal data.
- Quota settling is idempotent, and nothing that can throw sits between take and settle.
- Workspace-storage swallowing is documented as best-effort.
- Admin routes all go through `requireAdmin`.
- The webhook is signature-checked and idempotent.

## Confidence and gaps

- **Not fully read:** `lib/billing/sync.ts`, `fake.ts`, the admin action bodies, `prisma/schema.prisma` and the Dockerfile; treat them as unreviewed.
- **Reasoned, not run:** A9, A10 and the O(n²) `connectedRun` in `backstitch.ts:270` were reasoned from code. Only A1 was reproduced.
- **Line numbers** are as of 244c56e.
