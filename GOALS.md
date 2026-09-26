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

### G-074 · The photo is adjusted by hand, with sliders — ACTIVE (2026-09-26)
- **What:** the Photo tab's five enhancement buttons (Off, Brighten, Auto, Vivid, Portrait) are replaced by
  four sliders — **brightness, contrast, saturation, warm↔cool** — that adjust the photo directly and show
  the result as you move them.
- **Why:** Owner request, 2026-09-26. The buttons are five fixed opinions about a photo, each one analysing
  the image and deciding for the reader; a slider is the reader deciding. Only one of the five was ever
  released (D118), so four of the buttons do nothing today.
- **Acceptance criteria:**
  1. **Four sliders, no buttons**: brightness, contrast, saturation and warm↔cool, each neutral in the
     middle, replacing the segmented control.
  2. **They work in the browser**: moving a slider changes the photo shown **without a round trip to the
     server**. The preview today asks the processor for each mode and caches the answer; a slider cannot.
  3. **What you see is what you get**: generating applies the same adjustment to the full-resolution photo,
     so the chart matches the preview it was made from.
  4. **Neutral changes nothing**: with every slider centred, generation and every export are byte-identical
     to today's “Off”, and the 38 golden hashes do not move.
  5. **Old files still open**: a chart saved with `enhancementMode` opens without error, and the slider
     values are saved with the pattern as the other photo settings are (D138: an additive field, no format
     version bump).
  6. **The five modes and the machinery only they used are gone**, not left dead in the tree.
- **Constraints:**
  - **The adjustment exists twice and must not drift.** The browser applies it in TypeScript and generation
    applies it in Rust, exactly as the backstitch dash table does (D233), so it needs the same kind of
    parity script run in CI. Compelled by criterion 3: a preview that disagrees with the chart is worse
    than no preview.
  - **Interactive on the photos this app takes** — up to 12 MP. Compelled by criterion 2: the slider is
    useless if it stutters. The preview is already downscaled; the slider works on that, and generation
    works at full resolution.
  - **Generation itself does not change.** The pipeline is untouched; only what reaches it does.

**Milestones** (confirmed at planning, 2026-09-26):
- [x] M1 — **The adjustment** (criterion 4, and the constraint): one definition of what the four sliders do
  — the colour space, each curve, and neutral meaning identity — written once in TypeScript and once in
  Rust, with a parity script comparing them through the real binary. No UI.
- [x] M2 — **The sliders, live** (criteria 1, 2): the four sliders in the Photo tab, applied to the decoded
  photo in the browser as they move, with no request to the server. “Compare with original” is kept.
- [x] M3 — **Generation uses them** (criteria 3, 5): the values travel with the generate request and Rust
  applies them at full resolution; they are saved with the pattern, and a file carrying the old
  `enhancementMode` still opens.
- [ ] M4 — **The modes retire** (criterion 6): the buttons, the per-mode preview route and the adaptive
  analysis only they used are removed, D118's release gates are settled one way or the other, README and
  HANDOVER catch up, and it is deployed and verified live.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-26 — **M3 reached.** The sliders travel with the generate request, through the processor's
  validation, into the binary, which applies them before any stage reads the photo (D239); they are
  recorded on the pattern, in the save file and in the autosave, and absent when neutral. Verified:
  a new suite (`npm run test:photo-adjust-pipeline:rust`, 8 cases) proving generating *with* the
  sliders is byte-identical to generating the *already adjusted* photo — criterion 3 demonstrated, not
  asserted — mutation-checked with 5 deliberate breaks, 5 caught, including "adjusts only the colours,
  not the structure"; 864 unit tests (4 new, 5 mutations caught); 444 e2e (2 new, one of which
  generates grey threads from a colour photo and reopens a pre-G-074 file); 73 golden hashes unmoved.
  Next: M4, retiring the five enhancement modes.
- 2026-09-26 — **M2 reached.** The four sliders are in the Photo tab and applied in the browser:
  a downscaled preview (1440 px) adjusted in a worker, quarter-size while a slider moves and full when it
  settles. Measured in Chrome: first frame 16 ms, sharp frame 340—414 ms after release, 1.3 ms median on
  the page's own thread per value, no frame over 100 ms in a 60-value drag
  (`docs/reviews/2026-09-26-photo-adjust-cost.md`). **D238 changed M1's adjustment**: the gamut map cost
  145—572 ms for 0.23 MP and answered "more saturation" by removing saturation, so both copies now clip;
  a 3D LUT was measured and rejected (worst-case error 83—162 per channel at 49 nodes). Verified: 860 unit
  tests (36 new, the runner's six guards mutation-checked), 442 e2e (6 new), 73 golden hashes and all four
  Rust parity suites unmoved, lint/tsc/prettier clean; driven by hand in Chrome on a 2816x1536 photo.
  Next: M3, generation reading the sliders — until then a chart does not match its preview.
- 2026-09-26 — **M1 reached.** The four sliders defined once in `lib/pipeline/photo-adjust.ts`
  and mirrored in `rust/cs-core/src/photo_adjust.rs`: OKLab, contrast pivoting on the measured L of
  sRGB 128 (0.5999), neutral returning the source buffer itself. Verified: 13 unit tests on the
  adjustment's own properties, mutation-checked (8 deliberate breaks, 8 caught); 11 parity cases
  byte-identical through the real `cs-bench` binary, also mutation-checked (one digit of
  `TEMPERATURE_B` fails 4 of them); 837 unit tests and the 73 golden hashes unmoved; lint, tsc and
  clippy clean. `test:photo-adjust:rust` wired into CI beside the other parity suites. D237 written.
  Next: M2, the sliders in the Photo tab, applied in the browser.
- 2026-09-26 — goal created and planned.

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
