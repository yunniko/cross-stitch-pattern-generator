# D357 · A saved chart's preview is drawn by the app server at every save, one pixel per stitch
Date: 2026-10-08 · Goal: G-108 part 1 M6 · Status: active (superseded by: —)
Context: The Owner asked for previews of saved charts, regenerated at each save, and chose the chart's own colours, one pixel per stitch, scaled up.
Decision: Each create and overwrite draws the preview from the chart it stores (`pixelArtPixels`, encoded by the shared server encoder) into `SavedChart.preview`; a rename keeps it; the route serves it to the owner alone, kept by the browser per version.
Force: requirement — the Owner's choice of 2026-10-08, and G-108's rule that a picture comes from the stored chart, never from the browser.
Rejected: the processor (its three workers serve generations and exports, and a few-kilobyte pass needs no queue); a picture uploaded by the browser (it need not match its chart); counting the preview in the space limit (it is the server's, and tiny).
Consequence: anything that changes a stored chart's stitches draws its preview again; a chart saved before this is drawn once on first request, without changing its save time.
Evidence: lib/charts/preview.ts; lib/charts/server.ts; tests/unit/chart-preview.spec.ts; tests/e2e/saved-charts-api.spec.ts