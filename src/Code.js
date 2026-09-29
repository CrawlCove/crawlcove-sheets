/**
 * crawlcove-sheets — the Apps Script glue. Menu, two ways in (paste, or a
 * file in Drive), then the workbook writer. All the data shaping is in
 * lib.js so it can be tested outside Sheets.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Crawl Cove')
    .addItem('Import export from Drive…', 'ccImportFromDrive')
    .addItem('Paste export (JSON or CSV)…', 'ccImportFromPaste')
    .addSeparator()
    .addItem('About', 'ccAbout')
    .addToUi()
}

function ccAbout() {
  SpreadsheetApp.getUi().alert('Crawl Cove for Sheets', 'Imports a Crawl Cove crawl export (Reports → Export JSON/CSV) into this workbook: Summary, Pages, Issues, Issues by type, Pages by status, Title & meta flags.\n\nhttps://github.com/CrawlCove/crawlcove-sheets', SpreadsheetApp.getUi().ButtonSet.OK)
}

function ccImportFromDrive() {
  var ui = SpreadsheetApp.getUi()
  var r = ui.prompt('Import from Drive', 'File name (exact) or file ID of the Crawl Cove export in your Drive:', ui.ButtonSet.OK_CANCEL)
  if (r.getSelectedButton() !== ui.Button.OK) return
  var q = r.getResponseText().trim()
  if (!q) return
  var file = null
  try { file = DriveApp.getFileById(q) } catch (e) {
    var it = DriveApp.getFilesByName(q)
    if (it.hasNext()) file = it.next()
  }
  if (!file) { ui.alert('No file called "' + q + '" in your Drive.'); return }
  ccImportText(file.getBlob().getDataAsString('UTF-8'))
}

function ccImportFromPaste() {
  var html = HtmlService.createHtmlOutput(
    '<form><p>Paste the contents of a Crawl Cove export (JSON or CSV):</p>' +
    '<textarea id="t" style="width:100%;height:260px;font-family:monospace"></textarea>' +
    '<p><button type="button" onclick="google.script.run.withSuccessHandler(function(){google.script.host.close()}).withFailureHandler(function(e){alert(e.message)}).ccImportText(document.getElementById(\'t\').value)">Import</button></p></form>'
  ).setWidth(640).setHeight(360)
  SpreadsheetApp.getUi().showModalDialog(html, 'Paste export')
}

/** Entry point for both routes: text in, workbook out. */
function ccImportText(text) {
  var dataset = ccLoad(text)
  var wb = ccBuildWorkbook(dataset)
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  ccWriteSheet(ss, 'Summary', wb.summary, false)
  ccWriteSheet(ss, 'Pages', wb.pages, true)
  ccWriteSheet(ss, 'Issues', wb.issues, true)
  ccWriteSheet(ss, 'Issues by type', wb.issuesByType, true)
  ccWriteSheet(ss, 'Pages by status', wb.pagesByStatus, true)
  ccWriteSheet(ss, 'Title & meta flags', wb.titleMetaFlags, true)
  ccFormat(ss)
  ss.setActiveSheet(ss.getSheetByName('Summary'))
  SpreadsheetApp.getUi().alert('Imported ' + wb.counts.pages + ' pages, ' + wb.counts.issues + ' issues.')
}

function ccWriteSheet(ss, name, rows, headerRow) {
  var sheet = ss.getSheetByName(name) || ss.insertSheet(name)
  sheet.clear()
  if (rows.length === 0) return sheet
  var width = rows.reduce(function (m, r) { return Math.max(m, r.length) }, 0)
  var padded = rows.map(function (r) { while (r.length < width) r.push(''); return r })
  sheet.getRange(1, 1, padded.length, width).setValues(padded)
  if (headerRow) {
    sheet.getRange(1, 1, 1, width).setFontWeight('bold').setBackground('#0f172a').setFontColor('#ffffff')
    sheet.setFrozenRows(1)
    if (padded.length > 1) sheet.getRange(1, 1, padded.length, width).createFilter()
  } else {
    sheet.getRange(1, 1, 1, 1).setFontWeight('bold').setFontSize(14)
  }
  sheet.autoResizeColumns(1, Math.min(width, 12))
  return sheet
}

function ccFormat(ss) {
  var flags = ss.getSheetByName('Title & meta flags')
  if (flags && flags.getLastRow() > 1) {
    var rules = []
    ;[4, 7].forEach(function (col) {
      var range = flags.getRange(2, col, flags.getLastRow() - 1, 1)
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('missing').setBackground('#fecaca').setRanges([range]).build())
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('too long').setBackground('#fed7aa').setRanges([range]).build())
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('short').setBackground('#fef3c7').setRanges([range]).build())
      rules.push(SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo('ok').setBackground('#dcfce7').setRanges([range]).build())
    })
    flags.setConditionalFormatRules(rules)
  }
  var pages = ss.getSheetByName('Pages')
  if (pages && pages.getLastRow() > 1) {
    var status = pages.getRange(2, 3, pages.getLastRow() - 1, 1)
    pages.setConditionalFormatRules([
      SpreadsheetApp.newConditionalFormatRule().whenNumberGreaterThanOrEqualTo(400).setBackground('#fecaca').setRanges([status]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenNumberBetween(300, 399).setBackground('#fef3c7').setRanges([status]).build()
    ])
  }
}
