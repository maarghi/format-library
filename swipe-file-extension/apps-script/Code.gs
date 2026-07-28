/**
 * My Formats — Google Sheets endpoint + LIVE viewer (v2.0)
 *
 * Two files live in this Apps Script project:
 *   • Code.gs   — this file (API + server functions)
 *   • Viewer    — an HTML file (the Format Library page). Add it via: + → HTML → name it "Viewer".
 *
 * After ANY edit you MUST redeploy for the change to go live:
 *   Deploy → Manage deployments → (pencil / edit) → Version: New version → Deploy.
 *   (This keeps the same /exec URL.)
 *
 * Endpoints:
 *   GET  /exec                     → serves the live Format Library viewer (default)
 *   GET  /exec?action=labels       → { labels:[{label,category}] }   (extension)
 *   GET  /exec?action=people       → { people:[{name,gid}] }         (popup onboarding)
 *   GET  /exec?action=ensureTab&name=X → { ok, name, gid }           (popup onboarding)
 *   GET  /exec?action=normalize    → tidy the marghi tab schema
 *   POST /exec  {formatType,link,funnel,note,labels,author,text,image,reactions,comments,tab}
 *   POST /exec  {action:'addLabel'|'deleteLabel', ...}
 *
 * The viewer calls getViewerData() and getImageDataUri() directly via google.script.run
 * (no CORS), so saved posts render live and their images always resolve.
 */

var DEFAULT_TAB = 'marghi';
var LABELS_TAB = 'labels';
// Tabs that are NOT people (excluded from the person filter + viewer data).
// Tabs that are NOT people (excluded from the person filter + viewer data).
// NOTE: 'millie' is a person (teammate), so it is NOT excluded. 'virio' is the client tab.
var NON_PERSON = ['labels', 'virio', 'virio_millie', 'millies', 'sheet1', 'template', 'formats', 'readme'];
var HEADERS = ['Post Format Type', 'Link', 'Funnel', 'Note', 'Labels',
               'Author', 'Text', 'Image', 'Reactions', 'Comments', 'Saved At'];
var LABEL_HEADERS = ['Label', 'Category'];
var SEED_LABELS = [
  ['Arceus', 'Client'], ['Caspian', 'Client'], ['Crescendo', 'Client'],
  ['Futurify', 'Client'], ['Goody', 'Client'], ['Percents', 'Client'],
  ['Strong hook', 'Tag'], ['Great image', 'Tag']
];

// ---------- POST: save a format / manage labels ----------
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
      'Author': data.author || '',
      'Text': data.text || '',
      'Image': data.image || '',
      'Reactions': data.reactions || '',
      'Comments': data.comments || '',
      'Saved At': new Date()
    };
    sheet.appendRow(headers.map(function (h) { return (h in map) ? map[h] : ''; }));
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ---------- GET: API actions, else serve the viewer ----------
function doGet(e) {
  try {
    var action = e && e.parameter ? e.parameter.action : '';
    if (action === 'labels')    return json({ ok: true, labels: getLabels_() });
    if (action === 'people')    return json({ ok: true, people: getPeople_() });
    if (action === 'ensureTab') return json(ensureTab_(e.parameter.name));
    if (action === 'img')       return json({ ok: true, dataUri: getImageDataUri(e.parameter.u || '') });
    if (action === 'normalize') { normalizeSchema(); return json({ ok: true, msg: 'normalized' }); }
    if (action === 'clearTab')  return json(clearTab_(e.parameter.name));   // wipe one person's saved posts
    if (action === 'backfillImages') return json(backfillImages_(e.parameter.name)); // fill Image from og:image
    if (action === 'cleanup')   return json({ ok: true, msg: 'no-op in v2 — content columns are kept' });

    // Default: the live Format Library viewer.
    return serveViewer_();
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}
// SERVE_VIEWER_START (build_standalone.py replaces this whole function for the 1-file build)
function serveViewer_() {
  try {
    return HtmlService.createHtmlOutputFromFile('Viewer')
      .setTitle('Format Library')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (noFile) {
    return HtmlService.createHtmlOutput(
      '<div style="font:15px/1.6 -apple-system,Arial;max-width:520px;margin:60px auto;padding:0 20px;color:#1b1b18">' +
      '<h2>Almost there 🐸</h2><p>The <b>Code.gs</b> is deployed, but the <b>Viewer</b> HTML file is missing.</p>' +
      '<p>Easiest fix: paste <b>Code.standalone.gs</b> instead (it has the viewer built in) and redeploy.</p></div>'
    ).setTitle('Format Library — setup');
  }
}
// SERVE_VIEWER_END
// Clear a person's saved posts (keeps the header row). Used from the front end so you
// never touch the sheet — e.g. /exec?action=clearTab&name=Marghi
function clearTab_(name) {
  name = String(name || '').trim();
  if (!name) return { ok: false, error: 'no name' };
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sh) return { ok: false, error: 'no such tab' };
  var last = sh.getLastRow();
  if (last > 1) sh.deleteRows(2, last - 1);
  return { ok: true, cleared: name, removed: Math.max(0, last - 1) };
}
// Callable from the viewer (google.script.run) to clear the signed-in person's posts.
function clearMyPosts(name) { return clearTab_(name); }

// One-time: fill the Image column for saved posts that lack one, by reading each post's
// og:image from its LinkedIn link. Visit /exec?action=backfillImages (all people) or
// &name=Marghi. Capped per run (rerun to continue); results persist in the sheet.
function backfillImages_(only) {
  only = String(only || '').trim().toLowerCase();
  var CAP = 120, done = 0, filled = 0, ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  for (var s = 0; s < sheets.length && done < CAP; s++) {
    var sh = sheets[s], name = sh.getName();
    if (NON_PERSON.indexOf(name.toLowerCase()) > -1) continue;
    if (only && name.toLowerCase() !== only) continue;
    var last = sh.getLastRow(); if (last < 2) continue;
    var H = getHeaders_(sh), li = H.indexOf('Link'), im = H.indexOf('Image');
    if (li < 0) continue;
    if (im < 0) { ensureHeaders_(sh, HEADERS); H = getHeaders_(sh); im = H.indexOf('Image'); li = H.indexOf('Link'); }
    var rng = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
    for (var r = 0; r < rng.length && done < CAP; r++) {
      var link = String(rng[r][li] || '').trim();
      var cur = String(rng[r][im] || '').trim();
      if (!link || cur) continue;
      done++;
      var img = extractOgImage_(link);
      if (img) { sh.getRange(r + 2, im + 1).setValue(img); filled++; }
      Utilities.sleep(120);
    }
  }
  return { ok: true, scanned: done, filled: filled, note: done >= CAP ? 'hit per-run cap — run again to continue' : 'complete' };
}

// ---------- people (tabs) ----------
function getPeople_() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheets()
    .map(function (sh) { return { name: sh.getName(), gid: sh.getSheetId() }; })
    .filter(function (p) { return NON_PERSON.indexOf(String(p.name).toLowerCase()) === -1; });
}
function ensureTab_(name) {
  name = String(name || '').trim();
  if (!name) return { ok: false, error: 'empty name' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  ensureHeaders_(sh, HEADERS);
  return { ok: true, name: name, gid: sh.getSheetId() };
}

// ---------- viewer data (called from the page via google.script.run) ----------
// Live read of every person tab → format objects the viewer renders as LinkedIn posts.
function getViewerData() {
  var out = [];
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sh) {
    var person = sh.getName();
    if (NON_PERSON.indexOf(String(person).toLowerCase()) > -1) return;
    var last = sh.getLastRow(); if (last < 2) return;
    var vals = sh.getRange(1, 1, last, Math.max(sh.getLastColumn(), 1)).getValues();
    var H = vals[0].map(function (h) { return String(h).trim(); });
    function col(r, h) { var i = H.indexOf(h); return i > -1 ? r[i] : ''; }
    for (var i = 1; i < vals.length; i++) {
      var r = vals[i];
      var nm = String(col(r, 'Post Format Type') || '').trim();
      var lk = String(col(r, 'Link') || '').trim();
      if (!nm && !lk) continue;
      out.push({
        name: nm || 'Untitled format',
        library: 'saved',
        person: person,
        lane: String(col(r, 'Funnel') || '').toUpperCase(),
        note: String(col(r, 'Note') || ''),
        labels: String(col(r, 'Labels') || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean),
        author: String(col(r, 'Author') || ''),
        example_text: String(col(r, 'Text') || ''),
        image: String(col(r, 'Image') || ''),
        reactions: String(col(r, 'Reactions') || ''),
        comments: String(col(r, 'Comments') || ''),
        savedAt: (function () { try { var d = col(r, 'Saved At'); return d ? new Date(d).toISOString() : ''; } catch (e) { return ''; } })(),
        examples: lk ? [{ url: lk, meta: 'saved by ' + person }] : []
      });
    }
  });
  return out;
}

// Resolve a post's preview image straight from its LinkedIn link (og:image) and inline it.
// This is how posts saved BEFORE we captured images — and the bundled reference posts —
// still show a picture. Best-effort: LinkedIn may gate some URLs. Cached 6h (incl. misses).
function getPostImageData(url) {
  url = String(url || '');
  if (!/^https?:\/\//i.test(url)) return '';
  var cache = CacheService.getScriptCache();
  var key = 'pi_' + Utilities.base64EncodeWebSafe(url).slice(0, 200);
  var hit = cache.get(key);
  if (hit !== null) return hit;              // cached hit OR cached miss ('')
  var img = extractOgImage_(url);
  var data = img ? getImageDataUri(img) : '';
  cache.put(key, data, 21600);
  return data;
}
function extractOgImage_(url) {
  try {
    var resp = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true, followRedirects: true,
      headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' }
    });
    if (resp.getResponseCode() >= 400) return '';
    var html = resp.getContentText();
    var m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
         || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!m) return '';
    var img = m[1].replace(/&amp;/g, '&');
    // ignore LinkedIn's generic login/brand fallbacks
    if (/static\.licdn\.com\/(sc|aero)/i.test(img)) return '';
    return img;
  } catch (e) { return ''; }
}

// Called from the viewer (google.script.run) when you edit a saved post's labels in the
// drafting menu. Finds the row by its Link across person tabs and writes the Labels cell.
function setRowLabels(link, labelsCsv) {
  link = String(link || '').trim();
  if (!link) return { ok: false, error: 'no link' };
  var sheets = SpreadsheetApp.getActiveSpreadsheet().getSheets();
  for (var s = 0; s < sheets.length; s++) {
    var sh = sheets[s];
    if (NON_PERSON.indexOf(String(sh.getName()).toLowerCase()) > -1) continue;
    var last = sh.getLastRow(); if (last < 2) continue;
    var H = getHeaders_(sh);
    var li = H.indexOf('Link'); if (li < 0) continue;
    var la = H.indexOf('Labels');
    if (la < 0) { ensureHeaders_(sh, HEADERS); la = getHeaders_(sh).indexOf('Labels'); }
    var links = sh.getRange(2, li + 1, last - 1, 1).getValues();
    for (var r = 0; r < links.length; r++) {
      if (String(links[r][0]).trim() === link) {
        sh.getRange(r + 2, la + 1).setValue(String(labelsCsv || ''));
        return { ok: true };
      }
    }
  }
  return { ok: false, error: 'row not found' };
}

// ---------- label management (callable from the viewer via google.script.run) ----------
// Delete a label from the master list AND strip it from every saved post.
function deleteLabelEverywhere(label) {
  label = String(label || '').trim(); if (!label) return { ok: false };
  deleteLabel_({ label: label });                       // master list
  eachPersonTab_(function (sh, la, vals) {
    for (var r = 0; r < vals.length; r++) {
      var parts = String(vals[r][0] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var kept = parts.filter(function (p) { return p.toLowerCase() !== label.toLowerCase(); });
      if (kept.length !== parts.length) sh.getRange(r + 2, la + 1).setValue(kept.join(', '));
    }
  });
  return { ok: true };
}
// Rename a label in the master list AND in every saved post.
function renameLabel(oldL, newL) {
  oldL = String(oldL || '').trim(); newL = String(newL || '').trim();
  if (!oldL || !newL) return { ok: false };
  var sh0 = labelsSheet_(), last0 = sh0.getLastRow();
  if (last0 >= 2) {
    var vals0 = sh0.getRange(2, 1, last0 - 1, 1).getValues();
    for (var i = 0; i < vals0.length; i++) if (String(vals0[i][0]).trim().toLowerCase() === oldL.toLowerCase()) sh0.getRange(i + 2, 1).setValue(newL);
  }
  eachPersonTab_(function (sh, la, vals) {
    for (var r = 0; r < vals.length; r++) {
      var parts = String(vals[r][0] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var changed = false;
      var out = parts.map(function (p) { if (p.toLowerCase() === oldL.toLowerCase()) { changed = true; return newL; } return p; });
      if (changed) sh.getRange(r + 2, la + 1).setValue(out.join(', '));
    }
  });
  return { ok: true };
}
function eachPersonTab_(fn) {
  SpreadsheetApp.getActiveSpreadsheet().getSheets().forEach(function (sh) {
    if (NON_PERSON.indexOf(String(sh.getName()).toLowerCase()) > -1) return;
    var last = sh.getLastRow(); if (last < 2) return;
    var la = getHeaders_(sh).indexOf('Labels'); if (la < 0) return;
    fn(sh, la, sh.getRange(2, la + 1, last - 1, 1).getValues());
  });
}

// Server-side image fetch → data URI. Used by the viewer as a fallback when a LinkedIn
// image won't hotlink. Cached 6h (CacheService values cap at 100KB, so we guard).
function getImageDataUri(url) {
  url = String(url || '');
  if (!/^https?:\/\//i.test(url)) return '';
  var cache = CacheService.getScriptCache();
  var key = 'img_' + Utilities.base64EncodeWebSafe(url).slice(0, 200);
  var hit = cache.get(key); if (hit) return hit;
  try {
    var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (resp.getResponseCode() >= 400) return '';
    var blob = resp.getBlob();
    var dataUri = 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes());
    if (dataUri.length < 95000) cache.put(key, dataUri, 21600);
    return dataUri;
  } catch (e) { return ''; }
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
 * ONE-TIME tidy: rewrites the `marghi` tab into the exact HEADERS order, keeping all row
 * data (mapped by header name) and dropping blank rows. Run from the editor if the older
 * schema left columns out of order. Safe to run repeatedly.
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
