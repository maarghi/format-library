# Chrome Web Store listing — Save to My Formats

Copy/paste these into the Web Store Developer Dashboard. Publish as **Unlisted**.

---

## Item name
Save to My Formats — Format Library

## Category
Productivity

## Language
English (United States)

## Short description (≤132 chars)
Save any LinkedIn post — text, image, funnel stage, labels and a note — into your team's live Format Library in one click.

## Detailed description
Save to My Formats turns LinkedIn into a swipe file. When you see a post worth keeping, click the "➕ My Formats" button that appears on the post and save it — the full text, author, image, and engagement — straight into your team's shared Format Library (a Google Sheet), tagged with a funnel stage, labels, and a note.

Features:
• One-click save from any LinkedIn post, right where you're reading.
• Capture the whole post: copy, author, image, reactions and comments.
• Organize by funnel stage (TOFU / MOFU / BOFU) and your own labels.
• Everyone's saves flow into one shared, always-live library.
• Works as you browse — the button follows you across the feed and profiles.

Access is limited to teammates who have the team code. Made for the Virio content team.

## Single purpose (required field)
This extension has a single purpose: to let a user save a LinkedIn post they are viewing into their team's shared Format Library, along with a funnel stage, labels, and a note.

## Permission justifications (required per permission)
- **storage** — Stores the user's settings (their name, whether they've unlocked the library with the team code, and a cached list of labels) so the extension remembers them between sessions.
- **scripting** — Injects the "➕ My Formats" save button onto LinkedIn posts and re-injects it after in-page navigation so it keeps working.
- **tabs** — Detects navigation within LinkedIn's single-page app so the save button is re-added on newly loaded posts.
- **Host permission: https://www.linkedin.com/*** — Required to place the save button on posts and read the content of the specific post the user chooses to save.
- **Host permission: https://script.google.com/* and https://script.googleusercontent.com/*** — Required to send the user's saved posts to the team's Google Apps Script web app (the Format Library backend).

## Data usage disclosures (Privacy tab)
- Does the item collect user data? **Yes.**
- Data collected: **Website content** (the LinkedIn post the user chooses to save) and **User-provided content** (name, labels, note).
- Certify:
  - ✔ Data is NOT sold to third parties.
  - ✔ Data is NOT used for purposes unrelated to the item's single purpose.
  - ✔ Data is NOT used for creditworthiness / lending.
- Privacy policy URL: **(paste the hosted privacy.html URL — see SUBMIT.md)**

## Assets checklist
- [x] Icon 128×128 (icons/icon128.png)
- [ ] At least 1 screenshot, 1280×800 or 640×400 (see SUBMIT.md — Marghi to capture, or ask Claude to grab them)
- [ ] Small promo tile 440×280 (optional)
