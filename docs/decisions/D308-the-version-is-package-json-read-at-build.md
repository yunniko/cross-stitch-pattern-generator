# D308 · The version is `package.json`'s, read when the app is built
Date: 2026-10-06 · Goal: G-105 M1 · Status: active (superseded by: —)
Context: the app must show a release number that matches the git tag and the deploy-log row; it showed none, and the crash report's `APP_VERSION` held the commit.
Decision: `next.config.ts` hands `package.json`'s `version` to the bundle as `APP_VERSION`; `lib/app-version.ts` is the one accessor, beside `APP_COMMIT` from the build argument. Shown at the foot of Preferences and in the crash report.
Force: judgment — one source cannot disagree with itself; the review's second build argument beside `APP_COMMIT` could.
Rejected: a build argument `APP_VERSION` in the `Dockerfile` (a second copy of the number, unset locally); importing `package.json` in the page (the whole file, dependency list included, would ship in the bundle).
Consequence: the number changes only by editing `package.json`, which the release step does. A build without `APP_COMMIT` shows the number alone.
Evidence: tests/unit/app-version.spec.ts; tests/e2e/preferences.spec.ts
