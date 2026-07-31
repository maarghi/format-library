# How to go back when something breaks

Three separate safety nets. Use the first one for emergencies.

---

## 1. The live site (easiest, no Terminal)

**Google already saves every version you have ever deployed.** There are 17.

1. Open the Apps Script project
2. **Deploy → Manage deployments**
3. Click the pencil (edit)
4. Open the **Version** dropdown. Every past version is listed with its date.
5. Pick an older one → **Deploy**

The site goes back immediately. The `/exec` link stays the same, so nobody else notices anything except that it works again.

**This is your panic button.** It does not touch your laptop at all.

---

## 2. Your laptop files (git)

Git is a time machine for your folder, but only for moments you told it to remember. Those moments are called commits.

See the list:

```bash
cd ~/Desktop/format-library
git log --oneline
```

Undo changes to one file, back to the last remembered moment:

```bash
git checkout -- path/to/file
```

Go back to a specific moment (copy the short code from `git log`):

```bash
git checkout 2acee63 -- path/to/file
```

**Tags are nicknames for moments**, so you do not have to remember codes:

```bash
git tag known-good-2026-07-30        # name this moment
git checkout known-good-2026-07-30 -- .   # come back to it later
```

---

## 3. A plain copy (no tools)

Before anything scary, just duplicate the folder in Finder. `format-library copy`. Unglamorous and it always works.

---

# Setup, run these once

Paste one block at a time in Terminal. Read the comment above each first.

```bash
cd ~/Desktop/format-library

# Delete the leftover lock file (safe, it is empty)
rm .git/index.lock.stale-remove-me

# Tell git who you are. One time only.
git config user.name "Marghi Andreassi"
git config user.email "marghi@virio.ai"

# Stop tracking editor settings
echo ".claude/" >> .gitignore
```

```bash
# Save the current half-finished edit so it can never be lost,
# even though it is the one with the missing charset.
git add -A
git commit -m "WIP: standalone build missing UTF-8 charset - do not deploy"
```

```bash
# Now put the good version of the finished file back
git checkout 2acee63 -- swipe-file-extension/apps-script/Code.standalone.gs
git commit -am "Restore working standalone build with UTF-8 charset"

# Nickname this moment so you can always return to it
git tag known-good-2026-07-30
```

```bash
# Send it all to GitHub so it exists somewhere other than this laptop
git push
git push --tags
```

---

# Then: go look at what is actually live

This copies the deployed code into a brand new empty folder. **Nothing of yours is touched.**

```bash
npm install -g @google/clasp
clasp login

mkdir -p ~/Desktop/_clasp-scratch
cd ~/Desktop/_clasp-scratch
clasp clone 1S5cUm9b62iE_es7424OQsghe11hw14w-q3QMwD5aB7de5Bv4csMk7dQr
```

Then tell Claude it is done and it will compare the two and report what drifted.

**Do not run clasp inside `format-library/`.** It overwrites files.

---

# The rule that prevents all of this

Every time you deploy, nickname it:

```bash
git tag deploy-v18
git push --tags
```

Then "put it back the way it was" is one command instead of an afternoon.
