# Design brief — what the app does and what every control must allow

For whoever redesigns the application. It states behaviour and data only: what a person can do, what each input accepts, when it is available, what it changes. It says nothing about how the present interface looks or is built, and it gives no advice. Scope: the chart maker and editor and its exports. The admin area and the account and profile pages are left out (Owner, 2026-10-02); where being signed in changes what the editor does, the document says so in one line.

**Status: written and checked 2026-10-02 (G-088); see `docs/reviews/2026-10-02-design-brief-check.md` for what was checked and what is not covered.** Goal G-088.

## Contents

| File | Holds |
|---|---|
| `01-overview.md` | Purpose, who uses it, the journeys, the states the product is in, what is kept between visits |
| `02-photo-and-generation.md` | Everything that shapes a chart made from a photo: size, colour count and its prediction, algorithm, palette mode and set-up, colour detail, edges, dithering and its marks, photo adjustment, backstitch from lines, texture strokes |
| `03-chart-views.md` | The ways of seeing a chart, zoom and position, rulers, the chart's measurements, canvas and stitch texture, the original photo behind it |
| `04-editing.md` | Every drawing and selection operation, the stitch-type choice, symmetry, the pointer and keyboard behaviour, undo, transparency lock |
| `05-colours-and-threads.md` | The thread list, selecting, isolating, merging, renaming, symbols, the colour editor, thread brands, colour pair |
| `06-backstitch-and-stitch-types.md` | Backstitch lines and their threads, editing them, half stitches |
| `07-text.md` | Lettering: fonts, size, weight, preview, placing |
| `08-exports-and-files.md` | Every export and import, the editable file, saving and restoring, new chart, fabric and size units, A4 settings |
| `09-limits-and-messages.md` | Limits (sizes, counts, durations, rates, file types), every message with its cause, empty, loading and error states |
| `coverage.md` | Every goal and decision of the development record traced to the file above that covers it, or marked as not user-facing (`node scripts/design-brief-coverage.mjs`) |
| `banned-words.txt` | Words that name an interface element; no document may contain them outside quoted messages |

## How a control is described

Every input, choice and gesture gets one entry with these fields; a field that does not apply is omitted, never left blank.

- **Name** and **purpose**: what it decides, in the user's terms.
- **Kind of value**: choice (list the complete set), number (range, step, unit), switch (on/off), text (allowed length and characters), colour, file (types and sizes), gesture (what it does, with which modifiers).
- **Runs on**: *this device* (instant, always available, cannot fail because of a service) or **server** (the work is done by the site's own service). Every server action is marked **[server]** in its entry, and carries the extra states in "Server-run actions" of `09-limits-and-messages.md`: waiting for a free place, running with progress, cancelled, refused as busy or rate-limited, service unreachable, photo no longer held, over its time limit. A server action is never silently retried except the one case that file names.
- **Default**, and **kept**: not kept, this visit, this browser, or in the saved chart.
- **Available when** and **otherwise**: the conditions under which it can be used, and whether it is then unavailable (shown, cannot be used) or absent, with the reason a person is told.
- **Depends on / changes**: other controls whose values or availability it alters, and in which direction.
- **Messages**: what it can say, and what causes each.
- **Source**: the constant or file the values come from (for checking; not for the designer).

## Rules for the text

Facts, in the present tense, with numbers from the code or measured. Where the code has more than one rule for a thing, say which wins. Words for interface elements are banned (see `banned-words.txt`); gestures are written as acts ("choose", "drag from a stitch to another", "press the key"), not as the element that receives them.

## Keeping it true

Three scripts fail when the brief drifts from the app:

- `npx tsx scripts/design-brief-ranges.ts` — the ranges, defaults, lists and limits the brief states against the code's own constants (60 checks).
- `node scripts/design-brief-words.mjs` — no interface-element words.
- `node scripts/design-brief-coverage.mjs --strict` — every goal and decision of the development record has a row in `coverage.md` and every document it names exists.

A goal that changes what a person can do or any range here updates the brief in the same change.
