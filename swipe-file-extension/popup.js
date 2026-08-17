// Popup: team-code gate + home. Once unlocked (chrome.storage.sync.mode === 'virio'),
// saves go to the shared Virio library (endpoint resolved in the background from
// SF_CONFIG). Everything talks to that endpoint through the background worker.

var ADD_NEW = '__add_new__';

// Suggested starter labels (only shown if not already in the master list).
var SUGGESTED = [
  ['Arceus', 'Client'], ['Caspian', 'Client'], ['Crescendo', 'Client'],
  ['Futurify', 'Client'], ['Goody', 'Client'], ['Percents', 'Client'],
  ['Strong hook', 'Tag'], ['Great image', 'Tag'], ['Great story', 'Tag'],
  ['Contrarian take', 'Tag'], ['Data-backed', 'Tag'], ['Listicle', 'Tag']
];

var $ = function (id) { return document.getElementById(id); };
function msg(payload) { return new Promise(function (res) { chrome.runtime.sendMessage(payload, function (r) { res(r || {}); }); }); }
function setSync(o) { return new Promise(function (res) { chrome.storage.sync.set(o, res); }); }
function getSync(keys) { return new Promise(function (res) { chrome.storage.sync.get(keys, res); }); }
function toast(t) { var el = $('toast'); el.textContent = t; el.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(function () { el.classList.remove('show'); }, 1800); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]; }); }

var state = { mode: '', endpoint: '', tabName: '', tabGid: '', people: [], labels: [] };

function showScreen(id) {
  ['gate', 'home'].forEach(function (s) {
    $(s).classList.toggle('active', s === id);
  });
}

// ================= team-code gate =================
async function unlockVirio() {
  await setSync({ mode: 'virio' });
  state.mode = 'virio';
  toast('Unlocked ✓ Welcome to the library');
  loadHome();
}

$('codeBtn').addEventListener('click', function () {
  var v = $('codeInput').value.trim();
  var note = $('codeNote'); note.style.display = 'block';
  var want = (self.SF_CONFIG && self.SF_CONFIG.VIRIO_CODE) || '';
  if (want && v.toLowerCase() === String(want).toLowerCase()) { unlockVirio(); return; }
  note.className = 'note warn';
  note.textContent = v ? 'That code isn’t right.' : 'Enter your team code.';
});
$('codeInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('codeBtn').click(); });

// ================= home: links =================
function refreshLinks() {
  var viewer = $('viewerLink');
  viewer.href = state.endpoint || '#';
  var sheet = $('sheetLink');
  var sid = (self.SF_CONFIG && self.SF_CONFIG.SHARED_SHEET_ID) || '';
  if (state.tabName && sid) {
    sheet.href = 'https://docs.google.com/spreadsheets/d/' + sid + '/edit' + (state.tabGid ? '#gid=' + state.tabGid : '');
    sheet.setAttribute('aria-disabled', 'false');
    sheet.querySelector('span:nth-child(2)').textContent = 'Open my sheet tab (' + state.tabName + ')';
    sheet.style.display = '';
  } else {
    sheet.setAttribute('aria-disabled', 'true');
  }
}

function refreshOnboarded() {
  var on = !!state.tabName;
  $('banner').classList.toggle('on', on);
  if (on) $('bannerName').textContent = state.tabName;
  $('step1').classList.toggle('complete', on);
  $('step2').classList.toggle('complete', (state.labels || []).length > 0);
  // mode line + sign-out
  var ml = $('modeline');
  ml.innerHTML = 'Virio team library · <button id="startOver">sign out</button>';
  $('startOver').addEventListener('click', startOver);
  $('step1desc').textContent = 'Your saves land in a tab with your name in the shared team sheet. Pick yourself, or add your name.';
  refreshLinks();
}

async function startOver() {
  await setSync({ mode: '', endpoint: '', tabName: '', tabGid: '' });
  state = { mode: '', endpoint: '', tabName: '', tabGid: '', people: [], labels: [] };
  showScreen('gate');
}

// ================= home: person dropdown =================
function renderPeople() {
  var sel = $('person');
  var names = state.people.map(function (p) { return p.name; });
  if (state.tabName && names.indexOf(state.tabName) === -1) names.unshift(state.tabName);
  sel.innerHTML = '';
  var ph = document.createElement('option'); ph.value = ''; ph.textContent = names.length ? '— pick your name —' : '— add your name below —'; sel.appendChild(ph);
  names.forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n; sel.appendChild(o); });
  var add = document.createElement('option'); add.value = ADD_NEW; add.textContent = '＋ Add my name…'; sel.appendChild(add);
  sel.value = state.tabName || '';
  $('newNameRow').classList.toggle('hide', sel.value !== ADD_NEW);
}

async function commitName(name) {
  name = (name || '').trim();
  if (!name) return;
  state.tabName = name;
  await setSync({ tabName: name });
  refreshOnboarded();
  toast('Saving as ' + name + ' ✓');
  var r = await msg({ type: 'SF_ENSURE_TAB', name: name });
  if (r && r.ok && r.gid != null) {
    state.tabGid = String(r.gid);
    setSync({ tabGid: state.tabGid });
    if (state.people.every(function (p) { return p.name !== name; })) state.people.push({ name: name, gid: r.gid });
  }
  refreshLinks();
}

$('person').addEventListener('change', function (e) {
  var v = e.target.value;
  if (v === ADD_NEW) { $('newNameRow').classList.remove('hide'); $('newName').focus(); return; }
  $('newNameRow').classList.add('hide');
  if (v) commitName(v);
});
$('newNameAdd').addEventListener('click', function () {
  var v = $('newName').value.trim(); if (!v) return;
  commitName(v).then(function () { $('newName').value = ''; renderPeople(); });
});
$('newName').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('newNameAdd').click(); });
$('changeName').addEventListener('click', function () { $('person').focus(); toast('Pick or add a name above'); });

// ================= home: labels =================
function renderLabels() {
  var cur = $('curLabels');
  cur.innerHTML = '';
  if (!state.labels.length) {
    cur.innerHTML = '<span class="muted">No labels yet — add some below.</span>';
  } else {
    state.labels.forEach(function (l) {
      var c = document.createElement('span'); c.className = 'chip';
      c.innerHTML = esc(l.label) + ' <span class="cat">' + esc(l.category || 'Tag') + '</span> <span class="x" title="Remove">×</span>';
      c.querySelector('.x').addEventListener('click', function () { removeLabel(l.label); });
      cur.appendChild(c);
    });
  }
  var have = {}; state.labels.forEach(function (l) { have[l.label.toLowerCase()] = true; });
  var sug = SUGGESTED.filter(function (s) { return !have[s[0].toLowerCase()]; });
  var wrap = $('suggestLabels');
  wrap.innerHTML = '';
  $('suggestHint').style.display = sug.length ? '' : 'none';
  sug.forEach(function (s) {
    var c = document.createElement('span'); c.className = 'chip suggest';
    c.innerHTML = '＋ ' + esc(s[0]) + ' <span class="cat">' + esc(s[1]) + '</span>';
    c.addEventListener('click', function () { addLabel(s[0], s[1]); });
    wrap.appendChild(c);
  });
  $('step2').classList.toggle('complete', state.labels.length > 0);
}
function addLabel(label, cat) {
  label = (label || '').trim(); if (!label) return;
  if (!state.labels.some(function (l) { return l.label.toLowerCase() === label.toLowerCase(); }))
    state.labels.push({ label: label, category: cat || 'Tag' });
  renderLabels();
  msg({ type: 'SF_ADD_LABEL', label: label, category: cat || 'Tag' });
  toast('Added “' + label + '”');
}
function removeLabel(label) {
  state.labels = state.labels.filter(function (l) { return l.label.toLowerCase() !== label.toLowerCase(); });
  renderLabels();
  msg({ type: 'SF_DELETE_LABEL', label: label });
}
$('labelAdd').addEventListener('click', function () {
  var v = $('labelInput').value.trim(); if (!v) return;
  addLabel(v, $('labelCat').value); $('labelInput').value = '';
});
$('labelInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('labelAdd').click(); });

// ================= home load =================
async function loadHome() {
  showScreen('home');
  var st = await getSync(['tabName', 'tabGid']);
  state.tabName = st.tabName || '';
  state.tabGid = st.tabGid || '';

  var ep = await msg({ type: 'SF_ENDPOINT' }); state.endpoint = (ep && ep.endpoint) || '';
  refreshOnboarded();

  var pr = await msg({ type: 'SF_PEOPLE' });
  state.people = (pr && pr.people) || [];
  if (state.tabName && !state.tabGid) {
    var me = state.people.filter(function (p) { return p.name === state.tabName; })[0];
    if (me && me.gid != null) { state.tabGid = String(me.gid); setSync({ tabGid: state.tabGid }); }
  }
  renderPeople(); refreshLinks();

  var lr = await msg({ type: 'SF_LABELS' });
  state.labels = (lr && lr.labels) || [];
  renderLabels();
}

// ================= boot =================
(async function boot() {
  var st = await getSync(['mode', 'endpoint', 'tabName', 'tabGid']);
  state.mode = st.mode || '';
  state.endpoint = st.endpoint || '';
  state.tabName = st.tabName || '';
  state.tabGid = st.tabGid || '';
  if (state.mode === 'virio') loadHome();
  else showScreen('gate');
})();
