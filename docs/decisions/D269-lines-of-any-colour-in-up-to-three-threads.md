# D269 · Lines of any colour, dark, light or coloured, in up to three threads
Date: 2026-10-02 · Goal: G-084 · Status: active (superseded by: —)
Context: the first tracing found dark lines only and gave all of them one thread (D266); the Owner asked for all types of lines.
Decision: a line is a feature thinner than a stitch in any of the red, green or blue channels, dark or light; each line takes the mean colour of its strongest pixels and the colours group into at most three threads, lines within 0.12 Oklab of a thread joining it.
Force: requirement — Owner, 2026-10-02: trace all types of lines. The three threads and 0.12 are judgment.
Rejected: a thread per line colour (a drawing with dozens of pale shades would add dozens of threads); luminance alone (a red line on green of the same brightness is invisible to it).
Consequence: a chart can hold up to three threads more than the colour count asked for, none with stitches. A light and a dark line closer than a stitch merge into one line of mixed colour. Replaces D266's one-thread rule.
Evidence: rust/cs-core/src/lines.rs (`lines_of_two_colours_are_two_threads_and_of_one_colour_one`); rust/cs-core/tests/backstitch_lines.rs; docs/reviews/2026-10-02-backstitch-from-lines.md
