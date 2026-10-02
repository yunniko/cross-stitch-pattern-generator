# Colour count and colour prediction (G-087)

Measured 2026-10-02 with `cs-bench predict` (release build) on the e2e fixtures; "ms" is the predictor alone on this machine.
Method: D276. Counts are in Oklab; thresholds are the three gain constants in `rust/cs-core/src/predict.rs`.

| picture | size | suggested | range | ceiling | cells | ms |
|---|---|---|---|---|---|---|
| sample.png | 50 | 8 | 4–15 | 20 | 1550 | 2.0 |
| sample.png | 150 | 9 | 8–14 | 19 | 14100 | 7.2 |
| texture-fur.png | 50 | 5 | 4–9 | 12 | 1900 | 3.3 |
| texture-fur.png | 150 | 7 | 5–11 | 15 | 16950 | 8.5 |
| line-drawing.png | 50 | 8 | 5–9 | 12 | 1900 | 2.6 |
| line-drawing.png | 150 | 8 | 4–10 | 14 | 16950 | 8.0 |
| transparent-subject.png | 50 | 4 | 4–4 | 7 | 1388 | 1.6 |
| transparent-subject.png | 150 | 4 | 4–4 | 7 | 12489 | 7.0 |

Against the full generation: the predicted colours at the suggested count lay 0.008–0.034 Oklab from the chart's own colours
at the same count (measured during M1 on the same fixtures; the run was not kept as a script, so it is not reproducible from the
repository). Cost through the app (upload held, 350 ms debounce, processor round trip) was not measured separately.

Gaps: the thresholds were judged by eye on four small fixtures and the Owner's own pictures with dark shadows have not
been compared (acceptance criterion 8 awaits the Owner's look). A picture of one or two flat colours gives a range of one count.
