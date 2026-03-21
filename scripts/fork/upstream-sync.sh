#!/usr/bin/env bash
# upstream-sync.sh — Main upstream sync workflow
# Usage: ./scripts/upstream-sync.sh [--dry-run]
#
# Steps:
#   1. Adds 'upstream' remote if not present
#   2. Fetches upstream + tags
#   3. Creates backup tag
#   4. Shows upstream commits to merge
#   5. Shows conflict surface
#   6. Prints instructions

set -euo pipefail

DRY_RUN=false
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
fi

UPSTREAM_URL="https://github.com/google-gemini/gemini-cli.git"
BACKUP_TAG="pre-merge-backup-$(date +%Y%m%d)"

echo "=== Upstream Sync Workflow ==="
echo ""

# 1. Add upstream remote if not present
if ! git remote get-url upstream &>/dev/null; then
  echo "[1/6] Adding upstream remote: $UPSTREAM_URL"
  if [[ "$DRY_RUN" == "false" ]]; then
    git remote add upstream "$UPSTREAM_URL"
  else
    echo "  (dry-run: would add remote)"
  fi
else
  echo "[1/6] Upstream remote already configured: $(git remote get-url upstream)"
fi

# 2. Fetch upstream
echo ""
echo "[2/6] Fetching upstream..."
if [[ "$DRY_RUN" == "false" ]]; then
  git fetch upstream --tags
else
  echo "  (dry-run: would fetch)"
fi

# 3. Create backup tag
echo ""
echo "[3/6] Creating backup tag: $BACKUP_TAG"
if [[ "$DRY_RUN" == "false" ]]; then
  if git rev-parse "$BACKUP_TAG" &>/dev/null; then
    echo "  Tag $BACKUP_TAG already exists, skipping"
  else
    git tag "$BACKUP_TAG"
    echo "  Created tag $BACKUP_TAG at $(git rev-parse --short HEAD)"
  fi
else
  echo "  (dry-run: would create tag at $(git rev-parse --short HEAD))"
fi

# 4. Show upstream commits to merge
echo ""
echo "[4/6] Upstream commits not yet merged:"
MERGE_BASE=$(git merge-base HEAD upstream/main 2>/dev/null || echo "")
if [[ -z "$MERGE_BASE" ]]; then
  echo "  ERROR: Cannot find merge base. Is upstream/main fetched?"
  exit 1
fi
UPSTREAM_COUNT=$(git rev-list --count "$MERGE_BASE"..upstream/main)
echo "  Merge base: $(git rev-parse --short "$MERGE_BASE")"
echo "  Upstream commits to merge: $UPSTREAM_COUNT"
echo ""
echo "  Latest 10 upstream commits:"
git log --oneline -10 upstream/main | sed 's/^/    /'

# 5. Show conflict surface
echo ""
echo "[5/6] Conflict surface analysis:"
echo ""
# Files modified on both sides since merge base
FORK_FILES=$(git diff --name-only "$MERGE_BASE"..HEAD)
UPSTREAM_FILES=$(git diff --name-only "$MERGE_BASE"..upstream/main)

BOTH_MODIFIED=""
while IFS= read -r file; do
  if echo "$UPSTREAM_FILES" | grep -qxF "$file"; then
    BOTH_MODIFIED="$BOTH_MODIFIED$file"$'\n'
  fi
done <<< "$FORK_FILES"

if [[ -n "$BOTH_MODIFIED" ]]; then
  echo "  Files modified on BOTH sides (potential conflicts):"
  echo "$BOTH_MODIFIED" | sort | while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    FORK_STAT=$(git diff --stat "$MERGE_BASE"..HEAD -- "$file" | tail -1 | sed 's/.*|/|/')
    UPSTREAM_STAT=$(git diff --stat "$MERGE_BASE"..upstream/main -- "$file" | tail -1 | sed 's/.*|/|/')
    # Check for [FORK] markers
    if git show "HEAD:$file" 2>/dev/null | grep -q '\[FORK\]'; then
      MARKED="[FORK] marked"
    else
      MARKED="no markers"
    fi
    echo "    $file  ($MARKED)"
    echo "      fork:     $FORK_STAT"
    echo "      upstream: $UPSTREAM_STAT"
  done
else
  echo "  No files modified on both sides. Clean merge expected!"
fi

# Count fork-only and upstream-only
FORK_ONLY=$(echo "$FORK_FILES" | while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  echo "$UPSTREAM_FILES" | grep -qxF "$f" || echo "$f"
done | wc -l)
UPSTREAM_ONLY=$(echo "$UPSTREAM_FILES" | while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  echo "$FORK_FILES" | grep -qxF "$f" || echo "$f"
done | wc -l)

echo ""
echo "  Fork-only changes: $FORK_ONLY files"
echo "  Upstream-only changes: $UPSTREAM_ONLY files"

# 6. Instructions
echo ""
echo "[6/6] Next steps:"
echo ""
echo "  To proceed with the merge:"
echo "    git merge upstream/main --no-commit"
echo ""
echo "  To verify after resolving conflicts:"
echo "    npm install --ignore-scripts"
echo "    npm run build && npm run typecheck && npm test"
echo "    ./scripts/verify-fork-features.sh"
echo ""
echo "  To abort if something goes wrong:"
echo "    git merge --abort"
echo "    git reset --hard $BACKUP_TAG"
echo ""
echo "  To commit the merge:"
echo "    git commit -m 'merge: sync with upstream \$(git describe upstream/main --tags)'"
echo ""
echo "=== Done ==="
