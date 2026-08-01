import sys, io, re

path = sys.argv[1]
s = io.open(path, encoding="utf-8").read()
orig = s
changes = []

# ---------------------------------------------------------------- 1. findWrapper
old_wrapper = """  function findWrapper(cm) {
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
  }"""

new_wrapper = """  var URN_RE = /urn:li:(activity|share|ugcPost):\\d+/;

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
  function findWrapper(cm) {
    var node = cm;
    for (var i = 0; i < 20 && node; i++) {
      node = node.parentElement;
      if (!node) break;
      if (hasUrn(node)) return node;                       // the post boundary
      var ck = node.getAttribute && node.getAttribute('componentkey');
      if (ck && ck.indexOf('FeedType_MAIN_FEED') > -1) return node;   // legacy feed path
      if (node.tagName === 'ARTICLE') return node;         // single-post + profile pages
      if (node.getAttribute && node.getAttribute('data-urn')) return node;
    }
    node = cm;
    for (var j = 0; j < 6 && node.parentElement; j++) node = node.parentElement;
    return node;
  }"""
assert old_wrapper in s, "findWrapper block not found"
s = s.replace(old_wrapper, new_wrapper); changes.append("findWrapper: urn-based post boundary")

# ---------------------------------------------------------------- 2. scanUrn nearest-first
old_scan = """  function scanUrn(w) {
    var all = w.querySelectorAll('*');
    for (var a = 0; a < all.length; a++) {
      var el = all[a];
      for (var b = 0; b < el.attributes.length; b++) {
        var m = (el.attributes[b].value || '').match(/urn:li:(activity|share|ugcPost):\\d+/);
        if (m) return m[0];
      }
    }
    return null;
  }"""
new_scan = """  function urnOf(el) {
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
  }"""
assert old_scan in s, "scanUrn block not found"
s = s.replace(old_scan, new_scan); changes.append("scanUrn: wrapper before children (reshares)")

# ---------------------------------------------------------------- 3. menu fallback
s2 = s.replace(
  "if (/copy link to post/i.test(items[i].textContent || ''))",
  "if (/copy link/i.test(items[i].textContent || ''))")
assert s2 != s, "menu matcher not found"
s = s2; changes.append("menu match widened to /copy link/i")

s2 = s.replace("if (link || tries >= 16) { clearInterval(iv); finish(link); }",
               "if (link || tries >= 34) { clearInterval(iv); finish(link); }")
assert s2 != s, "timeout not found"
s = s2; changes.append("fallback timeout 2.4s -> ~5s")

s2 = s.replace("      }, 420);", "      }, 600);")
assert s2 != s, "menu open delay not found"
s = s2; changes.append("menu open delay 420ms -> 600ms")

# ---------------------------------------------------------------- 4. visible, editable link
old_field = """        '<label>Format name</label>' +
        '<input type="text" class="sf-name" value="' + attr(nameGuess) + '" placeholder="Name this format">' +"""
new_field = """        '<label>Format name</label>' +
        '<input type="text" class="sf-name" value="' + attr(nameGuess) + '" placeholder="Name this format">' +
        '<label>Post link' + (resolvedLink ? '' : ' &mdash; not detected, paste it') + '</label>' +
        '<input type="text" class="sf-link" value="' + attr(resolvedLink || '') + '"' +
          ' placeholder="https://www.linkedin.com/feed/update/urn:li:activity:..."' +
          (resolvedLink ? '' : ' style="border-color:#b8412d;background:#fff6f4"') + '>' +"""
assert old_field in s, "name field not found"
s = s.replace(old_field, new_field); changes.append("link field added to the form, editable")

# ---------------------------------------------------------------- 5. use it, and refuse empty
old_payload = """      var payload = {
        tab: 'marghi', formatType: name, funnel: stage, link: resolvedLink || d.link || '',"""
new_payload = """      var linkField = overlay.querySelector('.sf-link');
      var link = (linkField && linkField.value.trim()) || resolvedLink || d.link || '';
      if (!link) {
        toast('\\u26a0 No post link. Paste it before saving.');
        if (linkField) { linkField.focus(); linkField.style.borderColor = '#b8412d'; }
        saveBtn.disabled = false; saveBtn.textContent = 'Save';
        return;
      }

      var payload = {
        tab: 'marghi', formatType: name, funnel: stage, link: link,"""
assert old_payload in s, "payload block not found"
s = s.replace(old_payload, new_payload); changes.append("save blocked when link is empty")

# ---------------------------------------------------------------- 6. version bump
s = s.replace("content script v1.3.0 loaded", "content script v1.4.0 loaded")
changes.append("console banner -> v1.4.0")

io.open(path, "w", encoding="utf-8").write(s)
print("patched", path)
for c in changes: print("  -", c)
print("size: %d -> %d chars" % (len(orig), len(s)))
