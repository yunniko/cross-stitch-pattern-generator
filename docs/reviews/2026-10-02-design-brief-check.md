# Design brief: what was checked (G-088 M5)

Checked 2026-10-02 against the code at the commit this file is committed with, and the live site (`https://cross-stitch.craftodejnice.cz`).

## Mechanical checks (rerun: see `docs/design-brief/README.md`, "Keeping it true")

| Check | Result |
|---|---|
| `scripts/design-brief-ranges.ts`: 60 ranges, defaults, lists and limits against the code's constants (size 10–1500, colours 2–100, presets, texture ranges and defaults, photo-adjustment range, brush sizes, zoom 25–800 % and step 1.4, undo depth 50, fabric counts, thread counts 454/500/355, text size 7–200 and weight step 5, A4 cell size 2–12 (default 5.5), overlaps, every server limit and deadline, rate limits 6 and 90 a minute, error dismissal 12 s, saved palettes 50) | 0 failed. Shown to fail: changing the generation deadline in the text to 40 s made it report the line |
| `scripts/design-brief-words.mjs`: 43 banned words, 9 documents; text in quotes (messages) and in backticks is exempt | 0 hits after rewording 8 (e.g. "tab", "dialog", "row", "status line", "bar of actions") |
| `scripts/design-brief-coverage.mjs --strict`: 88 goals and 275 decisions traced; 15 superseded decisions need no row | 0 problems, 0 documents missing |

## Run against the live interface

One temporary probe (not kept) read the running site after generating the sample chart and compared it with the text: the Export choices and their two groups; the 11 tool and 4 mirror controls; brush sizes 1–15 odd; fabric counts; overlaps 0/3/5/10; A4 cell size 2–12 default 5.5; the colour-count control's range 2–20 with the hint "Suggested 8: 4–15 …(up to 20)" for that photo; the four dither groups; the four photo sliders −100..100; text weight 0..100 and size 7..200 default 12; font groups (36 pixel, 5 other, 6 generic); zoom reaching 800 % and, after forty presses out, 28 % on a 50-stitch chart (the text now says the floor can sit slightly above 25 %). One difference found and written down: the chart made right after loading used 16 colours, not the recommended 8, because Generate was pressed before the recommendation arrived (stated in `02`).

## Reader test

Five questions were answered from the brief alone and each answer then checked in code:
1. How many colours may a chart hold, and what limits the count for a small photo? (100; the control's top is the recommendation's ceiling, 20 here.) Confirmed.
2. What happens if I export A4 pages while the service is busy, and what still works? (Refused as busy with the wait in seconds; the editable file, palette file and pixel-art image still export.) Confirmed in code (`use-exports`).
3. How many undo steps is a stroke drawn with two symmetry axes on? (One.) Confirmed (`use-canvas-tools`).
4. In a DMC chart, can I change one colour to a Cosmo thread? (No: a brand chart offers only its own brand, with a notice.) Confirmed (`colors-dock`).
5. What file does Export → Black & white → A4 pages give, and what is the default overlap? (`<name>_A4_bw.zip`; 5.) Confirmed (`rust/cs-export`, `workspace-storage`).

**Limit of this test:** the reader was the author, working from the documents with the code at hand, not someone who had not seen the app. A cold reader (the designer, or a fresh agent given only the documents) has not yet tried it.

## What the brief does not cover

- Accounts, sign-in, the profile and the admin area (Owner, 2026-10-02).
- Touch and small-screen behaviour (Owner, 2026-10-02).
- What a chart image, A4 page or legend looks like beyond what each carries: the brief states contents and options, not layout.
- Keyboard focus order and assistive-technology naming (the code has them; they are interface implementation).
- Behaviours read from code and the project's decisions but not exercised by hand this session: most of the editing tools, selection, backstitch editing, the colour editor, text placement, and every export's file contents. Their entries rest on the code, the README and the decisions, which the existing e2e suite exercises.
- Observed oddity left as it is, stated in `03`: the page invites dropping a photo, but dropping a file does nothing.
