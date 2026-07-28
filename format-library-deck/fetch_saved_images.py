#!/usr/bin/env python3
"""
Fetch og:images for the team's SAVED posts (read from the live sheet) and write a
{link: image} map to post_images.json. LinkedIn serves these to us but blocks Google's
Apps Script servers, so we resolve them here and bake the map into the viewer.
"""
import urllib.request, csv, io, re, json, os, time

SHEET = "1ZbIEn59ddSFJNJ5SXVwC_OU7o4FSybXmi8-lFBhYAmg"
TABS = {"Marghi": "1829980750", "Millie": "576473075"}
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "post_images.json")
UA = {"User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"}
OG = re.compile(r'property=["\']og:image["\'][^>]*content=["\']([^"\']+)', re.I)
OG2 = re.compile(r'content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']', re.I)

def og_image(url):
    h = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=18).read().decode("utf-8", "ignore")
    m = OG.search(h) or OG2.search(h)
    img = m.group(1).replace("&amp;", "&") if m else ""
    if re.search(r"static\.licdn\.com/(sc|aero)", img):   # generic brand fallback → skip
        return ""
    return img

def main():
    existing = {}
    if os.path.exists(OUT):
        existing = json.load(open(OUT, encoding="utf-8"))
    links = []
    for name, gid in TABS.items():
        try:
            txt = urllib.request.urlopen(f"https://docs.google.com/spreadsheets/d/{SHEET}/export?format=csv&gid={gid}", timeout=25).read().decode("utf-8")
            for r in csv.DictReader(io.StringIO(txt)):
                lk = (r.get("Link") or "").strip()
                if lk and lk not in existing:
                    links.append(lk)
        except Exception as e:
            print(name, "read ERR", e)
    links = list(dict.fromkeys(links))
    print("resolving", len(links), "new links…")
    out = dict(existing); ok = 0
    for i, lk in enumerate(links, 1):
        for attempt in range(2):
            try:
                img = og_image(lk)
                if img: out[lk] = img; ok += 1
                break
            except Exception:
                if attempt == 1: pass
                time.sleep(0.7)
        if i % 20 == 0:
            print(f"  {i}/{len(links)} (ok {ok})")
            json.dump(out, open(OUT, "w", encoding="utf-8"))
        time.sleep(0.2)
    json.dump(out, open(OUT, "w", encoding="utf-8"))
    print(f"done — {len(out)} total images mapped ({ok} new). wrote post_images.json")

if __name__ == "__main__":
    main()
