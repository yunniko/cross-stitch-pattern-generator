# QA, 2026-10-06 (G-095, the redesign): full pass

**Mode and scope:** full, asked for by the goal's plan as its last milestone. Run against the local production build of the
goal's final code (Next.js on 30200, the processor and the Rust binary on 8102), not the live site, which still runs the
interface from before the goal. Every region of the new layout was driven in a real browser (headless Chromium, by script,
with pictures looked at): the bar above, the three workspaces, the tools and their options, the view controls, the readout,
Preferences, the tries and every export. What the charts and export files contain was not judged again by eye: the goal
changes where controls are, not what generation or an export produces, and the golden cases and the export specs hold that
(all pass). No domain expert was called for the same reason.

## Findings

| # | Severity | Finding | Repro | Outcome |
|---|---|---|---|---|
| 1 | usability (new in this goal) | **Tab walked out of Preferences into the page behind it**, and closing left the focus on nothing. The question before a new chart had the same gap, from before the goal | Open Preferences, press Tab thirty times: nine stops were outside the dialog | **Fixed:** `app/hooks/use-modal-focus.ts`, used by both; Tab goes round inside, the focus returns to what opened it. Held by `tests/e2e/preferences.spec.ts` |
| 2 | usability (new in this goal) | **Under about 1,100 px the bar above lay over itself** ("Export" over Undo, the account link cut off) and the view controls ran off both sides of the chart | A window 900 px wide, any chart (`shots/g095-narrow-900-before.png`) | **Fixed:** the four buttons with icons give up their words under 1,100 px, and the view controls wrap inside the chart's area (`shots/g095-narrow-900.png`). Held at 820, 1,024 and 1,100 px by `tests/e2e/workspaces.spec.ts` |
| 3 | wrong (new in this goal, caught by its own spec) | The empty-grid card showed 100 × 100 after a reload whatever Preferences said: it read the size before the stored preferences had loaded | Set 60 × 45 in Preferences, reload, Start an empty grid | **Fixed** in M5 (the form is made when it is opened) |
| 4 | wrong (new in this goal, caught while writing the brief) | The page outlines over the chart were numbered; the printed A4 pages carry letters | Export, A4 pages | **Fixed** in M5: the same letters, by the same rule, tested against the Rust cases; the PDF's pages carry none and none is shown |
| 5 | usability (provision of the goal) | Pin and delete on a try were 20 px squares in a strip with room to spare | Photo, after a Generate | **Fixed:** 28 px |
| 6 | usability (old, seen again) | A Generate pressed within about two seconds of choosing a photo uses 16 colours, and the count then moves to the recommended one, so the first try and the setting disagree. A recommendation arriving late also overwrites a count typed meanwhile | Choose a photo, press Generate at once | **Left**, on the triage list since G-087 and G-098. It matters a little more now that the first try stays on screen with its count; the fix is the Owner's to schedule |
| 7 | cosmetic | A number field given `1e3` keeps showing `1e3` after it is taken as 1,000 (Preferences' grid size; `1e1` in the cell size) | Type `1e3`, leave the field | Left: the value kept is right |
| 8 | cosmetic (old) | A name of only spaces is not taken, and the field goes on showing the spaces; the saved file keeps the old name | Edit, Chart, name = three spaces | Left |
| 9 | note (old) | A name of 300 characters gives a download name of 318, longer than most file systems hold; the browser shortens it itself | Name of 300 characters, Save | Left |
| 10 | note | A decimal comma is refused by the cell size field in an English-language browser (`5,5`); the browser's own number field decides this by its language | Preferences, A4 cell size | Left |
| 11 | note | A phone-width window (390 px) scrolls sideways and the chart has no room | 390 px wide | Expected: the phone layout is G-101 |
| 12 | note | 55 controls are under 24 px on a side at desktop size: Undo and Redo (22 high), the zoom buttons (24 × 20), and the three small controls of each thread row (20 px) | Measured in Edit at 1,440 px | For G-101: there is no free room to grow them in the present layout |
| 13 | flaky test, cause not found | `generate-pattern.spec.ts:14` once did not show a chart within 15 s of Generate, in one of the goal's full runs | Not reproduced: 30 of 30 alone, and not in the two full runs after it | Left; said in the goal's log |

## What held

- **Sequencing.** A double press on Generate makes one try; a double press on Export one download. Ctrl+K does nothing while
  Preferences is up, and the Preferences command from the command list opens it. A piece in hand in Edit is still in hand
  after a visit to Export and back, with Undo refused meanwhile. A reload returns to Edit with the chart, and to its tries
  (4, 1 pinned) in Photo.
- **Malformed input.** Preferences' grid size: 0, -5 and 9 become 10; 1,501 and a 20-digit number become 1,500; 12.7 becomes
  13; letters are refused by the field; empty keeps the last value. Cell size: 1 and -3 become 2, 13 becomes 12. An author
  of 629 characters with Cyrillic, an emoji and a `<script>` tag is kept across a reload, is escaped in the OXS file and
  does not break the A4 export. Names with `../`, slashes, colons and the other characters a file name cannot hold are
  written with `_`.
- **Every export**, in colour and in black and white where it has both: eleven files and Export all, each with the name the
  brief gives.
- **Absent, not disabled.** With no chart there is no Save, Undo or Redo, and Edit and Export are disabled with the reason
  in their titles; Photo and Export offer Pan and Zoom only; each tool's bar holds what the tool reads (checked for all
  fifteen). The Text tool's tab comes first and selected, and the tab chosen before it comes back when Brush is picked.
- **Nothing by hover or keyboard alone** (a provision of the goal): no control is revealed only by hovering (searched in the
  code), and Tab reaches 64 stops through the bar, the tools, the options, the view controls and the panel, each with a
  visible focus mark.
- **Contrast.** 467 pieces of text in the start screen, Edit, Export, Photo and Preferences were measured against what is
  behind them: none under 4.5 to 1 except three disabled buttons, which are dim by intent.
- **The view controls, the zoom and the canvas settings** are present in all three workspaces.
- No page error and no failed request in any probe, apart from the browser abandoning a prefetch of the log-in page.

## Coverage

Exercised: every input of the new surfaces (Preferences, the Export choices, the empty-grid card, the name), the workspace
changes, the tools' bars, widths 820 to 1,440 px and 390 px, keyboard reach, contrast, and every export once. Covered by the
browser suite rather than by this pass: drawing with each tool, the thread list, crop, backstitch, text placing, the photo
sliders, dithering, palettes, tries' limits (5 and 5), file opening and OXS import: 594 cases (592, and 2 run alone), all passing on the same build.
**Not covered:** Firefox and Safari (Chromium only); touch input; a screen reader's own reading of the page (roles and names
were checked, not speech); generation above 250 stitches through the interface; the account, admin and log-in pages, which
the goal did not touch; the live site, until after the deploy.
