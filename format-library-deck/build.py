#!/usr/bin/env python3
"""
Rebuild the Format Library deck data.

Portable: it does NOT depend on the Virio/Millie's plugin cache (that only exists
on the original machine). It keeps the existing Virio + Millie's rich entries from
formats.json and only re-fetches YOUR live saves (the marghi tab) from the sheet.

Usage:
    python3 build.py            # refetch marghi + rebuild formats.json + deck.built.html
Then publish deck.built.html as the artifact (same URL) from Claude Code.
"""
import json, csv, io, os, re, urllib.request

SHEET_ID = "1ZbIEn59ddSFJNJ5SXVwC_OU7o4FSybXmi8-lFBhYAmg"
MARGHI_GID = "1829980750"
HERE = os.path.dirname(os.path.abspath(__file__))
FORMATS = os.path.join(HERE, "formats.json")
TEMPLATE = os.path.join(HERE, "deck.template.html")
OUT = os.path.join(HERE, "deck.built.html")

def fetch_marghi():
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={MARGHI_GID}"
    with urllib.request.urlopen(url, timeout=30) as r:
        text = r.read().decode("utf-8")
    rows = list(csv.DictReader(io.StringIO(text)))
    seen, out = {}, []
    for r in rows:
        name = (r.get("Post Format Type") or "").strip()
        link = (r.get("Link") or "").strip()
        lane = (r.get("Funnel") or "").strip().upper()
        note = (r.get("Note") or "").strip()
        labels = [x.strip() for x in (r.get("Labels") or "").split(",") if x.strip()]
        if not name or not link:
            continue
        if link in seen:
            o = seen[link]
            for l in labels:
                if l not in o["labels"]:
                    o["labels"].append(l)
            if note and not o["note"]:
                o["note"] = note
            continue
        obj = {"name": name, "library": "marghi", "lane": lane, "archetype": "", "hook": "",
               "skeleton": [], "examples": [{"url": link, "meta": "from my swipe file"}],
               "example_text": "", "linkOnly": True, "note": note, "labels": labels}
        seen[link] = obj
        out.append(obj)
    return out

def main():
    existing = json.load(open(FORMATS, encoding="utf-8"))
    keep = [f for f in existing if f.get("library") != "marghi"]   # Virio + Millie's (rich)
    marghi = fetch_marghi()
    data = keep + marghi
    order = {"TOFU": 0, "MOFU": 1, "BOFU": 2, "ABM": 3}
    data.sort(key=lambda d: (order.get(d["lane"], 9), d["library"], d["name"]))
    txt = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    json.dump(data, open(FORMATS, "w", encoding="utf-8"), ensure_ascii=False)
    tpl = open(TEMPLATE, encoding="utf-8").read()
    built = tpl.replace("/*__FORMATS__*/ []", txt).replace("/*__FORMATS__*/", txt)
    open(OUT, "w", encoding="utf-8").write(built)
    from collections import Counter
    print("formats:", len(data), "| by library:", dict(Counter(d["library"] for d in data)))
    print("wrote:", OUT)

if __name__ == "__main__":
    main()
