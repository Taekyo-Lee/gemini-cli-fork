#!/usr/bin/env bash
# upstream-sync.sh — Upstream sync workflow (stable releases only)
# Usage: ./scripts/fork/upstream-sync.sh [--dry-run] [--force]
#
# Steps:
#   1. Adds 'upstream' remote if not present
#   2. Fetches upstream + tags
#   3. Finds latest stable tag, compares with last synced version
#   4. Creates backup tag
#   5. Shows upstream commits to merge
#   6. Shows conflict surface
#   7. Prints instructions
#
# Flags:
#   --dry-run   Show what would happen without modifying anything
#   --force     Run conflict analysis even if already up to date

set -euo pipefail

# --- Parse arguments ---
DRY_RUN=false
FORCE=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --force) FORCE=true ;;
  esac
done

UPSTREAM_URL="https://github.com/google-gemini/gemini-cli.git"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MERGE_HISTORY="$REPO_ROOT/docs/fork/upstream/merge-history.md"
BACKUP_TAG="pre-merge-backup-$(date +%Y%m%d)"

echo "=== Upstream Sync Workflow ==="
echo ""

# --- Helper functions ---

# Find the latest stable upstream tag (vX.Y.Z with no suffix)
find_latest_stable_tag() {
  git tag -l 'v*.*.*' \
    | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' \
    | sort -V \
    | tail -1
}

# Read last synced version from merge-history.md
get_last_synced_version() {
  if [[ ! -f "$MERGE_HISTORY" ]]; then
    echo ""
    return
  fi
  # Parse the first data row of the markdown table (after the |---| separator)
  awk -F'|' '
    /^\|[-[:space:]]+\|/ { found=1; next }
    found && /^\|/ { gsub(/^[[:space:]]+|[[:space:]]+$/, "", $3); print $3; exit }
  ' "$MERGE_HISTORY"
}

# Extract vX.Y.Z from strings like "v0.34.0" or "v0.34.0 (fc03891a1)"
extract_version() {
  echo "$1" | grep -oE 'v[0-9]+\.[0-9]+\.[0-9]+' | head -1
}

# --- Step 1: Add upstream remote if not present ---
if ! git remote get-url upstream &>/dev/null; then
  echo "[1/7] Adding upstream remote: $UPSTREAM_URL"
  if [[ "$DRY_RUN" == "false" ]]; then
    git remote add upstream "$UPSTREAM_URL"
  else
    echo "  (dry-run: would add remote)"
  fi
else
  echo "[1/7] Upstream remote already configured: $(git remote get-url upstream)"
fi

# --- Step 2: Fetch upstream + tags ---
echo ""
echo "[2/7] Fetching upstream..."
if [[ "$DRY_RUN" == "false" ]]; then
  git fetch upstream --tags
else
  echo "  (dry-run: would fetch)"
fi

# --- Step 3: Find latest stable release + compare ---
echo ""
echo "[3/7] Checking for new stable release..."

LATEST_STABLE=$(find_latest_stable_tag)
if [[ -z "$LATEST_STABLE" ]]; then
  echo "  ERROR: No stable upstream tags found (expected vX.Y.Z format)."
  echo "  Did 'git fetch upstream --tags' succeed?"
  exit 1
fi
echo "  Latest stable upstream tag: $LATEST_STABLE"

LAST_SYNCED=$(get_last_synced_version)
LAST_VERSION=$(extract_version "${LAST_SYNCED:-}")
echo "  Last synced version: ${LAST_VERSION:-"(none — first sync)"}"

if [[ "$FORCE" == "false" ]] && [[ -n "$LAST_VERSION" ]] && [[ "$LAST_VERSION" == "$LATEST_STABLE" ]]; then
  echo ""
  echo "  Already up to date with $LATEST_STABLE. No new stable release to merge."
  echo "  Use --force to run conflict analysis anyway."
  exit 0
fi

if [[ -n "$LAST_VERSION" ]] && [[ "$LAST_VERSION" != "$LATEST_STABLE" ]]; then
  echo "  New stable release available: $LATEST_STABLE (last synced: $LAST_VERSION)"
elif [[ -z "$LAST_VERSION" ]]; then
  echo "  First sync — will merge $LATEST_STABLE"
else
  echo "  --force: re-analyzing $LATEST_STABLE"
fi

# --- Step 4: Create backup tag ---
echo ""
echo "[4/7] Creating backup tag: $BACKUP_TAG"
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

# --- Step 5: Show upstream commits to merge ---
echo ""
echo "[5/7] Upstream commits not yet merged:"
MERGE_BASE=$(git merge-base HEAD "$LATEST_STABLE" 2>/dev/null || echo "")
if [[ -z "$MERGE_BASE" ]]; then
  echo "  ERROR: Cannot find merge base between HEAD and $LATEST_STABLE."
  exit 1
fi
UPSTREAM_COUNT=$(git rev-list --count "$MERGE_BASE".."$LATEST_STABLE")
echo "  Merge base: $(git rev-parse --short "$MERGE_BASE")"
echo "  Upstream commits to merge: $UPSTREAM_COUNT"
echo ""
echo "  Latest 10 upstream commits (up to $LATEST_STABLE):"
git log --oneline -10 "$LATEST_STABLE" | sed 's/^/    /'

# --- Step 6: Show conflict surface ---
echo ""
echo "[6/7] Conflict surface analysis:"
echo ""
# Files modified on both sides since merge base
FORK_FILES=$(git diff --name-only "$MERGE_BASE"..HEAD)
UPSTREAM_FILES=$(git diff --name-only "$MERGE_BASE".."$LATEST_STABLE")

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
    UPSTREAM_STAT=$(git diff --stat "$MERGE_BASE".."$LATEST_STABLE" -- "$file" | tail -1 | sed 's/.*|/|/')
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

# --- Step 7: Instructions ---
echo ""
echo "[7/7] Next steps:"
echo ""
echo "  To proceed with the merge:"
echo "    git merge $LATEST_STABLE --no-commit"
echo ""
echo "  To verify after resolving conflicts:"
echo "    npm install --ignore-scripts"
echo "    npm run build && npm run typecheck && npm test"
echo "    ./scripts/fork/verify-fork-features.sh"
echo ""
echo "  To abort if something goes wrong:"
echo "    git merge --abort"
echo "    git reset --hard $BACKUP_TAG"
echo ""
echo "  To commit the merge:"
echo "    git commit -m 'merge: sync with upstream $LATEST_STABLE'"
echo ""
echo "  After committing, update merge history:"
echo "    docs/fork/upstream/merge-history.md"
echo ""
echo "=== Done ==="
