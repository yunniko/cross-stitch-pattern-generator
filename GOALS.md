# Goals — cross-stitch-pattern-generator

Template, numbering, and cross-project conventions live in
`E:\CLAUDE\COMPANY\GOALS.md`. This is a **standalone project** (Owner
decision, 2026-09-09) — not a svc-lab service. Deployed
live at the Owner's direct instruction after M9 (see progress log below)
to `cross-stitch.craftodejnice.cz`; see
`docs/decisions/D013-deployed-to-cross-stitch-craftodejnice.md`, the deploy
log in `HANDOVER.md` and `COMPANY/INFRASTRUCTURE_DEPLOY.md`. Standard
OPERATIONS.md milestone check-in gates apply (not waived, unlike
svc-lab). Completed goals live in `docs/goals-archive.md`.

## Active goals

### G-081 · A Text tab: type a line, see it cell by cell, add it as a selection — DRAFT (2026-10-01; plan settled, awaiting the go-ahead)
- **What:** a fourth tab beside Photo, Chart and Threads with the settings for one line of lettering: **font** (a dropdown
  of the fonts installed on the Owner's own computer), **font type** (the faces that family has: regular, bold, italic,
  condensed and so on), **font size**, **font colour** (one of the chart's threads), the **text**, a **weight** slider to try
  thicker or thinner letters, a **preview where one pixel is one cell**, and an **Add** button. Add puts the text on the chart
  as a floating selection, as Paste does, so it can be moved, flipped, rotated, duplicated, filled, applied or cancelled like
  any other selection. Once applied it is stitches and nothing else: the chart does not remember the text or the font.
- **Why:** lettering on a chart is drawn by hand today, one stitch at a time.
- **Acceptance criteria:** (1) the tab lists the fonts of the computer it runs on, and the choice of a family lists that
  family's own faces; (2) no font name, font file or typed text is ever sent to the server -- proved by a test that records the
  network traffic of a whole add; (3) size is in cells (a size of 9 is 9 stitches tall), and the preview draws every cell as a
  visible square in the chosen thread's colour, so the stitcher sees exactly what will be stitched; (4) Add behaves as Paste
  does: any piece already in hand is applied first, and the text arrives as the new piece in hand, holding only the
  lettering's own stitches (what lies behind the letters stays); (5) from there it behaves as any selection, including the
  transparency lock's rules; (6) where the browser cannot list fonts or the Owner declines, the tab still works with a typed
  font name and the generic families, and says why.
- **Constraints:** fonts stay on the computer (Owner, 2026-10-01): never uploaded, and not written into the saved chart or any
  export. No font file is added to the project; the existing `public/fonts/DejaVuSans.ttf` is the PDF's and is used here only
  by tests. One colour per piece, and it is a thread already in the chart (Owner), so Add changes no palette. A glyph is a
  stitch or it is not, so letter edges are cut to whole cells (M1). One line of text, no letter spacing in this goal
  (Owner: may change later, so the lettering code keeps its lines as a list). No new dependency expected: the browser's own
  APIs only.

**Owner's answers, 2026-10-01** (to the seven questions of the first plan): (1) Add behaves as Paste does; (2) colours present
in the chart only; (3) try the slider; (4) one line, no letter spacing, perhaps later; (5) Chrome and Edge for the font list,
a typed name elsewhere, accepted; (6) the text is not remembered; (7) a piece larger than the chart is refused.

**One default still to confirm:** Paste puts the piece three stitches down and right of where its copy came from, but text
has no origin. So the text starts three stitches in from the top-left corner of the part of the chart in view -- or, if a
piece was in hand, three stitches down and right of that piece's corner -- and is kept inside the chart. It is then moved like
any piece.

**What the plan rests on (to be checked in the milestone named, not assumed):**
- *Listing local fonts* is the browser's Local Font Access API, `window.queryLocalFonts()`. From memory, not re-checked
  today: it exists in Chromium browsers (Chrome, Edge) only, needs a secure context (the site is https) and a permission
  prompt, and returns one entry per face with its family, full name, style and the font file as a blob. Not in Firefox or
  Safari. M2 starts by checking this against current documentation and a real browser.
- *Drawing a face exactly* is a `FontFace` made from that blob under a private name, held in memory for the session. No upload
  is involved. A font installed by name can also be drawn without the blob, which is the fallback.
- *The selection machinery already carries what text needs:* `FloatingSelection` has a `mask` of the cells actually in the
  piece, and merging stamps only those (`FloatingSelection.mask`, G-072, covered by `tests/unit/selection-mask.spec.ts`); a
  piece with no `originRect` vacates nothing. Paste (`useSelectTool`'s `paste`) merges what is floating and then sets the new
  piece, so Add does the same. Text is a piece whose mask is its glyph cells and whose cells are the thread's palette index.
- *The tab itself* is additive: `InspectorTab` is a three-value union in `app/components/inspector.tsx`.

**Milestones:**
- [ ] M1 -- **Lettering to cells.** A pure module (`lib/editor/text-raster.ts`): a line of text, a face, a size in cells and a
  weight -> a bitmap -> whole cells (a coverage threshold the weight moves, trimmed to the ink, with the glyph cells as the
  mask). Lines are kept as a list although one is used. Tests against the bundled DejaVu in a Node canvas: the size equals the
  cells asked for, a known word is stable, bold differs from regular, a heavier weight never has fewer stitches than a lighter
  one. A short review of how small lettering stays readable in cross-stitch (the smallest sensible height, how legible 6 to 12
  cells are), using the `domain-expert` agent per STANDARDS. Deliverable: the module, its tests and that note.
- [ ] M2 -- **The Owner's fonts.** `lib/editor/local-fonts.ts`: ask for permission, group faces into families, load a face as a
  `FontFace` in memory, and the fallback when the API is missing or declined. Tests: in Chromium with the permission granted
  there is at least one family and a family's faces are listed; with the API removed the fallback appears; **the network
  check: no request made during a full list-and-load carries a font name or font bytes.** Deliverable: a working data source
  and those tests, not yet in the interface.
- [ ] M3 -- **The Text tab.** Fourth Inspector tab: font, type, size, colour (the chart's threads, defaulting to the one in
  hand), one line of text, the weight slider, the live preview (one pixel one cell, the stitches as squares in the thread
  colour on the canvas colour, with its size in stitches), and an Add button that stays disabled until there is text, a chart
  and a thread, with the reason shown. Settings remembered in the browser. Deliverable: the tab and its end-to-end tests, Add
  not yet doing anything.
- [ ] M4 -- **Add makes a selection, as Paste does.** Add applies any piece in hand, builds the `FloatingSelection` (cells = the
  thread's index, mask = the glyph cells, no `originRect`), starts it where the default above says and keeps it inside the
  chart, and refuses a piece larger than the chart with a message. End-to-end: Add, move, flip, rotate, duplicate, apply,
  cancel and undo behave as for any selection; with the transparency lock on, Fill selection still fills only the lettering;
  the network check again over the whole flow. Docs: README, HANDOVER.
- [ ] M5 -- **The Owner's look.** Adjustments after using it on a real chart (whether the weight slider earns its place, the
  starting spot), then the deploy.

**Risks and how the plan meets them:** fonts differ between computers, so a chart made on one cannot be remade from the same
text on another -- why the text is not stored. Small lettering is only as legible as the font's design at that size -- M1's
review fixes a recommended minimum and the preview shows the truth before Add. A computer can hold thousands of faces: the
list is read once per visit, grouped, and faces are loaded only when chosen. Colour and emoji fonts draw in colour: only
coverage is used, so they come out as single-colour shapes. A chart with no threads cannot take lettering: Add says so
instead of failing. Right-to-left and complex scripts depend on the browser's text shaping, which the canvas already does;
they are not specially tested in the first version.

**Progress log** (newest first):
- 2026-10-01 -- the Owner answered the seven questions (see above); the plan is revised: one line, colours from the chart only
  (so Add changes no palette), a weight slider to try, Add as Paste. One default (the starting spot) left to confirm. Nothing
  built; waits for the go-ahead to start M1.
- 2026-10-01 -- goal planned at the Owner's request ("plan a goal of adding text tab into the app"), as a DRAFT with seven
  open questions; nothing built. Checked in the code before writing: a floating selection with a mask stamps only its own
  cells (`mergeSelection`, `stampSelection`), the Inspector's tabs are a three-value union, and `addColor` exists. The Local
  Font Access API facts above are from memory and are the first thing M2 verifies.

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
