#!/usr/bin/env bash
# @license
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

# ─────────────────────────────────────────────────────────────────────
# link_global.sh — Build the fork and link `gemini` globally.
#
# After this script runs, the `gemini` command in ANY directory will
# point to the local fork build.  Run this after every code change
# (or just use `npm run build` — the link persists).
#
# Usage:
#   ./scripts/fork/link_global.sh           # full: build + link
#   ./scripts/fork/link_global.sh --link    # link only (skip build)
#   ./scripts/fork/link_global.sh --verify  # just check current state
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

# Resolve repo root (this script lives in <repo>/scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CLI_PKG="$REPO_ROOT/packages/cli"
EXPECTED_DIST="$CLI_PKG/dist/index.js"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m' # No Color

info()  { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
error() { echo -e "${RED}✗${NC} $*"; }

# ── Verify ────────────────────────────────────────────────────────────
verify() {
    local ok=true

    # 1. Check dist exists
    if [[ -f "$EXPECTED_DIST" ]]; then
        info "Build exists: $EXPECTED_DIST"
    else
        error "Build missing: $EXPECTED_DIST — run this script without --verify"
        ok=false
    fi

    # 2. Check gemini command exists
    local gemini_path
    gemini_path="$(command -v gemini 2>/dev/null || true)"
    if [[ -z "$gemini_path" ]]; then
        error "'gemini' command not found in PATH"
        ok=false
    else
        # Resolve through symlinks
        local real_path
        real_path="$(readlink -f "$gemini_path" 2>/dev/null || realpath "$gemini_path" 2>/dev/null || echo "$gemini_path")"
        if [[ "$real_path" == "$EXPECTED_DIST" ]]; then
            info "gemini → $real_path ${GREEN}(correct — points to fork)${NC}"
        else
            error "gemini → $real_path ${RED}(WRONG — not pointing to fork)${NC}"
            warn "Expected: $EXPECTED_DIST"
            ok=false
        fi
    fi

    # 3. Check version
    if [[ -n "$gemini_path" ]]; then
        local version
        version="$(gemini --version 2>/dev/null || echo 'unknown')"
        info "Version: $version"
    fi

    if $ok; then
        echo ""
        info "${BOLD}All good. 'gemini' points to the fork build.${NC}"
    else
        echo ""
        error "${BOLD}Issues found. Run: ./scripts/link_global.sh${NC}"
    fi

    $ok
}

# ── Main ──────────────────────────────────────────────────────────────
main() {
    local mode="full"
    if [[ "${1:-}" == "--link" ]]; then
        mode="link"
    elif [[ "${1:-}" == "--verify" ]]; then
        verify
        return $?
    fi

    cd "$REPO_ROOT"

    # Step 1: Build (unless --link)
    if [[ "$mode" == "full" ]]; then
        echo -e "${BOLD}[1/3] Building...${NC}"
        npm run build
        echo ""
    fi

    # Step 2: Remove any conflicting global install
    echo -e "${BOLD}[2/3] Removing conflicting global installs...${NC}"
    local gemini_path
    gemini_path="$(command -v gemini 2>/dev/null || true)"
    if [[ -n "$gemini_path" ]]; then
        local real_path
        real_path="$(readlink -f "$gemini_path" 2>/dev/null || echo "$gemini_path")"
        if [[ "$real_path" != "$EXPECTED_DIST" ]]; then
            warn "gemini currently points to: $real_path (not our fork)"
            warn "Removing global @google/gemini-cli..."
            npm uninstall -g @google/gemini-cli 2>/dev/null || true
        else
            info "gemini already points to fork"
        fi
    fi
    echo ""

    # Step 3: Link
    echo -e "${BOLD}[3/3] Linking fork globally...${NC}"
    npm link ./packages/cli 2>&1 | grep -v "^npm warn" || true
    echo ""

    # Verify
    echo -e "${BOLD}Verifying...${NC}"
    verify
}

main "$@"
