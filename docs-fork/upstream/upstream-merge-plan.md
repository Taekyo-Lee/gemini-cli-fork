# Upstream Merge Plan

## Current Divergence State

- **Base commit:** `28af4e12` (upstream `0.34.0-nightly.20260304`)
- **Total fork commits:** ~220 (89 cherry-picked upstream + 131 fork-specific)
- **Upstream:** `google-gemini/gemini-cli` — has advanced to v0.34.0+

The 89 cherry-picked commits are interleaved with fork-specific ones, making
rebase impractical. Merge is the correct strategy.

---

## Merge Strategy

### Why merge (not rebase)

- 131 fork-specific commits interleaved with 89 cherry-picks make rebase
  extremely painful
- Merge preserves both histories cleanly
- Single merge commit is easy to revert if needed
- `git log --first-parent` gives a clean view

### Branch model

```
main (fork)  ───●───●───●───M───  (merge commit)
                            /
upstream/main  ────────────●
```

### Backup protocol

Before every merge:
1. Create tag: `pre-merge-backup-YYYYMMDD`
2. Push tag to origin
3. If merge goes wrong: `git reset --hard pre-merge-backup-YYYYMMDD`

---

## Step-by-Step Merge Process

Repeatable checklist for each upstream sync:

### 1. Fetch upstream + create backup

```bash
# Add upstream remote (first time only)
git remote add upstream https://github.com/google-gemini/gemini-cli.git

# Fetch latest
git fetch upstream --tags

# Create backup tag
git tag pre-merge-backup-$(date +%Y%m%d)

# Verify current state
git log --oneline -5
```

### 2. Run conflict analysis

```bash
./scripts/fork-diff-report.sh
```

Review the output to understand which files have been modified on both sides.

### 3. Execute merge (no auto-commit)

```bash
git merge upstream/main --no-commit
```

### 4. Resolve conflicts

Use the conflict resolution table below. For each conflicting file:
- Look for `// [FORK]` markers to identify fork-specific changes
- Keep fork additions, accept upstream refactors around them
- When in doubt, take upstream version and re-apply fork changes on top

### 5. Build + typecheck + test

```bash
npm install --ignore-scripts
npm run build
npm run typecheck
npm test
```

### 6. Run fork feature verification

```bash
./scripts/verify-fork-features.sh
```

### 7. Commit + document

```bash
git commit -m "merge: sync with upstream $(git describe upstream/main --tags)"
```

Update `docs-fork/todo.md` with merge details.

---

## Conflict Resolution Guide

### Fork-created files (NO conflicts possible)

These files exist only in the fork. Upstream will never touch them.

| File | Purpose |
|------|---------|
| `packages/core/src/config/llmRegistry.ts` | LLM model registry |
| `packages/core/src/core/openaiContentGenerator.ts` | OpenAI ContentGenerator impl |
| `packages/core/src/core/openaiTypeMapper.ts` | Gemini ↔ OpenAI type conversion |
| `packages/core/src/core/openaiFactory.ts` | OpenAI factory (extracted) |
| `packages/cli/src/core/openaiInitializer.ts` | OpenAI auto-connect (extracted) |
| `packages/cli/src/ui/auth/OpenAIModelPicker.tsx` | Model picker UI (extracted) |
| `packages/core/src/config/llmRegistry.test.ts` | Registry tests |
| `packages/core/src/core/openaiTypeMapper.test.ts` | Type mapper tests |
| `packages/core/src/core/openaiContentGenerator.test.ts` | Content generator tests |
| `scripts/test_openai_adapter.sh` | Build/test/run script |
| `scripts/test_glm5_tools.py` | GLM-5 tool call test |
| `scripts/upstream-sync.sh` | Sync workflow script |
| `scripts/verify-fork-features.sh` | Post-merge verification |
| `scripts/fork-diff-report.sh` | Pre-merge conflict analysis |
| `docs-fork/*` | All fork documentation |

### Fork-modified files (potential conflicts)

Strategy per file. All fork changes are marked with `// [FORK]`.

| File | Fork change size | Conflict risk | Resolution strategy |
|------|-----------------|---------------|-------------------|
| `packages/core/src/core/contentGenerator.ts` | ~8 lines (after extraction) | **HIGH** | Accept upstream, re-apply `// [FORK]` import + 3 conditionals |
| `packages/core/src/index.ts` | 3 export lines | **LOW** | Append fork exports at end of relevant section |
| `packages/cli/src/core/initializer.ts` | ~6 lines (after extraction) | **MEDIUM** | Accept upstream, re-apply `// [FORK]` import + call |
| `packages/cli/src/ui/auth/AuthDialog.tsx` | ~5 lines (after extraction) | **MEDIUM** | Accept upstream, re-apply `// [FORK]` import + conditional |
| `packages/cli/src/ui/auth/useAuth.ts` | 6 lines | **LOW** | Keep fork early-return at top of effect |
| `packages/cli/src/config/auth.ts` | 3 lines | **LOW** | Keep fork OPENAI_COMPATIBLE case |
| `packages/cli/src/config/config.ts` | ~20 lines | **MEDIUM** | Keep fork YOLO sandbox + skipNextSpeakerCheck |
| `packages/cli/src/config/sandboxConfig.ts` | ~5 lines | **LOW** | Keep fork bestEffort parameter |
| `packages/cli/src/gemini.tsx` | ~20 lines | **MEDIUM** | Keep fork YOLO sandbox + OpenAI guard |
| `packages/cli/src/utils/sandbox.ts` | ~20 lines | **LOW** | Keep fork env file mount + repo volume |
| `packages/cli/src/utils/sandboxUtils.ts` | ~15 lines | **LOW** | Keep fork env sourcing + local clone detection |
| `packages/cli/src/ui/components/Footer.tsx` | ~5 lines | **LOW** | Keep fork configuredSandbox fallback |
| `packages/cli/src/ui/components/InputPrompt.tsx` | ~8 lines | **LOW** | Keep fork getLatestText() calls |
| `packages/cli/src/ui/components/shared/text-buffer.ts` | ~20 lines | **MEDIUM** | Keep fork getLatestText + latestLinesRef |
| `packages/cli/src/ui/contexts/KeypressContext.tsx` | ~25 lines | **MEDIUM** | Keep fork IME reorder logic |
| `packages/cli/src/ui/hooks/useGeminiStream.ts` | 5 lines | **LOW** | Keep fork InvalidStream message |
| `packages/core/src/core/client.ts` | ~30 lines | **HIGH** | Keep fork MAX_TOKENS + null-default-continue |
| `packages/core/src/core/geminiChat.ts` | ~10 lines | **MEDIUM** | Keep fork (isGemini2Model guard already removed) |
| `packages/core/package.json` | 1 line (openai dep) | **LOW** | Keep fork dependency |

---

## Rules Going Forward

1. **Never cherry-pick** — always merge. Cherry-picking creates duplicate
   commits that cause phantom conflicts on the next merge.

2. **Merge after each upstream release** — don't let divergence grow. Monthly
   syncs are ideal; quarterly is the maximum.

3. **Keep fork changes minimal** — every line changed in an upstream file is a
   potential conflict. Extract fork code into separate files where possible.

4. **Mark all fork changes** — use `// [FORK]` comments so they're easy to
   find during conflict resolution.

5. **Test after every merge** — run `npm run build && npm run typecheck && npm test`
   plus `./scripts/verify-fork-features.sh`.

6. **Document each merge** — update `docs-fork/todo.md` with what was merged,
   conflicts resolved, and any issues found.

---

## File Manifest

### Files created by fork

| File | Purpose | Phase |
|------|---------|-------|
| `packages/core/src/config/llmRegistry.ts` | TypeScript LLM registry (mirrors a2g_models, 3 environments) | 1 |
| `packages/core/src/core/openaiTypeMapper.ts` | Gemini ↔ OpenAI type conversion with ToolCallIdTracker | 2 |
| `packages/core/src/core/openaiContentGenerator.ts` | ContentGenerator impl using OpenAI SDK | 2 |
| `packages/core/src/core/openaiFactory.ts` | OpenAI factory extracted from contentGenerator.ts | 11 |
| `packages/cli/src/core/openaiInitializer.ts` | OpenAI auto-connect extracted from initializer.ts | 11 |
| `packages/cli/src/ui/auth/OpenAIModelPicker.tsx` | Model picker extracted from AuthDialog.tsx | 11 |
| `packages/core/src/config/llmRegistry.test.ts` | Registry tests (15 tests) | 5 |
| `packages/core/src/core/openaiTypeMapper.test.ts` | Type mapper tests (27 tests) | 5 |
| `packages/core/src/core/openaiContentGenerator.test.ts` | Content generator tests (11 tests) | 5 |
| `scripts/test_openai_adapter.sh` | Build/test/run script | 0 |
| `scripts/test_glm5_tools.py` | GLM-5 multi-turn tool call test | 8 |
| `scripts/upstream-sync.sh` | Upstream sync workflow | 11 |
| `scripts/verify-fork-features.sh` | Post-merge verification | 11 |
| `scripts/fork-diff-report.sh` | Pre-merge conflict analysis | 11 |

### Files modified by fork

| File | Nature of modification | Marked |
|------|----------------------|--------|
| `packages/core/src/core/contentGenerator.ts` | AuthType enum + env detection + factory branch | `[FORK]` |
| `packages/core/src/index.ts` | 3 export lines for fork modules | `[FORK]` |
| `packages/core/package.json` | `openai` dependency | — |
| `packages/cli/src/core/initializer.ts` | Import + call to openaiInitializer | `[FORK]` |
| `packages/cli/src/ui/auth/AuthDialog.tsx` | Import + conditional for OpenAIModelPicker | `[FORK]` |
| `packages/cli/src/ui/auth/useAuth.ts` | Skip Google auth in OpenAI mode | `[FORK]` |
| `packages/cli/src/config/auth.ts` | OPENAI_COMPATIBLE validation | `[FORK]` |
| `packages/cli/src/config/config.ts` | YOLO sandbox + skipNextSpeakerCheck | `[FORK]` |
| `packages/cli/src/config/sandboxConfig.ts` | bestEffort parameter | `[FORK]` |
| `packages/cli/src/gemini.tsx` | YOLO sandbox + OpenAI auth guard | `[FORK]` |
| `packages/cli/src/utils/sandbox.ts` | Env file mount + fork repo volume | `[FORK]` |
| `packages/cli/src/utils/sandboxUtils.ts` | Env sourcing + local clone detection | `[FORK]` |
| `packages/cli/src/ui/components/Footer.tsx` | configuredSandbox fallback | `[FORK]` |
| `packages/cli/src/ui/components/InputPrompt.tsx` | getLatestText() for Korean IME | `[FORK]` |
| `packages/cli/src/ui/components/shared/text-buffer.ts` | getLatestText + latestLinesRef | `[FORK]` |
| `packages/cli/src/ui/contexts/KeypressContext.tsx` | IME stdin reorder | `[FORK]` |
| `packages/cli/src/ui/hooks/useGeminiStream.ts` | InvalidStream info message | `[FORK]` |
| `packages/core/src/core/client.ts` | MAX_TOKENS + null-default-continue | `[FORK]` |
| `packages/core/src/core/geminiChat.ts` | isGemini2Model guard removal | `[FORK]` |
