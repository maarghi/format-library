# Deploy runbook

## The facts, as of 2026-07-30

| Thing | Value |
|---|---|
| Script ID | `1S5cUm9b62iE_es7424OQsghe11hw14w-q3QMwD5aB7de5Bv4csMk7dQr` |
| Live deployment | **Version 17, created 2026-07-28 06:49** |
| Deployment ID | `AKfycbw1m4CqBomO9dkCeeR1-d7UVxm1pxd-HZXu_v9S9JnpGbP8t6mm30bfJy1wfuppWtm5` |
| Architecture live | **Standalone. One file, `Code.gs`. There is no `Viewer` HTML file in the project.** |
| Sheet | `1ZbIEn59ddSFJNJ5SXVwC_OU7o4FSybXmi8-lFBhYAmg` ("Viral Formats - Marghi") |

**Every commit after 2026-07-28 06:49 is unpublished.** That is four of the six commits, plus the current uncommitted change.

## Why this got confusing

1. **No clasp.** Deploys were manual copy-paste, so git had no idea what was live and could not tell you.
2. **The deployed file contains two contradictory headers.** `build_standalone.py` prepends the standalone header ("paste this whole file, no separate Viewer needed") on top of the original two-file header ("two files live in this project: Code.gs and Viewer"). The file argues with itself. `HANDOFF.md` documents the two-file version, which is not what is live.
3. **The rollback churn never reached production.** The four commits on Jul 28 were fighting with local files that were never deployed. v17 sat untouched the whole time.

## Known state of the working tree

`swipe-file-extension/apps-script/Code.standalone.gs` is modified and uncommitted. The change strips `<meta charset="utf-8">` from the embedded viewer, which is exactly what commit `2acee63` ("Regenerate standalone build with UTF-8 charset (working version)") added on purpose.

**That edit is a regression. Do not deploy it.**

To drop it: `git checkout -- swipe-file-extension/apps-script/Code.standalone.gs`

## Setting up clasp (run these yourself, in Terminal)

This session cannot install packages on your machine. Four commands:

```bash
npm install -g @google/clasp
clasp login

# pull v17 into a scratch folder, NOT over the repo
mkdir -p ~/Desktop/_clasp-scratch && cd ~/Desktop/_clasp-scratch
clasp clone 1S5cUm9b62iE_es7424OQsghe11hw14w-q3QMwD5aB7de5Bv4csMk7dQr
```

That gives you the exact deployed source with nothing overwritten. Then come back here and we diff it against the repo.

**Do not run `clasp clone` or `clasp pull` inside `format-library/` yet.** It overwrites local files, and right now local is ahead of live in ways nobody has verified.

## Once clasp is wired up

```bash
clasp push                          # repo -> Apps Script editor
clasp deploy -i AKfycbw1m4Cq... -d "v18: <what changed>"   # editor -> live, same /exec URL
git tag deploy-v18 && git push --tags
```

The tag is the part that ends the confusion for good. "Revert to the last working deploy" becomes `git checkout deploy-v17` instead of archaeology.

## Rules going forward

1. **Never hand-edit `Code.standalone.gs`.** It is a build artifact from `build_standalone.py`. Edit `viewer.template.html`, rebuild, then push.
2. **Tag every deploy.** No tag, no deploy.
3. **One architecture.** Live is standalone. `HANDOFF.md` still documents the two-file setup and needs fixing or deleting.
4. Commit before pulling. Always.

## Open

- `.claude/` is untracked. Add to `.gitignore` or commit it.
- `Claude Code/linkedin-swipe-file/` is the July 25 prototype. Its `Code.gs` is 4.7KB against the current 18.6KB and they have diverged completely. Retire it.
