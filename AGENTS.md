# AGENTS.md — read this first

You are an AI agent maintaining the **Format Library** project. Before making ANY change,
read [`docs/HANDOFF.md`](docs/HANDOFF.md) in full — it's the complete maintainer's guide
(architecture, deploy paths, the base64-viewer edit procedure, config, and hard-won gotchas).

## Golden rules (do not violate)
1. **Two separate deploy paths.**
   - *Extension* (`swipe-file-extension/`, minus `apps-script/`) → Chrome Web Store / unpacked. **Bump `manifest.json` `version` on every change.**
   - *Viewer + backend* (`swipe-file-extension/apps-script/Code.standalone.gs`) → Apps Script. **Deploy = Manage deployments → New version.** Saving the code is NOT deploying.
2. **The viewer is a base64 blob** (`var VIEWER_B64 = "…"`) inside `Code.standalone.gs`, and that blob is the source of truth. Edit it by decode → edit → re-encode (procedure in HANDOFF §4). **Do NOT rebuild from `format-library-deck/viewer.template.html`** — it has drifted and will overwrite live fixes.
3. **LinkedIn blocks server-side fetches.** Any reading of a post's content must happen in the **extension** (runs on linkedin.com), never in Apps Script. Don't add server-side LinkedIn fetching.
4. **Match posts by activity id** (`postId_`, the 19-digit number in the URL), not the exact URL string.
5. **Always syntax-check before proposing a deploy**: `node --check` the extension JS, and the viewer's inline `<script>` blocks, and a `.js` copy of `Code.standalone.gs`.
6. **Secrets:** `config.js` `VIRIO_CODE` is a light gate, readable by installers — keep the store listing Unlisted. Don't add real secrets to the repo.

## Workflow
- Make changes on a branch, bump versions, syntax-check, commit, push, open a PR.
- **A human deploys** (Apps Script "New version" and the Chrome Web Store upload) — those need the owner's Google and Chrome Web Store logins. Prepare everything up to that point.

## Where things are
See the repo map in `docs/HANDOFF.md §2`. Start points: `swipe-file-extension/content.js`
(capture), `.../apps-script/Code.standalone.gs` (backend + viewer), `.../config.js` (config).
