#!/usr/bin/env node
// Fixture tests for first-save capture. Loads content.js in jsdom against
// LinkedIn-shaped HTML that reproduces the half-entry bugs we found.

var fs = require('fs');
var path = require('path');
var JSDOM;
try {
  JSDOM = require('jsdom').JSDOM;
} catch (e) {
  console.error('jsdom is required: npm install jsdom');
  process.exit(1);
}

var SRC = fs.readFileSync(path.join(__dirname, '../content.js'), 'utf8');
var failed = 0;
var passed = 0;

function assert(cond, name) {
  if (cond) { passed++; console.log('  ok  ' + name); }
  else { failed++; console.log('  FAIL  ' + name); }
}

function load(url, html) {
  var dom = new JSDOM('<!doctype html><html><body>' + (html || '') + '</body></html>', {
    url: url || 'https://www.linkedin.com/feed/',
    runScripts: 'dangerously'
  });
  var window = dom.window;
  window.chrome = {
    runtime: {
      id: 'test',
      getURL: function (p) { return p; },
      sendMessage: function (msg, cb) { if (cb) cb({ labels: [] }); }
    }
  };
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    return { width: 480, height: 320, top: 0, left: 0, right: 480, bottom: 320, x: 0, y: 0 };
  };
  // content.js reads `location` as a free global (browser-ok). jsdom window.eval
  // does not expose it, so run the file as a real <script>.
  var script = window.document.createElement('script');
  script.textContent = SRC;
  window.document.body.appendChild(script);
  return { window: window, document: window.document, SF: window.__SF_CAPTURE };
}

var IMG_SMALL = 'https://media.licdn.com/dms/image/v2/D4E22AQ/feedshare-shrink_20/x';
var IMG_LARGE = 'https://media.licdn.com/dms/image/v2/D4E22AQ/feedshare-shrink_800/x';
var AVATAR = 'https://media.licdn.com/dms/image/v2/D4E03AQ/profile-displayphoto-shrink_100_100/x';

console.log('pure helpers');
var bare = load('https://www.linkedin.com/feed/');
assert(bare.SF.URN_RE.test('urn:li:activity:7341234567890123456'), 'URN_RE matches activity');
assert(bare.SF.URN_RE.test('urn:li:ugcPost:7341234567890123456'), 'URN_RE matches ugcPost');
assert(bare.SF.URN_RE.test('urn:li:share:7341234567890123456'), 'URN_RE matches share');
assert(bare.SF.postIdFromString('https://www.linkedin.com/posts/jane-activity-7341234567890123456-AbC') === '7341234567890123456', 'postId from /posts/ activity URL');
assert(bare.SF.postIdFromString('https://www.linkedin.com/posts/jane-ugcPost-7341234567890123456-AbC') === '7341234567890123456', 'postId from /posts/ ugcPost URL');
assert(bare.SF.pickSrcset(IMG_SMALL + ' 20w, ' + IMG_LARGE + ' 800w') === IMG_LARGE, 'srcset picks largest w');
assert(bare.SF.isNearEmpty({ text: '', image: '' }), 'near-empty when no text and no image');
assert(!bare.SF.isNearEmpty({ text: 'hook', image: '' }), 'text-only is not near-empty');
assert(bare.SF.cleanAuthor('Jane Doe • 1st\nCEO at Foo') === 'Jane Doe', 'cleanAuthor strips degree + headline line');
assert(bare.SF.cleanAuthor('Premium') === '', 'cleanAuthor blocks Premium');
assert(bare.SF.mergeCapture({ text: '', image: 'a' }, { text: 'hi', image: '' }).text === 'hi', 'merge keeps new text');
assert(bare.SF.mergeCapture({ text: '', image: 'a' }, { text: 'hi', image: '' }).image === 'a', 'merge keeps existing image');

console.log('classic feed card');
var feed = load('https://www.linkedin.com/feed/',
  '<div class="feed-shared-update-v2" data-id="urn:li:activity:7341234567890123456">' +
    '<div class="update-components-actor">' +
      '<span class="update-components-actor__title"><span aria-hidden="true">Jane Doe</span></span>' +
      '<span class="update-components-actor__description">CEO at C-Serv | Helping teams grow</span>' +
      '<button aria-label="Open control menu for post by Jane Doe">…</button>' +
    '</div>' +
    '<div class="update-components-update-v2__commentary">' +
      '<div class="update-components-text">This is a strong hook about pipeline and the rest of the body goes here for the format.</div>' +
    '</div>' +
    '<div class="update-components-image"><img src="' + IMG_LARGE + '" width="800" height="800"></div>' +
  '</div>'
);
var feedCm = feed.document.querySelector('button[aria-label^="Open control menu"]');
var feedEx = feed.SF.extract(feedCm);
assert(feedEx.author === 'Jane Doe', 'feed author from actor title, not headline');
assert(/strong hook/.test(feedEx.text), 'feed text from commentary');
assert(feedEx.image === IMG_LARGE, 'feed image');
assert(/urn:li:activity:7341234567890123456/.test(feedEx.link), 'feed link from data-id URN');
assert(feedEx.text.indexOf('CEO at C-Serv') === -1, 'actor headline is not the body');

console.log('header-only URN (wrong-root regression)');
var header = load('https://www.linkedin.com/feed/',
  '<div class="feed-shared-update-v2">' +
    '<div data-urn="urn:li:activity:7341111111111111111">' +
      '<div class="update-components-actor">' +
        '<span class="update-components-actor__title">Alex Rivera</span>' +
        '<button aria-label="Open control menu for post by Alex Rivera">…</button>' +
      '</div>' +
    '</div>' +
    '<div class="update-components-text">Body lives in a sibling of the URN header, not inside it. Need a long enough caption so we know findPostCard climbed to the card.</div>' +
    '<img src="' + IMG_LARGE + '">' +
  '</div>'
);
var headerCm = header.document.querySelector('button[aria-label^="Open control menu"]');
var headerEx = header.SF.extract(headerCm);
assert(/Body lives in a sibling/.test(headerEx.text), 'text found when URN is on a header-level box');
assert(headerEx.image === IMG_LARGE, 'image found when URN is on a header-level box');

console.log('permalink with comment menus (postRoot used to stop at header)');
var permalink = load(
  'https://www.linkedin.com/feed/update/urn:li:activity:7342222222222222222/',
  '<div class="feed-shared-update-v2" data-urn="urn:li:activity:7342222222222222222">' +
    '<div class="update-components-actor">' +
      '<span class="update-components-actor__title">Sam Lee</span>' +
      '<button aria-label="Open control menu for post by Sam Lee">…</button>' +
    '</div>' +
    '<div class="update-components-text">Permalink caption that must win over the long comment below it on the detail page.</div>' +
    '<div class="update-components-image"><img data-delayed-url="' + IMG_LARGE + '"></div>' +
    '<div class="comments-comments-list">' +
      '<div class="comments-comment-item">' +
        '<button aria-label="Open control menu for comment by Other Person">…</button>' +
        '<p>This comment is much longer than the caption and used to steal the body and also made postRoot think it had climbed into a second post.</p>' +
        '<img src="https://media.licdn.com/dms/image/v2/commentpic/x">' +
      '</div>' +
    '</div>' +
  '</div>'
);
var permCm = permalink.document.querySelector('button[aria-label^="Open control menu for post"]');
assert(permalink.SF.isPostMenu(permCm), 'post menu is a post menu');
assert(!permalink.SF.isPostMenu(permalink.document.querySelector('button[aria-label*="comment"]')), 'comment menu is not a post menu');
var permEx = permalink.SF.extract(permCm);
assert(/Permalink caption/.test(permEx.text), 'permalink text is the caption, not the comment');
assert(permEx.image === IMG_LARGE, 'permalink image from data-delayed-url');
assert(permEx.author === 'Sam Lee', 'permalink author');
assert(/7342222222222222222/.test(permEx.link), 'permalink link');

console.log('reshare with nested quoted-post menu');
var reshare = load('https://www.linkedin.com/feed/',
  '<div class="feed-shared-update-v2" data-id="urn:li:activity:7343333333333333333">' +
    '<div class="update-components-actor">' +
      '<span class="update-components-actor__title">Outer Author</span>' +
      '<button aria-label="Open control menu for post by Outer Author" id="outerCm">…</button>' +
    '</div>' +
    '<div class="update-components-text">I am resharing this because the quoted post is the format.</div>' +
    '<div class="feed-shared-update-v2" data-id="urn:li:activity:7343444444444444444">' +
      '<div class="update-components-actor">' +
        '<span class="update-components-actor__title">Quoted Author</span>' +
        '<button aria-label="Open control menu for post by Quoted Author" id="innerCm">…</button>' +
      '</div>' +
      '<div class="update-components-text">Quoted body is longer so longestText should prefer it, and the image lives here too.</div>' +
      '<img src="' + IMG_LARGE + '">' +
    '</div>' +
  '</div>'
);
var outerCm = reshare.document.getElementById('outerCm');
var card = reshare.SF.findPostCard(outerCm);
assert(!reshare.SF.spansSecondPost(card, outerCm), 'quoted menu does not count as a second feed post');
var reEx = reshare.SF.extract(outerCm);
assert(reEx.image === IMG_LARGE, 'reshare still finds the quoted image from the outer card');
assert(reEx.text.length > 20, 'reshare captures commentary');
assert(/urn:li:activity:7343333333333333333/.test(reEx.link), 'reshare link is the OUTER urn');

console.log('SDUI permalink (May 2026 classes dropped)');
var sdui = load(
  'https://www.linkedin.com/posts/pat-ugcPost-7345555555555555555-xyz/',
  '<div componentkey="expanded-abc-FeedType_FEED_DETAIL" data-sdui-screen="com.linkedin.sdui.flagshipnav.feed.UpdateDetail">' +
    '<div class="update-components-actor">' +
      '<span class="update-components-actor__title">Pat Nguyen</span>' +
      '<button aria-label="Open control menu for post by Pat Nguyen">…</button>' +
    '</div>' +
    '<p componentkey="feed-commentary_1"><span data-testid="expandable-text-box">SDUI body on a ugcPost permalink — this used to come back empty because BODY_SEL only had legacy classes.</span></p>' +
    '<div class="update-components-image"><img srcset="' + IMG_SMALL + ' 20w, ' + IMG_LARGE + ' 800w"></div>' +
  '</div>'
);
var sduiCm = sdui.document.querySelector('button[aria-label^="Open control menu"]');
var sduiEx = sdui.SF.extract(sduiCm);
assert(/SDUI body on a ugcPost/.test(sduiEx.text), 'SDUI expandable-text-box is the body');
assert(sduiEx.image === IMG_LARGE, 'SDUI srcset uses the 800w image, not shrink_20');
assert(sduiEx.author === 'Pat Nguyen', 'SDUI author');
assert(/ugcPost:7345555555555555555|7345555555555555555/.test(sduiEx.link), 'ugcPost permalink yields a usable link');

console.log('text-only post is complete without an image');
var textOnly = load('https://www.linkedin.com/feed/',
  '<div class="feed-shared-update-v2" data-id="urn:li:activity:7346666666666666666">' +
    '<div class="update-components-actor">' +
      '<span class="update-components-actor__title">Text Only</span>' +
      '<button aria-label="Open control menu for post by Text Only">…</button>' +
    '</div>' +
    '<div class="update-components-text">A text-only format with no image at all, which is a valid complete save.</div>' +
  '</div>'
);
var toCm = textOnly.document.querySelector('button[aria-label^="Open control menu"]');
var toEx = textOnly.SF.extract(toCm);
var toGaps = textOnly.SF.captureGaps(toEx, textOnly.SF.findPostCard(toCm));
assert(toEx.text.length > 20, 'text-only has text');
assert(!toEx.image, 'text-only has no image');
assert(toGaps.indexOf('image') === -1, 'missing image is not a gap on a text-only card');
assert(!textOnly.SF.isNearEmpty(toEx), 'text-only is not near-empty');

console.log('avatar must not win as the post image');
var avatarOnly = load('https://www.linkedin.com/feed/',
  '<div class="feed-shared-update-v2" data-id="urn:li:activity:7347777777777777777">' +
    '<div class="update-components-actor">' +
      '<img src="' + AVATAR + '">' +
      '<span class="update-components-actor__title">Avatar Person</span>' +
      '<button aria-label="Open control menu for post by Avatar Person">…</button>' +
    '</div>' +
    '<div class="update-components-text">Caption only, avatar in the actor block must not be captured as Image.</div>' +
  '</div>'
);
var avEx = avatarOnly.SF.extract(avatarOnly.document.querySelector('button[aria-label^="Open control menu"]'));
assert(!avEx.image, 'actor avatar is not the post image');

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
