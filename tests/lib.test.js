import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
const require = createRequire(import.meta.url)
const lib = require('../src/lib.js')

const sample = readFileSync(new URL('./fixtures/sample-crawl-export.json', import.meta.url), 'utf8')

describe('ccLoad', () => {
  it('loads the spec sample JSON export', () => {
    const d = lib.ccLoad(sample)
    expect(d.source).toBe('json')
    expect(d.pages).toHaveLength(7)
    expect(d.auditRunId).toBe(1)
  })
  it('loads the CSV export shape (29 columns, yes/no booleans, BOM) into the same page objects', () => {
    const csv = '﻿' + lib.CC_CSV_COLUMNS.map((c) => `"${c}"`).join(',') + '\r\n' +
      '"https://a.test/","https://a.test/","200","text/html","0","yes","Home, sweet ""home""","17","","","https://a.test/","en","","","1","300","5","1","2","1","120","5000","no","0","","1","0","abcd","0"\r\n' +
      '"https://a.test/x","https://a.test/y","301","","1","no","","","","","","","","","","","","","","","","","no","1","","","","",""\r\n'
    const d = lib.ccLoad(csv)
    expect(d.source).toBe('csv')
    expect(d.pages[0]).toMatchObject({ url: 'https://a.test/', statusCode: 200, indexable: true, title: 'Home, sweet "home"', titleLength: 17, metaDescription: null, h1Count: 1, responseTimeMs: 120, rendered: false, redirectHops: 0, schemaBlocks: 1, contentFingerprint: 'abcd' })
    expect(d.pages[1]).toMatchObject({ statusCode: 301, indexable: false, redirectHops: 1, finalUrl: 'https://a.test/y', schemaBlocks: 0, contentFingerprint: '' })
  })
  it('rejects things that are not exports', () => {
    expect(() => lib.ccLoad('{"hello":1}')).toThrow(/pages/)
    expect(() => lib.ccLoad('Address,Status Code\nx,200')).toThrow(/no "URL" column/)
  })
})

describe('ccIssues (same rules as crawlcove-mcp)', () => {
  const page = (o) => Object.assign({ url: 'https://a.test/', finalUrl: 'https://a.test/', statusCode: 200, fetchError: null, indexable: true, title: 'A fine title for a page', titleLength: null, metaDescription: 'A meta description long enough to be sensible for search results and readers alike.', metaLength: null, h1Count: 1, canonical: 'https://a.test/', robotsMeta: null, xRobotsTag: null, redirectHops: 0 }, o)
  const types = (pages) => lib.ccIssues(pages).map((i) => i.type).sort()
  it('is quiet on a clean page', () => expect(types([page({})])).toEqual([]))
  it('flags each rule', () => {
    expect(types([page({ statusCode: 404 })])).toEqual(['broken-page'])
    expect(types([page({ statusCode: null, fetchError: 'ETIMEDOUT' })])).toEqual(['broken-page'])
    expect(types([page({ title: '' })])).toEqual(['missing-title'])
    expect(types([page({ title: 'x'.repeat(61) })])).toEqual(['long-title'])
    expect(types([page({ url: 'https://a.test/1' }), page({ url: 'https://a.test/2' })])).toEqual(['duplicate-title', 'duplicate-title'])
    expect(types([page({ metaDescription: null })])).toEqual(['missing-meta-description'])
    expect(types([page({ metaDescription: 'x'.repeat(161) })])).toEqual(['long-meta-description'])
    expect(types([page({ h1Count: 0 })])).toEqual(['missing-h1'])
    expect(types([page({ h1Count: 2 })])).toEqual(['multiple-h1'])
    expect(types([page({ xRobotsTag: 'noindex', indexable: false })])).toEqual(['noindex'])
    expect(types([page({ canonical: null })])).toEqual(['missing-canonical'])
    expect(types([page({ statusCode: 301, redirectHops: 2, indexable: false })])).toEqual(['redirect-chain'])
  })
  it('does not judge title/meta/h1 on non-200 pages', () => {
    expect(types([page({ statusCode: 500, title: '', h1Count: 0, canonical: null })])).toEqual(['broken-page'])
  })
})

describe('ccBuildWorkbook', () => {
  const wb = lib.ccBuildWorkbook(lib.ccLoad(sample))
  it('builds every sheet with a header row and consistent counts', () => {
    expect(wb.pages[0]).toHaveLength(30)
    expect(wb.pages).toHaveLength(8)
    expect(wb.issues[0]).toEqual(['Issue', 'URL', 'Detail'])
    expect(wb.issuesByType).toHaveLength(lib.CC_ISSUE_TYPES.length + 1)
    const typedTotal = wb.issuesByType.slice(1).reduce((s, r) => s + r[1], 0)
    expect(typedTotal).toBe(wb.counts.issues)
    expect(wb.issues.length - 1).toBe(wb.counts.issues)
    const statusTotal = wb.pagesByStatus.slice(1).reduce((s, r) => s + r[1], 0)
    expect(statusTotal).toBe(7)
    expect(wb.summary[1]).toEqual(['Pages crawled', 7])
    expect(wb.summary.find((r) => r[0] === 'Made with Crawl Cove')[1]).toMatch(/^https:\/\/crawlcove\.com/)
  })
  it('flags title and meta lengths on 200 pages only', () => {
    const flags = wb.titleMetaFlags.slice(1)
    expect(flags.every((r) => ['missing', 'too long', 'short', 'ok'].includes(r[3]) && ['missing', 'too long', 'short', 'ok'].includes(r[6]))).toBe(true)
    expect(flags.length).toBeLessThanOrEqual(7)
  })
  it('renders booleans and nulls as sheet-friendly values', () => {
    const row = wb.pages[1]
    expect(row.every((v) => v !== null && v !== undefined)).toBe(true)
    expect(row[5]).toMatch(/^(yes|no)$/)
  })
})
