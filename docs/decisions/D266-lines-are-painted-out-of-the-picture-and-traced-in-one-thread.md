# D266 · Lines are traced first, painted out of the picture, and stitched in one thread
Date: 2026-10-02 · Goal: G-084 · Status: active (superseded by: —)
Context: a line thinner than a stitch averages into grey stitches that are neither the line nor the colour beside it.
Decision: the picture's thin dark lines are traced before generation reads it and painted over with their surroundings; all of them become backstitch in one thread, an existing palette thread within 0.07 Oklab of their colour or else a new one at the end of the palette, snapped to the brand's thread in a brand palette.
Force: requirement — Owner, 2026-10-02: the stitches under a line take the surrounding colour; a traced line may add a thread.
Rejected: tracing after quantising (the stitches under a line would already be grey or black); one thread per line colour (a drawing's lines are one pen).
Consequence: a chart can hold one thread more than the colour count asked for; that thread has no stitches. Moving or cropping the photo later does not move the lines.
Evidence: rust/cs-core/tests/backstitch_lines.rs; tests/e2e/backstitch-from-lines.spec.ts
