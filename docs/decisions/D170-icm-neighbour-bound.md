# D170 · ICM scans the palette only when no neighbour label is below `total`
Date: 2026-09-19 · Goal: G-046 M3 · Status: active (superseded by: —)
Context: ICM tried every palette label at every visit, about half of its time; M3 asked for fewer candidates with a byte-identical result.
Decision: a Standard cell evaluates its neighbours' labels first; one scoring strictly below `total` wins, since any other label costs at least `total`, and only otherwise is the palette scanned.
Force: judgment — the measured gain over the alternative below; exactness itself is a requirement (D107).
Rejected: each cell's nine nearest labels plus neighbours, the milestone's own wording, exact but slower up to 64 colours because building the lists cost more than it saved.
Consequence: the bound relies on a colour weight of zero or more (a negative one scans) and on the colour term being non-negative. ICM is 14–55 % faster; generation end to end only 0–5 s.
Evidence: tests/unit/icm-neighbour-bound.spec.ts; tests/unit/golden-hashes.spec.ts; docs/reviews/2026-09-19-icm-candidate-reduction.md
