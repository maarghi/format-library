#!/usr/bin/env python3
"""
Produce a ONE-FILE Apps Script: Code.standalone.gs = all the backend logic + the viewer
embedded (base64). Paste it as Code.gs and deploy — no separate 'Viewer' HTML file needed.

  python3 build_viewer.py        # first, to refresh Viewer.html
  python3 build_standalone.py    # then this → writes ../swipe-file-extension/apps-script/Code.standalone.gs
"""
import base64, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
CODE = os.path.join(HERE, "..", "swipe-file-extension", "apps-script", "Code.gs")
VIEWER = os.path.join(HERE, "Viewer.html")
OUT = os.path.join(HERE, "..", "swipe-file-extension", "apps-script", "Code.standalone.gs")

code = open(CODE, encoding="utf-8").read()
html = open(VIEWER, encoding="utf-8").read()
b64 = base64.b64encode(html.encode("utf-8")).decode("ascii")

# Optional custom favicon: Apps Script's setFaviconUrl requires a HOSTED image URL
# (data URIs are rejected: "favicon icon image type is not supported"). Put a public
# PNG URL here (e.g. a link-shared Google Drive icon) to use the frog; else leave "".
FAVICON_URL = ""   # gave up on custom favicon — Apps Script rejects both data URIs and Drive-hosted PNGs
favicon_line = ("    .setFaviconUrl('" + FAVICON_URL + "')\n") if FAVICON_URL else ""

replacement = (
    "function serveViewer_() {\n"
    "  var html = Utilities.newBlob(Utilities.base64Decode(VIEWER_B64)).getDataAsString();\n"
    "  return HtmlService.createHtmlOutput(html)\n"
    "    .setTitle('Format Library')\n"
    + favicon_line +
    "    .addMetaTag('viewport', 'width=device-width, initial-scale=1')\n"
    "    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);\n"
    "}\n"
    'var VIEWER_B64 = "' + b64 + '";\n'
)

# swap the serveViewer_ function (between the markers) for the base64 version
new_code = re.sub(
    r"// SERVE_VIEWER_START.*?// SERVE_VIEWER_END",
    "// SERVE_VIEWER_START (1-file build — viewer embedded)\n" + replacement + "// SERVE_VIEWER_END",
    code, flags=re.S,
)

banner = ("/**\n * Format Library — STANDALONE (one file).\n"
          " * Paste this whole file as Code.gs, then Deploy -> Manage deployments -> New version.\n"
          " * No separate 'Viewer' HTML file needed. Regenerate with build_standalone.py.\n */\n")
open(OUT, "w", encoding="utf-8").write(banner + new_code)
print("wrote", OUT, "(", round(len(new_code)/1024), "KB )")
