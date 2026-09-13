# D090 · Pattern-load failures are logged with a report of the bad file; a corrupt autosave is cleared
Date: 2026-09-12 · Goal: Owner request · Status: partly superseded (superseded by: D101)
Context: The Owner asked to log load errors, save the problem file to an error-report folder and fall back to the previous version.
Decision: reportPatternLoadFailure logs to the console and downloads the failing content as a timestamped error-report file. Open-file failures leave the current pattern untouched. A corrupt autosave is reported and cleared.
Rejected: browser-storage-only quarantine and a hybrid (the Owner chose auto-download for every case); keeping the corrupt autosave (fails identically on every reload).
Consequence: A browser app has no folders, so "error report folder" means downloads. D101 replaced the automatic download on page load with a banner and an on-demand report.
Evidence: lib/editor/error-report.ts; tests/unit/error-report.spec.ts; tests/e2e/export-all.spec.ts; HANDOVER.md D90 as of commit f7bb51c.
