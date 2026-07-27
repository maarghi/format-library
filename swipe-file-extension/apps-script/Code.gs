/**
 * My Formats — Google Sheets endpoint (v1.1)
 * Paste into your sheet's Apps Script editor (Extensions → Apps Script), Save,
 * then Deploy. IMPORTANT: after updating this file you must redeploy —
 * Deploy → Manage deployments → (edit / pencil) → Version: New version → Deploy.
 *
 * Saves entries to the `marghi` tab: Post Format Type · Link · Funnel · Note · Labels · Saved At.
 * Maintains a `labels` tab (Label · Category) as the master label list, seeded with your clients.
 */

var DEFAULT_TAB = 'marghi';
var LABELS_TAB = 'labels';
var HEADERS = ['Post Format Type', 'Link', 'Funnel', 'Note', 'Labels', 'Saved At'];
var LABEL_HEADERS = ['Label', 'Category'];
var SEED_LABELS = [
  ['Arceus', 'Client'], ['Caspian', 'Client'], ['Crescendo', 'Client'],
  ['Futurify', 'Client'], ['Goody', 'Client'], ['Percents', 'Client'],
  ['Great image', 'Tag'], ['Strong hook', 'Tag']
];

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'addLabel') return addLabel_(data);
    if (data.action === 'deleteLabel') return deleteLabel_(data);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tabName = (data.tab || DEFAULT_TAB);
    // Auto-create a tab per person (teammates just set their name — no sheet access needed).
    var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
    ensureHeaders_(sheet, HEADERS);
    var headers = getHeaders_(sheet);
    var map = {
      'Post Format Type': data.formatType || '',
      'Link': data.link || '',
      'Funnel': String(data.funnel || '').toUpperCase(),
      'Note': data.note || '',
      'Labels': data.labels || '',
      'Saved At': new Date()
    };
    sheet.appendRow(headers.map(function (h) { return (h in map) ? map[h] : ''; }));
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : '';
    if (action === 'labels') return json({ ok: true, labels: getLabels_() });
    // Remote maintenance so the editor is never needed again after one deploy:
    if (action === 'normalize') { normalizeSchema(); return json({ ok: true, msg: 'normalized' }); }
    if (action === 'cleanup') { cleanUpSheet(); return json({ ok: true, msg: 'cleaned' }); }
    return json({ ok: true, msg: 'My Formats endpoint live' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---------- labels ----------
function labelsSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(LABELS_TAB);
  if (!sh) {
    sh = ss.insertSheet(LABELS_TAB);
    sh.getRange(1, 1, 1, LABEL_HEADERS.length).setValues([LABEL_HEADERS]);
    sh.getRange(2, 1, SEED_LABELS.length, 2).setValues(SEED_LABELS);
  }
  return sh;
}
function getLabels_() {
  var sh = labelsSheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 2).getValues()
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { label: String(r[0]).trim(), category: String(r[1] || 'Tag').trim() }; });
}
function addLabel_(data) {
  var name = (data.label || '').trim();
  if (!name) return json({ ok: false, error: 'empty label' });
  var sh = labelsSheet_();
  var exists = getLabels_().some(function (l) { return l.label.toLowerCase() === name.toLowerCase(); });
  if (!exists) sh.appendRow([name, data.category || 'Tag']);
  return json({ ok: true });
}
function deleteLabel_(data) {
  var name = (data.label || '').trim();
  if (!name) return json({ ok: false, error: 'empty label' });
  var sh = labelsSheet_();
  var last = sh.getLastRow();
  if (last < 2) return json({ ok: true });
  var vals = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    if (String(vals[i][0]).trim().toLowerCase() === name.toLowerCase()) sh.deleteRow(i + 2);
  }
  return json({ ok: true });
}

// ---------- helpers ----------
function ensureHeaders_(sheet, desired) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
  if (headers.join('') === '') { sheet.getRange(1, 1, 1, desired.length).setValues([desired]); return; }
  desired.forEach(function (h) {
    if (headers.indexOf(h) === -1) { headers.push(h); sheet.getRange(1, headers.length).setValue(h); }
  });
}
function getHeaders_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 1);
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
}
function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * ONE-TIME cleanup: run once from the Apps Script editor (select cleanUpSheet → Run).
 * Removes the old content columns we no longer save AND deletes junk rows
 * (rows with no format name and no link — e.g. stray rows created by the old code).
 */
function cleanUpSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DEFAULT_TAB);
  if (!sh) return;
  ['Author', 'Headline', 'Text', 'Image', 'Reactions', 'Comments', 'Reposts'].forEach(function (name) {
    var idx = getHeaders_(sh).indexOf(name);
    if (idx > -1) sh.deleteColumn(idx + 1);
  });
  var headers = getHeaders_(sh);
  var pf = headers.indexOf('Post Format Type'), lk = headers.indexOf('Link');
  for (var r = sh.getLastRow(); r >= 2; r--) {
    var name = pf > -1 ? String(sh.getRange(r, pf + 1).getValue()).trim() : '';
    var link = lk > -1 ? String(sh.getRange(r, lk + 1).getValue()).trim() : '';
    if (!name && !link) sh.deleteRow(r);
  }
}

/**
 * ONE-TIME tidy: rewrites the `marghi` tab into the exact intended column order
 * (Post Format Type · Link · Funnel · Note · Labels · Saved At), keeping all row
 * data (mapped by header name) and dropping blank rows. Run once from the editor.
 */
function normalizeSchema() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(DEFAULT_TAB);
  if (!sh) return;
  var vals = sh.getDataRange().getValues();
  if (!vals.length) return;
  var oldH = vals[0].map(function (h) { return String(h).trim(); });
  var out = [HEADERS.slice()];
  vals.slice(1).forEach(function (r) {
    var obj = {};
    oldH.forEach(function (h, i) { obj[h] = r[i]; });
    if (!String(obj['Post Format Type'] || '').trim() && !String(obj['Link'] || '').trim()) return; // drop junk
    out.push(HEADERS.map(function (h) { return (h in obj) ? obj[h] : ''; }));
  });
  sh.clearContents();
  sh.getRange(1, 1, out.length, HEADERS.length).setValues(out);
}
