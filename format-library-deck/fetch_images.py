#!/usr/bin/env python3
"""
Fetch each reference post's preview image (og:image) from its LinkedIn URL and bake it into
formats.json as f["image"], so the library shows a picture for every post — not just new saves.
Run:  python3 fetch_images.py   (then rebuild the viewer / standalone)
"""
import json, os, re, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
FORMATS = os.path.join(HERE, "formats.json")
UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
OG = re.compile(r'property=["\']og:image["\'][^>]*content=["\']([^"\']+)', re.I)
OG2 = re.compile(r'content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']', re.I)

def og_image(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    html = urllib.request.urlopen(req, timeout=18).read().decode("utf-8", "ignore")
    m = OG.search(html) or OG2.search(html)
    img = m.group(1).replace("&amp;", "&") if m else ""
    if re.search(r"static\.licdn\.com/(sc|aero)", img):  # generic brand fallback → treat as none
        return ""
    return img

def main():
    data = json.load(open(FORMATS, encoding="utf-8"))
    todo = [f for f in data if f.get("library") != "marghi" and not f.get("image")
            and f.get("examples") and f["examples"][0].get("url")]
    print("fetching images for", len(todo), "posts…")
    ok = fail = 0
    for i, f in enumerate(todo, 1):
        url = f["examples"][0]["url"]
        for attempt in range(2):
            try:
                img = og_image(url)
                if img:
                    f["image"] = img; ok += 1
                else:
                    fail += 1
                break
            except Exception as e:
                if attempt == 1:
                    fail += 1
                    print("  miss:", url[:70], "-", str(e)[:40])
                time.sleep(0.8)
        if i % 10 == 0:
            print(f"  {i}/{len(todo)}  (ok {ok}, miss {fail})")
            json.dump(data, open(FORMATS, "w", encoding="utf-8"), ensure_ascii=False)  # checkpoint
        time.sleep(0.25)
    json.dump(data, open(FORMATS, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"done — {ok} images added, {fail} missing. saved formats.json")

if __name__ == "__main__":
    main()
