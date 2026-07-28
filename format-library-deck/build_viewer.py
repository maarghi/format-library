#!/usr/bin/env python3
"""
Build the paste-ready Apps Script viewer.

  python3 build_viewer.py            → writes Viewer.html (paste into Apps Script as HTML file "Viewer")
  python3 build_viewer.py --preview  → also writes viewer.preview.html with mock saved posts

The viewer ships the Virio + Millie's reference formats inline (BUNDLED) and pulls the
LIVE saved posts from the sheet at runtime via google.script.run.getViewerData().
"""
import json, os, sys, base64, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
FORMATS = os.path.join(HERE, "formats.json")
TEMPLATE = os.path.join(HERE, "viewer.template.html")
ICON = os.path.join(HERE, "..", "swipe-file-extension", "icons", "icon128.png")
OUT = os.path.join(HERE, "Viewer.html")
PREVIEW = os.path.join(HERE, "viewer.preview.html")

def bundled_json():
    data = json.load(open(FORMATS, encoding="utf-8"))
    keep = [f for f in data if f.get("library") != "marghi"]   # Virio + Millie's (rich)
    return json.dumps(keep, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

def frog_data_uri():
    b64 = base64.b64encode(open(ICON, "rb").read()).decode("ascii")
    return "data:image/png;base64," + b64

def post_images_json():
    p = os.path.join(HERE, "post_images.json")
    data = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

def post_meta_json():
    p = os.path.join(HERE, "post_meta.json")
    data = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
    return json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")

def build(txt):
    tpl = open(TEMPLATE, encoding="utf-8").read()
    tpl = tpl.replace("__FROG_ICON__", frog_data_uri())
    tpl = tpl.replace("/*__POSTIMAGES__*/ {}", post_images_json()).replace("/*__POSTIMAGES__*/", post_images_json())
    tpl = tpl.replace("/*__POSTMETA__*/ {}", post_meta_json()).replace("/*__POSTMETA__*/", post_meta_json())
    return tpl.replace("/*__BUNDLED__*/ []", txt).replace("/*__BUNDLED__*/", txt)

def sample_images():
    """A few real raster images so the LOCAL preview can show pictures (it has no server
    to fetch LinkedIn images). Deployed viewer uses real post images instead."""
    from PIL import Image, ImageDraw
    import io
    palettes = [((71,109,115),(20,40,44)), ((207,94,50),(60,20,10)),
                ((125,119,48),(30,28,10)), ((44,67,71),(10,20,22))]
    uris = []
    for i, (c1, c2) in enumerate(palettes):
        W, H = 700, 394
        img = Image.new("RGB", (W, H), c2)
        d = ImageDraw.Draw(img)
        for y in range(H):  # vertical gradient
            t = y / H
            d.line([(0, y), (W, y)], fill=tuple(int(c2[k] + (c1[k]-c2[k])*t) for k in range(3)))
        # a few "content" blocks so it clearly reads as an image
        if i % 2 == 0:
            for b, bx in enumerate(range(90, W-90, 120)):
                bh = 40 + (b*37) % 180
                d.rectangle([bx, H-70-bh, bx+70, H-70], fill=tuple(min(255, c1[k]+40) for k in range(3)))
        else:
            d.ellipse([W//2-120, H//2-120, W//2+120, H//2+120], outline=tuple(min(255,c1[k]+60) for k in range(3)), width=10)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=72)
        uris.append("data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("ascii"))
    return uris

def main():
    data = json.load(open(FORMATS, encoding="utf-8"))
    keep = [f for f in data if f.get("library") != "marghi"]
    txt = json.dumps(keep, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    open(OUT, "w", encoding="utf-8").write(build(txt))
    print("wrote", OUT)
    if "--preview" in sys.argv:
        imgs = sample_images()
        # DEMO ONLY: paint sample images onto the first chunk of bundled formats so the
        # local preview shows pictures. The deployed viewer fetches real post images.
        keep2 = [dict(f) for f in keep]
        for j, f in enumerate(keep2):
            if not f.get("image"):          # real og:images win; samples only fill the gaps
                f["image"] = imgs[j % len(imgs)]
        txt2 = json.dumps(keep2, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
        mock = [
            {"name":"Founder origin story","library":"saved","person":"Marghi","lane":"TOFU",
             "note":"strong hook — great for Arceus","labels":["Arceus","Strong hook"],
             "author":"Mac Liu","example_text":"I almost shut the company down in 2021.\n\nHere's the 3-sentence email that saved it — and the lesson I still use every week when a deal stalls and the team looks to me for the call.","image":imgs[0],
             "reactions":"1,204","comments":"88","savedAt":(datetime.datetime.utcnow()-datetime.timedelta(days=2)).isoformat(),"examples":[{"url":"https://linkedin.com/x","meta":"saved by Marghi"}]},
            {"name":"Contrarian data take","library":"saved","person":"Millie","lane":"MOFU",
             "note":"","labels":["Data-backed","Contrarian take"],
             "author":"Katy Carrigan","example_text":"Everyone says post daily.\n\nWe analyzed 226,000 posts. Daily posting correlated with LOWER reach for 71% of accounts. Here's what actually moved the needle.","image":imgs[1],
             "reactions":"640","comments":"212","savedAt":(datetime.datetime.utcnow()-datetime.timedelta(days=20)).isoformat(),"examples":[{"url":"https://linkedin.com/y","meta":"saved by Millie"}]},
        ]
        preview = build(txt2).replace("let SAVED = [];",
                                      "window.__MOCK_SAVED__=" + json.dumps(mock, ensure_ascii=False) + ";\nlet SAVED = [];")
        open(PREVIEW, "w", encoding="utf-8").write(preview)
        print("wrote", PREVIEW)

if __name__ == "__main__":
    main()
