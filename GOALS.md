# Goals — cross-stitch-pattern-generator

Template, numbering, and cross-project conventions live in
`E:\CLAUDE\COMPANY\GOALS.md`. This is a **standalone project** (Owner
decision, 2026-09-09) — not a svc-lab service: no monetization. Deployed
live at the Owner's direct instruction after M9 (see progress log below)
to `cross-stitch.craftodejnice.cz`; see
`docs/decisions/D013-deployed-to-cross-stitch-craftodejnice.md`, the deploy
log in `HANDOVER.md` and `COMPANY/INFRASTRUCTURE_DEPLOY.md`. Standard
OPERATIONS.md milestone check-in gates apply (not waived, unlike
svc-lab). Completed goals live in `docs/goals-archive.md`.

## Active goals

### G-069 · The workspace stops being the only thing that knows how everything connects — DRAFT (2026-09-24)
- **What:** the changes `docs/reviews/2026-09-24-workspace-shape.md` recommends: a `useEditorDocument` hook owning
  what it means to replace the open chart, then grouped props for the panes that take 31 and 30 of them.
- **Why:** `app/workspace.tsx` is 754 lines of which 465 are logic and 289 are wiring, and not one of its 19
  functions is longer than 18 lines. It is not complex, it is wide — and the eight functions that replace a chart
  each have to remember the same list of state to reset. That is the shape of mistake that produced D217.
- **Acceptance criteria:** replacing the open chart is decided in one place; adding a tool touches one hook and one
  component; no behaviour change, suites green.
- **Constraints:** not a line-count exercise. G-067's "under 300 lines" was a bad proxy and is not inherited; a shell
  component taking 38 props would meet it and improve nothing.

### G-071 · The build uses the CPU the server actually has — ACTIVE (2026-09-24)
- **What:** a `target-cpu` baseline for every x86-64 build of `rust/`, instead of the 2003 default.
- **Why:** the one actionable finding of G-070 M1 (`docs/reviews/2026-09-24-parity-tax.md`): rebuilding the
  unchanged code with `-C target-cpu=native` was **4.8–6.1% faster with byte-identical output**. Rust defaults to
  the base x86-64 instruction set, so the release image is compiled for a CPU two decades older than the EPYC it
  runs on — no SSE4.2, no AVX2, no FMA. This is the rare change that costs nothing and risks nothing: no
  algorithm moves, no hash moves, and the goldens prove it.
- **Acceptance criteria:**
  1. **Not one golden hash moves.** The 38 recorded hashes (D107) pass against the new build; if any moves, the
     baseline is wrong and is lowered, not re-recorded.
  2. **The speed-up is measured, not assumed** — the chosen level timed against the default on the same
     workloads as G-070 M1, so the two are comparable.
  3. **The flag reaches the build production runs**, and CI builds the same way, so the suites test what ships
     (STANDARDS → "Verified means the path production runs").
  4. **The WASM build is unaffected** — an x86 flag must not reach a `wasm32` target.
  5. Live afterwards: generate, export and reopen a chart.
- **Constraints:**
  - **A named baseline, not `native`.** Compelled by: `native` compiles for whatever machine happens to run the
    build, so the image would differ between a CI build and a host build and could fault if the VPS is
    migrated. A named level is reproducible.
  - **The level must be one every machine that builds this can run**: the VPS (AMD EPYC, verified 2026-09-24:
    sse4_2, avx, avx2, bmi1, bmi2, fma, f16c, movbe, xsave), CI runners, and the Owner's machine. Too high a
    level is an illegal-instruction crash, not a slow build.
  - **Byte-identical output is the gate, not a hope.** Compelled by D107/D222: floating-point contraction (FMA)
    *can* change results. If it does here, the flag is wrong.

**Milestones** (confirmed at planning, 2026-09-24):
- [x] M1 — **Choose and prove the baseline** (criteria 1–4): measure `x86-64-v2` and `v3` against the default,
  confirm the hashes and the full suites, wire it so dev, CI and the image all build the same way.
- [ ] M2 — Deploy, verify live, docs (criterion 5).

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-24 — **M1 done. `x86-64-v3`, mean 6.6% faster, output byte-identical** (D224).
  Measured v2 3.8%, **v3 6.6%** (2.1–10.1% per case), native 6.9% — a named, reproducible baseline gets
  essentially all of what `native` offers without compiling for whatever machine ran the build.
  **Criterion 1 holds**: all 38 golden hashes unmoved, 0 cells differing at every level, and the V8 vector test
  still exact over 2.7M records — so FMA contraction changes nothing here, which was the one real risk.
  **The subtle part was where the config goes.** Cargo reads config upwards from the *working directory*, and
  CI, the Dockerfile and the local scripts all build from the root with `--manifest-path rust/Cargo.toml`.
  In `rust/.cargo/` — the obvious place — it would be silently ignored by all three, with no error and
  no speed-up. It lives at the repository root, the Dockerfile copies it, and HANDOVER carries that as a rule.
  Verified the flag reaches rustc (`cargo build -v` shows it) rather than assuming it did.
  **Criterion 4**: the `wasm32` build of `cs-wasm` shows no `target-cpu` flag and still compiles — which is
  why the flags are per-target rather than under `[build]`.
  Verified: 732 unit, 123 Rust-config, 8 cargo, 380 e2e (1 flaky retry in `brush-outline.spec.ts`), docs-lint.
  M2 next: deploy and verify live.
- 2026-09-24 — goal created from G-070 M1's one surviving finding, at the Owner's instruction.

### G-030 · Public launch: a social ecosystem around the app — DRAFT, far future (2026-09-12)
- **What:** Eventually make the app public, built around **a social
  ecosystem** (community/sharing features -- exact shape not yet defined:
  could include public pattern galleries, profiles, following, comments,
  or similar) rather than a plain paywall-on-exports model. Owner
  explicitly corrected an earlier draft of this goal that jumped straight
  to a detailed "server-side generation + paid export tiers" plan --
  **that plan is withdrawn**, not just superseded; the real direction is
  the social ecosystem, and "other details will be defined later"
  (Owner's own words, 2026-09-12).
- **Why:** Owner is exploring making the app public and building a
  business around it, but this is explicitly **a plan for very later**,
  not something to scope or sequence now.
- **Status:** Intentionally not planned in detail -- no acceptance
  criteria, no milestones, per the Owner's own "very later, details
  defined later" framing. This entry exists so the intent isn't lost
  between sessions, not to commit to any architecture yet. Do not expand
  this into a full plan without an explicit Owner go-ahead to start
  planning it for real.
- **One durable technical fact worth keeping regardless of eventual
  shape** (verified while a fuller version of this goal was briefly
  drafted, then withdrawn): `buildPattern` (`lib/pattern.ts`) and
  everything it calls already take/return plain typed-array buffers with
  zero DOM dependency (`lib/pattern.worker.ts` is just a thin
  `postMessage` shim around it) -- so if a future version of this goal
  ever does need server-side generation, the existing TypeScript pipeline
  can run in a Node server context unmodified, without needing G-023's
  Rust work first. Not a decision, just a fact worth not re-deriving
  later.
