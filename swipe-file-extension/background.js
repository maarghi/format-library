// Background service worker: bridges the content script to the Apps Script web app.
// The endpoint is baked in as a default so teammates never touch Apps Script — they
// just install the extension and set their name. Each person's saves go to their own tab.

const DEFAULT_ENDPOINT = "https://script.google.com/macros/s/AKfycbw1m4CqBomO9dkCeeR1-d7UVxm1pxd-HZXu_v9S9JnpGbP8t6mm30bfJy1wfuppWtm5/exec";

function cfg(cb) {
  chrome.storage.sync.get(['endpoint', 'tabName'], function (c) {
    cb((c.endpoint || DEFAULT_ENDPOINT), (c.tabName || 'marghi'));
  });
}

function postJson(url, body, sendResponse) {
  // text/plain avoids a CORS preflight; Apps Script still receives the JSON body.
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
    .then(function (r) { return r.json().catch(function () { return { ok: true }; }); })
    .then(sendResponse)
    .catch(function (e) { sendResponse({ ok: true, soft: String(e) }); }); // assume delivered; verify in sheet
}

function getJson(url, sendResponse, fallback) {
  fetch(url, { method: 'GET' })
    .then(function (r) { return r.json(); })
    .then(sendResponse)
    .catch(function (e) { sendResponse(fallback || { ok: false, error: String(e) }); });
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg) return;

  if (msg.type === 'SF_SAVE') {
    cfg(function (url, tab) {
      msg.payload.tab = tab;               // route to this person's own tab
      postJson(url, msg.payload, sendResponse);
    });
    return true;
  }

  if (msg.type === 'SF_ADD_LABEL') {
    cfg(function (url) { postJson(url, { action: 'addLabel', label: msg.label, category: msg.category }, sendResponse); });
    return true;
  }

  if (msg.type === 'SF_DELETE_LABEL') {
    cfg(function (url) { postJson(url, { action: 'deleteLabel', label: msg.label }, sendResponse); });
    return true;
  }

  // Popup onboarding: which people (tabs) already exist in the shared sheet.
  if (msg.type === 'SF_PEOPLE') {
    cfg(function (url) {
      getJson(url + (url.indexOf('?') > -1 ? '&' : '?') + 'action=people', sendResponse, { ok: true, people: [] });
    });
    return true;
  }

  // Popup onboarding: create (or find) this person's tab and get its gid for a deep link.
  if (msg.type === 'SF_ENSURE_TAB') {
    cfg(function (url) {
      var u = url + (url.indexOf('?') > -1 ? '&' : '?') + 'action=ensureTab&name=' + encodeURIComponent(msg.name || '');
      getJson(u, sendResponse, { ok: false });
    });
    return true;
  }

  // Popup needs the live endpoint (= the Format Library viewer URL) to build links.
  if (msg.type === 'SF_ENDPOINT') {
    cfg(function (url) { sendResponse({ ok: true, endpoint: url }); });
    return true;
  }

  if (msg.type === 'SF_LABELS') {
    cfg(function (url) {
      var u = url + (url.indexOf('?') > -1 ? '&' : '?') + 'action=labels';
      fetch(u, { method: 'GET' })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          var labels = (d && d.labels) || [];
          chrome.storage.local.set({ labelsCache: labels });
          sendResponse({ labels: labels });
        })
        .catch(function () { chrome.storage.local.get(['labelsCache'], function (c) { sendResponse({ labels: c.labelsCache || [] }); }); });
    });
    return true;
  }
});
