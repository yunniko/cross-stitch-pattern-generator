# D036 · A thread-mode pattern's color editor offers only real threads; free-form patterns get a switch
Date: 2026-09-10 · Goal: G-017 · Status: active (superseded by: —)
Context: The Owner asked for DMC-only swatches when editing a DMC-mode color, and a Full range/DMC switch for other patterns.
Decision: Picking a thread sets the color's RGB and renames it "CODE - Name". A thread-mode pattern shows only the thread picker, while a free-form pattern defaults to Full range with an optional thread tab. Converting one color doesn't change the pattern's mode.
Rejected: keeping the old name on a thread pick (a named thread is a different edit than a hex nudge); flipping the pattern's mode on a single conversion (the mode means every color is a thread).
Consequence: Discrete pickers commit on click; only the continuous hex picker has Done. Deployed 2026-09-11. D092 renamed the helpers brand-neutral.
Evidence: lib/editor/pattern-edit.ts; app/components/colors-dock.tsx; tests/unit/pattern-edit.spec.ts; HANDOVER.md D36 as of commit f7bb51c.
