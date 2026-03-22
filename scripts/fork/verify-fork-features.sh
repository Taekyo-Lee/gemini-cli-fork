#!/usr/bin/env bash
# verify-fork-features.sh — Post-merge verification checklist
# Usage: ./scripts/fork/verify-fork-features.sh
#
# Verifies that all fork features survived a merge by checking:
#   1. Fork-created files exist
#   2. Key fork markers present in modified files
#   3. Build succeeds
#   4. Typecheck passes
#   5. Tests pass

set -euo pipefail

PASS=0
FAIL=0
WARN=0

check() {
  local desc="$1"
  shift
  if "$@" &>/dev/null; then
    echo "  [PASS] $desc"
    ((PASS++))
  else
    echo "  [FAIL] $desc"
    ((FAIL++))
  fi
}

check_marker() {
  local file="$1"
  local marker="$2"
  local desc="$3"
  if [[ -f "$file" ]] && grep -q "$marker" "$file"; then
    echo "  [PASS] $desc"
    ((PASS++))
  elif [[ ! -f "$file" ]]; then
    echo "  [FAIL] $desc (file missing: $file)"
    ((FAIL++))
  else
    echo "  [FAIL] $desc (marker not found: $marker)"
    ((FAIL++))
  fi
}

echo "=== Fork Feature Verification ==="
echo ""

# 1. Fork-created files exist
echo "1. Fork-created files:"
check "llmRegistry.ts" test -f packages/core/src/config/llmRegistry.ts
check "openaiContentGenerator.ts" test -f packages/core/src/core/openaiContentGenerator.ts
check "openaiTypeMapper.ts" test -f packages/core/src/core/openaiTypeMapper.ts
check "openaiFactory.ts" test -f packages/core/src/core/openaiFactory.ts
check "openaiInitializer.ts" test -f packages/cli/src/core/openaiInitializer.ts
check "OpenAIModelPicker.tsx" test -f packages/cli/src/ui/auth/OpenAIModelPicker.tsx
check "llmRegistry.test.ts" test -f packages/core/src/config/llmRegistry.test.ts
check "openaiTypeMapper.test.ts" test -f packages/core/src/core/openaiTypeMapper.test.ts
check "openaiContentGenerator.test.ts" test -f packages/core/src/core/openaiContentGenerator.test.ts
check "test_openai_adapter.sh" test -f scripts/fork/test_openai_adapter.sh
check "test_glm5_tools.py" test -f scripts/fork/test_glm5_tools.py

echo ""

# 2. Key fork markers in modified files
echo "2. Fork markers in upstream files:"
check_marker "packages/core/src/core/contentGenerator.ts" "OPENAI_COMPATIBLE" "contentGenerator.ts: OPENAI_COMPATIBLE enum"
check_marker "packages/core/src/core/contentGenerator.ts" "\[FORK\]" "contentGenerator.ts: [FORK] markers"
check_marker "packages/core/src/core/client.ts" "\[FORK\]" "client.ts: [FORK] markers"
check_marker "packages/core/src/core/geminiChat.ts" "\[FORK\]" "geminiChat.ts: [FORK] markers"
check_marker "packages/core/src/index.ts" "openaiFactory" "index.ts: openaiFactory export"
check_marker "packages/core/src/index.ts" "openaiContentGenerator" "index.ts: openaiContentGenerator export"
check_marker "packages/core/src/index.ts" "openaiTypeMapper" "index.ts: openaiTypeMapper export"
check_marker "packages/core/src/index.ts" "llmRegistry" "index.ts: llmRegistry export"
check_marker "packages/cli/src/core/initializer.ts" "openaiInitializer" "initializer.ts: openaiInitializer import"
check_marker "packages/cli/src/ui/auth/AuthDialog.tsx" "OpenAIModelPicker" "AuthDialog.tsx: OpenAIModelPicker import"
check_marker "packages/cli/src/ui/auth/useAuth.ts" "\[FORK\]" "useAuth.ts: [FORK] markers"
check_marker "packages/cli/src/config/auth.ts" "OPENAI_COMPATIBLE" "auth.ts: OPENAI_COMPATIBLE validation"
check_marker "packages/cli/src/config/config.ts" "\[FORK\]" "config.ts: [FORK] markers"
check_marker "packages/cli/src/config/sandboxConfig.ts" "bestEffort" "sandboxConfig.ts: bestEffort parameter"
check_marker "packages/cli/src/gemini.tsx" "\[FORK\]" "gemini.tsx: [FORK] markers"
check_marker "packages/cli/src/utils/sandbox.ts" "\[FORK\]" "sandbox.ts: [FORK] markers"
check_marker "packages/cli/src/utils/sandboxUtils.ts" "\[FORK\]" "sandboxUtils.ts: [FORK] markers"
check_marker "packages/cli/src/ui/components/Footer.tsx" "configuredSandbox" "Footer.tsx: configuredSandbox"
check_marker "packages/cli/src/ui/components/InputPrompt.tsx" "getLatestText" "InputPrompt.tsx: getLatestText"
check_marker "packages/cli/src/ui/components/shared/text-buffer.ts" "getLatestText" "text-buffer.ts: getLatestText"
check_marker "packages/cli/src/ui/contexts/KeypressContext.tsx" "\[FORK\]" "KeypressContext.tsx: [FORK] markers"
check_marker "packages/cli/src/ui/hooks/useGeminiStream.ts" "\[FORK\]" "useGeminiStream.ts: [FORK] markers"

echo ""

# 3. Build
echo "3. Build:"
if npm run build &>/dev/null; then
  echo "  [PASS] npm run build"
  ((PASS++))
else
  echo "  [FAIL] npm run build"
  ((FAIL++))
fi

echo ""

# 4. Typecheck
echo "4. Typecheck:"
if npm run typecheck &>/dev/null; then
  echo "  [PASS] npm run typecheck"
  ((PASS++))
else
  echo "  [FAIL] npm run typecheck"
  ((FAIL++))
fi

echo ""

# 5. Tests
echo "5. Tests:"
if npm test &>/dev/null; then
  echo "  [PASS] npm test"
  ((PASS++))
else
  echo "  [FAIL] npm test"
  ((FAIL++))
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="

if [[ $FAIL -gt 0 ]]; then
  echo ""
  echo "WARNING: $FAIL checks failed. Review before committing merge."
  exit 1
fi

echo ""
echo "All checks passed! Safe to commit."
