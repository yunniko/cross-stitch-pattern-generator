# 09 · Limits, server-run actions and messages

Values come from the code (constants in `lib/types.ts`, `processor/job-protocol.ts`, `lib/server/request-guard.ts`) as of 2026-10-02. The messages tied to one control are listed with that control in its area file; this file holds the ones that are not, and the states every server action shares. *Status: limits and server states complete (M2); the full message catalogue is finished in M5 when every area file exists.*

## Limits

| Thing | Limit | Notes |
|---|---|---|
| Chart size | 10 to 1500 stitches on each side | Presets 50, 100, 150, 200, 250 on the longer side; a custom whole number between the limits. The other side follows the photo's proportions. Above about 1550 a chart no longer fits as one exported picture |
| Colours in the palette | 100 | Each has a one-character symbol; there are as many symbols as colours |
| Colours asked of a generation | 2 to 100 | While a recommendation is known the upper end is lowered to it (never below 2); see `02` |
| Colours chosen by hand for a generation | 1 to 100 | One palette mode per set |
| Saved palettes | 100 by default (the admin's limit "Palettes kept"), names up to 60 characters | With the account, one per name; signed out, as a file only |
| Thread systems of one's own | 10 by default (the admin's limit "Thread systems kept"), up to 2,000 threads each, a file up to 512 KB | Signed in only; "You keep 10 thread systems, as many as your account allows. Delete one to upload another." |
| Photo for generating | JPEG, PNG or WebP; up to 25 MB; up to 50 million pixels | Refused while arriving (size) or before decoding (pixels) |
| Pixel-art image to import | PNG, GIF, WebP or BMP | Imported exactly; refused, not repaired, if it cannot be one stitch per pixel |
| Files that can be opened | `.json` (editable file), `.zip` and `.cspzip` (bundle of exports), `.oxs` | A file of another kind is refused with a message |
| A chart sent for export | up to 32 MB as data | About 2.9 MB of cells at 1000 stitches, plus its photo |
| A generation's settings | up to 64 KB | |
| A4 print cell size | 2 to 12 millimetres per stitch, default 5.5 | |
| Name used for exported files | non-empty, shorter than 200 characters | |
| Time allowed | Generation 45 s. Single-picture exports 45 s. A4 and PDF exports 60 s plus 2 s per printed page, never less than 150 s. Export all 150 s plus 2 s for each page of three paginated sets, never less than 15 min | Past the time the work is stopped and reported as over its time limit |
| Photo held by the server | Dropped 30 minutes after its last use | Anything that needs it again must send it again |
| Result held for collection | 5 minutes after the work finishes | |

## Server-run actions

Marked **[server]** in the area files. The same set of states applies to each; an entry only adds what is specific.

| Action | Needs | Gives back |
|---|---|---|
| Generate a chart | A photo and valid settings | A chart |
| Recommend colour count and colours | A photo; re-asked when the picture, size, palette mode, photo adjustment or chosen set changes, after the values have stayed put for 350 ms | A suggested count, the range of counts that give the best result, the most the count may be set to, the colours at the suggestion, and (with a set) how much of the picture the set covers and what kinds of colour are missing |
| Export: colour chart, black-and-white chart, realistic preview, OXS, A4 pages, Pattern Keeper PDF, Export all | A chart | A file |

Done on the device, with none of the states below: the editable file, the palette file, the pixel-art image, the photo-adjustment preview, undo, editing, saving and restoring.

### States of a server action

| State | Meaning | What the person can do | What they are told |
|---|---|---|---|
| **Idle** | Nothing running | Start it | |
| **Sending** | The photo or chart is being uploaded | Cancel | |
| **Waiting for a free place** | All three workers are busy; this action is in the queue (up to 12 waiting) | Cancel | "Waiting for a free slot — *n*th in line, about *s* s." (the seconds part only when an estimate exists) |
| **Running** | A worker has it | Cancel | A progress value from 0 to 100 %; for page-based exports "page *n* of *m*" with a label |
| **Done** | The result arrived | Use it | Generation replaces or creates the chart; an export is downloaded |
| **Cancelled** | The person cancelled | Start again | Nothing is shown as an error |
| **Refused: busy** | The queue is full, or too many recommendations at once (more than 4) | Try again later | "The pattern service is busy. Try again in about *s* seconds." (export: "The export service is busy…"); the number is what the service asked for, 30 s if it did not say |
| **Refused: too many requests** | One address has used its allowance: 6 generation, upload or export requests a minute (continuously refilled); 90 recommendations a minute | Wait | "Too many requests from this address; wait a moment and try again." |
| **Refused: too large** | Photo over 25 MB, chart over 32 MB, request over its size | Choose a smaller one | "That image is larger than 25 MB." / "That pattern is larger than 32 MB." / "That pattern is too large to export." |
| **Refused: not a picture** | The uploaded file is not one of the picture formats the server reads (an SVG drawing, a document) | Choose a photo | "That file is not a picture this service reads (PNG, JPEG, GIF, WebP, BMP or AVIF)." |
| **Photo no longer held** | The server dropped the photo | Nothing, once: the photo is sent again and the action retried automatically a single time; if that also fails, choose the photo again | "The server no longer has that photo. Choose it again, then generate." |
| **Service unreachable** | No answer, or a gateway failure | Check the connection, try again | "Couldn't reach the pattern service. Check your connection and try again." (export: "…the export service…") |
| **Over its time limit** | Past the allowance in the table above | Try a smaller chart or settings | "The job ran past its time limit." |
| **Chart too large for one picture** | A single-picture export would not fit | Choose a smaller chart or a paginated export | "This pattern is too large to render as a single image. Try a smaller pattern size, fewer colors, or use "Export as A4 pages" instead, which renders one printable page at a time." |
| **Failed** | Any other fault | Try again | "Couldn't generate a pattern from that image." / "Couldn't complete that export." |

Rules that apply to every server action:

- While a generation runs the photo cannot be replaced and generation cannot be started again; while an export runs, exporting is unavailable.
- Only a request from this site's own address is accepted.
- The recommendation is advice: if it cannot be had, nothing is shown and the colour count has no ceiling; no message appears.
- Several changes made quickly ask for one recommendation, after the last change.
- A recommendation that arrives for a picture or setting that has since changed is discarded.

## How messages behave

| Kind | Examples | Behaviour |
|---|---|---|
| **Error** (something failed or was refused) | Generation, export, open and resize failures; a refused palette file | Shown until dismissed, and dismissed by itself **12 seconds** after it appears (error messages only); can be dismissed by the person at any time; a new message replaces the old one |
| **Information** | The result of opening an OXS file; the page-count line of a page-based export | Stays until dismissed or replaced; never dismisses itself |
| **Alert needing a decision** | A failed restore of the autosaved chart, with the actions "Download error report" and "Dismiss" | Stays until acted on |
| **Note beside a control** | Why Add is unavailable, a coverage note | Shown as long as the condition holds |
| **Crash** | The editor failed unexpectedly | The whole editor is replaced by a message: "Something in the editor failed." "Your chart is autosaved, so reloading should bring it back as it was. Before you do, take the report — it is the only record of what went wrong, and without it this can't be chased.", the error's own text (or "Unknown error"), an action to download the report, and an action to reload |

## Where the messages are

Each message is listed with the control or flow that causes it: generation and its settings (`02`), views and chart measurements (`03`), editing and selection (`04`), colours (`05`), backstitch (`06`), text (`07`), files, exports and starting a chart (`08`), and the states of server actions (above). The ones that belong to no single control follow.

## Messages not tied to one control

| Message | Cause |
|---|---|
| "Upload an image first." | Generate asked with no photo |
| "Pattern size must be a whole number between 10 and 1500 stitches." | Size outside the limits |
| "Color count must be between 2 and 100." | Count outside the limits |
| "Add at least one colour to the palette, or switch back to Automatic." | Generate asked while choosing colours by hand with none chosen |
