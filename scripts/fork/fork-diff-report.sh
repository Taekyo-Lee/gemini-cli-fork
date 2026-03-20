#!/usr/bin/env bash
# fork-diff-report.sh — Pre-merge conflict analysis
# Usage: ./scripts/fork-diff-report.sh [upstream-ref]
#
# Lists files modified by both fork and upstream since last merge base.
# Shows change magnitude (insertions/deletions) on each side.

set -euo pipefail

UPSTREAM_REF="${1:-upstream/main}"

# Ensure upstream remote exists
if ! git remote get-url upstream &>/dev/null; then
  echo "ERROR: 'upstream' remote not configured."
  echo "Run: git remote add upstream https://github.com/google-gemini/gemini-cli.git"
  echo "Then: git fetch upstream"
  exit 1
fi

# Find merge base
MERGE_BASE=$(git merge-base HEAD "$UPSTREAM_REF" 2>/dev/null || echo "")
if [[ -z "$MERGE_BASE" ]]; then
  echo "ERROR: Cannot find merge base between HEAD and $UPSTREAM_REF"
  exit 1
fi

echo "=== Fork Diff Report ==="
echo ""
echo "Merge base: $(git rev-parse --short "$MERGE_BASE") ($(git log -1 --format='%s' "$MERGE_BASE"))"
echo "Fork HEAD:  $(git rev-parse --short HEAD) ($(git log -1 --format='%s' HEAD))"
echo "Upstream:   $(git rev-parse --short "$UPSTREAM_REF") ($(git log -1 --format='%s' "$UPSTREAM_REF"))"
echo ""

# Get file lists
FORK_FILES=$(git diff --name-only "$MERGE_BASE"..HEAD)
UPSTREAM_FILES=$(git diff --name-only "$MERGE_BASE".."$UPSTREAM_REF")

FORK_COUNT=$(echo "$FORK_FILES" | grep -c . || true)
UPSTREAM_COUNT=$(echo "$UPSTREAM_FILES" | grep -c . || true)

echo "Fork changed files:     $FORK_COUNT"
echo "Upstream changed files: $UPSTREAM_COUNT"
echo ""

# Find files modified on both sides
echo "--- Files modified on BOTH sides (potential conflicts) ---"
echo ""

CONFLICT_COUNT=0
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  if echo "$UPSTREAM_FILES" | grep -qxF "$file"; then
    ((CONFLICT_COUNT++))

    # Get stats
    FORK_STAT=$(git diff --numstat "$MERGE_BASE"..HEAD -- "$file" | awk '{print "+"$1" -"$2}')
    UPSTREAM_STAT=$(git diff --numstat "$MERGE_BASE".."$UPSTREAM_REF" -- "$file" | awk '{print "+"$1" -"$2}')

    # Check for [FORK] markers
    MARKERS=""
    if git show "HEAD:$file" 2>/dev/null | grep -q '\[FORK\]'; then
      MARKERS=" [FORK-marked]"
    fi

    echo "  $file$MARKERS"
    echo "    Fork:     $FORK_STAT"
    echo "    Upstream: $UPSTREAM_STAT"
    echo ""
  fi
done <<< "$FORK_FILES"

if [[ $CONFLICT_COUNT -eq 0 ]]; then
  echo "  (none — clean merge expected)"
  echo ""
fi

echo "Total potential conflict files: $CONFLICT_COUNT"
echo ""

# Fork-only files
echo "--- Fork-only files ($((FORK_COUNT - CONFLICT_COUNT)) files) ---"
echo ""
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  if ! echo "$UPSTREAM_FILES" | grep -qxF "$file"; then
    echo "  $file"
  fi
done <<< "$FORK_FILES"

echo ""
echo "--- Upstream-only files ---"
echo ""
UPSTREAM_ONLY=0
while IFS= read -r file; do
  [[ -z "$file" ]] && continue
  if ! echo "$FORK_FILES" | grep -qxF "$file"; then
    ((UPSTREAM_ONLY++))
  fi
done <<< "$UPSTREAM_FILES"
echo "  $UPSTREAM_ONLY files (not shown — these merge cleanly)"

echo ""
echo "=== Done ==="
