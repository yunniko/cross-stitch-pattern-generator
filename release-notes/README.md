# Release notes

What each release changed, in a user's words, shown in the app under "What's new" (G-105, D309).

## Writing a note

A change that touches `app/` (but `app/admin/`), `lib/`, `rust/` or `public/` (tests apart) carries **one small file in
`next/`** in the same commit. `npm run check:fast` and CI refuse the change without one.

```
---
kind: fixed
---
The custom size can be typed freely again; it is limited and rounded when you leave the field.
```

- **kind** is `new` (something a person can do that they could not), `changed` (something works differently), `fixed`
  (something that was wrong is right), or `internal`: the change has nothing a user sees, and the text says why in one
  line. Internal notes are dropped when a release is cut.
- **The text** is Markdown, written for the person using the app: what they will notice, not how it was done. One or two
  sentences; no file names, commit ids or goal numbers (the check refuses those, D363).
- **The file name** is a short slug of the change (`colour-picker.md`). It is never shown.

## Cutting a release

`npm run release` gathers `next/` into the release's own file, sets the number and tags it; see
`docs/development-loop.md`.
