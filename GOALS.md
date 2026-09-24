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

### G-070 · Rust stops being shaped by a language that is no longer here — ACTIVE (2026-09-24)
- **What:** a measured answer to "what does byte-identity with V8 still cost us?", and — only if the answer
  justifies it and the Owner approves — the removal of that cost: Rust's own maths instead of the 1,153-line V8
  port, clippy's loop lints back on, `f32` where the data is 8-bit, and parallel reductions where summation order
  was the only thing blocking them.
- **Why:** the port was proven correct by matching TypeScript bit for bit, and that was the right call while both
  existed. TypeScript is gone (G-068), but the constraint outlived it: the golden hashes were recorded from
  TypeScript's bits, so every parity-driven shape is now frozen by the hashes instead. Today `rust/` carries
  `jsmath.rs` + `fdlibm.rs` (1,153 lines whose only job is to reproduce V8's last bit), seven clippy lints
  disabled crate-wide because "loops, comparisons and bounds mirror the TypeScript line for line", `f64`
  throughout because JavaScript has no `f32`, and a hand-rolled `unsafe impl Send/Sync` around a `*mut f32` in
  `pair_evidence.rs` to keep index-order writes. None of that is what anyone would write for Rust.
  **M1 may well conclude the speed case is not there** — that is a valid and useful outcome, and the goal stops
  at M1 if so. What is not in doubt is the maintenance cost; what is unmeasured is everything else.
- **Acceptance criteria:**
  1. **A measurement, before any change**: a `docs/reviews/` document giving `jsmath`/`fdlibm`'s share of
     generation time by profile, what `f32` would save where the data is 8-bit, and what the indexed loops cost
     in vectorisation — each a number from a run, not an estimate.
  2. **The Owner decides whether the hashes may move**, on that evidence. Until then nothing changes.
  3. If approved: the V8 maths port is **deleted**, not merely bypassed, and `cargo clippy` passes with the
     crate-wide `allow`s in `lib.rs` removed.
  4. **The hashes move exactly once**, in one commit that changes nothing else, with a decision file naming what
     moved and why.
  5. **No user-visible change**: charts generated before and after are indistinguishable by eye at 1:1, and the
     property tests, the D118 enhancement gates, the preview-parity suite and all 380 e2e stay green.
- **Constraints:**
  - **The hashes may move once and only once, deliberately.** Compelled by: they are the whole byte-identity
    floor (D107, D222), and a floor that can be re-recorded whenever it is inconvenient is not a floor. The
    recorder still refuses to overwrite; moving them means editing the file by hand.
  - **`jsfmt.rs` and the JSZip/pdf-lib byte formats stay.** Compelled by D174 and file-format compatibility with
    Pattern Keeper and other stitching programs — not by TypeScript, so G-068's reasoning does not reach them.
  - **`prng.rs` stays bit-exact** unless M1 shows a reason: it is 18 lines, and changing it moves every
    hand-drawn dither placement for no gain.
  - **Existing saved charts must keep opening unchanged.** They store explicit cells and palette, so they are not
    at risk; what changes is that regenerating from the same photo may differ in the last bit. Say so to the
    Owner rather than discovering it in a support question.

**Milestones** (confirmed at planning, 2026-09-24):
- [ ] M1 — **Measure, change nothing** (criterion 1). Profile generation with and without the V8 maths behind a
  temporary feature flag, so the difference is measured rather than argued. Ends with the review document and a
  recommendation, which may be "not worth it".
- [ ] M2 — **BLOCKED on the Owner** (criterion 2): the decision to move the hashes, or not. The goal ends here if
  the answer is no.
- [ ] M3 — **Rust's own maths** (criteria 3, 4, 5): delete `jsmath.rs`/`fdlibm.rs`, re-record the hashes in one
  commit, prove the chart is visually identical.
- [ ] M4 — **Let the rest be Rust**, scoped to what M1 measured: clippy `allow`s removed, `f32` and parallel
  reductions where they pay, the `unsafe` in `pair_evidence.rs` replaced with safe slice splitting if the order
  constraint is gone.
- [ ] M5 — README, HANDOVER, deploy and verify live.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-24 — goal created at the Owner's request, from the parity-tax findings reported at G-068's close.
  Evidence gathered so far, all from the tree at `3ce410b`: `jsmath.rs` 478 lines + `fdlibm.rs` 675; seven
  crate-wide clippy `allow`s in `rust/cs-core/src/lib.rs`; `f64` 153 times in `enhance.rs` alone against 103
  `f32` mentions across the whole core crate; `HashMap<String, Matrix>` for 13 fixed dither matrices;
  `SharedOut(*mut f32)` with `unsafe impl Send`/`Sync` in `pair_evidence.rs`; order-pinned summation in
  `quantize.rs` and `downsample.rs`. **Not yet measured: any of the performance impact.**

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
