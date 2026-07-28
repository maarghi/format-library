#!/usr/bin/env python3
"""
Fetch post COPY + AUTHOR (+image) for the team's saved posts from their LinkedIn links
and write {link: {text, author, image}} to post_meta.json. LinkedIn serves og-tags to us
but blocks Google's Apps Script servers, so we resolve here and bake the map into the viewer.

Most sheet rows only have a format name + link (no captured copy), so this backfills the copy.
"""
import urllib.request, csv, io, re, json, os, time, html as _html

SHEET = "1ZbIEn59ddSFJNJ5SXVwC_OU7o4FSybXmi8-lFBhYAmg"
TABS = {"Marghi": "1829980750", "Millie": "576473075"}
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "post_meta.json")
UA = {"User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"}

def og(h, prop):
    # capture the whole content value up to the MATCHING quote (inner quotes are &quot;/&#39; encoded);
    # do NOT stop at the first apostrophe — that truncated posts full of "what's / don't / team's".
    m = (re.search(r'property=["\']og:'+prop+r'["\'][^>]*?content=(["\'])(.*?)\1', h, re.I | re.S)
         or re.search(r'content=(["\'])(.*?)\1[^>]*?property=["\']og:'+prop+r'["\']', h, re.I | re.S))
    if not m: return ""
    v = m.group(2)
    for _ in range(3):                       # some LinkedIn values are double-encoded (&amp;#39;)
        nv = _html.unescape(v)
        if nv == v: break
        v = nv
    return v

def clean_img(img):
    return "" if re.search(r"static\.licdn\.com/(sc|aero)", img) else img

def parse_author(title, desc):
    # "…text… | Adam Schoenfeld posted on the topic | LinkedIn"
    m = re.search(r'\|\s*([^|]+?)\s+posted on', title, re.I)
    if m: return m.group(1).strip()
    # "Adam Schoenfeld on LinkedIn: …"
    m = re.search(r'^(.{2,60}?)\s+on LinkedIn[:\|]', title, re.I)
    if m: return m.group(1).strip()
    return ""

def clean_text(text):
    text = re.sub(r'\s*\|\s*LinkedIn\s*$', '', text).strip()
    # reshare titles look like "Commentary | Author | 36 comments" — keep just the commentary.
    # Guard on length so we never chop a real (long) post body that happens to contain "|".
    if "|" in text and re.search(r"\bcomments?\b", text, re.I) and len(text) < 220:
        text = text.split("|")[0].strip()
    return text

def fetch(url):
    h = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=18).read().decode("utf-8", "ignore")
    title, desc = og(h, "title"), og(h, "description")
    # prefer the longer of description / title as the copy (title is sometimes the full hook)
    text = clean_text(desc if len(desc) >= len(title) else title)
    return {"text": text, "author": parse_author(title, desc), "image": clean_img(og(h, "image"))}

def main():
    out = json.load(open(OUT, encoding="utf-8")) if os.path.exists(OUT) else {}
    links = []
    for name, gid in TABS.items():
        try:
            txt = urllib.request.urlopen(f"https://docs.google.com/spreadsheets/d/{SHEET}/export?format=csv&gid={gid}", timeout=25).read().decode("utf-8")
            for r in csv.DictReader(io.StringIO(txt)):
                lk = (r.get("Link") or "").strip()
                if lk: links.append(lk)
        except Exception as e:
            print(name, "read ERR", e)
    links = [l for l in dict.fromkeys(links)]
    todo = [l for l in links if l not in out or not out[l].get("text")]
    print(f"{len(links)} links, resolving {len(todo)} …")
    ok = 0
    for i, lk in enumerate(todo, 1):
        for attempt in range(2):
            try:
                d = fetch(lk)
                if d.get("text") or d.get("image"):
                    out[lk] = d; ok += 1
                break
            except Exception:
                if attempt == 1: break
                time.sleep(0.7)
        if i % 20 == 0:
            print(f"  {i}/{len(todo)} (ok {ok})"); json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
        time.sleep(0.2)
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"done — {len(out)} mapped ({ok} new). wrote post_meta.json")

if __name__ == "__main__":
    main()
