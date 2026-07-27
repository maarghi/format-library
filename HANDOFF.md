# Format Library — Project Handoff

Read this to resume work with full context (e.g. after moving to another computer).
Tell Claude: **"Read HANDOFF.md and catch up."**

## What this is
A system for collecting viral LinkedIn post formats and drafting content from them:
1. **Format Library deck** — a hosted, browsable/filterable deck of viral formats.
2. **"Save to My Formats" Chrome extension** — a ➕ button on LinkedIn posts that saves the format to a Google Sheet.
3. **Google Sheet** — the source of truth (per-person tabs + a shared `labels` tab).
4. **Google Apps Script web app** — receives saves from the extension and writes to the sheet.

## Cloud resources (accessible from ANY computer with the right login)
- **Deck (artifact):** https://claude.ai/code/artifact/3dd9a4a3-4495-429b-9fc2-a5549e3ac0b9
- **Google Sheet:** id `1ZbIEn59ddSFJNJ5SXVwC_OU7o4FSybXmi8-lFBhYAmg` (tabs: `marghi` gid=1829980750, `millie`, `virio`, `labels`; per-person tabs auto-created)
- **Apps Script web app (v4, live):** `https://script.google.com/macros/s/AKfycbw1m4CqBomO9dkCeeR1-d7UVxm1pxd-HZXu_v9S9JnpGbP8t6mm30bfJy1wfuppWtm5/exec` (SECRET — writes to the sheet). Script editor: `https://script.google.com/home/projects/1S5cUm9b62iE_es7424OQsghe11hw14w-q3QMwD5aB7de5Bv4csMk7dQr/edit`. Remote maintenance (no editor): append `?action=normalize` (tidy marghi schema) / `?action=cleanup` / `?action=labels`.

## Local source (in this folder — move with the project)
- `swipe-file-extension/` — the Chrome extension (v1.2.0) + `apps-script/Code.gs`.
- `swipe-file-extension.zip` — distributable build (teammate-ready).
- `format-library-deck/` — the deck source: `deck.template.html` (has a `/*__FORMATS__*/` placeholder), `formats.json` (current data: 81 marghi + 60 Virio + 27 Millie's = 168), `deck.built.html`, `build.py`.

## Current state (all DONE)
- Extension: ➕ "My Formats" button on LinkedIn posts → form (name, funnel, labels, note) → saves name/link/funnel/note/labels. Reliable link capture (copy-link toast). Delete-label (× on chips). **Teammate-ready:** endpoint baked in, "Your name" field in Options sets a per-person tab (auto-created); teammates need no Apps Script/Google access.
- Deck: **renamed to "Format Library"**, **restyled to match virio.ai** (cream `#FFF9ED`, ink `#1B1B18`, gold `#D5B473`, funnel hues TOFU teal `#476D73` / MOFU olive `#7D7730` / BOFU terracotta `#CF5E32` / ABM dark-teal `#2C4347`, mono uppercase labels, grain overlay — Helvetica Neue+SF Mono stand in for licensed Haffer). Filters by funnel/library/label; shows labels + notes.

## To rebuild + republish the deck (the "refresh")
The hosted deck can't read the sheet live, so refreshing = rebuild + republish:
1. `cd format-library-deck && python3 build.py` (refetches your marghi saves; keeps Virio/Millie's rich data from formats.json).
2. Publish `deck.built.html` as the artifact to the SAME url (pass `url=` the artifact link).

## Key LinkedIn DOM facts (2026, hard-won)
LinkedIn dropped data-urn/data-id/role=article + uses hashed classes. Anchor on the control-menu button `button[aria-label^="Open control menu for post by <Author>"]`; per-post wrapper = nearest ancestor whose `componentkey` contains `FeedType_MAIN_FEED`. Post link: scan wrapper descendants for `urn:li:activity:N`, else open "…" menu → "Copy link to post" → read the `[role=alert] a[href*="/posts/"]` toast. Capture the link at ➕-click (fresh ref), not at save (feed re-renders → stale).

## Apps Script deploy gotcha
Editing `Code.gs` does NOT update the live app — must **Deploy → Manage deployments → ✏️ edit → Version: New version → Deploy** (keeps same /exec URL).

## Next / in-flight
- **Image render (chosen, PAUSED mid-feasibility):** user wants saved posts rendered in the deck with the image, pixel-identical to LinkedIn. Blocked by: (a) we stopped capturing post content, (b) hosted deck can't load LinkedIn image servers (must embed as data URI). Was testing whether LinkedIn images are fetchable server-side for build-time embedding.
- **Carousel/ring browse view:** 3D fan of cards that animate in and rearrange by label (reference: Online Presence® template). Not started.
- Deck refresh can be scheduled/automated.
