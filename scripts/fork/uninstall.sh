#!/usr/bin/env bash
# @license
# Copyright 2026 Google LLC
# SPDX-License-Identifier: Apache-2.0

# ─────────────────────────────────────────────────────────────────────
# uninstall.sh — Remove the global `gemini` command and undo
# the shell configuration that setup.sh added.
#
# This does NOT delete the repo or node_modules — you can reinstall
# anytime with: ./scripts/fork/setup.sh
#
# Usage:
#   ./scripts/fork/uninstall.sh          # remove command + bashrc line
#   ./scripts/fork/uninstall.sh --all    # also remove ~/.gemini config
# ─────────────────────────────────────────────────────────────────────

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BOLD='\033[1m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $*"; }
warn()  { echo -e "${YELLOW}!${NC} $*"; }
error() { echo -e "${RED}✗${NC} $*"; }

BASHRC="$HOME/.bashrc"
MARKER="# [gemini-fork]"

main() {
    local remove_config=false
    if [[ "${1:-}" == "--all" ]]; then
        remove_config=true
    fi

    echo -e "${BOLD}Uninstalling Gemini CLI fork...${NC}"
    echo ""

    # Step 1: Remove global symlink
    echo -e "${BOLD}[1/3] Removing global gemini command...${NC}"
    local gemini_path
    gemini_path="$(command -v gemini 2>/dev/null || true)"
    if [[ -n "$gemini_path" ]]; then
        npm uninstall -g @google/gemini-cli 2>/dev/null || true
        # Verify removal
        if command -v gemini &>/dev/null; then
            warn "gemini command still exists (may be from another source)"
        else
            info "Removed global gemini command"
        fi
    else
        info "gemini command not found (already removed)"
    fi
    echo ""

    # Step 2: Remove bashrc entries (env sourcing + alias)
    echo -e "${BOLD}[2/3] Cleaning ~/.bashrc...${NC}"
    local cleaned=false
    if grep -qF "$MARKER" "$BASHRC" 2>/dev/null; then
        grep -vF "$MARKER" "$BASHRC" > "$BASHRC.tmp" && mv "$BASHRC.tmp" "$BASHRC"
        info "Removed env sourcing line from ~/.bashrc"
        cleaned=true
    fi
    if grep -q "alias gemini=" "$BASHRC" 2>/dev/null; then
        grep -v "alias gemini=" "$BASHRC" > "$BASHRC.tmp" && mv "$BASHRC.tmp" "$BASHRC"
        info "Removed gemini alias from ~/.bashrc"
        cleaned=true
    fi
    if ! $cleaned; then
        info "No gemini-fork entries found in ~/.bashrc (already clean)"
    fi
    echo ""

    # Step 3: Remove ~/.gemini config (only with --all)
    echo -e "${BOLD}[3/3] Config directory (~/.gemini)...${NC}"
    if $remove_config; then
        if [[ -d "$HOME/.gemini" ]]; then
            rm -rf "$HOME/.gemini"
            info "Removed ~/.gemini"
        else
            info "~/.gemini not found (already removed)"
        fi
    else
        if [[ -d "$HOME/.gemini" ]]; then
            info "Kept ~/.gemini (run with --all to remove)"
        else
            info "~/.gemini not found"
        fi
    fi
    echo ""

    # Summary
    echo -e "${BOLD}Done.${NC} Open a new terminal to take effect."
    echo ""
    echo "  To reinstall:  ./scripts/fork/setup.sh && source ~/.bashrc"
}

main "$@"
