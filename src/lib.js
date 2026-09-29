/**
 * crawlcove-sheets — the pure part. Plain script, no import/export, so the
 * same file runs unchanged inside Google Apps Script (V8) and under Node for
 * the tests. Everything that touches SpreadsheetApp lives in Code.js.
 *
 * Reads a Crawl Cove crawl export (JSON per crawlcove-export-spec 1.0.0, or
 * the app's CSV export with the same 29 columns) and turns it into the rows
 * of an audit workbook. Issue rules match crawlcove-mcp's get_issues, so a
 * number in the sheet agrees with what an assistant would report.
 */

var CC_TITLE_MAX = 60
var CC_META_MAX = 160

var CC_ISSUE_TYPES = [
  ['broken-page', 'Broken page', 'Returned 4xx/5xx or could not be fetched'],
  ['missing-title', 'Missing title', 'No <title>'],
  ['long-title', 'Long title', '<title> over ' + CC_TITLE_MAX + ' characters'],
  ['duplicate-title', 'Duplicate title', 'Same <title> on more than one page'],
  ['missing-meta-description', 'Missing meta description', 'No <meta name="description">'],
  ['long-meta-description', 'Long meta description', 'Over ' + CC_META_MAX + ' characters'],
  ['missing-h1', 'Missing H1', 'No <h1> on a 200 page'],
  ['multiple-h1', 'Multiple H1', 'More than one <h1>'],
  ['noindex', 'Noindex', 'Robots noindex directive'],
  ['redirect-chain', 'Redirect chain', '2 or more redirect hops'],
  ['missing-canonical', 'Missing canonical', 'Indexable page without a canonical']
]

var CC_CSV_COLUMNS = ['URL', 'Final URL', 'Status', 'Content-Type', 'Depth', 'Indexable', 'Title', 'Title length', 'Meta description', 'Meta length', 'Canonical', 'HTML lang', 'Robots meta', 'X-Robots-Tag', 'H1 count', 'Word count', 'Internal links', 'External links', 'Images', 'Images missing alt', 'Response time (ms)', 'Byte size', 'Rendered', 'Redirect hops', 'Fetch error', 'Schema blocks', 'hreflang count', 'Content fingerprint', 'Findings']
var CC_JSON_FIELDS = ['url', 'finalUrl', 'statusCode', 'contentType', 'depth', 'indexable', 'title', 'titleLength', 'metaDescription', 'metaLength', 'canonical', 'htmlLang', 'robotsMeta', 'xRobotsTag', 'h1Count', 'wordCount', 'linksInternal', 'linksExternal', 'imageCount', 'imagesMissingAlt', 'responseTimeMs', 'byteSize', 'rendered', 'redirectHops', 'fetchError', 'schemaBlocks', 'hreflangCount', 'contentFingerprint', 'findingsCount']

/** RFC 4180 CSV → rows. Handles a BOM, quoted commas/newlines, doubled quotes, CRLF. */
function ccParseCsv(text) {
  var rows = [], row = [], field = '', i = 0, q = false
  if (text.charCodeAt(0) === 0xfeff) i = 1
  while (i < text.length) {
    var c = text[i]
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue }
        q = false; i++; continue
      }
      field += c; i++; continue
    }
    if (c === '"') { q = true; i++; continue }
    if (c === ',') { row.push(field); field = ''; i++; continue }
    if (c === '\r' || c === '\n') {
      row.push(field); field = ''; rows.push(row); row = []
      if (c === '\r' && text[i + 1] === '\n') i++
      i++; continue
    }
    field += c; i++
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter(function (r) { return !(r.length === 1 && r[0] === '') })
}

function ccInt(v) { if (v === null || v === undefined || v === '') return null; var n = Number(v); return isFinite(n) ? n : null }
function ccStr(v) { if (v === null || v === undefined) return null; v = String(v); return v === '' ? null : v }
function ccBool(v) { return v === true || v === 'yes' || v === 'true' || v === 'TRUE' }

/** The app's CSV export → the same page objects as the JSON export. */
function ccPagesFromCsv(text) {
  var rows = ccParseCsv(text)
  if (rows.length === 0) throw new Error('Empty CSV.')
  var header = rows[0].map(function (h) { return h.trim() })
  var idx = {}
  CC_CSV_COLUMNS.forEach(function (col, n) {
    var i = header.indexOf(col)
    if (i !== -1) idx[CC_JSON_FIELDS[n]] = i
  })
  if (idx.url === undefined) throw new Error('This CSV has no "URL" column. Export it from Crawl Cove → Reports → Export CSV. (Got: ' + header.slice(0, 6).join(', ') + ')')
  var ints = { statusCode: 1, depth: 1, titleLength: 1, metaLength: 1, h1Count: 1, wordCount: 1, linksInternal: 1, linksExternal: 1, imageCount: 1, imagesMissingAlt: 1, responseTimeMs: 1, byteSize: 1, redirectHops: 1, schemaBlocks: 1, hreflangCount: 1, findingsCount: 1 }
  var bools = { indexable: 1, rendered: 1 }
  return rows.slice(1).map(function (row) {
    var p = {}
    CC_JSON_FIELDS.forEach(function (f) {
      var v = idx[f] === undefined ? undefined : row[idx[f]]
      if (bools[f]) p[f] = ccBool(v)
      else if (ints[f]) p[f] = ccInt(v)
      else p[f] = ccStr(v)
    })
    if (p.redirectHops === null) p.redirectHops = 0
    if (p.schemaBlocks === null) p.schemaBlocks = 0
    if (p.hreflangCount === null) p.hreflangCount = 0
    if (p.findingsCount === null) p.findingsCount = 0
    if (p.contentFingerprint === null) p.contentFingerprint = ''
    return p
  }).filter(function (p) { return p.url !== null })
}

/** Accept JSON export text, CSV export text, or an already-parsed export object. */
function ccLoad(input) {
  var data = input
  if (typeof input === 'string') {
    var t = input.replace(/^﻿/, '').trim()
    if (t[0] === '{' || t[0] === '[') data = JSON.parse(t)
    else return { source: 'csv', exportedAt: null, auditRunId: null, runIncomplete: false, pages: ccPagesFromCsv(input) }
  }
  if (!data || typeof data !== 'object' || !Array.isArray(data.pages)) throw new Error('Not a Crawl Cove export: expected an object with a "pages" array (crawlcove-export-spec 1.0.0).')
  return { source: 'json', exportedAt: data.exportedAt || null, auditRunId: data.auditRunId === undefined ? null : data.auditRunId, runIncomplete: !!data.runIncomplete, pages: data.pages }
}

function ccIsNoindex(p) {
  return /\bnoindex\b/i.test(p.robotsMeta || '') || /\bnoindex\b/i.test(p.xRobotsTag || '')
}

/** Issues per page, same rules as crawlcove-mcp get_issues. Returns [{type, url, detail}]. */
function ccIssues(pages) {
  var out = []
  var titleCounts = {}
  pages.forEach(function (p) { if (p.title) titleCounts[p.title] = (titleCounts[p.title] || 0) + 1 })
  pages.forEach(function (p) {
    var okHtml = p.statusCode === 200 && !p.fetchError
    if (p.fetchError || p.statusCode === null || p.statusCode >= 400) {
      out.push({ type: 'broken-page', url: p.url, detail: p.fetchError || ('HTTP ' + p.statusCode) })
    }
    if (p.redirectHops >= 2) out.push({ type: 'redirect-chain', url: p.url, detail: p.redirectHops + ' hops → ' + p.finalUrl })
    if (!okHtml) return
    if (!p.title || p.title.trim() === '') out.push({ type: 'missing-title', url: p.url, detail: 'no <title>' })
    else {
      var tl = p.titleLength === null || p.titleLength === undefined ? p.title.length : p.titleLength
      if (tl > CC_TITLE_MAX) out.push({ type: 'long-title', url: p.url, detail: tl + ' chars: "' + p.title + '"' })
      if (titleCounts[p.title] > 1) out.push({ type: 'duplicate-title', url: p.url, detail: '"' + p.title + '" is used on ' + titleCounts[p.title] + ' pages' })
    }
    if (!p.metaDescription || p.metaDescription.trim() === '') out.push({ type: 'missing-meta-description', url: p.url, detail: 'no meta description' })
    else {
      var ml = p.metaLength === null || p.metaLength === undefined ? p.metaDescription.length : p.metaLength
      if (ml > CC_META_MAX) out.push({ type: 'long-meta-description', url: p.url, detail: ml + ' chars' })
    }
    if (p.h1Count === 0) out.push({ type: 'missing-h1', url: p.url, detail: 'no <h1>' })
    else if (p.h1Count !== null && p.h1Count > 1) out.push({ type: 'multiple-h1', url: p.url, detail: p.h1Count + ' <h1> elements' })
    if (ccIsNoindex(p)) out.push({ type: 'noindex', url: p.url, detail: 'robots: ' + (p.robotsMeta || p.xRobotsTag) })
    if (p.indexable && !p.canonical) out.push({ type: 'missing-canonical', url: p.url, detail: 'indexable page without a canonical' })
  })
  return out
}

/** Everything the workbook needs, as arrays of rows (header first). */
function ccBuildWorkbook(dataset) {
  var pages = dataset.pages
  var issues = ccIssues(pages)
  var byType = {}
  issues.forEach(function (i) { byType[i.type] = (byType[i.type] || 0) + 1 })
  var byStatus = {}
  pages.forEach(function (p) {
    var k = p.fetchError ? 'Fetch error' : p.statusCode === null ? 'No response' : String(p.statusCode)
    byStatus[k] = (byStatus[k] || 0) + 1
  })
  var indexable = pages.filter(function (p) { return p.indexable }).length
  var label = {}
  CC_ISSUE_TYPES.forEach(function (t) { label[t[0]] = t[1] })

  var summary = [
    ['Crawl Cove audit', ''],
    ['Pages crawled', pages.length],
    ['Indexable pages', indexable],
    ['Pages with issues', Object.keys(issues.reduce(function (m, i) { m[i.url] = 1; return m }, {})).length],
    ['Issues found', issues.length],
    ['Exported at', dataset.exportedAt || ''],
    ['Audit run', dataset.auditRunId === null ? '' : dataset.auditRunId],
    ['Crawl incomplete', dataset.runIncomplete ? 'yes' : 'no'],
    ['Source', dataset.source === 'csv' ? 'CSV export' : 'JSON export'],
    ['', ''],
    ['Made with Crawl Cove', 'https://crawlcove.com/?utm_source=sheets&utm_medium=crawlcove-sheets']
  ]

  var pagesRows = [CC_CSV_COLUMNS.concat(['Issues on page'])]
  var issuesPerUrl = {}
  issues.forEach(function (i) { issuesPerUrl[i.url] = (issuesPerUrl[i.url] || 0) + 1 })
  pages.forEach(function (p) {
    pagesRows.push(CC_JSON_FIELDS.map(function (f) {
      var v = p[f]
      if (v === null || v === undefined) return ''
      if (typeof v === 'boolean') return v ? 'yes' : 'no'
      return v
    }).concat([issuesPerUrl[p.url] || 0]))
  })

  var issuesRows = [['Issue', 'URL', 'Detail']]
  issues.forEach(function (i) { issuesRows.push([label[i.type] || i.type, i.url, i.detail]) })

  var byTypeRows = [['Issue', 'Pages', 'What it means']]
  CC_ISSUE_TYPES.forEach(function (t) { byTypeRows.push([t[1], byType[t[0]] || 0, t[2]]) })

  var byStatusRows = [['Status', 'Pages']]
  Object.keys(byStatus).sort().forEach(function (k) { byStatusRows.push([k, byStatus[k]]) })

  var flagsRows = [['URL', 'Title', 'Title length', 'Title flag', 'Meta description', 'Meta length', 'Meta flag']]
  pages.forEach(function (p) {
    if (!(p.statusCode === 200 && !p.fetchError)) return
    var tl = p.title ? (p.titleLength === null || p.titleLength === undefined ? p.title.length : p.titleLength) : 0
    var ml = p.metaDescription ? (p.metaLength === null || p.metaLength === undefined ? p.metaDescription.length : p.metaLength) : 0
    var tf = !p.title ? 'missing' : tl > CC_TITLE_MAX ? 'too long' : tl < 30 ? 'short' : 'ok'
    var mf = !p.metaDescription ? 'missing' : ml > CC_META_MAX ? 'too long' : ml < 70 ? 'short' : 'ok'
    flagsRows.push([p.url, p.title || '', tl, tf, p.metaDescription || '', ml, mf])
  })

  return {
    summary: summary,
    pages: pagesRows,
    issues: issuesRows,
    issuesByType: byTypeRows,
    pagesByStatus: byStatusRows,
    titleMetaFlags: flagsRows,
    counts: { pages: pages.length, indexable: indexable, issues: issues.length }
  }
}

if (typeof module !== 'undefined') {
  module.exports = { ccParseCsv: ccParseCsv, ccPagesFromCsv: ccPagesFromCsv, ccLoad: ccLoad, ccIssues: ccIssues, ccBuildWorkbook: ccBuildWorkbook, CC_ISSUE_TYPES: CC_ISSUE_TYPES, CC_CSV_COLUMNS: CC_CSV_COLUMNS }
}
