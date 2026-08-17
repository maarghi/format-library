// Popup: onboarding router + home. Two modes (chrome.storage.sync.mode):
//   'virio'    → shared team library (endpoint resolved in background from SF_CONFIG).
//   'personal' → the user's own deployment (endpoint saved during guided setup).
// Everything talks to the resolved endpoint through the background worker.

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
  ['router', 'virioVerify', 'personalSetup', 'home'].forEach(function (s) {
    $(s).classList.toggle('active', s === id);
  });
}

// ================= router =================
$('chooseVirio').addEventListener('click', function () { showScreen('virioVerify'); });
$('choosePersonal').addEventListener('click', function () { showScreen('personalSetup'); });
$('virioBack').addEventListener('click', function () { showScreen('router'); });
$('personalBack').addEventListener('click', function () { showScreen('router'); });
$('toPersonalFromVirio').addEventListener('click', function () { showScreen('personalSetup'); });

// ================= virio verify (team code) =================
async function unlockVirio() {
  await setSync({ mode: 'virio' });
  state.mode = 'virio';
  toast('Unlocked ✓ Welcome to the team library');
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

// ================= personal guided setup =================
$('createLibBtn').addEventListener('click', function () {
  var url = (self.SF_CONFIG && self.SF_CONFIG.TEMPLATE_COPY_URL) || '';
  var note = $('ps1Note'); note.style.display = 'block';
  if (!url) {
    note.className = 'note warn';
    note.textContent = 'The library template isn’t configured yet (TEMPLATE_COPY_URL is empty in config.js).';
    return;
  }
  chrome.tabs.create({ url: url });
  note.className = 'note';
  note.textContent = 'Opened the copy in a new tab. Make the copy, then Deploy → New deployment → Web app → Anyone, and paste the URL below.';
  $('ps1').classList.add('ok');
});

$('connectBtn').addEventListener('click', async function () {
  var u = $('epInput').value.trim();
  var note = $('ps2Note'); note.style.display = 'block'; note.className = 'note';
  if (!u) { note.className = 'note warn'; note.textContent = 'Paste your /exec URL first.'; return; }
  $('connectBtn').disabled = true; $('connectBtn').textContent = 'Connecting…';
  var r = await msg({ type: 'SF_CHECK_ENDPOINT', url: u });
  $('connectBtn').disabled = false; $('connectBtn').textContent = 'Connect';
  if (!r || !r.ok) {
    note.className = 'note warn';
    note.textContent = (r && r.error) || 'Couldn’t reach that URL. Check it’s deployed as a Web app with access "Anyone".';
    return;
  }
  await setSync({ mode: 'personal', endpoint: u });
  state.mode = 'personal'; state.endpoint = u;
  $('ps2').classList.add('ok');
  toast('Connected ✓ Your library is live');
  loadHome();
});
$('epInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('connectBtn').click(); });

// ================= home: links =================
function sheetIdForMode() {
  return state.mode === 'virio' ? ((self.SF_CONFIG && self.SF_CONFIG.SHARED_SHEET_ID) || '') : '';
}
function refreshLinks() {
  var viewer = $('viewerLink');
  viewer.href = state.endpoint || '#';
  var sheet = $('sheetLink');
  var sid = sheetIdForMode();
  if (state.tabName && sid) {
    sheet.href = 'https://docs.google.com/spreadsheets/d/' + sid + '/edit' + (state.tabGid ? '#gid=' + state.tabGid : '');
    sheet.setAttribute('aria-disabled', 'false');
    sheet.querySelector('span:nth-child(2)').textContent = 'Open my sheet tab (' + state.tabName + ')';
    sheet.style.display = '';
  } else if (state.mode === 'personal') {
    sheet.style.display = 'none';   // we don't know the personal spreadsheet id from the /exec URL
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
  // mode line + start-over
  var ml = $('modeline');
  ml.innerHTML = (state.mode === 'virio' ? 'Virio team library' : 'Your personal library')
    + ' · <button id="startOver">switch</button>';
  $('startOver').addEventListener('click', startOver);
  $('step1desc').textContent = state.mode === 'virio'
    ? 'Your saves land in a tab with your name in the shared team sheet. Pick yourself, or add your name.'
    : 'Your saves land in a tab with your name in your own sheet. Add your name.';
  refreshLinks();
}

async function startOver() {
  await setSync({ mode: '', endpoint: '', tabName: '', tabGid: '' });
  state = { mode: '', endpoint: '', tabName: '', tabGid: '', people: [], labels: [] };
  showScreen('router');
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
  var ready = state.mode === 'virio' || (state.mode === 'personal' && state.endpoint);
  if (ready) loadHome();
  else showScreen('router');
})();
