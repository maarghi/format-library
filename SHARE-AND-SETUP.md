# Format Library — share & setup guide

There are two pieces:

1. **The Chrome extension** — the "➕ My Formats" button that saves LinkedIn posts to the shared Google Sheet.
2. **The Library viewer** — the web page (Apps Script) where saved posts are browsed and turned into Claude prompts.

Who you're sharing with decides which path to send.

---

## Path A — a teammate joining YOUR library (same posts, same sheet)

Best for people on your team who should see and add to the *same* collection.

**Send them:**
- The `swipe-file-extension` folder (zip it up), **or** ask them to pull it from your shared drive/repo.
- The **viewer link** (your deployed Apps Script Web App URL — the `…/exec` link).

**They do this once:**
1. Open `chrome://extensions` → toggle **Developer mode** (top-right) → **Load unpacked** → pick the `swipe-file-extension` folder.
2. Click the extension's icon → **Options** (or right-click → Options) → set **Your name / tab** to their own name (e.g. `dan`). This is the tab their saves land in. Leave the **Endpoint** as-is — it already points at the shared library.
3. Bookmark the **viewer link**. That's the library.

**Using it:** on any LinkedIn post, click **➕ My Formats**, pick a funnel stage, save. It shows up in the viewer on the next refresh. (Images/copy for brand-new saves fill in when the library owner next re-runs the image/copy bake — see the maintenance note at the bottom.)

> Everyone on this path shares one Google Sheet, so you all see each other's saves, split by name under **Source**.

---

## Path B — someone who wants their OWN separate library

Best for a different team/company who should have their own private collection. It's more setup (~15 min) because they need their own Sheet + Apps Script.

1. **Copy the Google Sheet** (File → Make a copy) so they own the data.
2. **Create an Apps Script project** bound to that copy (Extensions → Apps Script), and paste in `swipe-file-extension/apps-script/Code.standalone.gs` as `Code.gs`.
3. **Deploy → New deployment → Web app**, "Execute as **Me**", "Who has access: **Anyone**". Copy the `…/exec` URL — that's both their save-endpoint *and* their viewer link.
4. **Load the extension** (steps 1–2 from Path A), but in **Options** replace the **Endpoint** with *their* `…/exec` URL and set their name/tab.
5. Bookmark the `…/exec` URL to open the viewer.

That's a clean, self-contained copy with none of your data.

---

## Quick checklist to hand off (Path A)

- [ ] `swipe-file-extension` folder (zipped)
- [ ] Viewer link (the `…/exec` URL)
- [ ] One line: "Load unpacked in chrome://extensions, set your name in Options, bookmark the link."

---

## Maintenance note (for the library owner)

The viewer reads saved posts **live** from the sheet, so new saves appear on refresh. But LinkedIn blocks Google's servers from fetching post **images and full copy**, so those are baked in locally. When new posts have been added, re-run:

```bash
cd format-library-deck
python3 fetch_saved_images.py     # images
python3 fetch_saved_meta.py       # copy + author
python3 build_standalone.py       # rebuild Code.standalone.gs
```

Then paste the rebuilt `Code.standalone.gs` into Apps Script and **Deploy → New version**. Until then, brand-new posts show their text from the sheet but may be missing the image.
