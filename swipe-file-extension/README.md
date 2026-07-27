# Save to My Formats — Chrome extension

One-click save LinkedIn post formats into your **Viral Formats** Google Sheet, which feeds
The Swipe File deck. Each save records: **format name · link · funnel stage · labels · note**.

Labels are managed in a `labels` tab (Label · Category, seeded with your clients) and shown
as toggle chips in the save form; you can create new ones on the fly. The post's link is
captured reliably (via the post's "Copy link" action when it isn't already in the page).

## Setting it up for a teammate (zero technical steps for them)
The Apps Script runs as the sheet owner, so teammates need **no Google/sheet access and never touch Apps Script**. Each person's saves go to their own tab (auto-created).
1. Send them the `swipe-file-extension` folder (or the zip).
2. They load it: `chrome://extensions` → Developer mode → Load unpacked → pick the folder.
3. They open the extension's **Options**, type **their name** in "Your name", Save.
4. Done — their saves land in a tab named after them in the shared sheet. (The endpoint is baked in; the "Advanced" URL field can stay blank.)

## Updating (important)
After editing `apps-script/Code.gs`, you must **redeploy**: in the Apps Script editor →
**Deploy → Manage deployments → ✏️ edit → Version: New version → Deploy**. Editing the code
alone does not update the live web app. After editing extension files, reload it at
`chrome://extensions` (↻) and hard-refresh LinkedIn.

## Setup (once, ~5 minutes)

### 1. Add the write endpoint to your Sheet
1. Open your **Viral Formats** Google Sheet → **Extensions → Apps Script**.
2. Delete the placeholder code, paste in everything from [`apps-script/Code.gs`](apps-script/Code.gs), **Save**.
3. **Deploy → New deployment** → gear → **Web app**.
4. **Execute as: Me**, **Who has access: Anyone** → **Deploy** → authorize when Google asks.
5. Copy the **Web app URL** (ends in `/exec`).

### 2. Load the extension in Chrome
1. Go to `chrome://extensions`.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** → select this `swipe-file-extension` folder.
4. Click the extension's **Details → Extension options** (or the puzzle-piece menu → ⋮ → Options).
5. Paste your Web app URL → **Save**.

### 3. Use it
1. Go to LinkedIn (logged in). Hover any post — a **➕ Swipe File** button appears top-right.
2. Click it → name the format, pick **TOFU / MOFU / BOFU** → **Save**.
3. The row lands in your sheet's **`marghi`** tab. **Check the sheet after your first save** to confirm the connection.

## Notes & limits
- **Desktop Chrome only** — extensions don't run on phones.
- **The deck doesn't auto-refresh yet.** This step saves to the sheet; regenerating and
  republishing The Swipe File from the sheet is the next piece (step 2).
- LinkedIn changes its markup often. Link + name + funnel are the reliable fields; text/
  image/engagement are best-effort and may occasionally come through blank.
- Image URLs from LinkedIn can expire — fine for now; step 2 will handle media embedding.
- Reading LinkedIn's DOM is against LinkedIn's ToS; this only reads posts you're already
  viewing and only when you click. Use at your own discretion.

## Files
| File | Role |
|---|---|
| `manifest.json` | Extension config (MV3) |
| `content.js` / `content.css` | Injects the button + save form, extracts post data |
| `background.js` | POSTs the save to your Apps Script URL |
| `options.html` / `options.js` | One-time setup: store your Sheet URL |
| `apps-script/Code.gs` | Paste into the Sheet; appends the row |
