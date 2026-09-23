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

### G-064 · Drawing tools: a sized brush, shapes, and two colours — ACTIVE (2026-09-23)
- **What:** the Owner's list of 2026-09-23, in one goal because every part of it shares the same two seams — what a
  press paints (a stamp) and which colour it paints with (a pair):
  1. **Brush size and shape** — square or round, any size, not just one stitch.
  2. **A Line tool**, drawn with the brush's own stamp, so its thickness follows the brush.
  3. **Rectangle and Oval tools**, each filled or outlined; an outline is the brush's stamp walked around the shape.
  4. **Two colours, foreground and background**, as an image editor has them: two squares one over the other, in
     fixed places, the active one drawn over the other. Clicking a square makes it the foreground and the other the
     background. **Left click paints with the foreground, right click with the background.** Right-clicking a thread
     in the list sets the **background** without changing which square is active.
  5. **No smoothing anywhere**: every cell a tool touches is exactly the chosen thread, never a blend.
- **Why:** the editor can paint one stitch at a time and flood-fill a region, and that is all. Everything a stitcher
  draws by hand — a border, a line, a filled block — is currently a click per stitch. Two colours halve the trips to
  the thread list, which is where the Owner spends presses today.
- **Acceptance criteria:**
  1. **The stamp is a function, and it is exact.** `brushStamp(size, shape)` returns the cells a press covers; round
     is a disc and square is a block, both centred, and an even size resolves the same way every time. Unit-tested,
     with the even-size convention written down rather than discovered.
  2. **Every tool paints only the chosen thread.** After any gesture, the cells it touched hold exactly one palette
     index and no other — the test that says "no smoothing" in a way that cannot rot.
  3. **A gesture is one undo step**, whether it is a brush stroke, a line, a rectangle or an oval, exactly as a
     stroke is today.
  4. **A shape follows the pointer before it is committed**: a rubber-band preview that redraws from the chart each
     frame rather than accumulating, and leaves nothing behind when the gesture is cancelled or leaves the chart.
  5. **The two squares never move.** Clicking the lower one makes it active and the other the background; only which
     is drawn on top changes. Right-clicking a thread row changes the background and leaves the active square alone.
  6. **Right click paints and never opens the browser's menu** over the chart or the thread list; everywhere else
     the native menu is untouched.
  7. **What exists still works**: the Fill tool, the empty-stitch thread, symmetry and Isolate behave as they do now.
- **Constraints:** a chart is discrete, so every rasteriser is integer work on cells — no anti-aliasing, no
  sub-cell geometry. Nothing here touches generation, so there is no Rust port and no parity corpus to extend.
- **Settled by the Owner, 2026-09-23:** shapes mirror under symmetry exactly as a stroke does; the keys are `L`,
  `R`, `O` and `X` to swap; right-drag draws a shape in the background, matching the brush; and the brush takes
  **odd sizes only** (1, 3, 5 … 15), which gives every stamp a true centre cell and removes the even-size
  convention the plan was going to need.

**Milestones**:
- [x] M1 — **The two colours**, end to end and shippable on its own: the pair and which is active, the two squares,
  left and right click painting with each, right-click thread selection, and the browser menu suppressed where it
  would get in the way.
- [x] M2 — **The stamp**: `brushStamp(size, shape)` as a pure function with its tests, the size and shape controls,
  and the brush painting through it — size 1 square being exactly today's brush, byte for byte.
- [x] M3 — **The Line tool**, sharing the stamp, with the rubber-band preview the shape tools will reuse.
- [x] M4 — **Rectangle and Oval**, filled and outlined, each a pure rasteriser with its own tests.
- [x] M5 — Shortcuts, README and HANDOVER, deploy and verify live.

**Progress log** (newest first; The Company appends at every stopping point):
- 2026-09-23 — **M3, M4 and M5 done and deployed; the goal's work is complete, pending the Owner's sign-off.**
  Line, Rectangle and Oval drag from one stitch to another through one gesture (D214): `lib/editor/shape-raster.ts`
  holds the rasterisers (Bresenham for the line, an inscribed ellipse decided by exact integer arithmetic for the
  oval), and the gesture stamps the brush along the spine, mirrors it under symmetry and commits once. A filled
  shape is exactly the shape, whatever the brush size (D215). The preview redraws over a snapshot of the base scene
  rather than accumulating — checked by sabotaging that restore and watching the test fail. `L`, `R`, `O` take the
  tools, `Escape` drops a half-drawn shape. Verified: Vitest 1295 passed / 8 skipped, Playwright 366 passed across
  34 specs, tsc, eslint and docs-lint clean; live at cross-stitch.craftodejnice.cz (commit c1cd90c) with each key
  taking its tool, a 21-stitch line undone by one press, a 6x4 rectangle 16 stitches outlined and 24 filled, a 9x9
  oval outline 24, a 5-wide line 101, and the console clean. Eight other sites returned 200, no other container
  restarted. HANDOVER condensed: the two G-064 milestone lines became one, and the oldest deploy row left it.
- 2026-09-23 — **M2 done and deployed.** `lib/editor/brush-stamp.ts` is the stamp: odd sizes 1..15, round as the
  disc that fits the block, square as the block, eight unit tests; size 1 covers the one stitch under the pointer,
  as before. Symmetry mirrors every stamped cell rather than the stamp's centre, so a wide brush stays symmetric
  about the axis. Size and shape sit in the context bar and survive a reload. One regression found and fixed on
  the way (D213): the new controls pushed the bar 59px past its container, and focusing the Photo button scrolled
  the whole chart column sideways — the tool options are now a track that scrolls inside itself, with a test that
  asserts `main` never becomes scrollable. Verified: Vitest 1277 passed / 8 skipped, Playwright 354 passed, tsc,
  eslint and docs-lint clean; live at cross-stitch.craftodejnice.cz (commit 30851ea) with the size control set to
  7, `main` overflow 0, the chart frame unmoved on focus, and a press painting without error. Every other site on
  the host returned 200 and no other container restarted. M3 next.
- 2026-09-23 — **M1 done.** The pair is `lib/editor/color-slots.ts`, eight unit tests: two slots and a flag for
  which is in front, so the squares never move. Left paints with the front one, right with the one behind, and a
  right click on a thread loads the square behind without taking the brush out of the reader's hand. The squares
  live in the context bar where the single swatch was; `X` swaps them. Right clicks are claimed on the chart and on
  the thread rows only — everywhere else the browser's menu is untouched. Three e2e cases, and one existing bug
  fixed on the way: merging a thread renumbers the palette, and the held colour was not renumbered with it, so a
  square could end up pointing at a different thread than the reader picked. Verified: Vitest 1268 passed / 8
  skipped, Playwright 350 passed across 33 specs, tsc, eslint and docs-lint clean. Not deployed — M2 next.
- 2026-09-23 — Owner's answers recorded above; odd sizes only means `brushStamp` never has to pick a side, so
  criterion 1's "even size resolves the same way every time" is now "there are no even sizes".
- 2026-09-23 — goal created from the Owner's list. Seams read before planning, so the milestones name real code:
  the brush already keeps a stroke buffer and commits it as one undo step through `replaceSince`, which is what the
  shape tools will reuse for criterion 3; and `previewSelect` already redraws from a cached base canvas each frame,
  which is the rubber-band preview criterion 4 asks for, rather than something to invent. `activeColorIndex` is a
  single number today and becomes the pair.

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
