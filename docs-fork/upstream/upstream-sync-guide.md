# Upstream Sync Guide

How to sync this fork with the latest
[google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli).

---

## Prerequisites

**Git identity** (one-time setup):

```bash
git config user.name "Your Name"
git config user.email "your@email.com"
```

**Upstream remote** (one-time setup):

```bash
git remote add upstream https://github.com/google-gemini/gemini-cli.git
```

---

## Step-by-Step

### 1. Save any uncommitted work

```bash
git stash
```

### 2. Analyze what's changed

```bash
./scripts/fork/upstream-sync.sh
```

This will:
- Fetch the latest upstream code
- Create a backup tag (`pre-merge-backup-YYYYMMDD`)
- Show how many commits need merging
- Show which files will conflict

Review the output. Note the **backup tag name** — you'll need it if something
goes wrong.

### 3. Start the merge

```bash
git merge upstream/main --no-commit
```

This merges but does NOT commit, so you can inspect and fix conflicts first.

### 4. Resolve conflicts

```bash
git status
```

Files marked `both modified` need manual resolution. Open each one and:

1. Search for `<<<<<<<` conflict markers
2. Look for `// [FORK]` comments — these mark our fork's changes
3. Keep both upstream changes AND fork changes
4. Remove the conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)

**Common patterns:**

| Situation | What to do |
|-----------|------------|
| Upstream changed code around a `[FORK]` block | Keep upstream's changes, re-add the `[FORK]` block |
| Upstream deleted code that our fork modified | Take upstream's deletion, move fork logic elsewhere if still needed |
| Both sides added code in the same spot | Keep both additions |
| `package-lock.json` conflict | Delete it, run `npm install` to regenerate |

After resolving each file:

```bash
git add <resolved-file>
```

### 5. Build and test

```bash
npm install --ignore-scripts
npm run build
npm run typecheck
npm test
```

Fix any errors before committing.

### 6. Verify fork features survived

```bash
./scripts/fork/verify-fork-features.sh
```

This checks that all fork-created files exist and `[FORK]` markers are still
present in modified files.

### 7. Commit the merge

```bash
git commit -m "merge: sync with upstream vX.Y.Z"
```

Replace `vX.Y.Z` with the upstream version (shown in Step 2 output).

### 8. Restore stashed work

```bash
git stash pop
```

If there are conflicts with the stash, resolve them the same way as Step 4.

### 9. Final build and run

```bash
npm run build
node packages/cli        # or: gemini
```

---

## If Something Goes Wrong

**Cancel merge in progress:**

```bash
git merge --abort
```

**Go back to before the merge started:**

```bash
git reset --hard pre-merge-backup-YYYYMMDD
```

(Use the tag name from Step 2.)

**Restore stashed work after aborting:**

```bash
git stash pop
```

---

## Tips

- **Do this regularly** — monthly syncs are easier than quarterly ones.
- **Small conflicts are normal** — the `[FORK]` markers make them easy to
  resolve.
- **`package-lock.json`** always conflicts — just delete it and run
  `npm install`.
- **Test files** may need updated mocks — if tests fail after merge, check
  that `getAuthTypeFromEnv` is mocked to return `undefined` in test files
  that use `...actual` spread from `@google/gemini-cli-core`.
