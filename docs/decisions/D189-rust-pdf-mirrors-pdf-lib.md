# D189 · The Rust PDF mirrors pdf-lib's structure with pdf-writer and a subset Type0 font
Date: 2026-09-19 · Goal: G-048 M4 · Status: active (superseded by: —)
Context: criterion 3 asks for the same page count, the same extracted text per page and symbols as embedded-font text.
Decision: `cs-export` writes the PDF with pdf-writer, emitting pdf-lib's operators and page order, and embeds a subsetter subset of DejaVu Sans as Type0/Identity-H with a ToUnicode map.
Force: judgment — pdf-writer is low-level enough to reproduce pdf-lib's layout operator for operator; a higher-level library would lay text out its own way.
Rejected: printpdf (its own text layout and font handling); rasterised symbols (criterion 3 requires text).
Consequence: text widths use pdf-lib's unkerned advances; a change to the TypeScript PDF layout needs the same change in `rust/cs-export/src/pdf.rs`.
Evidence: rust/cs-export/src/pdf.rs; scripts/rust-export-parity.ts
