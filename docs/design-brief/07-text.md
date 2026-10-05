# 07 · Text (lettering)

Typing a line, seeing it stitch by stitch, and adding it to the chart as a piece in hand. Sources: `app/components/text-pane.tsx`, `lib/editor/text-raster.ts`, `lettering-warnings.ts`, `bundled-fonts.ts`, `local-fonts.ts`, `text-selection.ts`; as of 2026-10-02. All on the device: fonts are read here and never leave the computer, and the chart does not remember the text, only the stitches it made.

## What it does

The chosen text is drawn in the chosen font at the chosen size and weight, cut into stitches (a stitch is inked where the letter covers enough of it; lighter weights cut at a higher coverage, heavier at lower), shown as a preview of one square per stitch, and on Add becomes a **piece in hand** (`04`): the letters in one thread, where only the inked stitches are part of the piece, so putting it down stamps the letters and leaves what lies behind them. It is placed like a paste: three stitches down and right of the piece that was in hand, or, with none, three stitches in from the corner of the part of the chart in view; moved, flipped, turned and applied like any other piece. Each distinct letter is drawn once and placed on whole stitches, so identical letters are identical.

## Controls

All settings except the text are remembered in the browser; the text is not.

| Control | Kind and values | Default | Available when | Effects and messages |
|---|---|---|---|---|
| **Use the fonts on my computer** | Action | | Until used (then absent) | The browser asks permission first. While reading: "Reading your fonts…". Outcomes: the list gains "On this computer" fonts, or a note: "This browser cannot list the fonts on your computer. Type a font name, or use a generic family.", "No fonts were found. Type a font name, or use a generic family.", "Access to your fonts was declined. Type a font name, or use a generic family.", "Your fonts could not be read. Type a font name, or use a generic family." |
| **Font** | Choice of a family, in groups: **Pixel fonts, bundled** (36), **Other fonts, bundled** (5), then **On this computer** (when listed) or **Generic families** | sans-serif | Always | Choosing a family resets the face to Regular. Bundled fonts are openly licensed and served from this site; the computer's own are read locally |
| **Font name** | Text, up to 100 characters, "or type the name of an installed font" | | The computer's fonts have not been listed (browser lists none) | A typed name is used as a family |
| **Font type** (face) | Choice among the faces of the family (Regular, Bold, Italic and so on) | Regular | Always | |
| **Pixel-font hint** | Text | | A bundled pixel font at a size that is not one of its clean sizes | "A pixel font: its letters come out cleanest at *a* or *b* stitches." (the clean sizes nearest below and above, 7 or more) |
| **Size** | Whole number **7 to 200** stitches high; one at a time up and down, or typed (a typed value is brought to the nearest limit on leaving the field); a value outside is not accepted by the arrows | 12 | Always | |
| **Reset size** | Action | | The size is not already the best for the font | Returns to "the size this font reads best at": for a bundled pixel font, its smallest clean size of 8 or more; otherwise 12 |
| **Weight** | Number **0 to 100**, step 5; arrows (Lighter, Heavier) and a range choice | 50 | Always | Lighter letters cut at a higher coverage, heavier at lower |
| **Reset weight** | Action | | The weight is not 50 | Returns to 50 |
| **Colour** | Choice of one of the chart's palette colours, each shown as its colour with symbol and name | The first | The chart has colours; otherwise "The chart has no threads yet." | The thread the letters are stitched in |
| **Text** | One line of text, up to 100 characters, placeholder "One line of text" | Empty | Always | |
| **Preview** | A picture, one square per stitch, in the chosen thread on the canvas colour; scaled to fit, at most 14 per stitch; size line "*w* × *h* stitches, *n* stitched" | "Your text appears here." (none typed) or "Nothing to show yet." | | |
| **Warnings** | List of notes | | When they apply | Below about 10 stitches: "Below about 10 stitches an outline font loses its curves and holes. A larger size, or backstitch, reads better."; lowercase below 12 and from 10 up: "Lowercase letters need about 12 stitches or more to keep their holes open."; below 12 with more than one character: "Letters may touch at this size: there is no letter spacing control yet."; weight 25 or less: "A light cut can break diagonal strokes."; weight 75 or more: "A heavy cut can fill the holes in a, e and o." |
| **Add** | Action | | See below | Creates the piece in hand |

**Add is unavailable, with the reason shown beneath it, when:** no chart ("Open a chart first."); a looking-only view ("Switch to the Color or B&W view to add text."); the chart has no colours ("This chart has no threads yet. Add one in the Threads tab."); no text ("Type some text."); the text cannot be drawn (the browser's own message, or "That text could not be drawn."); nothing would be drawn ("That text has nothing to draw."); or the lettering is larger than the chart ("The text is *w* × *h* stitches; this chart is *w* × *h*.").

Also: lettering is unavailable until there is a chart, and it keeps its text and chosen thread while the person looks at other settings.

## Text is a tool

Text is one of the tools (`04`), with no key. Its settings above are shown while it is in hand, and only then; the settings that were being looked at before come back when it is put down.

The lettering reaches the chart in two ways, both as a piece in hand that the selection tool then holds:

- **Add** places it three stitches in from the corner of the part of the chart in view.
- **A press on the chart** places it with its top left corner at the stitch pressed, brought back inside the chart where it would overhang. A press does nothing when Add would be unavailable.

Either way Text is put down, since the piece is the selection tool's to move, turn and apply. Taking Text up again applies a piece still in hand, as taking up any drawing tool does, and keeps what was typed.
