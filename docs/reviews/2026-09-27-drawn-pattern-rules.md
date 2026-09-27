# Drawn dither pattern rules — moved out of HANDOVER.md, 2026-09-27

`HANDOVER.md` → "Rules in force" passed its 160-line cap while G-075 added its own entries. These six rules
are all specific to the drawn dither pattern subsystem (G-052–G-059) and are not needed by anyone not
touching it; moved here per STANDARDS.md's "a cap is a prompt to restructure" rule, each one already backed
by a named test or decision file.

- A drawn pattern's randomness comes from `lib/prng.ts`/`prng.rs` on a seed in its texture, consumed in the same
  order by both languages, and its shapes use no transcendental function — `atan2` differs between V8 and libm (D183,
  D201, D202). Its cells are ranked and spread evenly over 0..1, which is what holds tone.
- A texture is data with ranges, validated by number not by type union, and its default is frozen against
  `tests/unit/helpers/dither-frozen-g054.ts` — never update that copy to match a change (D203). A texture is compared
  **by value**: it crosses the wire as JSON, so a reference check silently writes a default into every drawn chart
  (D204). A new knob needs a range, a Rust field, a parity case and a line in the editor.
- A drawn mark's shape list only grows at the end and a short weight list falls back to `lump` by name, never "the
  last shape" (D205); every cell keeps an order, painted or not, because that ranking is what holds tone.
- A drawn chart's field depends on the grid's **width and height**: marks are placed across the whole grid and their
  shapes drawn from the stream left afterwards. So a preview of a corner has to build the chart's own field (D206),
  and a tone compared with a threshold is the pipeline's rule only while the dark thread is the nearer one.
- A knob that reaches a shape it was not written for goes behind a switch that starts off, or it changes every
  texture already drawn (D207). The panel's Ring thickness is the stored radius read backwards: ink is fixed by tone,
  so a wider circle is a thinner stroke.
- The preview is shown for every pattern and builds only what that family forces: a matrix needs its window, a kernel
  the chart's full width down to the window, the drawn marks the whole grid (D208). The four line screens are one
  option with a direction, stored as four `lines-*` ids so old files keep opening; the list row carries its own value
  because a `select` cannot show one its options lack.
