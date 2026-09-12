# D099 · A failed auto-restore shows a banner with an on-demand report, not a page-load download
Date: 2026-09-13 · Goal: G-031 M1 · Status: active (superseded by: —)
Context: on a corrupt autosave the page started a file download during mount with no user gesture (review B9). Browsers commonly block gesture-less downloads, which silently defeats the Owner's request to preserve the failed content; when not blocked it is startling.
Decision: the auto-restore path logs at once, clears the corrupt slot, keeps the failed payload in memory for the session, and shows an alert banner with a "Download error report" button (same filename scheme as before) and "Dismiss"; the open-file path, which follows a click, keeps its immediate download.
Rejected: persisting the failed payload in a second storage slot — nothing would read it back after the session, and the banner offers the download while it matters.
Consequence: the Owner's 2026-09-12 "save the problematic version" intent is met by the button, not an automatic file; if a persisted report is ever wanted, add a slot and a way to list it, not a page-load download.
Evidence: tests/e2e/autosave.spec.ts (corrupt-autosave case: no download on load, one on click); tests/unit/error-report.spec.ts.
