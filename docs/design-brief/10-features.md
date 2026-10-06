# 10 · Feature switches

What a person may use is decided feature by feature (G-102, D303 to D305). Every feature of the editor is one entry in one list, in groups, and for a given person is in one of three states. The states are set by an admin: for the whole site, for one person, or as a named set that a subscription tier gives the people on it.

## The states

| State | What the person sees | What the server does |
|---|---|---|
| **On** | The feature is offered and usable | A request for it is served |
| **Locked** | The feature is shown in its place, greyed, with the note "*Name* is not available to you."; it takes no press, and its key does nothing | A request for it is refused by name (403) |
| **Hidden** | The feature is absent, as if it did not exist; its key does nothing; its command is not in the command list | A request for it is refused by name (403) |

A feature with no state set is On. A person's own state wins over their tier's set, which wins over the site's; an explicit On set for a person or in a set lifts a lock the site has put on. A visitor without an account gets the site's states. A tier's set counts while the subscription is live (`active`, `trialing`, `past_due`).

**When a change is seen.** The states are given with the page and asked for again once they are older than the time the site sets (5 minutes unless set otherwise; between 5 seconds and a day): on a timer while the editor is in view, and at once when it comes back into view after that time. A change an admin makes therefore reaches an open editor within that time, with no reload. A feature that becomes locked or hidden while it is in use is put down: a tool in hand gives way to the first usable one.

## What is a feature

The list is derived from what the editor has, so a new tool, export kind, generation setting, dither pattern, texture or thread brand appears in it by being added, unless it declares itself core. The groups, and what is in them today:

| Group | Features | Core (never switched) |
|---|---|---|
| Drawing tools | Brush, Fill, Line, Rectangle, Oval, Lasso fill, Text, Backstitch, BS edit | |
| Selection and transformation | Select, Lasso, Crop, Move | |
| Navigation | | Pan, Zoom |
| Colours | Isolate the lit threads | The two drawing colours and their swap |
| Chart | Quick mirrors (the four as one), Symmetry axes (the four as one), Transparency lock | |
| Views | Stitched view, Photo behind the chart (the grid over it and the photo alone, as one) | Color, Black & white, the zoom, the workspaces |
| Exports | A4 pages, PDF for Pattern Keeper, Full chart PNG, Realistic preview PNG, Pixel art PNG, Editable pattern, OXS chart, Palette file, Export all | Save in the bar above (the editable file by another road) |
| Generation | Choice of algorithm, Crisp edges, Dithering (as a whole), Vivid colour detail, Backstitch from lines (with "also in photographs" and the sensitivity), Set up palette, Texture strokes (with the density), Photo adjustment | The size, the colour count, the palette mode itself |
| Dither patterns | Clustered dots, Rings, Lines (the four directions as one), Bayer 4×4, Bayer 8×8, Blue noise, Floyd–Steinberg, Atkinson, Hand-drawn (with its texture editing) | Off |
| Textures | Classic, Pixel, Cell outline, Cell outline shaded, Cross 2 stitch textures; Natural linen and Counted canvas cloths | The plain canvas colour |
| Thread brands | DMC, Cosmo, Anchor | Full range |

Undo and Redo, the file actions, Generate itself, the command list, Preferences and the keyboard cursor are core.

## What a switched-off feature does to what exists

A chart keeps its data whatever the person's states: backstitch lines, text once placed, a texture or a brand its threads came from are shown and saved as they are. Only making more of the feature is withheld. A stored setting that names a feature the person cannot use is read as its default while the state lasts (a hidden stitch texture draws as Classic, a hidden brand generates in the full range, a locked dither pattern generates with no dithering) and is back the moment the feature is.

The tool in hand is never a locked or hidden one: if it becomes one, the first usable tool the workspace offers is in hand instead.

## The admin

Every admin page refuses a visitor (to the sign-in) and a signed-in reader (to the editor).

| Where | What it allows |
|---|---|
| The site | The list in its groups; a state per feature, and one for a whole group at once (a group whose features differ reads "Mixed"). Each change is kept as it is made; a refused one is put back with its reason |
| Feature sets | Make a set by name (up to 60 characters, unique); for each feature, As the site, On, Locked or Hidden, with what the site says shown beside As the site; delete a set no tier points at |
| Tiers | Make a tier by name; give it one set or none; the number of people on it. Nothing is sold: a subscription is written by a billing goal to come |
| A person | From the users list: their tier and its set named; for each feature, As the site, On, Locked or Hidden |
| Changes | The latest thirty changes, newest first: when, the scope (site, user, set, tier), what is now true, who made it |

## Limits and messages

| Thing | Value |
|---|---|
| A set's or a tier's name | 1 to 60 characters, no line break; a set's name is unique |
| Changes shown | 30 |
| How long a browser keeps its states | 300 seconds unless set; 5 to 86,400 |
| The note on a locked feature | "*Name* is not available to you." |
| A refused request | 403, `{ "error": "<Name> is not available to you." }` |
| A set a tier points at, on delete | "A tier points at this set; detach it first." |
| The database cannot be read | Everything is on, and the fault is logged on the server |
