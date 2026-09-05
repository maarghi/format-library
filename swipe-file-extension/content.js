// Save to My Formats — content script (v1.8.4)
// Anchors on each post's control-menu button, injects a "➕ My Formats" button,
// and on click opens a form: name + funnel + labels (toggle chips from the sheet's
// `labels` tab) + a free note. Captures the post itself too — author, full text, main
// image, and social counts — so the live library can render it exactly like the feed.
//
// v1.8.4 hardens FIRST-save capture. Half-entries (link+funnel+name, empty Text/Image/
// Author) came from several independent bugs — not one. See extract / findPostCard /
// waitAndRefine / captureLinkViaMenu.

(function () {
  'use strict';

  // Captured up front (before LinkedIn's router can strip the hash): the Format Library's
  // "Fix" button opens a post at …#sf-fix so we auto-open the save form to re-capture it.
  var SF_FIX_REQUESTED = /sf-fix/i.test(location.hash || '');

  // Re-injection happens on in-app navigation AND on extension reload. The OLD design gave
  // every injection a new generation number and made older instances "stand down" (kill
  // their observer + heartbeat). Under LinkedIn's rapid multi-step SPA navigations those
  // instances raced and superseded each other until NONE were left alive — so nothing
  // re-injected the buttons and only a hard refresh brought them back.
  //
  // New rule: a re-injection LEAVES A HEALTHY INSTANCE ALONE. The first instance stays alive
  // for the whole SPA session; its MutationObserver re-injects buttons whenever LinkedIn
  // renders new posts (route changes included). Only a genuinely dead instance — one whose
  // extension context was invalidated by a reload — is torn down and replaced.
  try {
    if (window.__SF_ACTIVE && window.__SF_ACTIVE.alive && window.__SF_ACTIVE.alive()) return;
  } catch (e) {}
  try { if (window.__SF_ACTIVE && window.__SF_ACTIVE.standDown) window.__SF_ACTIVE.standDown(); } catch (e) {}

  console.log('%c[MyFormats] content script v1.8.4 loaded', 'color:#0a66c2;font-weight:bold');

  var timers = [];
  var mo = null;
  function alive() {
    try { return window.__SF_ACTIVE === self && !!(chrome.runtime && chrome.runtime.id); }
    catch (e) { return false; }
  }
  function standDown() {
    timers.forEach(clearInterval); timers = [];
    try { if (mo) mo.disconnect(); } catch (e) {}
  }
  var self = { alive: alive, standDown: standDown };
  window.__SF_ACTIVE = self;                              // claim ownership of the page
  // Clear any leftover buttons from a previous (now-replaced) instance.
  [].slice.call(document.querySelectorAll('.sf-btn')).forEach(function (b) { b.remove(); });

  // Widened from 'Open control menu for post' — some surfaces label it differently and
  // a post with no matching menu simply never gets a button. Comment menus also match
  // this prefix; isPostMenu() filters those so we don't treat a comment as the post.
  var CM_SEL = 'button[aria-label^="Open control menu"]';
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
    if (!w) return null;
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
    //
    // This stays the SMALL box (header-level is fine) — it's for button placement, not
    // text/image. Extraction uses findPostCard(), which climbs further on purpose.
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
    for (var j = 0; j < 6 && n && n.parentElement; j++) n = n.parentElement;
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
  // The author's name + headline ("CEO at C-Serv | Helping…") live in the actor block; it
  // must never win as the post text. The real post body is the commentary container.
  var ACTOR_SEL = '.update-components-actor, .feed-shared-actor, [data-view-name="feed-actor"]';
  // Legacy class names PLUS May-2026 SDUI permalink markers. LinkedIn's post-detail rewrite
  // dropped .update-components-text on /posts/… and /feed/update/… in favor of
  // [data-testid="expandable-text-box"] and [componentkey^="feed-commentary_"]. Without
  // those, permalink + Fix-flow extracts returned empty text even when the body was on screen.
  var BODY_SEL = [
    '.update-components-text',
    '.feed-shared-inline-show-more-text',
    '.update-components-update-v2__commentary',
    '.feed-shared-update-v2__description',
    '.feed-shared-text',
    '.update-components-commentary',
    '.feed-shared-update-v2__description-wrapper',
    '[data-testid="expandable-text-box"]',
    '[data-test-id="expandable-text-box"]',
    '[componentkey^="feed-commentary_"]'
  ].join(', ');
  // On a post's detail page (which the "Fix" flow opens) the comments are in the DOM too,
  // and a long comment can beat a short caption. Never treat comment text as the post body.
  var COMMENT_SEL = [
    '.comments-comment-item',
    '.comments-comment-entity',
    '.comments-comments-list',
    '.comments-comment-texteditor',
    '.comments-comment-social-bar',
    '.feed-shared-update-v2__comments-container',
    '[data-view-name*="comment"]',
    '[componentkey^="replaceableComment_"]'
  ].join(', ');
  // Visual post card — innermost match that actually holds commentary/media. Do NOT put
  // [data-urn]/[data-id] here: those often sit on a header-level box that does not contain
  // the body (the v1.6.8 postRoot bug). Feed wrappers also use data-id instead of data-urn.
  var FULL_CARD_SEL = [
    '.feed-shared-update-v2',
    'article.feed-shared-update-v2',
    '[data-view-name="feed-full-update"]',
    '[data-view-name="feed-single-update"]',
    '[componentkey$="FeedType_FEED_DETAIL"]',
    '[data-sdui-screen="com.linkedin.sdui.flagshipnav.feed.UpdateDetail"]',
    '.occludable-update'
  ].join(', ');
  var MEDIA_SEL = [
    '.update-components-image',
    '.feed-shared-image',
    '.update-components-linkedin-video',
    '.feed-shared-linkedin-video',
    '.feed-shared-carousel',
    '.update-components-carousel',
    '.ivm-image-view-model',
    '.ivm-view-attr__img-wrapper',
    '.update-components-article-summary',
    '.update-components-article',
    'video',
    '[data-test-id*="image"]'
  ].join(', ');
  function inActor(e) { try { return !!(e.closest && e.closest(ACTOR_SEL)); } catch (x) { return false; } }
  function inComments(e) { try { return !!(e.closest && e.closest(COMMENT_SEL)); } catch (x) { return false; } }

  // Comment control menus share the "Open control menu…" prefix. Treating them as post
  // menus made postRoot stop at the header on permalinks (card contains post menu +
  // comment menus → "climbed into a second post") — author+link saved, text/image blank.
  function isPostMenu(cm) {
    if (!cm || !cm.getAttribute) return false;
    var lab = cm.getAttribute('aria-label') || '';
    if (!/^Open control menu/i.test(lab)) return false;
    if (/comment|message|conversation/i.test(lab)) return false;
    try { if (inComments(cm)) return false; } catch (e) {}
    return true;
  }

  // True when climbing `node` would span a *sibling* feed item. Nested quoted-post menus
  // (reshare) must NOT trip this — that was another empty-body path: the outer card has
  // two CMs, we stopped before it, and longestText/findImage ran on the header only.
  function spansSecondPost(node, cm) {
    if (!node || !cm) return false;
    var menus;
    try { menus = [].slice.call(node.querySelectorAll(CM_SEL)).filter(isPostMenu); }
    catch (e) { return false; }
    var ourCard = null;
    try { ourCard = cm.closest && cm.closest(FULL_CARD_SEL); } catch (e) {}
    for (var i = 0; i < menus.length; i++) {
      if (menus[i] === cm) continue;
      var theirCard = null;
      try { theirCard = menus[i].closest && menus[i].closest(FULL_CARD_SEL); } catch (e) {}
      if (ourCard && theirCard && ourCard !== theirCard && ourCard.contains(theirCard)) continue;
      return true;
    }
    return false;
  }

  function longestText(w) {
    if (!w) return '';
    // 1) Prefer LinkedIn's real post-commentary container (the hook + body); never the actor,
    //    never a comment.
    var body = [].slice.call(w.querySelectorAll(BODY_SEL))
      .filter(function (e) { return !inActor(e) && !inComments(e); })
      .map(function (e) { return stripSocial((e.innerText || e.textContent || '').trim()); })
      .filter(function (t) { return t.length > 0; });
    body.sort(function (a, b) { return b.length - a.length; });
    var long = body.filter(function (t) { return t.length > 20; });
    if (long[0]) return long[0];
    // Short hooks still count. The old >20 cutoff dropped one-line formats and left Text blank.
    if (body[0]) return body[0];
    // 2) Fallback: longest span/p, but skip the author/header block and the comments, and
    //    strip social-proof so "Jane and 500 others reacted" can never win.
    var texts = [].slice.call(w.querySelectorAll('span[dir="ltr"], p'))
      .filter(function (e) { return !inActor(e) && !inComments(e); })
      .map(function (e) { return stripSocial((e.innerText || '').trim()); })
      .filter(function (t) { return t.length > 40; });
    texts.sort(function (a, b) { return b.length - a.length; });
    return texts[0] || '';
  }

  function isLicdn(u) {
    return !!u && /licdn\.com|media\./i.test(String(u)) &&
      !/profile-displayphoto|profile-framedphoto|company-logo|EntityPhoto|\/aero-v1\/|ghost|static\.licdn/i.test(String(u));
  }

  // srcset lists small→large. Taking the first licdn URL saved a shrink_20 placeholder.
  // Prefer the widest candidate so the library gets a usable feed image.
  function pickSrcset(srcset) {
    var bestU = '', bestW = -1;
    String(srcset || '').split(',').forEach(function (part) {
      var bits = part.trim().split(/\s+/);
      var u = bits[0] || '';
      if (!isLicdn(u)) return;
      var w = 0;
      if (bits[1] && /w$/i.test(bits[1])) w = parseInt(bits[1], 10) || 0;
      else if (bits[1] && /x$/i.test(bits[1])) w = Math.round((parseFloat(bits[1]) || 0) * 400);
      else w = 1;
      if (w >= bestW) { bestW = w; bestU = u; }
    });
    return bestU;
  }

  function imgSrc(im) {
    if (!im) return '';
    var cands = [];
    function add(u) {
      if (!u) return;
      u = String(u).trim().replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
      if (isLicdn(u)) cands.push(u);
    }
    add(im.currentSrc);
    add(im.src);
    // LinkedIn lazy-loads: src stays empty until near the viewport; the real URL is in
    // data-delayed-url / srcset. Reading only currentSrc/src is why image-posts saved blank.
    try {
      add(im.getAttribute('data-delayed-url'));
      add(im.getAttribute('data-src'));
      add(im.getAttribute('data-ghost-url'));
      add(pickSrcset(im.getAttribute('srcset')));
    } catch (e) {}
    var feed = '';
    for (var i = 0; i < cands.length; i++) {
      if (/feedshare|dms\/image|image\/v2|image\/upload|article-cover/i.test(cands[i])) feed = cands[i];
    }
    return feed || cands[cands.length - 1] || cands[0] || '';
  }

  // The post's main image. Classes are hashed, so we score every <img>: keep LinkedIn
  // media, drop avatars/logos/tiny icons, and take the largest (boosting real feedshare
  // images). Also video posters + CSS background-image (used on some carousels / articles).
  function findImage(w) {
    if (!w) return '';
    var best = '', bestScore = 0;
    function consider(src, el) {
      if (!isLicdn(src)) return;
      var r = { width: 0, height: 0 };
      try { if (el && el.getBoundingClientRect) r = el.getBoundingClientRect(); } catch (e) {}
      var nw = (el && el.naturalWidth) || 0;
      var nh = (el && el.naturalHeight) || 0;
      var area = (nw * nh) || (r.width * r.height);
      var isFeed = /feedshare|dms\/image|image\/v2|image\/upload|article-cover/i.test(src);
      if ((r.width < 120 || r.height < 120) && !isFeed && area < 14400) return;
      var score = area * (isFeed ? 3 : 1);
      if (!score && isFeed) score = 1;   // feedshare present but not decoded yet — still capture
      if (score > bestScore) { bestScore = score; best = src; }
    }
    [].slice.call(w.querySelectorAll('img')).forEach(function (im) {
      if (inComments(im) || inActor(im)) return;   // comments + actor avatars
      consider(imgSrc(im), im);
    });
    [].slice.call(w.querySelectorAll('video')).forEach(function (v) {
      if (inComments(v)) return;
      consider((v.getAttribute && v.getAttribute('poster')) || v.poster || '', v);
    });
    [].slice.call(w.querySelectorAll('source[srcset]')).forEach(function (s) {
      if (inComments(s)) return;
      consider(pickSrcset(s.getAttribute('srcset')), s);
    });
    [].slice.call(w.querySelectorAll('[style*="background-image"]')).forEach(function (el) {
      if (inComments(el) || inActor(el)) return;
      var m = ((el.getAttribute && el.getAttribute('style')) || '').match(/url\(["']?(https?:\/\/[^"')]+)["']?\)/i);
      if (m) consider(m[1], el);
    });
    return best;
  }

  function hasMediaHint(root) {
    if (!root) return false;
    try {
      var hits = root.querySelectorAll(MEDIA_SEL);
      for (var i = 0; i < hits.length; i++) {
        if (!inComments(hits[i]) && !inActor(hits[i])) return true;
      }
    } catch (e) {}
    var imgs = root.querySelectorAll('img');
    for (var j = 0; j < imgs.length; j++) {
      if (inComments(imgs[j]) || inActor(imgs[j])) continue;
      if (imgSrc(imgs[j])) return true;
    }
    return false;
  }

  function commentaryLooksPending(root) {
    if (!root) return true;
    var boxes = [];
    try { boxes = root.querySelectorAll(BODY_SEL); } catch (e) { return true; }
    var sawText = false, sawEmpty = false;
    for (var i = 0; i < boxes.length; i++) {
      if (inActor(boxes[i]) || inComments(boxes[i])) continue;
      var t = stripSocial((boxes[i].innerText || boxes[i].textContent || '').trim());
      if (t.length > 0) sawText = true;
      else sawEmpty = true;
    }
    if (sawText) return false;
    return sawEmpty || boxes.length === 0;
  }

  function cardHasContent(node) {
    if (!node) return false;
    var boxes = [];
    try { boxes = node.querySelectorAll(BODY_SEL); } catch (e) {}
    for (var i = 0; i < boxes.length; i++) {
      if (!inActor(boxes[i]) && !inComments(boxes[i])) return true;
    }
    return hasMediaHint(node);
  }

  // Best-effort social proof — via aria-labels first (e.g. "1,234 reactions"), which
  // survive class hashing better than text nodes. Blank when not found; the viewer copes.
  function matchCount(w, word) {
    if (!w) return '';
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

  var AUTHOR_BLOCKLIST = /^(premium|following|connect|follow|message|pending|linkedin)$/i;
  function cleanAuthor(t) {
    t = String(t || '').trim().split('\n')[0].trim();
    t = t.replace(/\s*[•·].*$/, '').replace(/\s+Premium\s*$/i, '').trim();
    if (!t || t.length > 80 || AUTHOR_BLOCKLIST.test(t)) return '';
    return t;
  }

  function authorFromMenu(cm) {
    var raw = (cm && cm.getAttribute && cm.getAttribute('aria-label')) || '';
    var m = raw.match(/post by\s+(.+?)\s*$/i);
    return m ? cleanAuthor(m[1]) : '';
  }

  // Read the actor name from the card. Never the headline, never the first /in/ link on
  // the page (permalinks have a Premium upsell pointing at the *current* user).
  function authorFromDom(root) {
    if (!root) return '';
    var actor = null;
    var actors = [];
    try { actors = [].slice.call(root.querySelectorAll(ACTOR_SEL)); } catch (e) {}
    for (var i = 0; i < actors.length; i++) {
      if (!inComments(actors[i])) { actor = actors[i]; break; }
    }
    var scope = actor || root;
    var sels = [
      '.update-components-actor__title span[aria-hidden="true"]',
      '.update-components-actor__name span[aria-hidden="true"]',
      '.update-components-actor__title',
      '.update-components-actor__name',
      '.feed-shared-actor__name'
    ];
    for (var s = 0; s < sels.length; s++) {
      var el = null;
      try { el = (actor || scope).querySelector(sels[s]); } catch (e) {}
      var t = cleanAuthor(el && (el.innerText || el.textContent));
      if (t) return t;
    }
    if (actor) {
      var a = null;
      try { a = actor.querySelector('a[href*="/in/"] span[aria-hidden="true"], a[href*="/company/"] span[aria-hidden="true"]'); } catch (e) {}
      var t2 = cleanAuthor(a && (a.innerText || a.textContent));
      if (t2) return t2;
    }
    return '';
  }

  function postIdFromString(s) {
    var m = String(s || '').match(/(\d{15,})/);
    return m ? m[1] : '';
  }

  function isPermalinkPath(path) {
    path = path || (location.pathname || '');
    return /\/feed\/update\//.test(path) || /\/posts\//.test(path) || /\/pulse\//.test(path);
  }

  // On a permalink (activity OR ugcPost) the URL itself is the post. Don't use this on
  // /feed/ — that would stamp every save with the feed URL.
  function permalinkLink() {
    if (!isPermalinkPath()) return '';
    var href = location.href || '';
    var urn = href.match(URN_RE);
    if (urn) return 'https://www.linkedin.com/feed/update/' + urn[0] + '/';
    var slug = href.match(/\/posts\/[^?#]+/i);
    if (slug) return 'https://www.linkedin.com' + slug[0].replace(/\/$/, '');
    return '';
  }

  // Capture the post so the library can render it exactly like the LinkedIn feed:
  // link, full text, main image, and social counts. Read at ➕-click while the node is fresh.
  // findWrapper returns the smallest boxed+URN ancestor — great for placing the button and
  // resolving the link, but on many layouts the URN sits on a header-level box that does NOT
  // contain the post body or image (they're siblings lower in the post). postRoot climbs to
  // the WIDEST single-post box (stops before it would span a second post) so body/image/counts
  // are in scope. That's why some saves came in with author+link but empty text+image.
  function postRoot(cm) {
    var node = cm, best = null;
    for (var i = 0; i < 24 && node && node.parentElement; i++) {
      node = node.parentElement;
      if (spansSecondPost(node, cm)) break;   // sibling post — too far (quoted menus ignored)
      var r = node.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) best = node;           // keep the widest single-post box
    }
    return best || cm;
  }

  // Prefer a semantic card (feed-shared-update-v2 / SDUI detail) that actually contains
  // commentary or media. Fall back to postRoot's widest-box walk.
  function findPostCard(cm) {
    if (!cm) return cm;
    var node = cm;
    var fulls = [];
    var widest = null;
    for (var i = 0; i < 24 && node && node.parentElement; i++) {
      node = node.parentElement;
      if (spansSecondPost(node, cm)) break;
      var r = node.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      widest = node;
      try { if (node.matches && node.matches(FULL_CARD_SEL)) fulls.push(node); } catch (e) {}
    }
    for (var f = 0; f < fulls.length; f++) {
      if (cardHasContent(fulls[f])) return fulls[f];
    }
    if (fulls[0]) return fulls[0];
    return widest || postRoot(cm) || cm;
  }

  function extract(cm) {
    cm = reliveCm(cm);
    var w = findWrapper(cm);
    var root = findPostCard(cm);
    var urn = scanUrn(root) || scanUrn(w);
    var author = authorFromDom(root) || authorFromDom(w) || authorFromMenu(cm);
    return {
      link: urn ? 'https://www.linkedin.com/feed/update/' + urn + '/' : permalinkLink(),
      text: longestText(root) || longestText(w),
      image: findImage(root) || findImage(w),
      author: author,
      reactions: matchCount(root, 'reactions?') || matchCount(w, 'reactions?'),
      comments: matchCount(root, 'comments?') || matchCount(w, 'comments?')
    };
  }

  // Copy-link / SPA re-render can detach the original … button. Re-find the live menu
  // by activity id (works for activity, share, AND ugcPost URLs).
  function reliveCm(cm, hint) {
    try {
      if (cm && cm.isConnected && isPostMenu(cm)) return cm;
    } catch (e) {}
    var pid = postIdFromString(hint || '') ||
      postIdFromString((cm && scanUrn(cm)) || '') ||
      (isPermalinkPath() ? postIdFromString(location.href) : '');
    var menus = [];
    try { menus = [].slice.call(document.querySelectorAll(CM_SEL)).filter(isPostMenu); } catch (e) {}
    if (pid) {
      for (var i = 0; i < menus.length; i++) {
        var u = scanUrn(findPostCard(menus[i])) || scanUrn(findWrapper(menus[i]));
        if (u && u.indexOf(pid) !== -1) return menus[i];
      }
    }
    return menus[0] || cm;
  }

  function mergeCapture(a, b) {
    a = a || {}; b = b || {};
    return {
      link: b.link || a.link || '',
      text: b.text || a.text || '',
      image: b.image || a.image || '',
      author: b.author || a.author || '',
      reactions: b.reactions || a.reactions || '',
      comments: b.comments || a.comments || ''
    };
  }

  function captureScore(d) {
    d = d || {};
    return (d.text ? 2 : 0) + (d.image ? 2 : 0) + (d.author ? 1 : 0) + (d.link ? 1 : 0);
  }

  function captureGaps(d, root) {
    d = d || {};
    var missing = [];
    if (!String(d.author || '').trim()) missing.push('author');
    if (!String(d.text || '').trim()) missing.push('text');
    // Image is only a gap when the card looks like it HAS media. Text-only posts are complete.
    if (!String(d.image || '').trim() && hasMediaHint(root)) missing.push('image');
    return missing;
  }

  function isNearEmpty(d) {
    d = d || {};
    return !String(d.text || '').trim() && !String(d.image || '').trim();
  }

  // Expand the post's own "see more" (never comments) so we save the full body, not the fold.
  function expandSeeMore(cm) {
    var root = findPostCard(cm);
    if (!root) return;
    var nodes = [];
    try { nodes = root.querySelectorAll('button, span[role="button"], [aria-expanded="false"]'); } catch (e) { return; }
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (inComments(n) || inActor(n)) continue;
      var t = (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
      if (/^(see more|see more…|…more|\.\.\.more|more)$/i.test(t) || (/see more/i.test(t) && t.length < 24)) {
        try { n.click(); } catch (e) {}
      }
    }
  }

  // Commentary and licdn images often arrive a tick after the … menu (lazy img, SPA).
  // Retry briefly before giving up so first-save isn't a silent half-entry.
  function waitAndRefine(cm, cb, opts) {
    var started = Date.now();
    var maxMs = (opts && opts.maxMs) || 2000;
    var best = extract(cm);
    function tick() {
      if (!alive()) { cb(best); return; }
      cm = reliveCm(cm, best && best.link);
      expandSeeMore(cm);
      var d = extract(cm);
      if (captureScore(d) >= captureScore(best)) best = d;
      if (overlay && overlay._sfApply) overlay._sfApply(best, best.link, true);
      var root = findPostCard(cm);
      var gaps = captureGaps(best, root);
      var pending = gaps.indexOf('image') !== -1 ||
        (gaps.indexOf('text') !== -1 && commentaryLooksPending(root));
      if (!pending || Date.now() - started >= maxMs) {
        if (overlay && overlay._sfApply) overlay._sfApply(best, best.link, false);
        cb(best);
        return;
      }
      setTimeout(tick, 160);
    }
    setTimeout(tick, 120);
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
  // Caller MUST re-extract after this — the menu dance re-renders the card and the
  // snapshot taken beforehand is often still empty (the link-only half-entry path).
  function captureLinkViaMenu(cm, cb) {
    var done = false;
    function finish(link) { if (done) return; done = true; closeMenu(); cb(link || ''); }
    // every post-link toast currently on screen
    function toastLinks() {
      return [].slice.call(document.querySelectorAll(
        '[role="alert"] a[href*="/posts/"], [role="status"] a[href*="/posts/"], [aria-live] a[href*="/posts/"]'
      )).map(function (a) { return a.href.split('?')[0]; });
    }
    function findCopyItem() {
      var items = [].slice.call(document.querySelectorAll('[role="menuitem"]'));
      for (var i = 0; i < items.length; i++) { if (/copy link/i.test(items[i].textContent || '')) return items[i]; }
      return null;
    }
    try {
      cm.click();
      // Poll for the "Copy link to post" item — the menu can render slowly (portal).
      var mtries = 0;
      var mIv = setInterval(function () {
        mtries++;
        var copy = findCopyItem();
        if (!copy) { if (mtries >= 12) { clearInterval(mIv); finish(''); } return; }  // ~1.8s → give up (no copy item)
        clearInterval(mIv);
        // Snapshot toasts ALREADY on screen so a stale one from a previous copy can't win.
        var seen = {}; toastLinks().forEach(function (h) { seen[h] = 1; });
        copy.click();
        var tries = 0;
        var tIv = setInterval(function () {
          tries++;
          var links = toastLinks(), fresh = null;
          for (var i = 0; i < links.length; i++) { if (!seen[links[i]]) { fresh = links[i]; break; } }  // only a NEW toast
          if (fresh) { clearInterval(tIv); finish(fresh); }
          else if (tries >= 40) { clearInterval(tIv); finish(''); }                                     // ~6s → give up
        }, 150);
      }, 150);
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

  function renderCaptureStatus(el, d, root, refining) {
    if (!el) return;
    var gaps = captureGaps(d, root);
    var near = isNearEmpty(d);
    el.className = 'sf-capture' + ((near || gaps.length) ? ' warn' : ' ok');
    if (refining && (gaps.length || near)) {
      el.textContent = 'Still reading the post' + (gaps.length ? ' (' + gaps.join(', ') + ')' : '') + '…';
      return;
    }
    if (near) {
      el.textContent = 'Missing post text and image. Wait a moment (or open the permalink) before saving — a near-empty save will ask you to confirm.';
      return;
    }
    if (gaps.length) {
      el.textContent = 'Captured with gaps: ' + gaps.join(', ') + '. Text-only posts are fine; if you can see the missing field on LinkedIn, wait a beat before saving.';
      return;
    }
    el.textContent = d.image
      ? 'Captured author, text, and image.'
      : 'Captured author and text (no image on this post).';
  }

  function openForm(cm, authorHint) {
    if (overlay) return;
    cm = reliveCm(cm);
    expandSeeMore(cm);
    var d = extract(cm);
    d.author = d.author || authorHint || '';

    function present(link) {
      if (overlay) return;
      d.link = link || d.link || '';
      showForm(cm, d.author, d, d.link);
      // Keep trying while the form is open — lazy images / SDUI commentary often land
      // in the next 1–2s. Updates the status line; does not overwrite a typed name.
      waitAndRefine(cm, function (next) {
        if (overlay && overlay._sfApply) overlay._sfApply(next, next.link, false);
      }, { maxMs: 2200 });
    }

    if (d.link) {
      present(d.link);
      return;
    }
    // Link-only path: URN missing from the feed DOM. Do NOT show the form with the
    // pre-menu snapshot — that snapshot is why we saved link+funnel and nothing else.
    toast('Reading post link…');
    captureLinkViaMenu(cm, function (link) {
      cm = reliveCm(cm, link);
      expandSeeMore(cm);
      var again = extract(cm);
      d = mergeCapture(d, again);
      d.author = d.author || authorFromMenu(cm) || authorHint || '';
      present(link || d.link || permalinkLink());
    });
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
        '<div class="sf-capture" id="sfCapture"></div>' +
        '<div class="sf-actions">' +
          '<button type="button" class="sf-cancel">Cancel</button>' +
          '<button type="button" class="sf-save" disabled>Save</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(overlay);

    var saveBtn = overlay.querySelector('.sf-save');
    var labelsWrap = overlay.querySelector('#sfLabels');
    var sub = overlay.querySelector('.sf-sub');
    var linkInput = overlay.querySelector('.sf-link');
    var nameInput = overlay.querySelector('.sf-name');
    var captureEl = overlay.querySelector('#sfCapture');
    var nameTouched = false;
    nameInput.addEventListener('input', function () { nameTouched = true; });

    function applyCapture(next, link, refining) {
      d = mergeCapture(d, next);
      if (link) { d.link = link; resolvedLink = link; }
      if (d.author) author = d.author;
      if (sub) sub.textContent = (author ? 'From ' + author : 'LinkedIn post') + ' → your Format Library';
      if (linkInput && d.link && !String(linkInput.value || '').trim()) {
        linkInput.value = d.link;
        linkInput.style.borderColor = '';
        linkInput.style.background = '';
      }
      if (!nameTouched && d.text) {
        var guess = (d.text || '').split('\n').map(function (s) { return s.trim(); }).filter(Boolean)[0] || '';
        guess = guess.slice(0, 80);
        if (!nameInput.value || nameInput.value === nameGuess) {
          nameGuess = guess;
          nameInput.value = guess;
        }
      }
      renderCaptureStatus(captureEl, d, findPostCard(cm), refining);
    }
    overlay._sfApply = applyCapture;
    renderCaptureStatus(captureEl, d, findPostCard(cm), isNearEmpty(d) || captureGaps(d, findPostCard(cm)).length > 0);

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

      // A content script left over from an extension reload can never reach the service
      // worker: sendMessage's callback simply never fires and the button sits on
      // "Saving..." forever. chrome.runtime.id is undefined once the context is dead.
      if (!chrome.runtime || !chrome.runtime.id) {
        toast('\u26a0 Extension was reloaded. Refresh this page (Cmd+Shift+R), then save.');
        saveBtn.disabled = false; saveBtn.textContent = 'Save';
        return;
      }

      var linkField = overlay.querySelector('.sf-link');
      var link = (linkField && linkField.value.trim()) || resolvedLink || d.link || '';
      if (!link) {
        toast('\u26a0 No post link. Paste it before saving.');
        if (linkField) { linkField.focus(); linkField.style.borderColor = '#b8412d'; }
        saveBtn.disabled = false; saveBtn.textContent = 'Save';
        return;
      }

      // Last-chance extract: images/text may have painted while the form was open.
      cm = reliveCm(cm, link);
      expandSeeMore(cm);
      d = mergeCapture(d, extract(cm));
      if (d.author) author = d.author;
      applyCapture(d, link, false);

      if (isNearEmpty(d)) {
        var go = window.confirm(
          'This save is missing the post text and image. LinkedIn may still be loading them.\n\nSave a near-empty entry anyway?'
        );
        if (!go) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save';
          return;
        }
      }

      var payload = {
        tab: 'marghi', formatType: name, funnel: stage, link: link,
        note: note, labels: labels,
        author: author || d.author || '', text: d.text || '', image: d.image || '',
        reactions: d.reactions || '', comments: d.comments || ''
      };
      var settled = false;
      function fail(msg) {
        if (settled) return; settled = true;
        toast('\u26a0 ' + msg);
        saveBtn.disabled = false; saveBtn.textContent = 'Save';
      }
      var timer = setTimeout(function () {
        fail('Save timed out after 20s. Refresh the page and try again.');
      }, 20000);

      chrome.runtime.sendMessage({ type: 'SF_SAVE', payload: payload }, function (res) {
        if (settled) return; settled = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError) {
          saveBtn.disabled = false; saveBtn.textContent = 'Save';
          toast('\u26a0 ' + chrome.runtime.lastError.message + ' — refresh the page.');
          return;
        }
        if (res && res.ok !== false) { close(); toast('\u2713 Saved to My Formats'); }
        else {
          saveBtn.disabled = false; saveBtn.textContent = 'Save';
          toast('\u26a0 ' + ((res && res.error) || 'Save failed — check the extension Options'));
        }
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
    setTimeout(function () { t.remove(); }, 3200);
  }

  // ---------- inject the button on each post ----------
  var DEBUG = false;
  try { DEBUG = localStorage.getItem('SF_DEBUG') === '1'; } catch (e) {}
  var lastLog = '';
  function debugLog() {
    if (!DEBUG) return;
    function vis(e) { var r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; }
    var menus = [].slice.call(document.querySelectorAll(CM_SEL));
    var btns = [].slice.call(document.querySelectorAll('.sf-btn'));
    var line = location.pathname.slice(0, 40) +
      '  menus ' + menus.filter(vis).length + '/' + menus.length +
      '  buttons ' + btns.filter(vis).length + '/' + btns.length;
    if (line === lastLog) return;                  // only log when something changed
    lastLog = line;
    console.log('%c[MyFormats] ' + line, 'color:#0a66c2');
  }

  function inject() {
    if (!alive()) { if (DEBUG) console.log('%c[MyFormats] stood down (superseded or context dead)', 'color:#b8412d'); standDown(); return; }
    [].slice.call(document.querySelectorAll(CM_SEL)).forEach(function (cm) {
      try {
      if (!isPostMenu(cm)) return;   // skip comment / message menus
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
        // Re-read author at click time (not inject time) — the aria-label can fill in late.
        var live = reliveCm(cm);
        var author = authorFromDom(findPostCard(live)) || authorFromMenu(live);
        openForm(live, author);
      });
      if (getComputedStyle(wrapper).position === 'static') wrapper.style.position = 'relative';
      wrapper.appendChild(btn);
      } catch (err) {
        // One awkward post must never abort the whole pass, which would leave every
        // later post on the page without a button and no visible error.
        if (DEBUG) console.warn('[MyFormats] skipped a post:', err && err.message);
      }
    });
    debugLog();
  }

  var pending = null;
  function schedule(delay) {
    if (pending) return;
    pending = setTimeout(function () { pending = null; inject(); }, delay || 400);
  }

  mo = new MutationObserver(function () { if (!alive()) { standDown(); return; } schedule(400); });
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
    // A route change leaves the previous page's buttons in the DOM, attached to nodes
    // that are now hidden or detached. They then confuse the next pass: a stale button
    // can sit inside a wrapper the injector picks for a NEW post, which sees a button
    // already there and just repositions the dead one. Wiping first means every post on
    // the new page is evaluated from scratch.
    try {
      [].slice.call(document.querySelectorAll('.sf-btn')).forEach(function (b) { b.remove(); });
    } catch (e) {}
    [0, 250, 600, 1200, 2000, 3200].forEach(function (ms) { setTimeout(inject, ms); });
  }

  var lastUrl = location.href;
  function checkUrl() {
    if (location.href === lastUrl) return;
    lastUrl = location.href;
    if (DEBUG) console.log('%c[MyFormats] route -> ' + location.pathname.slice(0, 44), 'color:#8a6d3b');
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

  timers.push(setInterval(function () { if (!alive()) { standDown(); return; } checkUrl(); }, 500));
  timers.push(setInterval(function () { if (!document.hidden) inject(); }, 3000));   // heartbeat

  burst();

  function pickFixMenu() {
    // Match the permalink's activity/ugcPost id so we don't auto-open a sidebar /
    // "more posts" card. Fall back to the first visible post menu (never a comment).
    var pid = postIdFromString(location.href);
    var menus = [];
    try {
      menus = [].slice.call(document.querySelectorAll(CM_SEL)).filter(function (cm) {
        if (!isPostMenu(cm)) return false;
        var r = cm.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
    } catch (e) {}
    if (pid) {
      for (var i = 0; i < menus.length; i++) {
        var u = scanUrn(findPostCard(menus[i])) || scanUrn(findWrapper(menus[i]));
        if (u && u.indexOf(pid) !== -1) return menus[i];
      }
    }
    return menus[0] || null;
  }

  // Opened from the library's "Fix" button → auto-open the save form for this post so the
  // user just reviews and hits Save. The save matches the post by its activity id and
  // updates the existing (wrong/incomplete) row in place.
  //
  // Wait until the opened permalink has painted commentary/image (or ~2.5s) so re-extract
  // is from the live post page, not the empty SPA shell. querySelector(CM_SEL) used to
  // fire on the first menu — often a comment — and extract() ran once, empty.
  if (SF_FIX_REQUESTED) {
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {}   // don't re-trigger on refresh
    var fxTries = 0;
    var fxIv = setInterval(function () {
      if (!alive()) { clearInterval(fxIv); return; }
      var cm = pickFixMenu();
      if (!cm) {
        if (++fxTries >= 80) clearInterval(fxIv);   // ~20s, then give up (user can click + manually)
        return;
      }
      var snap = extract(cm);
      var painted = !!(snap.text || snap.image);
      var waited = fxTries >= 10;                  // ~2.5s after the menu exists
      if (painted || waited || fxTries >= 24) {    // hard cap ~6s after menu
        clearInterval(fxIv);
        try { openForm(cm, snap.author || authorFromMenu(cm)); } catch (e) {}
      }
      fxTries++;
    }, 250);
  }

  // Test hook (unused in the extension). Lets a node/jsdom harness call extract()
  // against LinkedIn-shaped fixtures without poking private IIFE locals.
  try {
    window.__SF_CAPTURE = {
      extract: extract,
      findImage: findImage,
      longestText: longestText,
      findPostCard: findPostCard,
      postRoot: postRoot,
      authorFromDom: authorFromDom,
      authorFromMenu: authorFromMenu,
      imgSrc: imgSrc,
      pickSrcset: pickSrcset,
      captureGaps: captureGaps,
      isNearEmpty: isNearEmpty,
      isPostMenu: isPostMenu,
      spansSecondPost: spansSecondPost,
      permalinkLink: permalinkLink,
      postIdFromString: postIdFromString,
      mergeCapture: mergeCapture,
      cleanAuthor: cleanAuthor,
      URN_RE: URN_RE
    };
  } catch (e) {}
})();
