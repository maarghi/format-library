// Save to My Formats — content script (v1.3.0)
// Anchors on each post's control-menu button, injects a "➕ My Formats" button,
// and on click opens a form: name + funnel + labels (toggle chips from the sheet's
// `labels` tab) + a free note. Captures the post itself too — author, full text, main
// image, and social counts — so the live library can render it exactly like the feed.

(function () {
  'use strict';

  console.log('%c[MyFormats] content script v1.3.0 loaded', 'color:#0a66c2;font-weight:bold');

  var CM_SEL = 'button[aria-label^="Open control menu for post"]';
  var labelCache = null;

  // ---------- post location + extraction ----------
  function findWrapper(cm) {
    var node = cm;
    for (var i = 0; i < 16 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      var ck = node.getAttribute && node.getAttribute('componentkey');
      if (ck && ck.indexOf('FeedType_MAIN_FEED') > -1) return node;
    }
    node = cm;
    for (var j = 0; j < 6 && node.parentElement; j++) node = node.parentElement;
    return node;
  }

  function longestText(w) {
    var texts = [].slice.call(w.querySelectorAll('span[dir="ltr"], p'))
      .map(function (e) { return (e.innerText || '').trim(); })
      .filter(function (t) { return t.length > 40; });
    texts.sort(function (a, b) { return b.length - a.length; });
    return texts[0] || '';
  }

  // The post's main image. Classes are hashed, so we score every <img>: keep LinkedIn
  // media, drop avatars/logos/tiny icons, and take the largest (boosting real feedshare
  // images). currentSrc picks the resolved srcset entry.
  function findImage(w) {
    var best = '', bestScore = 0;
    [].slice.call(w.querySelectorAll('img')).forEach(function (im) {
      var src = im.currentSrc || im.src || '';
      if (!/licdn\.com|media\./i.test(src)) return;
      if (/profile-displayphoto|profile-framedphoto|company-logo|EntityPhoto|\/aero-v1\/|ghost|static\.licdn/i.test(src)) return;
      var r = im.getBoundingClientRect();
      var area = (im.naturalWidth * im.naturalHeight) || (r.width * r.height);
      var isFeed = /feedshare|dms\/image|image\/v2|image\/upload|article-cover/i.test(src);
      if ((r.width < 120 || r.height < 120) && !isFeed) return;   // skip small chrome/avatars
      var score = area * (isFeed ? 3 : 1);
      if (score > bestScore) { bestScore = score; best = src; }
    });
    return best;
  }

  // Best-effort social proof — via aria-labels first (e.g. "1,234 reactions"), which
  // survive class hashing better than text nodes. Blank when not found; the viewer copes.
  function matchCount(w, word) {
    var re = new RegExp('([\\d,\\.]+)\\s*' + word, 'i');
    var nodes = [].slice.call(w.querySelectorAll('[aria-label]'));
    for (var i = 0; i < nodes.length; i++) {
      var m = (nodes[i].getAttribute('aria-label') || '').match(re);
      if (m) return m[1].replace(/[.,]$/, '');
    }
    var spans = [].slice.call(w.querySelectorAll('span,button'));
    for (var j = 0; j < spans.length; j++) {
      var t = (spans[j].innerText || '').match(re);
      if (t) return t[1].replace(/[.,]$/, '');
    }
    return '';
  }

  function scanUrn(w) {
    var all = w.querySelectorAll('*');
    for (var a = 0; a < all.length; a++) {
      var el = all[a];
      for (var b = 0; b < el.attributes.length; b++) {
        var m = (el.attributes[b].value || '').match(/urn:li:(activity|share|ugcPost):\d+/);
        if (m) return m[0];
      }
    }
    return null;
  }

  // Capture the post so the library can render it exactly like the LinkedIn feed:
  // link, full text, main image, and social counts. Read at ➕-click while the node is fresh.
  function extract(cm) {
    var w = findWrapper(cm);
    var urn = scanUrn(w);
    return {
      link: urn ? 'https://www.linkedin.com/feed/update/' + urn + '/' : '',
      text: longestText(w),
      image: findImage(w),
      reactions: matchCount(w, 'reactions?'),
      comments: matchCount(w, 'comments?')
    };
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function attr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

  function closeMenu() {
    document.body.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  // Reliable link when the URN isn't in the DOM: open "…" → Copy link to post →
  // read the canonical /posts/…-activity-<id> URL from the confirmation toast.
  function captureLinkViaMenu(cm, cb) {
    var done = false;
    function finish(link) { if (done) return; done = true; closeMenu(); cb(link || ''); }
    function readToast() {
      var a = document.querySelector(
        '[role="alert"] a[href*="/posts/"], [role="status"] a[href*="/posts/"], [aria-live] a[href*="/posts/"]'
      );
      return a ? a.href.split('?')[0] : null;
    }
    try {
      cm.click();
      setTimeout(function () {
        var items = [].slice.call(document.querySelectorAll('[role="menuitem"]'));
        var copy = null;
        for (var i = 0; i < items.length; i++) { if (/copy link to post/i.test(items[i].textContent || '')) { copy = items[i]; break; } }
        if (!copy) { finish(''); return; }
        copy.click();
        var tries = 0;
        var iv = setInterval(function () {
          tries++;
          var link = readToast();
          if (link || tries >= 16) { clearInterval(iv); finish(link); }
        }, 150);
      }, 420);
    } catch (e) { finish(''); }
  }

  // ---------- labels (fetched from the sheet's `labels` tab via the Apps Script) ----------
  function getLabels(cb) {
    if (labelCache) { cb(labelCache); return; }
    chrome.runtime.sendMessage({ type: 'SF_LABELS' }, function (res) {
      labelCache = (res && res.labels) || [];
      cb(labelCache);
    });
  }
  function addLabel(label, category, cb) {
    chrome.runtime.sendMessage({ type: 'SF_ADD_LABEL', label: label, category: category }, function (res) {
      if (!labelCache) labelCache = [];
      if (!labelCache.some(function (l) { return l.label.toLowerCase() === label.toLowerCase(); })) {
        labelCache.push({ label: label, category: category });
      }
      cb(res && res.ok !== false);
    });
  }

  // ---------- the save form ----------
  var overlay = null;

  function openForm(cm, author) {
    if (overlay) return;
    var d = extract(cm);
    // Resolve the post link NOW, while the control-menu reference is fresh. The feed
    // re-renders over time, so capturing at save-time can hit a stale/detached node and
    // silently fail. Capture up front, then show the form with the link already in hand.
    if (d.link) {
      showForm(cm, author, d, d.link);
    } else {
      toast('Reading post link…');
      captureLinkViaMenu(cm, function (link) { showForm(cm, author, d, link); });
    }
  }

  function showForm(cm, author, d, resolvedLink) {
    if (overlay) return;
    var firstLine = (d.text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || '';
    var nameGuess = firstLine.slice(0, 80);
    var stage = '';
    var selected = {};

    var frogUrl = '';
    try { frogUrl = chrome.runtime.getURL('icons/icon48.png'); } catch (e) {}
    overlay = document.createElement('div');
    overlay.className = 'sf-overlay';
    overlay.innerHTML =
      '<div class="sf-card" role="dialog" aria-label="Save to My Formats">' +
        '<div class="sf-head">' + (frogUrl ? '<img class="sf-frog" src="' + attr(frogUrl) + '" alt="">' : '') + '<h3>Save to My Formats</h3></div>' +
        '<div class="sf-rule"></div>' +
        '<p class="sf-sub">' + (author ? 'From ' + escapeHtml(author) : 'LinkedIn post') + ' → your Format Library</p>' +
        '<label>Format name</label>' +
        '<input type="text" class="sf-name" value="' + attr(nameGuess) + '" placeholder="Name this format">' +
        '<label>Funnel stage</label>' +
        '<div class="sf-stages">' +
          '<button type="button" data-s="TOFU">TOFU</button>' +
          '<button type="button" data-s="MOFU">MOFU</button>' +
          '<button type="button" data-s="BOFU">BOFU</button>' +
        '</div>' +
        '<label>Labels</label>' +
        '<div class="sf-labels" id="sfLabels"><span class="sf-loading">Loading labels…</span></div>' +
        '<div class="sf-newlabel">' +
          '<input type="text" class="sf-newlabel-input" placeholder="+ new label (e.g. Arceus)">' +
          '<select class="sf-newlabel-cat"><option value="Client">Client</option><option value="Tag">Tag</option></select>' +
          '<button type="button" class="sf-newlabel-add">Add</button>' +
        '</div>' +
        '<label>Note</label>' +
        '<textarea class="sf-note" placeholder="e.g. great one for Arceus — strong hook"></textarea>' +
        '<div class="sf-actions">' +
          '<button type="button" class="sf-cancel">Cancel</button>' +
          '<button type="button" class="sf-save" disabled>Save</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var saveBtn = overlay.querySelector('.sf-save');
    var labelsWrap = overlay.querySelector('#sfLabels');

    function renderChips(labels) {
      if (!labels || !labels.length) {
        labelsWrap.innerHTML = '<span class="sf-loading">No labels yet — add one below.</span>';
        return;
      }
      var groups = {};
      labels.forEach(function (l) { (groups[l.category || 'Tag'] = groups[l.category || 'Tag'] || []).push(l.label); });
      var html = '';
      Object.keys(groups).forEach(function (cat) {
        html += '<div class="sf-lgroup"><span class="sf-lcat">' + escapeHtml(cat) + '</span>';
        groups[cat].forEach(function (name) {
          html += '<span class="sf-chip' + (selected[name] ? ' on' : '') + '" data-l="' + attr(name) + '">' +
                    '<span class="sf-chip-name">' + escapeHtml(name) + '</span>' +
                    '<span class="sf-chip-x" data-del="' + attr(name) + '" title="Delete this label">&times;</span>' +
                  '</span>';
        });
        html += '</div>';
      });
      labelsWrap.innerHTML = html;
      // toggle selection (click the name)
      [].slice.call(labelsWrap.querySelectorAll('.sf-chip')).forEach(function (ch) {
        ch.querySelector('.sf-chip-name').addEventListener('click', function () {
          var n = ch.getAttribute('data-l');
          if (selected[n]) { delete selected[n]; ch.classList.remove('on'); }
          else { selected[n] = true; ch.classList.add('on'); }
        });
      });
      // delete label from the master list (click the ×)
      [].slice.call(labelsWrap.querySelectorAll('.sf-chip-x')).forEach(function (x) {
        x.addEventListener('click', function (e) {
          e.stopPropagation();
          var n = x.getAttribute('data-del');
          if (!window.confirm('Delete label “' + n + '” from your master list?')) return;
          chrome.runtime.sendMessage({ type: 'SF_DELETE_LABEL', label: n }, function () {});
          if (labelCache) labelCache = labelCache.filter(function (l) { return l.label.toLowerCase() !== n.toLowerCase(); });
          delete selected[n];
          renderChips(labelCache || []);
        });
      });
    }
    getLabels(renderChips);

    overlay.querySelector('.sf-newlabel-add').addEventListener('click', function () {
      var inp = overlay.querySelector('.sf-newlabel-input');
      var cat = overlay.querySelector('.sf-newlabel-cat').value;
      var name = inp.value.trim();
      if (!name) return;
      inp.value = '';
      selected[name] = true;
      addLabel(name, cat, function () { renderChips(labelCache || [{ label: name, category: cat }]); });
    });

    var stageBtns = overlay.querySelectorAll('.sf-stages button');
    [].slice.call(stageBtns).forEach(function (b) {
      b.addEventListener('click', function () {
        stage = b.getAttribute('data-s');
        [].slice.call(stageBtns).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        saveBtn.disabled = false;
      });
    });
    overlay.querySelector('.sf-cancel').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey);

    saveBtn.addEventListener('click', function () {
      if (!stage) return;
      var name = overlay.querySelector('.sf-name').value.trim() || nameGuess || 'Untitled format';
      var note = overlay.querySelector('.sf-note').value.trim();
      var labels = Object.keys(selected).join(', ');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      var payload = {
        tab: 'marghi', formatType: name, funnel: stage, link: resolvedLink || d.link || '',
        note: note, labels: labels,
        author: author || '', text: d.text || '', image: d.image || '',
        reactions: d.reactions || '', comments: d.comments || ''
      };
      chrome.runtime.sendMessage({ type: 'SF_SAVE', payload: payload }, function (res) {
        close();
        if (res && res.ok !== false) toast('✓ Saved to My Formats');
        else toast('⚠ ' + ((res && res.error) || 'Save failed — check the extension Options'));
      });
    });
  }

  function onKey(e) { if (e.key === 'Escape') close(); }
  function close() {
    if (overlay) { overlay.remove(); overlay = null; }
    document.removeEventListener('keydown', onKey);
  }

  function toast(m) {
    var t = document.createElement('div');
    t.className = 'sf-toast';
    t.textContent = m;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  // ---------- inject the button on each post ----------
  function inject() {
    [].slice.call(document.querySelectorAll(CM_SEL)).forEach(function (cm) {
      var wrapper = findWrapper(cm);
      if (!wrapper) return;
      var existing = wrapper.querySelector(':scope > .sf-btn');
      var cr = cm.getBoundingClientRect(), wr = wrapper.getBoundingClientRect();
      if (!cr.width || !wr.width) return;
      // Vertically center the button on the "…" menu (robust to a "liked by / commented on"
      // header pushing the actor row down), and sit just to its left.
      var top = (cr.top - wr.top + cr.height / 2) + 'px';
      var right = (wr.right - cr.left + 6) + 'px';
      if (existing) { existing.style.top = top; existing.style.right = right; existing.style.transform = 'translateY(-50%)'; return; }
      var author = (cm.getAttribute('aria-label') || '').replace(/^Open control menu for post by\s*/i, '').trim();
      var btn = document.createElement('button');
      btn.className = 'sf-btn';
      btn.type = 'button';
      btn.textContent = '➕ My Formats';
      btn.style.top = top;
      btn.style.right = right;
      btn.style.transform = 'translateY(-50%)';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        openForm(cm, author);
      });
      if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
      wrapper.appendChild(btn);
    });
  }

  var pending = null;
  var mo = new MutationObserver(function () {
    if (pending) return;
    pending = setTimeout(function () { pending = null; inject(); }, 400);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  inject();
})();
