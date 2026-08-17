// Background service worker: bridges the content script to the Apps Script web app.
// The endpoint depends on the user's onboarding mode (chrome.storage.sync.mode):
//   • 'virio'    → the shared Virio library (SF_CONFIG.SHARED_ENDPOINT), unlocked only
//                  after the popup verifies the user's Google email against the allowlist.
//   • 'personal' → the user's OWN deployment URL, saved during guided setup.
//   • ''         → not set up yet; saves are refused with a "finish setup" message.
importScripts('config.js');

function cfg(cb) {
  chrome.storage.sync.get(['mode', 'endpoint', 'tabName'], function (c) {
    var mode = c.mode || '';
    var endpoint = (mode === 'virio') ? self.SF_CONFIG.SHARED_ENDPOINT : (c.endpoint || '');
    cb(endpoint, (c.tabName || ''), mode);
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
      if (!url) { sendResponse({ ok: false, error: 'Finish setup in the extension popup first.' }); return; }
      msg.payload.tab = tab;               // route to this person's own tab
      postJson(url, msg.payload, sendResponse);
    });
    return true;
  }

  // Validate a pasted personal endpoint by asking it for the people list (proves it's a
  // working deployment of this Apps Script before we save it as the user's library).
  if (msg.type === 'SF_CHECK_ENDPOINT') {
    var u = String(msg.url || '').trim();
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec/.test(u)) {
      sendResponse({ ok: false, error: 'That does not look like an Apps Script /exec URL.' }); return true;
    }
    fetch(u + (u.indexOf('?') > -1 ? '&' : '?') + 'action=people', { method: 'GET' })
      .then(function (r) { return r.json(); })
      .then(function (d) { sendResponse({ ok: !!(d && d.ok !== false), raw: d }); })
      .catch(function (e) { sendResponse({ ok: false, error: 'Could not reach it: ' + e }); });
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

// Re-inject into already-open LinkedIn tabs whenever the extension is installed,
// updated or reloaded. Without this the old content script keeps running with a dead
// context and every save hangs on "Saving..." until the user hard-refreshes.
chrome.runtime.onInstalled.addListener(function () {
  try {
    chrome.tabs.query({ url: 'https://www.linkedin.com/*' }, function (tabs) {
      (tabs || []).forEach(function (t) {
        if (!t.id) return;
        try {
          chrome.scripting.insertCSS({ target: { tabId: t.id }, files: ['content.css'] }, function () { void chrome.runtime.lastError; });
          chrome.scripting.executeScript({ target: { tabId: t.id }, files: ['content.js'] }, function () { void chrome.runtime.lastError; });
        } catch (e) {}
      });
    });
  } catch (e) {}
});

// LinkedIn is a single-page app: navigating into a profile or its posts happens via
// history navigation, not a page load, so the manifest's content_scripts never re-run.
// If the live instance has stood down (dead context after an extension reload, or
// superseded) it never revives itself, and the button stays missing until a manual
// refresh. tabs.onUpdated fires with changeInfo.url on these in-app navigations too, so
// we re-inject a fresh content script on every LinkedIn URL change. The content script's
// generation counter (window.__SF_GEN) makes the newest instance win and the rest stand
// down, so this can't produce duplicate buttons. CSS from the initial load persists.
// Re-inject ONLY when the path genuinely changes. LinkedIn fires tabs.onUpdated many
// times per navigation (tracking params, internal redirects); re-injecting on each one
// spawned a fresh instance every time, and each new instance superseded the last, wiped
// the buttons, and re-injected — a wipe/re-inject thrash that left the buttons blinking
// out. Keyed on pathname + a cooldown, a route change re-injects once; the live instance
// then self-heals any later same-path churn on its own.
var sfReinject = {};
var sfLastPath = {};
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (!changeInfo || !changeInfo.url) return;
  var m = /^https:\/\/www\.linkedin\.com(\/[^?#]*)/.exec(changeInfo.url);
  if (!m) return;
  var path = m[1];
  var prev = sfLastPath[tabId];
  if (prev && prev.path === path && (Date.now() - prev.time) < 4000) return;   // same page, just handled
  sfLastPath[tabId] = { path: path, time: Date.now() };
  clearTimeout(sfReinject[tabId]);
  sfReinject[tabId] = setTimeout(function () {
    delete sfReinject[tabId];
    try {
      chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content.js'] }, function () { void chrome.runtime.lastError; });
    } catch (e) {}
  }, 500);
});
chrome.tabs.onRemoved.addListener(function (tabId) {
  clearTimeout(sfReinject[tabId]); delete sfReinject[tabId]; delete sfLastPath[tabId];
});
