# Format Library — Maintainer's Handoff

Everything needed to understand, change, and deploy this project. Read this fully before editing.

## 1. What it is
Two pieces that share one Google Sheet:
- **Chrome extension "Save to My Formats"** — adds a **➕ My Formats** button to LinkedIn posts. Clicking it captures the post (text, image, author, counts, link) plus a funnel stage / labels / note, and POSTs it to a Google Apps Script web app, which writes a row to the shared **Format Library** Google Sheet.
- **Apps Script web app** — two jobs: (a) a JSON API (`doPost`/`doGet`) the extension talks to, and (b) it serves the **viewer** (the coverflow "deck" at the `/exec` URL) that renders the saved posts.

## 2. Repo map
```
swipe-file-extension/            ← the Chrome extension (this is what's on the Web Store)
  manifest.json                  ← version lives here; bump on every extension change
  content.js                     ← the LinkedIn button + post capture (the brains)
  background.js                  ← service worker; talks to Apps Script; re-injects on nav
  popup.html / popup.js          ← onboarding (team-code gate) + home
  config.js                      ← SHARED_ENDPOINT, SHARED_SHEET_ID, VIRIO_CODE
  content.css, icons/
  apps-script/
    Code.standalone.gs           ← THE DEPLOYABLE. Backend + viewer-as-base64 in one file.
    Code.gs                      ← older split source (NOT what's deployed)
format-library-deck/             ← original build pipeline (SEE WARNING below)
  viewer.template.html, build_viewer.py, build_standalone.py, formats.json
docs/                            ← privacy policy, store listing, install guide, this file
dist/                            ← build artifacts (zip, icons, screenshots); git-ignored
```

## 3. The two deploy paths (they are DIFFERENT)
**Extension → Chrome Web Store (or unpacked)**
- Change files in `swipe-file-extension/`, **bump `version` in manifest.json**, test unpacked (`chrome://extensions` → Load unpacked → reload after edits).
- To publish: zip the extension files and upload a new package in the Web Store dashboard (Unlisted), then Submit for review (hours–days). Users auto-update.
- Zip command:
  ```bash
  cd swipe-file-extension
  zip -rq ../dist/format-library-extension-vX.Y.Z.zip manifest.json background.js content.js content.css config.js popup.html popup.js icons -x '*.DS_Store'
  ```

**Viewer + backend → Apps Script (INSTANT, no review)**
- Edit `apps-script/Code.standalone.gs`, paste the whole file into the Apps Script editor, then **Deploy → Manage deployments → ✏️ edit the existing deployment → Version: New version → Deploy**.
- ⚠️ **Saving the code is NOT deploying.** The `/exec` URL serves the last *deployed version*. You must create a **New version** on the existing deployment (keeps the same URL). Hard-refresh (`Cmd+Shift+R`) after.

## 4. ⚠️ Editing the viewer (it's a base64 blob)
The viewer HTML is embedded in `Code.standalone.gs` as one big string: `var VIEWER_B64 = "…";`. **The deployed base64 is the source of truth** — do NOT rebuild from `format-library-deck/viewer.template.html`; that source drifted long ago and rebuilding will overwrite working fixes.

To edit the viewer, decode → edit → re-encode:
```bash
GS=swipe-file-extension/apps-script/Code.standalone.gs
# decode to a working HTML file
python3 - "$GS" viewer.html <<'PY'
import re,base64,sys
s=open(sys.argv[1]).read()
open(sys.argv[2],"w").write(base64.b64decode(re.search(r'var VIEWER_B64 = "([^"]+)";',s).group(1)).decode())
PY
# ...edit viewer.html...  then re-encode back in:
python3 - viewer.html "$GS" <<'PY'
import re,base64,sys
html=open(sys.argv[1]).read(); gs=open(sys.argv[2]).read()
b64=base64.b64encode(html.encode()).decode()
new,n=re.subn(r'(var VIEWER_B64 = ")[^"]+(";)',lambda m:m.group(1)+b64+m.group(2),gs); assert n==1
open(sys.argv[2],"w").write(new)
PY
```
Always syntax-check before deploying: extract the inline `<script>` blocks and run `node --check`, and `node --check` a copy of the `.gs` (as `.js`).

## 5. Critical constraints / gotchas (learned the hard way)
- **LinkedIn blocks server-side fetches.** Apps Script (`UrlFetchApp`) gets an auth-wall from LinkedIn even with a crawler UA, so there is **no server-side recovery** of a post's text/image. Anything that reads a post must run in the **extension** (on linkedin.com). This is why "Fix post" opens the post and re-saves via the extension rather than fetching.
- **Post identity = activity id.** Links come in several formats (`/posts/…-share-<id>-…`, `/feed/update/urn:li:activity:<id>/`). De-dupe and "match the existing row" use `postId_()` = the 19-digit number. Re-saving a post updates its row in place (merge: new non-blank values win, blanks keep existing).
- **The team code is not a secret.** `VIRIO_CODE` in `config.js` ships inside the extension package; anyone who installs can read it. It's a speed bump. Keep the store listing **Unlisted**.
- **Link capture depends on the "Copy link" menu.** LinkedIn removed the post URN from the feed DOM, so `content.js` gets the link by opening the post's "…" menu → "Copy link to post" and reading the fresh toast (ignoring stale ones).
- **Never capture actor headline or comments as the post body.** `longestText` excludes the author block and the comments section.
- **SPA button re-injection**: one content-script instance stays alive per page (`window.__SF_ACTIVE`); a re-injection leaves a healthy instance alone. Don't reintroduce the old generation/supersede model.

## 6. Config values (swipe-file-extension/config.js)
- `SHARED_ENDPOINT` — the Apps Script `/exec` URL (the live deployment).
- `SHARED_SHEET_ID` — the Format Library spreadsheet id.
- `VIRIO_CODE` — team unlock code (currently a simple passphrase).

## 7. Accounts required to actually deploy (can't be automated away)
- The **Google account that owns** the Apps Script project + the Sheet — needed for "New version" deploys.
- The **Chrome Web Store developer account** — needed to publish extension updates.
- The **GitHub repo** (maarghi/format-library) — for source + the teammate download link.
An agent can prepare all the code changes and the zip, but a human with these logins performs the Apps Script deploy and the store upload.

## 8. Current state
- Extension: v1.8.3 (team-code onboarding; robust capture; comment/actor exclusion; SPA re-inject; Fix re-save flow).
- Viewer/backend: dedupe by activity id, per-card "↻ Fix", queue-position fix + Cmd/Ctrl+Z undo, click-to-advance, scroll-stays-on-post, image backfill button.
- Store: submitted **Unlisted** (pending review at time of writing).
