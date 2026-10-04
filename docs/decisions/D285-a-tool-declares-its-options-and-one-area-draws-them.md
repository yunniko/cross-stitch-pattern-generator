# D285 · A tool declares its options, and one options area draws them
Date: 2026-10-05 · Goal: G-093 M1 · Status: active (superseded by: —)
Context: brush size, brush shape, outline-or-filled and stitch type were written by hand in the bar above the chart, so a tool with a new option meant editing that bar.
Decision: an option is data (`app/tools/options.tsx`: id, values, default, heading, kind of control); a tool lists its options in its definition; `app/components/tool-options.tsx` draws the list for the tool in hand. The four earlier options keep their named settings; any other option's value is kept in one bag by id (`lib/editor/tool-options.ts`).
Force: requirement — Owner, 2026-10-04: "yes, add tool options to 093". Which options each tool shows is unchanged, by the goal's criterion.
Rejected: moving the four into the bag (changes what browsers have stored); pruning the brush options from tools that ignore them (a behaviour change, put to the Owner).
Consequence: every tool still lists the brush options because the bar always showed them; dropping them from a tool is a one-line edit of its definition.
Evidence: tests/unit/tool-options.spec.ts; tests/unit/tool-registry.spec.ts
