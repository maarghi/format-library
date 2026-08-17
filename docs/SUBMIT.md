# Submitting to the Chrome Web Store (Unlisted)

One-time setup to get "Save to My Formats" onto the store as an **Unlisted** item —
teammates install it from a link you share.

## 0. Before you upload — set your real team code
The packaged zip includes `config.js`, which currently has `VIRIO_CODE: 'virio-frogs'`.
Anyone who installs can read it, so pick the code you actually want, set it in
`swipe-file-extension/config.js`, and rebuild the zip (ask Claude, or run the zip command
in the repo). Give that code to the team.

## 1. Register as a developer (one-time, $5)
Go to the **Chrome Web Store Developer Dashboard**:
https://chrome.google.com/webstore/devconsole
Sign in with the Google account you want to own the extension, pay the one-time $5 fee.

## 2. Host the privacy policy → get a URL
The store requires a public privacy-policy URL. `docs/privacy.html` is ready. Easiest option:

**GitHub Pages** (works if the repo is public):
1. Repo → **Settings → Pages**.
2. Source: **Deploy from a branch** → Branch **main**, folder **/docs** → Save.
3. After a minute the URL is: `https://maarghi.github.io/format-library/privacy.html`

If the repo is private (or you prefer not to enable Pages): paste the contents of
`docs/privacy.html` into a **public GitHub Gist**, a **Google Site**, or a **Notion public
page**, and use that URL instead.

## 3. Create the item and upload
1. Dashboard → **Add new item**.
2. Upload `dist/format-library-extension-v1.8.0.zip`.

## 4. Fill the listing
Copy fields from `docs/STORE_LISTING.md`:
- Name, short description, detailed description, category (Productivity), language.
- **Screenshots:** at least one 1280×800 or 640×400 image. Good ones to capture:
  the "➕ My Formats" save form open on a LinkedIn post, and the Format Library deck.
  (Ask Claude to grab these in your browser if you want.)
- Icon 128×128 is already in the package.

## 5. Privacy tab
- Single purpose: from `STORE_LISTING.md`.
- Permission justifications: from `STORE_LISTING.md` (one per permission).
- Data-usage disclosures: **collects Website content + User-provided content**; certify
  not sold, not for unrelated purposes, not for creditworthiness.
- **Privacy policy URL:** paste the URL from step 2.

## 6. Visibility → Unlisted
Under **Visibility**, choose **Unlisted**. Save the draft.

## 7. Submit for review
Click **Submit for review**. Review usually takes a few days. Once approved, the item page
URL is your **install link** — share it with the team.

## Updating later
Bump the `version` in `manifest.json`, rebuild the zip, upload it as a new package on the
same item, and submit. Users auto-update. (The Apps Script backend is separate — deploy that
from Apps Script as before; it isn't part of the store package.)
