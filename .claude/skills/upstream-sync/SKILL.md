---
name: upstream-sync
description: Automates the full upstream sync process for this gemini-cli fork — checking for new stable releases, merging, resolving conflicts, building, testing, verifying fork features, committing, and updating the merge history. Use this skill whenever the user mentions syncing with upstream, updating from upstream, merging upstream changes, or wants to check if a new upstream version is available. Also trigger when the user says "sync upstream", "update from upstream", "merge upstream", "check upstream", or "/upstream-sync". Even if the user just asks "is there a new version upstream?" or "are we up to date?", use this skill to run the check.
---

# Upstream Sync — Full Automation

This skill automates syncing this fork with stable releases of the upstream
[google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli).

The fork supports on-prem LLMs via OpenAI-compatible APIs. Fork-specific code is
marked with `// [FORK]` comments in upstream files. The goal during every merge
is to preserve ALL fork features while accepting upstream improvements.

## Key Principle

**Only sync with stable releases** (`vX.Y.Z`) — never preview or nightly tags.
The sync script handles this detection automatically.

---

## Workflow

Execute these phases in order. Each phase has a gate — if a phase fails, stop
and work on fixing it before moving to the next.

### Phase 1: Pre-flight Check

1. Verify the working tree is clean:
   ```bash
   git status
   ```
   If there are uncommitted changes, stash them:
   ```bash
   git stash
   ```
   Note whether you stashed (you'll need to pop later).

2. Run the sync script:
   ```bash
   ./scripts/fork/upstream-sync.sh
   ```

3. **Read the output carefully.** The script will either:
   - Report **"Already up to date"** — tell the user and stop. No merge needed.
   - Report a **new stable release** — continue to Phase 2. Note the `LATEST_STABLE` tag (e.g., `v0.35.0`) and the `BACKUP_TAG` (e.g., `pre-merge-backup-20260415`).

**Gate:** If already up to date, the workflow ends here. Report the current
version to the user and stop.

### Phase 2: Start the Merge

1. Run the merge with `--no-commit` so you can inspect before committing:
   ```bash
   git merge <LATEST_STABLE> --no-commit
   ```
   Replace `<LATEST_STABLE>` with the exact tag from Phase 1 (e.g., `v0.35.0`).

2. Check the result:
   ```bash
   git status
   ```

3. If the merge completes cleanly (no conflicts), skip to Phase 4.

4. If there are conflicts, list all `both modified` files and proceed to Phase 3.

### Phase 3: Resolve Conflicts

This is the critical phase. For each conflicting file, apply the resolution
strategy from the reference table below.

#### General conflict resolution rules

- **Always preserve `// [FORK]` blocks** — these are the fork's behavioral changes
- **Accept upstream refactors** around fork blocks (new variable names, restructured code)
- **If upstream renamed something the fork references**, use the new name
- **`package-lock.json`** — always delete and regenerate: `git rm package-lock.json`
- **`README.md`** — always take upstream: `git checkout --theirs README.md && git add README.md`

#### Per-file resolution strategy

For each conflicting file, look it up in this table:

| File | Fork change | Resolution |
|------|------------|------------|
| `contentGenerator.ts` | AuthType enum + factory branch | Accept upstream, re-apply `// [FORK]` import + 3 conditionals |
| `client.ts` | MAX_TOKENS + null-default-continue | Keep fork MAX_TOKENS + null-default-continue |
| `geminiChat.ts` | Retry for all models | Keep fork retry-all, adopt any upstream renames (e.g., retry option constants) |
| `index.ts` (core) | 3-4 export lines | Append fork exports at end of relevant section |
| `package.json` (core) | `openai` dependency | Keep fork dependency |
| `initializer.ts` | openaiInitializer import + call | Accept upstream, re-apply `// [FORK]` import + call |
| `AuthDialog.tsx` | OpenAIModelPicker import + conditional | Accept upstream, re-apply `// [FORK]` import + conditional |
| `useAuth.ts` | Skip Google auth early-return | Keep fork early-return at top of effect |
| `auth.ts` | OPENAI_COMPATIBLE case | Keep fork OPENAI_COMPATIBLE validation case |
| `config.ts` | YOLO sandbox + skipNextSpeakerCheck | Keep fork YOLO block + accept upstream additions after it |
| `sandboxConfig.ts` | bestEffort parameter | Keep fork bestEffort param in `getSandboxCommand()` call |
| `gemini.tsx` | YOLO + OpenAI auth guard | Keep fork YOLO + OpenAI guard |
| `sandbox.ts` | Env file mount + repo volume | Keep fork env file mount + fork repo volume |
| `sandboxUtils.ts` | Env sourcing + local clone detection | Keep fork env sourcing + local clone detection |
| `Footer.tsx` | configuredSandbox fallback | Keep fork configuredSandbox fallback |
| `InputPrompt.tsx` | getLatestText() for Korean IME | Keep fork getLatestText() calls |
| `text-buffer.ts` | getLatestText + latestLinesRef | Keep fork getLatestText + latestLinesRef |
| `KeypressContext.tsx` | IME stdin reorder | Keep fork IME reorder logic |
| `useGeminiStream.ts` | InvalidStream info message | Keep fork InvalidStream message |

#### How to resolve each file

For each `both modified` file:

1. Read the file and find all conflict markers (`<<<<<<<`)
2. Look up the file in the table above for the strategy
3. Read both sides of each conflict carefully:
   - **HEAD side** (between `<<<<<<< HEAD` and `=======`) — fork's version
   - **Theirs side** (between `=======` and `>>>>>>>`) — upstream's version
4. Apply the resolution: keep fork's `// [FORK]` changes, accept upstream's
   structural changes around them
5. Remove all conflict markers
6. Verify no markers remain: search the file for `<<<<<<<`
7. Stage the resolved file: `git add <file>`

After resolving ALL files, verify no conflict markers remain anywhere:
```bash
git diff --check
```

**Gate:** All conflicts must be resolved and staged before proceeding.

### Phase 4: Build and Test

Run these in sequence. If any step fails, fix the issue before continuing.

1. **Install dependencies** (regenerates `package-lock.json` if it was deleted):
   ```bash
   npm install --ignore-scripts
   ```

2. **Build**:
   ```bash
   npm run build
   ```
   If build fails, check for:
   - Missing imports (upstream may have moved/renamed exports)
   - Type errors from merged code
   - Fix and re-run until clean

3. **Typecheck**:
   ```bash
   npm run typecheck
   ```

4. **Run tests**:
   ```bash
   npm test
   ```
   If tests fail, common fixes:
   - Test files may need `getAuthTypeFromEnv` mocked to return `undefined`
     when using `...actual` spread from `@google/gemini-cli-core`
   - Upstream may have renamed constants that fork tests reference
   - Updated assertion counts if retry behavior changed

**Gate:** Build, typecheck, and all tests must pass before proceeding.

### Phase 5: Verify Fork Features

```bash
./scripts/fork/verify-fork-features.sh
```

This runs 60+ checks: fork-created files exist, `[FORK]` markers are present in
all modified files, build/typecheck/tests pass.

**Gate:** All checks must pass. If any `[FAIL]`, fix the issue — a missing
`[FORK]` marker means fork code was lost during conflict resolution.

### Phase 6: Commit and Record

1. **Commit the merge**:
   ```bash
   git commit -m "merge: sync with upstream <LATEST_STABLE>"
   ```

2. **Get the merge commit hash**:
   ```bash
   git rev-parse --short HEAD
   ```

3. **Count how many files had conflicts** (from Phase 3).

4. **Update merge history** — add a new row at the TOP of the table in
   `docs/fork/upstream/merge-history.md`:
   ```markdown
   | <TODAY_DATE> | <LATEST_STABLE> | <BACKUP_TAG> | <COMMIT_HASH> | <CONFLICT_COUNT> | <NOTES> |
   ```
   Use today's date in YYYY-MM-DD format.

5. **Update tracking doc** — add a new Phase entry at the bottom of
   `docs/fork/tracking/todo.md` documenting what was merged and conflicts resolved.

6. **Commit the doc updates**:
   ```bash
   git add docs/fork/upstream/merge-history.md docs/fork/tracking/todo.md
   git commit -m "docs: record upstream merge <LATEST_STABLE>"
   ```

### Phase 7: Restore and Report

1. If you stashed work in Phase 1, restore it:
   ```bash
   git stash pop
   ```

2. Report to the user:
   - What version was merged
   - How many conflicts were resolved (and which files)
   - Build/test/verify status
   - The backup tag name (in case they need to rollback)

---

## Recovery

If anything goes wrong during the merge:

- **Abort the merge**: `git merge --abort`
- **Reset to backup**: `git reset --hard <BACKUP_TAG>`
- **Restore stash**: `git stash pop`

The backup tag is recorded in `merge-history.md` for future reference.

---

## Important Context

- The fork's upstream is `https://github.com/google-gemini/gemini-cli.git`
  (remote named `upstream`)
- All fork changes in upstream files are marked with `// [FORK]` comments
- Fork-created files (in `packages/core/src/core/openai*.ts`,
  `packages/core/src/config/llmRegistry.ts`, `packages/cli/src/core/openaiInitializer.ts`,
  `packages/cli/src/ui/auth/OpenAIModelPicker.tsx`) will NEVER conflict because
  upstream doesn't touch them
- The sync script at `scripts/fork/upstream-sync.sh` handles stable tag detection
  and backup tag creation
- Full reference: `docs/fork/upstream/upstream-sync-guide.md`
