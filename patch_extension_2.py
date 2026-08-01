import sys, io

path = sys.argv[1]
s = io.open(path, encoding="utf-8").read()
orig = s
changes = []

# --------------------------------------------------- 1. skip work when the tab is hidden
old_inject_head = """  function inject() {
    [].slice.call(document.querySelectorAll(CM_SEL)).forEach(function (cm) {"""
new_inject_head = """  function inject() {
    if (document.hidden) return;
    [].slice.call(document.querySelectorAll(CM_SEL)).forEach(function (cm) {"""
assert old_inject_head in s, "inject() head not found"
s = s.replace(old_inject_head, new_inject_head)
changes.append("inject() skips work while the tab is hidden")

# --------------------------------------------------- 2. replace the whole scheduler
old_sched = """  var pending = null;
  var mo = new MutationObserver(function () {
    if (pending) return;
    pending = setTimeout(function () { pending = null; inject(); }, 400);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });
  inject();
})();"""

new_sched = """  var pending = null;
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
  setInterval(inject, 3000);     // heartbeat: recover from any single missed pass

  burst();
})();"""
assert old_sched in s, "scheduler block not found"
s = s.replace(old_sched, new_sched)
changes.append("route-change detection: pushState/replaceState/popstate + 500ms poll")
changes.append("retry ladder on every route change (0/250/600/1200/2000/3200ms)")
changes.append("3s heartbeat so a missed pass self-heals")
changes.append("re-inject when the tab becomes visible again")

# --------------------------------------------------- 3. version
s = s.replace("content script v1.4.0 loaded", "content script v1.5.0 loaded")
changes.append("console banner -> v1.5.0")

io.open(path, "w", encoding="utf-8").write(s)
print("patched", path)
for c in changes:
    print("  -", c)
print("size: %d -> %d chars" % (len(orig), len(s)))
