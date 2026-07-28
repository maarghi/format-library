# Format Library — Project Handoff

Read this to resume with full context (e.g. after moving computers).
Tell Claude: **"Read HANDOFF.md and catch up."**

## What this is
A system for collecting viral LinkedIn post formats and drafting content from them:
1. **"Save to My Formats" Chrome extension** — a ➕ button on LinkedIn posts that captures the post (link, author, full text, image, social counts) + your funnel/labels/note, and saves it to a Google Sheet. Click the **🐸 frog icon** for guided onboarding.
2. **Google Sheet** — the source of truth (per-person tabs + a shared `labels` tab).
3. **Google Apps Script web app** — one URL that (a) receives saves from the extension and (b) **serves the live Format Library viewer**.
4. **Format Library viewer** — a hosted, minimal **white coverflow gallery**: posts float as an overlapping fan of cards, the centered one lifted; ←/→ (or chevrons / wheel / drag) glide through them, cards bump up on hover. Saved posts render **exactly like the LinkedIn feed** (image included), live from the sheet with no rebuild. Filters (funnel / source / label) sit in a minimal side rail.

## ⚠️ v2 changed the architecture (2026-07-27)
The viewer **moved off the Claude artifact** onto the Apps Script web app so it can be **live** and **show real post images** (a Claude artifact can do neither — strict CSP). The new viewer URL is just the Apps Script `/exec` URL. See **DEPLOY** below — the new code must be deployed once before any of this is live.

## 🚀 DEPLOY (do this once — nothing is live until you do)
1. **Apps Script editor** → open the project (`https://script.google.com/home/projects/1S5cUm9b62iE_es7424OQsghe11hw14w-q3QMwD5aB7de5Bv4csMk7dQr/edit`).
   - Replace **`Code.gs`** with `swipe-file-extension/apps-script/Code.gs`.
   - Add a **new HTML file**: `+` (next to Files) → **HTML** → name it exactly **`Viewer`** → paste all of `format-library-deck/Viewer.html` → Save.
2. **Redeploy** (keeps the same `/exec` URL): **Deploy → Manage deployments → ✏️ edit → Version: New version → Deploy.** Editing files alone does NOT go live.
3. The `/exec` URL is now your **live Format Library** — open it. (It's baked into the extension, so the popup's "Open the Format Library" button points here.)
4. **Reload the extension** (it changed a lot): `chrome://extensions` → Developer mode → Reload (or Load unpacked → `swipe-file-extension/`). You'll see the 🐸 icon.
5. **Teammates:** re-share `swipe-file-extension.zip` (rebuilt). They install it, click 🐸, pick/add their name, done.
6. *(optional)* Visit `<endpoint>?action=normalize` once to reorder the `marghi` tab into the new column layout. Old rows saved before v2 have no image/text and render as text-only cards; **newly saved posts show the image.**

## Cloud resources
- **Google Sheet:** id `1ZbIEn59ddSFJNJ5SXVwC_OU7o4FSybXmi8-lFBhYAmg` (tabs: `marghi` gid=1829980750, plus one per teammate, `labels`; per-person tabs auto-created).
- **Apps Script web app (`/exec`, SECRET):** `https://script.google.com/macros/s/AKfycbw1m4CqBomO9dkCeeR1-d7UVxm1pxd-HZXu_v9S9JnpGbP8t6mm30bfJy1wfuppWtm5/exec` — this is BOTH the save endpoint AND the live viewer. Script editor link above.
  - `?action=labels` · `?action=people` · `?action=ensureTab&name=X` · `?action=normalize` (maintenance/JSON). No `?action` → serves the viewer.
- **Old deck artifact (DEPRECATED):** `https://claude.ai/code/artifact/3dd9a4a3-4495-429b-9fc2-a5549e3ac0b9` — superseded by the live viewer. Left as-is; not maintained.

## Local source (move with the project)
- `swipe-file-extension/` — the Chrome extension (**v1.3.0**):
  - `manifest.json` (frog icons + popup), `background.js`, `content.js` (+ `content.css`), `options.html/js` (advanced), `popup.html/js` (**onboarding**), `icons/` (frog PNGs), `make_icons.py` (regenerates icons), `apps-script/Code.gs`.
- `swipe-file-extension.zip` — distributable build for teammates.
- `format-library-deck/`:
  - `viewer.template.html` — viewer source (has a `/*__BUNDLED__*/` placeholder).
  - `build_viewer.py` — injects the Virio/Millie's reference formats → **`Viewer.html`** (the paste-ready Apps Script file). `--preview` also writes `viewer.preview.html` with mock data.
  - `Viewer.html` — **paste this into Apps Script** (built artifact).
  - `formats.json` — the Virio (60) + Millie's (27) reference formats bundled into the viewer. (marghi entries are no longer used here — they come live from the sheet.)
  - `deck.template.html` / `deck.built.html` / `build.py` — the OLD static artifact deck (deprecated; kept for reference).

## How it works now (the three goals)
1. **Onboarding = the 🐸 popup.** Click the icon → Step 1 pick/add your name (dropdown of existing people via `?action=people`, or add your own → a tab is auto-created via `?action=ensureTab`), Step 2 add labels (tap suggestions or add custom → shared `labels` tab), Step 3 buttons to open the live library + your own sheet tab (deep-linked by gid). No Apps Script/Sheet access needed for teammates.
2. **Post visuals.** The content script captures author, full text, main image URL, and reaction/comment counts (`findImage`/`matchCount` in `content.js`). The viewer is a **minimal white 3D coverflow of forward-facing LinkedIn posts** — the post stands alone and is immediately visible (`.li-post`, sharp corners, image + Like/Comment/Repost/Send). The funnel + format name + labels **float underneath** (`.underrow`), never over the post. `layout()` fans the posts (centered one lifted, neighbors angled slightly back, spread wide for travel); hover bumps a card forward. Rail hides via `#railToggle`. Brand mark = the embedded frog PNG (matches the extension icon), injected by `build_viewer.py`. (An earlier "vinyl record crate" look was tried then reverted at the user's request — `coverFace`/`FUNNEL_JOB`/`.sleeve`/`.vinyl`/`.gate` are leftover/unused.)
   - **Open post:** ↓ / Enter / click opens `openSheet()` — a post-first modal (`.sheet.post`): "← Back to library" + a key hint on top, then the full post, then funnel/labels, then the draft composer + actions. **Back** works via the on-screen button, Esc, Backspace, and the **browser Back button** (open pushes a history entry; `popstate` closes — see `modalOpen`/`hideModal`/`closeSheet`).
   - **Images (every post, incl. pre-v2 saves):** new saves use the captured image (hotlink → `getImageDataUri` proxy fallback). Everything else resolves its image from the post's LinkedIn link via `getPostImageData()` (server-side `og:image` → inlined data URI, cached 6h), lazily near the active card. **The local `viewer.preview.html` has no server**, so `build_viewer.py --preview` paints sample JPEGs onto posts so images are visible; the deployed viewer uses real post images.
4. **Keyboard-first UX (on-screen keypad shows the keys).** Library coverflow: **←/→** browse · **↑** queue the focused post (it swipe-animates to the queue counter) · **↓** first press = "see more" (expands the post; long posts scroll inside the card), second = open the **drafting menu** · **D** = browse the drafting queue in the same coverflow · **S** = shuffle · **M** = the **right-side filter wheel**. In the filter wheel: **↑/↓** move, **Enter** apply a filter (results update live), **← / Esc / M** close back to scrolling. Filters: funnel, recently-added (last 7/30 days, saved posts only — needs `savedAt` from `getViewerData`), source (person / Virio / Millie's), label, plus search.
   - **Drafting menu** (`.sheet.draft`, cushioned/rounded, warm): a "Drafting · <client>" badge, a **minimal** post strip (expandable), then the composer — client select, remembered-per-client **ICP**, "Optional instructions for Claude", and a big **editable** prompt textarea. Actions: **Open in Claude** (opens `claude.ai/new?q=<prompt>`; falls back to copy for very long prompts), Copy prompt, Queue. Back returns to the SAME post (no history/jump — `openedIndex` + `setActive`).
   - Queue + ICPs persist in `localStorage` (`fl_queue`, `fl_icps`, `fl_draftClient`). The left rail is hidden (filters moved to the wheel); the frog brand shows as the top-left corner label.
5. **Extension button** is now **black** (`content.css` `.sf-btn`), matching the popup.
6. **Look & feel (current).** Scrolling = **dark Virio teal** with slow-drifting gold dots; **queue/drafting mode = beige** (`.app.queuemode`). The coverflow is a **record crate**: the focused post is a full white LinkedIn card, neighbors are **turned & stacked colored record sleeves** (`.rec-cover`, palette in `REC_PALETTE`, color hashed from the post so it's stable). Accent = Virio **gold** (`--accent`).
   - **Right filter wheel** (`M` key or the right-edge **Filters** tab): big-type list, ↑/↓ move, **Enter toggles a filter on/off** (gold dot = applied), `←/Esc/M` back to scrolling. Sections: Clear all · Funnel · Recently added (7/30d) · Source · Label · search. **Applied filters also show as chips** (`#filterbar`) over the stage, each with × to remove.
   - **Keys:** `←/→` browse · `↑` or **`Q`** queue (swipes to the counter) · `↓` see-more then drafting menu · `D` queue mode · `S` shuffle · `M` filters.
   - **ICP pre-fill:** the drafting menu's ICP field pre-fills from `DEFAULT_ICPS[client]` (editable; a saved edit wins). Those defaults are approximate starters — refine per client.
3. **Live, no delay.** The viewer calls `getViewerData()` on every load, reading all person tabs fresh from the sheet. Save a post → refresh the library → it's there. No rebuild/republish.

## To refresh the viewer
- **Saved posts:** automatic (live). Nothing to do.
- **Virio/Millie's reference formats** (or any viewer code change): edit `viewer.template.html` (or `formats.json`) → `cd format-library-deck && python3 build_viewer.py` → paste the new `Viewer.html` into the Apps Script `Viewer` file → **redeploy (New version)**.

## Key LinkedIn DOM facts (2026, hard-won)
LinkedIn dropped data-urn/data-id/role=article + uses hashed classes. Anchor on the control-menu button `button[aria-label^="Open control menu for post by <Author>"]`; per-post wrapper = nearest ancestor whose `componentkey` contains `FeedType_MAIN_FEED`. Post link: scan wrapper descendants for `urn:li:activity:N`, else open "…" menu → "Copy link to post" → read the `[role=alert] a[href*="/posts/"]` toast. **Image:** score every `<img>`, keep licdn media, drop avatars/logos/small chrome, prefer `feedshare`/`dms/image`, take the largest. **Counts:** read `aria-label`s (`"1,234 reactions"`, `"45 comments"`). Capture everything at ➕-click (fresh ref), not at save (feed re-renders → stale).

## Apps Script deploy gotcha
Editing `Code.gs`/`Viewer` does NOT update the live app — you must **Deploy → Manage deployments → ✏️ edit → Version: New version → Deploy** (keeps same `/exec` URL).

## Next / ideas
- **Carousel/ring browse view:** 3D fan of cards that rearrange by label (ref: Online Presence® template). Not started.
- Author avatars: currently initials on a stage-colored disc. Could capture the real avatar URL too (another `findImage`-style pass) and proxy it.
- The person filter shows everyone; could add a "just me" quick toggle.
