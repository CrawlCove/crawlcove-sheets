# Changelog

## 1.0.0 — 2026-09-29

Initial release.

- Crawl Cove menu with "Import export from Drive…" and "Paste export (JSON or CSV)…".
- Builds six sheets: Summary, Pages (29 export columns + issues on page,
  filter, status colouring), Issues, Issues by type, Pages by status, Title &
  meta flags (conditional formatting).
- Issue rules identical to crawlcove-mcp's get_issues.
- Reads the JSON export (crawlcove-export-spec 1.0.0) and the app's CSV export.
- `src/lib.js` is pure and tested under Node (9 tests); CI checks both files
  stay plain scripts for the Apps Script V8 runtime.
