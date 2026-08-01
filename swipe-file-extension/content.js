// Save to My Formats — content script (v1.3.0)
// Anchors on each post's control-menu button, injects a "➕ My Formats" button,
// and on click opens a form: name + funnel + labels (toggle chips from the sheet's
// `labels` tab) + a free note. Captures the post itself too — author, full text, main
// image, and social counts — so the live library can render it exactly like the feed.

(function () {
  'use strict';

  console.log('%c[MyFormats] content script v1.6.0 loaded', 'color:#0a66c2;font-weight:bold');

  var CM_SEL = 'button[aria-label^="Open control menu for post"]';
  var labelCache = null;

  // ---------- post location + extraction ----------
  var URN_RE = /urn:li:(activity|share|ugcPost):\d+/;

  // True when this element itself carries a post URN in one of its attributes.
  function hasUrn(el) {
    if (!el || !el.attributes) return false;
    for (var i = 0; i < el.attributes.length; i++) {
      if (URN_RE.test(el.attributes[i].value || '')) return true;
    }
    return false;
  }

  // Find the element that IS the post. Walking up to a urn-bearing ancestor works on
  // every surface (main feed, single-post page, profile activity, search, notifications).
  // The old version looked for a FeedType_MAIN_FEED marker that only exists in the feed,
  // then blind-guessed six levels up everywhere else, which is why links went missing.
  function urnOf(el) {
    if (!el || !el.attributes) return null;
    for (var b = 0; b < el.attributes.length; b++) {
      var m = (el.attributes[b].value || '').match(URN_RE);
      if (m) return m[0];
    }
    return null;
  }

  // Check the wrapper itself before its children. On a reshare the outer post and the
  // quoted post both carry URNs, and the outer one is the post being saved.
  function scanUrn(w) {
    var own = urnOf(w);
    if (own) return own;
    var all = w.querySelectorAll('*');
    for (var a = 0; a < all.length; a++) {
      var m = urnOf(all[a]);
      if (m) return m;
    }
    return null;
  }
  function findWrapper(cm) {
    // The wrapper must be ONE post: it needs a real layout box (so the button can be
    // positioned) and a resolvable URN inside it (so the link is that post's).
    //
    // Two traps this avoids, both seen live on profile pages:
    //  - climbing into the <ul> that holds every post, so all 10 posts shared one
    //    wrapper and only the first ever got a button;
    //  - stopping on an <li> styled display:contents, which has no box at all, so the
    //    width check skipped every post.
    var node = cm, boxedBest = null;
    for (var i = 0; i < 20 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      if (node.querySelectorAll(CM_SEL).length > 1) break;   // would span several posts
      var r = node.getBoundingClientRect();
      var isBoxed = r.width > 0 && r.height > 0;
      if (isBoxed && !boxedBest) boxedBest = node;
      if (isBoxed && scanUrn(node)) return node;             // box AND link: the post
    }
    if (boxedBest) return boxedBest;
    var n = cm;
    for (var j = 0; j < 6 && n.parentElement; j++) n = n.parentElement;
    return n;
  }

  // Strip LinkedIn's social-proof header ("Jane Doe and 500 others reacted") that can lead the text.
  var SOCIAL_RE = /(\band\s[\d,]+\s+others\b|reacted$|(commented on|reposted|shared) this$|(likes|loves|celebrates|supports|finds) this( insightful)?$|^[\d,]+\s+(reactions?|comments?|reposts?)$|^(Promoted|Following|\+?\s*Follow)$)/i;
  function stripSocial(t) {
    if (!t) return t;
    var lines = t.split('\n'), i = 0;
    while (i < lines.length) {
      var ln = lines[i].replace(/^\s+|\s+$/g, '');
      if (ln === '' || (ln.length < 90 && SOCIAL_RE.test(ln))) { i++; continue; }
      break;
    }
    var out = lines.slice(i).join('\n').replace(/^\s+|\s+$/g, '');
    return out || t;
  }
  function longestText(w) {
    // Strip social-proof from EACH candidate first, so "Jane and 500 others reacted"
    // collapses to "" and can never win as the longest text (the real body wins instead).
    var texts = [].slice.call(w.querySelectorAll('span[dir="ltr"], p'))
      .map(function (e) { return stripSocial((e.innerText || '').trim()); })
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
        for (var i = 0; i < items.length; i++) { if (/copy link/i.test(items[i].textContent || '')) { copy = items[i]; break; } }
        if (!copy) { finish(''); return; }
        copy.click();
        var tries = 0;
        var iv = setInterval(function () {
          tries++;
          var link = readToast();
          if (link || tries >= 34) { clearInterval(iv); finish(link); }
        }, 150);
      }, 600);
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
        '<label>Post link' + (resolvedLink ? '' : ' &mdash; not detected, paste it') + '</label>' +
        '<input type="text" class="sf-link" value="' + attr(resolvedLink || '') + '"' +
          ' placeholder="https://www.linkedin.com/feed/update/urn:li:activity:..."' +
          (resolvedLink ? '' : ' style="border-color:#b8412d;background:#fff6f4"') + '>' +
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

      var linkField = overlay.querySelector('.sf-link');
      var link = (linkField && linkField.value.trim()) || resolvedLink || d.link || '';
      if (!link) {
        toast('\u26a0 No post link. Paste it before saving.');
        if (linkField) { linkField.focus(); linkField.style.borderColor = '#b8412d'; }
        saveBtn.disabled = false; saveBtn.textContent = 'Save';
        return;
      }

      var payload = {
        tab: 'marghi', formatType: name, funnel: stage, link: link,
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
  function schedule(delay) {
    if (pending) return;
    pending = setTimeout(function () { pending = null; inject(); }, delay || 400);
  }

  var mo = new MutationObserver(function () { schedule(400); });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  // LinkedIn is a single-page app: clicking into a profile, a post, or search never
  // reloads the page. The old code ran inject() once at load and then only on DOM
  // mutations. On a route change that single pass can land before layout finishes, the
  // width checks read 0, every post is skipped, mutations stop, and nothing runs again.
  // That is why the button vanished until a hard refresh.
  //
  // Fix: on every route change, retry on a short ladder so at least one attempt lands
  // after layout. A slow heartbeat then self-heals anything still missed.
  function burst() {
    [0, 250, 600, 1200, 2000, 3200].forEach(function (ms) { setTimeout(inject, ms); });
  }

  var lastUrl = location.href;
  function checkUrl() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    burst();
  }

  ['pushState', 'replaceState'].forEach(function (m) {
    var orig = history[m];
    if (typeof orig !== 'function') return;
    history[m] = function () {
      var r = orig.apply(this, arguments);
      try { checkUrl(); } catch (e) {}
      return r;
    };
  });
  window.addEventListener('popstate', checkUrl);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) burst(); });

  setInterval(checkUrl, 500);    // catches route changes the history hooks miss
  setInterval(function () { if (!document.hidden) inject(); }, 3000);   // heartbeat, idle in background tabs

  burst();
})();
