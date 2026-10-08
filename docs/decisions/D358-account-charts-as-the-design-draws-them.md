# D358 · The account's Charts are the design's card grid, with pins kept by the server and rename and delete's question kept
Date: 2026-10-08 · Goal: G-108 part 1 M8 · Status: active (superseded by: —)
Context: The Owner asked for the account's Charts to look as `Account.dc.html` draws them, with the number of saved charts beside the Charts tab.
Decision: Cards searched by name and ordered Recent, Name or Size with pinned charts first; a pin and each save's thread brand are stored on the chart; rename and the delete confirmation stay although the design shows neither.
Force: requirement — the Owner's instruction of 2026-10-08; rename is part 1's acceptance item 5, and a delete cannot be undone.
Rejected: pins kept in the browser (lost in another browser); reading the brand from each stored file when listing (a list would read every document); a pin as a save (it would move the chart in Recent and bump its version).
Consequence: a pin changes neither version nor save time, so it is written by raw SQL; New chart opens the editor at `/?new`, the start screen, which replaces nothing.
Evidence: lib/charts/chart-cards.ts; tests/unit/chart-cards.spec.ts; tests/e2e/account-charts.spec.ts; tests/e2e/saved-charts-api.spec.ts
