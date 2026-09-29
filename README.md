# crawlcove-sheets

A Google Sheets add-on (Apps Script) that imports a [Crawl Cove](https://crawlcove.com/?utm_source=github&utm_medium=crawlcove-sheets) crawl export into a standard SEO audit workbook: a **Summary**, every **Page** with its 29 export columns, an **Issues** list, **Issues by type**, **Pages by status**, and **Title & meta flags** with conditional formatting. One menu item, no copy-pasting formulas, and the issue rules are the same ones [crawlcove-mcp](https://github.com/CrawlCove/crawlcove-mcp) uses, so the sheet and an AI assistant agree on the numbers.

Works with both export formats the desktop app writes from Reports → Export: JSON ([crawlcove-export-spec](https://github.com/CrawlCove/crawlcove-export-spec)) and CSV. A Screaming Frog export works too once converted with [crawlcove-sf-import](https://github.com/CrawlCove/crawlcove-sf-import).

## Install (two minutes, no add-on store)

1. Open a Google Sheet (a new one is fine). **Extensions → Apps Script.**
2. Delete the default `Code.gs` contents. Create two files: `lib.gs` with the contents of [`src/lib.js`](src/lib.js) and `Code.gs` with the contents of [`src/Code.js`](src/Code.js). (Apps Script calls them `.gs`; the code is plain JavaScript.)
3. Save, then reload the spreadsheet. A **Crawl Cove** menu appears.
4. **Crawl Cove → Import export from Drive…** (type the file name or ID of a Crawl Cove export you've uploaded to Drive) or **Paste export (JSON or CSV)…**.

The first run asks for permission to edit this spreadsheet, show dialogs, and read your Drive (read-only, only to fetch the file you name). The script never sends data anywhere: it reads the file you point it at and writes sheets in the current workbook.

With [clasp](https://github.com/google/clasp): copy `.clasp.json.example` to `.clasp.json`, set your script ID, `npm run push`.

## What you get

| Sheet | Contents |
|---|---|
| Summary | Pages crawled, indexable pages, pages with issues, issue count, export time, run id, whether the crawl hit its page cap. |
| Pages | One row per crawled URL with all 29 export columns (status, indexability, title/meta and their lengths, canonical, robots, H1 count, word count, links, images, response time, size, redirect hops, fetch error, schema blocks, hreflang count, fingerprint, findings) plus "Issues on page". Filter and frozen header. 3xx rows amber, 4xx/5xx red. |
| Issues | One row per issue: type, URL, detail. |
| Issues by type | Count per type with a one-line meaning, in a fixed order so you can chart it. |
| Pages by status | Count per HTTP status (plus "No response" / "Fetch error"). |
| Title & meta flags | Every 200 page with title and meta lengths flagged `missing` / `too long` / `short` / `ok`, colour-coded. |

Issue rules (identical to crawlcove-mcp's `get_issues`): broken page (4xx/5xx or fetch error), missing / long (>60) / duplicate title, missing / long (>160) meta description, missing / multiple H1, noindex, redirect chain (2+ hops), missing canonical on an indexable page. Title, meta and H1 rules only apply to 200 pages.

Re-importing overwrites the six sheets and leaves any other sheets in the workbook alone, so you can keep your own analysis tabs next to the data.

## Template

A ready-made template workbook with the script installed and charts on the Summary tab is coming; until then the two-minute install above is the way in.

## Development

`src/lib.js` is the pure part (parsing, issue rules, sheet rows) and runs unchanged in Node, so it has a test suite: `npm test`. `src/Code.js` is the Apps Script glue (menu, dialogs, `SpreadsheetApp` writes). Both must stay plain scripts (no `import`/`export`; CI checks) because Apps Script's V8 runtime has no module system.

## Works with CrawlCove

The export comes from [Crawl Cove](https://crawlcove.com/?utm_source=github&utm_medium=crawlcove-sheets), the desktop SEO crawler for Windows and Mac: crawl a site, open Reports, Export JSON or CSV, import here. The app's own report ranks fixes by impact and keeps history over time; the sheet is for sharing with a client or building your own pivots.

## Related tools

- [crawlcove-export-spec](https://github.com/CrawlCove/crawlcove-export-spec) — the JSON Schema and CSV column reference this add-on reads.
- [crawlcove-sf-import](https://github.com/CrawlCove/crawlcove-sf-import) — convert a Screaming Frog export into the Crawl Cove export format, with a report of what carried over.
- [crawlcove-mcp](https://github.com/CrawlCove/crawlcove-mcp) — the same crawl data for Claude, Cursor and other AI assistants.
- [crawlcove-cli](https://github.com/CrawlCove/crawlcove-cli) — headless whole-site crawl with redirect-chain, broken-link, title and noindex checks.
- [crawlcove-action](https://github.com/CrawlCove/crawlcove-action) — the same checks as a GitHub Action on every PR.
- [crawlcove-schema-validator](https://github.com/CrawlCove/crawlcove-schema-validator) — validate a page's JSON-LD against Google's required and recommended rich-result properties.
- [crawlcove-hreflang-checker](https://github.com/CrawlCove/crawlcove-hreflang-checker) — check a page's or a sitemap's hreflang tags: codes, self-reference, x-default and return tags.
- [crawlcove-sitemap-validator](https://github.com/CrawlCove/crawlcove-sitemap-validator) — validate an XML sitemap or sitemap index against the protocol and search-engine limits.
- [crawlcove-robots-txt-tester](https://github.com/CrawlCove/crawlcove-robots-txt-tester) — lint a robots.txt and test which URLs each crawler may fetch.
- [crawlcove-redirect-chain-checker](https://github.com/CrawlCove/crawlcove-redirect-chain-checker) — follow every hop of a URL's redirects; flags chains, loops, HTTPS downgrades and meta refreshes.

## License

MIT — see [LICENSE](LICENSE).
