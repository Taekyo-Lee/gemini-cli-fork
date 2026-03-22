#!/usr/bin/env bash
# =============================================================================
# test_openai_adapter.sh — Build, verify, and run Gemini CLI with OpenAI adapter
#
# Usage:
#   ./scripts/test_openai_adapter.sh              # Full: build + typecheck + run
#   ./scripts/test_openai_adapter.sh --build-only  # Build + typecheck only
#   ./scripts/test_openai_adapter.sh --run-only    # Run only (skip build)
#   ./scripts/test_openai_adapter.sh --test        # Build + run unit tests
#   ./scripts/test_openai_adapter.sh --quick        # Build + run (skip typecheck)
#   ./scripts/test_openai_adapter.sh --list-models  # List available LLMs from Python registry
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$HOME/workspace/main/research/a2g_packages/envs/.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_step() { echo -e "\n${BLUE}==>${NC} ${1}"; }
log_ok()   { echo -e "  ${GREEN}OK${NC} ${1}"; }
log_warn() { echo -e "  ${YELLOW}WARN${NC} ${1}"; }
log_fail() { echo -e "  ${RED}FAIL${NC} ${1}"; }

# ---------------------------------------------------------------------------
# Load environment variables from .env file
# ---------------------------------------------------------------------------
load_env() {
  if [[ -f "$ENV_FILE" ]]; then
    log_step "Loading env vars from $ENV_FILE"
    set -a
    # shellcheck disable=SC1090
    source "$ENV_FILE"
    set +a
    log_ok "Env loaded (PROJECT_A2G_LOCATION=${PROJECT_A2G_LOCATION:-HOME})"
  else
    log_warn "Env file not found: $ENV_FILE"
    log_warn "API keys may not be available. Set them manually if needed."
  fi
}

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
do_build() {
  log_step "Building project..."
  cd "$REPO_ROOT"
  npm run build
  log_ok "Build succeeded"
}

# ---------------------------------------------------------------------------
# Typecheck
# ---------------------------------------------------------------------------
do_typecheck() {
  log_step "Running typecheck..."
  cd "$REPO_ROOT"
  npm run typecheck
  log_ok "Typecheck passed"
}

# ---------------------------------------------------------------------------
# Unit tests (core package only — OpenAI adapter tests)
# ---------------------------------------------------------------------------
do_test() {
  log_step "Running unit tests..."
  cd "$REPO_ROOT"

  # Run only OpenAI adapter tests if they exist, otherwise run all core tests
  if compgen -G "packages/core/src/core/openai*.test.ts" > /dev/null 2>&1 || \
     compgen -G "packages/core/src/config/llmRegistry.test.ts" > /dev/null 2>&1; then
    log_step "Running OpenAI adapter tests..."
    npm test -w @google/gemini-cli-core -- --reporter=verbose 2>&1 | tail -30
  else
    log_warn "No OpenAI adapter test files found yet. Running all core tests..."
    npm test -w @google/gemini-cli-core 2>&1 | tail -20
  fi
  log_ok "Tests done"
}

# ---------------------------------------------------------------------------
# Run gemini CLI interactively
# ---------------------------------------------------------------------------
do_run() {
  log_step "Starting Gemini CLI..."
  cd "$REPO_ROOT"
  echo -e "${GREEN}---${NC} Gemini CLI launching below ${GREEN}---${NC}"
  echo ""
  node packages/cli
}

# ---------------------------------------------------------------------------
# Quick status check: list what's been implemented
# ---------------------------------------------------------------------------
do_status() {
  log_step "Implementation status:"

  local files=(
    "packages/core/src/config/llmRegistry.ts"
    "packages/core/src/core/openaiTypeMapper.ts"
    "packages/core/src/core/openaiContentGenerator.ts"
    "packages/core/src/core/openaiTypeMapper.test.ts"
    "packages/core/src/core/openaiContentGenerator.test.ts"
    "packages/core/src/config/llmRegistry.test.ts"
  )

  for f in "${files[@]}"; do
    if [[ -f "$REPO_ROOT/$f" ]]; then
      log_ok "$f"
    else
      log_warn "$f (not yet created)"
    fi
  done

  # Check if AuthType has OPENAI_COMPATIBLE
  if grep -q "OPENAI_COMPATIBLE" "$REPO_ROOT/packages/core/src/core/contentGenerator.ts" 2>/dev/null; then
    log_ok "AuthType.OPENAI_COMPATIBLE added"
  else
    log_warn "AuthType.OPENAI_COMPATIBLE not yet added"
  fi

  # Check if openai dependency is in package.json
  if grep -q '"openai"' "$REPO_ROOT/packages/core/package.json" 2>/dev/null; then
    log_ok "openai dependency in packages/core/package.json"
  else
    log_warn "openai dependency not yet added"
  fi

  echo ""
}

# ---------------------------------------------------------------------------
# List available LLMs (Python registry — sanity check)
# ---------------------------------------------------------------------------
do_list_models() {
  log_step "Listing available LLMs (Python registry)..."
  cd "$REPO_ROOT"
  uv run --native-tls --active --env-file "$ENV_FILE" on_prem_llms_test/list_available_llms.py
  log_ok "Model list retrieved"
}

# ---------------------------------------------------------------------------
# Python registry test (verify a2g_models still works)
# ---------------------------------------------------------------------------
do_python_test() {
  log_step "Running Python LLM registry test..."
  cd "$REPO_ROOT"
  uv run --native-tls --active --env-file "$ENV_FILE" on_prem_llms_test/llm_test.py
  log_ok "Python LLM test passed"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE} Gemini CLI — OpenAI Adapter Test Suite ${NC}"
  echo -e "${BLUE}========================================${NC}"

  load_env

  case "${1:-full}" in
    --build-only)
      do_build
      do_typecheck
      ;;
    --run-only)
      do_run
      ;;
    --test)
      do_build
      do_test
      ;;
    --quick)
      do_build
      do_run
      ;;
    --status)
      do_status
      ;;
    --list-models)
      do_list_models
      ;;
    --python)
      do_python_test
      ;;
    full|"")
      do_status
      do_list_models
      do_build
      do_typecheck
      do_run
      ;;
    *)
      echo "Usage: $0 [--build-only|--run-only|--test|--quick|--status|--list-models|--python]"
      exit 1
      ;;
  esac

  echo ""
  echo -e "${GREEN}Done.${NC}"
}

main "$@"
