# D356 · A saved chart opens by its address, read before anything is asked
Date: 2026-10-08 · Goal: G-108 M4 · Status: active (superseded by: —)
Context: The account's Charts must open a chart in the editor, where one chart is open and autosaved, and the chart may have gone since the list was drawn.
Decision: Open links to `/?chart=<id>`; once the autosave is back the editor reads the chart, then asks as for any new chart and replaces it through the `open-saved` row; the parameter is taken off the address.
Force: judgment — reading first means a chart that is gone costs nothing; an address works from any page.
Rejected: asking first and reading after (a refused read would already have discarded the open chart); handing the file over through browser storage (a second way in beside the address).
Consequence: the same chart asked for while open is left as it is; a rename from the account is one more version, so the editor's next Save asks first.
Evidence: lib/charts/saved-chart-link.ts; app/hooks/use-chart-lifecycle.ts; tests/e2e/account-charts.spec.ts