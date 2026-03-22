# Upstream Sync Guide

How to sync this fork with stable releases of
[google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli).

---

## Quick Summary

If you've done this before and just need the commands:

```bash
git stash                                    # 1. Save work
./scripts/fork/upstream-sync.sh              # 2. Check for new stable release
git merge vX.Y.Z --no-commit                 # 3. Start merge (use tag from script output)
# ... resolve any conflicts, then:
git add <resolved-files>                     # 4. Stage resolved files
npm install --ignore-scripts                 # 5. Build & test
npm run build && npm run typecheck && npm test
./scripts/fork/verify-fork-features.sh       # 6. Verify fork features
git commit -m "merge: sync with upstream vX.Y.Z"  # 7. Commit
# Update docs-fork/upstream/merge-history.md       # 8. Record the merge
git stash pop                                # 9. Restore work
```

If something goes wrong: `git merge --abort` or
`git reset --hard pre-merge-backup-YYYYMMDD`

---

## Strategy

### Why merge (not rebase)

- Fork-specific commits are interleaved with upstream commits, making rebase
  extremely painful
- Merge preserves both histories cleanly
- Single merge commit is easy to revert if needed
- `git log --first-parent` gives a clean view

### Branch model

```
main (fork)  ───●───●───●───M───  (merge commit)
                            /
upstream tag  ─────────────●  (e.g., v0.35.0)
```

### Stable releases only

We only merge from **stable** upstream tags: `vX.Y.Z` (no `-preview`, no
`-nightly` suffix). The sync script detects the latest stable tag automatically
and skips if we're already up to date.

- Stable: `v0.34.0`, `v0.35.0` — merge these
- Preview: `v0.35.0-preview.2` — skip
- Nightly: `v0.36.0-nightly.20260318.abc1234` — skip

See `merge-history.md` for the record of all past merges and backup tags.

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

### 2. Run the sync script

```bash
./scripts/fork/upstream-sync.sh
```

This will:

- Fetch the latest upstream code and tags
- Find the latest stable release tag (`vX.Y.Z`)
- Compare against the last synced version (from `merge-history.md`)
- If no new stable release: report "up to date" and exit
- If a new stable release exists: create a backup tag, run conflict analysis,
  and print merge instructions

Note the **backup tag name** and **stable tag** from the output.

Use `--force` to run conflict analysis even when already up to date. Use
`--dry-run` to preview without modifying anything.

### 3. Start the merge

```bash
git merge vX.Y.Z --no-commit
```

Use the exact tag shown in the script output (e.g.,
`git merge v0.35.0 --no-commit`).

This merges but does NOT commit, so you can inspect and fix conflicts first.

### 4. Resolve conflicts

```bash
git status
```

Files marked `both modified` need manual resolution. Here's what to do:

#### What a conflict looks like

When you open a conflicting file, you'll see blocks like this:

```
<<<<<<< HEAD
  // This is our fork's version of the code
  const result = doSomething(bestEffort);  // [FORK] added bestEffort
=======
  // This is upstream's version of the code
  const result = doSomething(newOption);
>>>>>>> v0.35.0
```

- **Between `<<<<<<< HEAD` and `=======`** — our fork's code
- **Between `=======` and `>>>>>>> v0.35.0`** — upstream's code
- **Goal:** combine both, then delete all three marker lines

#### How to resolve

For each conflicting file:

1. Open the file and search for `<<<<<<<`
2. Look for `// [FORK]` comments — these mark our fork's changes
3. **Keep both** upstream changes AND fork changes (merge them together)
4. Delete the three marker lines (`<<<<<<<`, `=======`, `>>>>>>>`)
5. Save the file

**Example resolution** (combining both sides):

```typescript
// Merged: upstream's newOption + fork's bestEffort
const result = doSomething(newOption, bestEffort); // [FORK] added bestEffort
```

See the [Conflict Resolution Reference](#conflict-resolution-reference) below
for per-file strategies and risk levels.

#### After resolving each file

```bash
git add <resolved-file>
```

When all conflicts are resolved, `git status` should show no `both modified`
files. You can also run `git diff --check` to verify no conflict markers remain.

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

Replace `vX.Y.Z` with the stable tag you merged.

### 8. Update merge history

Add a new row **at the top** of the table in
`docs-fork/upstream/merge-history.md`:

```markdown
| 2026-04-15 | v0.35.0 | pre-merge-backup-20260415 | abc1234 | 5 | Clean merge,
no tricky conflicts |
```

To get the merge commit hash: `git rev-parse --short HEAD`

### 9. Restore stashed work

```bash
git stash pop
```

If there are conflicts with the stash, resolve them the same way as Step 4.

### 10. Final build and run

```bash
npm run build
node packages/cli        # or: gemini
```

---

## Recovery

**Cancel merge in progress:**

```bash
git merge --abort
```

**Go back to before the merge started:**

```bash
git reset --hard pre-merge-backup-YYYYMMDD
```

(Use the tag name from Step 2 output. All backup tags are also recorded in
`merge-history.md`.)

**Restore stashed work after aborting:**

```bash
git stash pop
```

---

## Conflict Resolution Reference

### Fork-modified files

Strategy per file. All fork changes are marked with `// [FORK]`.

| File                                                   | Fork change                                    | Risk       | Resolution strategy                                              |
| ------------------------------------------------------ | ---------------------------------------------- | ---------- | ---------------------------------------------------------------- |
| `packages/core/src/core/contentGenerator.ts`           | AuthType enum + env detection + factory branch | **HIGH**   | Accept upstream, re-apply `// [FORK]` import + 3 conditionals    |
| `packages/core/src/core/client.ts`                     | MAX_TOKENS + null-default-continue             | **HIGH**   | Keep fork MAX_TOKENS + null-default-continue                     |
| `packages/core/src/core/geminiChat.ts`                 | Retry for all models (not just Gemini2)        | **MEDIUM** | Keep fork retry-all condition, adopt upstream retry option names |
| `packages/core/src/index.ts`                           | 3 export lines for fork modules                | **LOW**    | Append fork exports at end of relevant section                   |
| `packages/core/package.json`                           | `openai` dependency                            | **LOW**    | Keep fork dependency                                             |
| `packages/cli/src/core/initializer.ts`                 | Import + call to openaiInitializer             | **MEDIUM** | Accept upstream, re-apply `// [FORK]` import + call              |
| `packages/cli/src/ui/auth/AuthDialog.tsx`              | Import + conditional for OpenAIModelPicker     | **MEDIUM** | Accept upstream, re-apply `// [FORK]` import + conditional       |
| `packages/cli/src/ui/auth/useAuth.ts`                  | Skip Google auth in OpenAI mode                | **LOW**    | Keep fork early-return at top of effect                          |
| `packages/cli/src/config/auth.ts`                      | OPENAI_COMPATIBLE validation                   | **LOW**    | Keep fork OPENAI_COMPATIBLE case                                 |
| `packages/cli/src/config/config.ts`                    | YOLO sandbox + skipNextSpeakerCheck            | **MEDIUM** | Keep fork YOLO + accept upstream additions sequentially          |
| `packages/cli/src/config/sandboxConfig.ts`             | bestEffort parameter                           | **LOW**    | Keep fork bestEffort parameter                                   |
| `packages/cli/src/gemini.tsx`                          | YOLO sandbox + OpenAI auth guard               | **MEDIUM** | Keep fork YOLO + OpenAI guard                                    |
| `packages/cli/src/utils/sandbox.ts`                    | Env file mount + fork repo volume              | **LOW**    | Keep fork env file mount + repo volume                           |
| `packages/cli/src/utils/sandboxUtils.ts`               | Env sourcing + local clone detection           | **LOW**    | Keep fork env sourcing + local clone detection                   |
| `packages/cli/src/ui/components/Footer.tsx`            | configuredSandbox fallback                     | **LOW**    | Keep fork configuredSandbox fallback                             |
| `packages/cli/src/ui/components/InputPrompt.tsx`       | getLatestText() for Korean IME                 | **LOW**    | Keep fork getLatestText() calls                                  |
| `packages/cli/src/ui/components/shared/text-buffer.ts` | getLatestText + latestLinesRef                 | **MEDIUM** | Keep fork getLatestText + latestLinesRef                         |
| `packages/cli/src/ui/contexts/KeypressContext.tsx`     | IME stdin reorder                              | **MEDIUM** | Keep fork IME reorder logic                                      |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`         | InvalidStream info message                     | **LOW**    | Keep fork InvalidStream message                                  |

### Common conflict patterns

| Situation                                                | What to do                                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| Upstream changed code around a `[FORK]` block            | Keep upstream's changes, re-add the `[FORK]` block                  |
| Upstream deleted code that our fork modified             | Take upstream's deletion, move fork logic elsewhere if still needed |
| Both sides added code in the same spot                   | Keep both additions                                                 |
| `package-lock.json` conflict                             | Delete it, run `npm install` to regenerate                          |
| Upstream renamed a constant/function the fork references | Use the new name in fork code                                       |

---

## Rules

1. **Never cherry-pick** — always merge. Cherry-picking creates duplicate
   commits that cause phantom conflicts on the next merge.

2. **Merge after each stable upstream release** — don't let divergence grow. The
   sync script checks for new stable tags automatically.

3. **Keep fork changes minimal** — every line changed in an upstream file is a
   potential conflict. Extract fork code into separate files where possible.

4. **Mark all fork changes** — use `// [FORK]` comments so they're easy to find
   during conflict resolution.

5. **Test after every merge** — run
   `npm run build && npm run typecheck && npm test` plus
   `./scripts/fork/verify-fork-features.sh`.

6. **Document each merge** — update `docs-fork/upstream/merge-history.md` with
   what was merged, conflicts resolved, and any issues found.

---

## Tips

- **Small conflicts are normal** — the `[FORK]` markers make them easy to
  resolve.
- **`package-lock.json`** always conflicts — just delete it and run
  `npm install`.
- **Test files** may need updated mocks — if tests fail after merge, check that
  `getAuthTypeFromEnv` is mocked to return `undefined` in test files that use
  `...actual` spread from `@google/gemini-cli-core`.
