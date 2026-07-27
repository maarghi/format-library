var nameEl = document.getElementById('name');
var urlEl = document.getElementById('url');
var ok = document.getElementById('ok');

chrome.storage.sync.get(['tabName', 'endpoint'], function (c) {
  if (c.tabName) nameEl.value = c.tabName;
  if (c.endpoint) urlEl.value = c.endpoint;
});

document.getElementById('save').addEventListener('click', function () {
  var tabName = nameEl.value.trim();
  var endpoint = urlEl.value.trim();
  chrome.storage.sync.set({ tabName: tabName || 'marghi', endpoint: endpoint }, function () {
    ok.textContent = 'Saved ✓';
    setTimeout(function () { ok.textContent = ''; }, 2000);
  });
});
