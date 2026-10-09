# D383 · The legal documents are versions an admin publishes in the app, never edited once published
Date: 2026-10-09 · Goal: G-128 M1 · Status: active (superseded by: —)
Context: the terms, the privacy policy and the withdrawal wording are the Owner's text, and a buyer's consent (M2) must name exactly what they read.
Decision: each document is a `LegalVersion` row, written and published by an admin at `/admin/legal`; a publish adds the next version, refused when the text was written over an older one; `/terms` and `/privacy` show the newest and keep every earlier one readable.
Force: judgment — that a published version never changes is compelled by consent naming its text; keeping the text in the database rather than in project files is judgment, so the Owner's wording needs no developer or deploy.
Rejected: Markdown files in the repository (each wording change a release); one editable row per document (a consent could no longer show what was agreed to).
Consequence: admin text is drawn with `renderMarkdown`'s `authored` (HTML escaped, unsafe links dropped); a page with nothing published says so, and the links to it are not shown.
Evidence: lib/legal/documents.ts; lib/admin/legal-actions.ts; tests/unit/legal-documents.spec.ts; tests/e2e/admin-legal.spec.ts