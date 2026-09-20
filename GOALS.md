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

### G-049 · Pixel art in and out — ACTIVE (2026-09-20)
- **What:** an image whose pixels are already stitches can be opened as a chart, and any chart can be written back out
  as that kind of image. Import is a fourth card in the new-project list; export is a new option beside the others.
- **Why:** Owner request (2026-09-20). Sprite art is already grid-and-palette shaped, so charting it through the photo
  pipeline is the wrong tool: it resamples and re-quantizes work that is finished. This treats one pixel as one stitch.
- **Owner decisions (2026-09-20):** colours import exactly, as custom colours with no thread brand (the colour editor
  can snap them later); a fully transparent pixel is an empty stitch and an empty stitch exports transparent; the
  export is one PNG at 1 px per stitch, written in the browser like the editable save; an image below the 10-stitch
  minimum is centred in a chart of the minimum with empty stitches added evenly around it (2026-09-20, revising the
  earlier "accept any size": 8×8 and 16×16 sprites are ordinary, but a chart below the minimum is a size nothing else
  in the app was built for).
- **Acceptance criteria:**
  1. Importing an image of at most 1500 px a side with at most 100 distinct opaque colours produces an editable chart
     whose every cell is the colour of the pixel at that position, and whose palette is exactly the image's distinct
     colours; fully transparent pixels become empty stitches. Checked cell by cell on a fixture, not by eye.
  2. An image over 1500 px a side, or with more than 100 distinct colours, is refused before anything is created, with
     an error naming the real numbers ("2048 × 1536 pixels; the largest chart is 1500 stitches a side"; "214 colours;
     a chart holds at most 100"). A partly transparent pixel is refused the same way. A refusal creates no chart and
     writes nothing; where a chart was open, the discard is the user's own confirmed choice at the card, exactly as it
     is for Open a saved pattern, and declining that confirm keeps the chart.
  3. The imported chart has no photo, so Generate stays unavailable for its whole life (D143), and the chart is named
     after the file.
  3a. An image smaller than 10 px a side opens as a chart of at least 10 × 10, the image centred in it and the rest
     empty stitches, with the odd stitch going right and down.
  4. "Pixel art PNG" exports one PNG at 1 px per stitch: no grid, no symbols, no margins, empty stitches transparent.
     It is written in the page, so it works with the processor unreachable (D191's reason).
  5. Round trip: exporting a chart and importing the result gives back the same cells and the same palette RGBs. A
     property test over generated charts, not one example.
  6. Vitest and Playwright cover both directions, including every refusal; `docs-lint` passes; HANDOVER regenerated;
     deployed and verified live.
- **Constraints:** no new dependency — the browser decodes the image (`createImageBitmap`) and encodes the PNG, as the
  existing decode and editable-save paths do. Import and export both run in the page, never on the processor: the work
  is one pass over at most 2.25M cells, and keeping it local means it works offline. The caps are the app's existing
  ones (`MAX_STITCHES` 1500 from D181, `MAX_COLORS` 100), not new numbers.

**Milestones**:
- [x] M1 — The import itself, as a pure module: distinct-colour collection, the palette with the dark-to-light order,
  symbols and names a generated chart gets, padding to the minimum, and every refusal in criterion 2. Unit tests
  including a 1×1 image, a 1500×1500 image at 100 colours, and each refusal. No UI yet.
- [x] M2 — The new-project card: "Import pixel art" in `first-run.tsx` beside Choose a photo, Start an empty grid and
  Open a saved pattern, wired through `workspace.tsx`, and the decode itself (exact pixels — the photo path's 4000 px
  downscale must not apply). Playwright covers a successful import and every refusal.
- [x] M3 — The export: "Pixel art PNG" in the export list, written in the page, empty stitches transparent; the
  round-trip property test of criterion 5; Playwright downloads one and re-imports it.
- [x] M4 — Documentation and ship: decision files for the import rules and for keeping both directions in the browser,
  README and HANDOVER, then deploy and verify live.

**Progress log** (newest first):
- 2026-09-20 — **M4 done; G-049 awaiting the Owner's sign-off.** README and HANDOVER carry both directions and the
  rule that pixel art is never resampled; D194 and D195 were written when the decisions were made. Deployed b68db8b:
  only the app container was recreated (the processor's bundle is unchanged, so the Rust sidecar stayed up), 23
  containers before and after with no other restarted, 38 vhosts, four sites at 200. Live checks: the export option
  and the import card are both present, and exporting a live 200 × 200 chart produced a 200 × 200 PNG of 40,000
  opaque pixels in 14 colours, matching its status line. **Not verified live:** an end-to-end import, because the
  browser held the Owner's own autosaved chart and any card choice would have discarded it — the import is covered by
  5 Playwright specs and 21 unit tests instead.
- 2026-09-20 — **M3 done; awaiting approval of M4.** "Pixel art PNG (1 px per stitch)" is the fourth option in the
  export dropdown, written in the page like the editable save (D195); `ExportChoice` keeps it out of the processor's
  job kinds by type, so it can never be posted to a service that has no code for it. Verified: 8 round-trip cases over
  generated charts (empty, full palette, all-empty, single-colour, tall-thin, and a second round trip after padding),
  each comparing stitch colours rather than palette indices; a Playwright test that exports the sprite, checks the
  downloaded PNG pixel by pixel (transparent padding, the red ring, the one blue pixel) and imports it back to the
  same chart. Vitest 1122 passed, 8 skipped; full e2e 323 passed; tsc, eslint and docs-lint clean.
- 2026-09-20 — **M2 done; awaiting approval of M3.** "Import pixel art" is the fourth card on the start screen;
  `lib/editor/pixel-art-file.ts` decodes the file at its own size with `colorSpaceConversion` and `premultiplyAlpha`
  off, so the bytes stay the artist's, and refuses an oversized image from the bitmap header before allocating a
  canvas. Verified: 4 Playwright specs (an 8×8 sprite padded to 10×10 with 29 stitches and no photo, every refusal
  creating no chart, an open chart surviving a declined discard, and a 200×120 import whose legend counts prove the
  pixels landed where they should); Vitest 1114 passed, 8 skipped; the full e2e suite 322 passed; tsc and eslint
  clean. **Worth the Owner's eye:** a refusal itself destroys nothing, but choosing any start-screen card with a chart
  open asks to discard *before* the file is chosen, so a refused file after confirming leaves no chart — the same as
  Open a saved pattern has always behaved. Criterion 2 now says this rather than promising more.
- 2026-09-20 — **M1 done; awaiting approval of M2.** `lib/editor/pixel-art-import.ts` turns a decoded image into a
  chart: dark-to-light palette, generated-chart symbols and names, transparent pixels as empty stitches, no photo
  (D143), and every refusal checked before anything is built (D194). Distinct colours are counted with a 2 MB bitmap
  rather than a Set, so an over-limit image still reports its true count. Verified: 13 unit tests in
  `tests/unit/pixel-art-import.spec.ts`, including 1×1, 8×8 and 7×7 padding, 1500×1500 at 100 colours, and each
  refusal; tsc and eslint clean. **Owner decision mid-milestone (2026-09-20):** images under the 10-stitch minimum are
  padded out to it rather than accepted at their own size; criterion 3a and D194 record it.
- 2026-09-20 — goal created and planned; milestones above. Owner settled the four open questions (palette, transparency,
  export shape, minimum size) before planning. Owner approval: "go m1".

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
