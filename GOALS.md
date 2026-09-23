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

### G-063 · The selection answers the keys and gains two buttons — ACTIVE (2026-09-23, deployed, awaiting sign-off)
- **What:** four changes to the Select tool, asked for by the Owner on 2026-09-23:
  1. **Enter applies** the floating piece where it sits, **Escape cancels** it.
  2. **Undo and Redo are blocked while a piece is in hand**, by keyboard as well as by button.
  3. A **Fill** button paints the whole selected area in the colour the brush is holding.
  4. A **Duplicate** button, which is Copy and Paste in one press.
- **Why:** the two committing actions are the ones a reader reaches for most and both are mouse-only today, while
  Escape currently *merges* — the opposite of what every other Cancel in this app does (the colour editor's Escape
  restores). Undo with a piece floating steps through history underneath it, which is not a state anyone asked for.
  Fill and Duplicate are each two or three presses today.
- **Acceptance criteria:**
  1. **Enter applies and Escape cancels** with the Select tool active and a piece in hand, matching the bar's own
     two buttons exactly — Cancel restores the chart as it was when the selection started, Apply merges it.
  2. **Undo and Redo do nothing while a piece is in hand**, from the keyboard and from the bar, and both work again
     the moment it is applied or cancelled. The bar says why rather than going silent.
  3. **Fill** paints every cell of the selected area in the brush's colour, leaving the piece floating so it can
     still be moved, applied or cancelled; it is unavailable with no colour to paint with.
  4. **Duplicate** leaves the original where it is and puts a copy in hand, offset so it is visibly a second piece,
     and the copy is on the clipboard for a later Paste.
  5. **The pure parts are pure**: filling and duplicating a piece are functions of a piece and a colour, unit-tested
     in `lib/editor/`, with the hook holding only the state.
  6. **Nothing else about the tool moves** — the existing selection specs pass unchanged except where they assert
     Escape's old meaning, which this goal deliberately reverses.
- **Constraints:** Escape's meaning changes, so the README's shortcut list and the keyboard hook's own comment must
  change with it — a reader who learned the old behaviour is the person this goal is for.

**Milestones**:
- [x] M1 — Enter and Escape, and the undo/redo block in both places, with the specs that pin them.
- [x] M2 — Fill and Duplicate: pure helpers in `lib/editor/`, their buttons in the selection bar, unit and
  end-to-end tests.
- [x] M3 — README and HANDOVER, deploy and verify live.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-23 — **All three milestones done, deployed at 2c354bd and verified live**: both buttons present, Undo
  disabled while a piece is held and free once it is let go, Fill leaves the piece floating, Escape cancels it,
  Duplicate puts a copy in hand with Paste live, Enter applies, console clean. 23 containers and 38 vhosts
  unchanged. Verified: Vitest 1255 passed / 8 skipped, Playwright 345 passed across 31 specs, tsc, eslint and
  docs-lint clean. Two things the tests decided rather than taste: the button is **Fill selection**, because the
  tool rail's own Fill is on screen at the same time and a test caught the collision; and Enter and Escape are
  checked against the buttons they stand for, since a floating piece counts as stitches wherever it sits, so no
  count settles until it is let go. **Awaiting sign-off.**
- 2026-09-23 — goal created from the Owner's list. Noted while reading: `paste()` merges what is floating before
  pasting, so Duplicate cannot be `copy(); paste()` — React would still be holding the old clipboard when paste
  ran. It is one function doing both, which M2's unit test exists to hold.

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
