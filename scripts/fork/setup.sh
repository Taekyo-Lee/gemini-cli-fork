#!/usr/bin/env bash
# @license
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

# ─────────────────────────────────────────────────────────────────────
# setup.sh — One-shot fork setup: build, link `gemini` globally,
# copy env/model templates, and configure ~/.bashrc.
#
# After this script runs, the `gemini` command in ANY directory will
# point to the local fork build.  Run this after every code change
# (or just use `npm run build` — the link persists).
#
# Usage:
#   ./scripts/fork/setup.sh           # full: build + link + env
#   ./scripts/fork/setup.sh --link    # link only (skip build)
#   ./scripts/fork/setup.sh --verify  # just check current state
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
        error "${BOLD}Issues found. Run: ./scripts/fork/setup.sh${NC}"
    fi

    $ok
}

# ── Env Setup ─────────────────────────────────────────────────────────
# 1. Ensures GEMINI_FORK_DIR is set in .env (so coworkers know the repo path)
# 2. Adds one line to ~/.bashrc:
#      set -a; source "<repo>/.env"; set +a  # [gemini-fork]
#    The path comes from .env's own GEMINI_FORK_DIR — but .bashrc needs
#    a literal path to find .env in the first place, so we write the
#    resolved path at script time.

ENV_FILE="$REPO_ROOT/.env"
MODELS_FILE="$REPO_ROOT/config/models.default.json"
BASHRC="$HOME/.bashrc"
MARKER="# [gemini-fork] source env vars"

setup_env() {
    # Copy templates if missing
    if [[ ! -f "$ENV_FILE" ]]; then
        if [[ -f "$REPO_ROOT/.env.example" ]]; then
            cp "$REPO_ROOT/.env.example" "$ENV_FILE"
            info "Created .env from .env.example — fill in your API keys"
        else
            warn ".env not found and no template available — skipping env setup"
            return 0
        fi
    fi

    if [[ ! -f "$MODELS_FILE" ]]; then
        if [[ -f "$REPO_ROOT/config/models.default.json.example" ]]; then
            cp "$REPO_ROOT/config/models.default.json.example" "$MODELS_FILE"
            info "Created config/models.default.json from template"
        else
            warn "config/models.default.json not found — model picker will be empty"
        fi
    fi

    # Ensure GEMINI_FORK_DIR is in .env
    if grep -q '^GEMINI_FORK_DIR=' "$ENV_FILE" 2>/dev/null; then
        # Update if repo moved
        local existing
        existing="$(grep '^GEMINI_FORK_DIR=' "$ENV_FILE" | cut -d= -f2-)"
        if [[ "$existing" != "$REPO_ROOT" ]]; then
            sed -i "s|^GEMINI_FORK_DIR=.*|GEMINI_FORK_DIR=$REPO_ROOT|" "$ENV_FILE"
            info "Updated GEMINI_FORK_DIR in .env (was: $existing)"
        fi
    else
        # Prepend to .env
        sed -i "1i GEMINI_FORK_DIR=$REPO_ROOT" "$ENV_FILE"
        info "Added GEMINI_FORK_DIR=$REPO_ROOT to .env"
    fi

    # [FORK] No longer sourcing project .env from ~/.bashrc.
    # Project .env is loaded at process startup by loadEnvironment() in
    # settings.ts, which overrides global ~/.env values. This keeps API
    # keys scoped to the gemini-fork process instead of leaking globally.
    # Clean up the old marker if it exists from a previous setup run.
    if grep -qF "$MARKER" "$BASHRC" 2>/dev/null; then
        grep -vF "$MARKER" "$BASHRC" > "$BASHRC.tmp" && mv "$BASHRC.tmp" "$BASHRC"
        info "Removed old source line from ~/.bashrc (env is now loaded at process level)"
    fi
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
        echo -e "${BOLD}[1/4] Building...${NC}"
        npm run build
        echo ""
    fi

    # Step 2: Remove any conflicting global install
    echo -e "${BOLD}[2/4] Removing conflicting global installs...${NC}"
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
    echo -e "${BOLD}[3/4] Linking fork globally...${NC}"
    npm link ./packages/cli 2>&1 | grep -v "^npm warn" || true
    echo ""

    # Step 4: Source .env from ~/.bashrc
    echo -e "${BOLD}[4/4] Setting up environment...${NC}"
    setup_env
    echo ""

    # Verify
    echo -e "${BOLD}Verifying...${NC}"
    verify
}

main "$@"
