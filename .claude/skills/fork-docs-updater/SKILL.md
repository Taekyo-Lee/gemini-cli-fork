---
name: fork-docs-updater
description: >
  Updates the fork's documentation files (README.md, CLAUDE.md, GEMINI.md,
  docs/fork/) to reflect code changes. Use this skill whenever the user asks
  to "update docs", "sync documentation", "reflect changes in docs", or after
  completing a feature, bug fix, or configuration change that affects how the
  fork works, is set up, or is used. Also use it when files are added, removed,
  or renamed, or when env vars, model config, or setup scripts change.
---

# Fork Documentation Updater

This skill keeps the fork's documentation in sync with the codebase. The fork
has several doc files that serve different audiences and purposes. When code
changes, one or more of these files likely need updating.

## Which files to update

Read each file before editing to understand its current state. Only update
sections that are actually affected by the change — don't rewrite unrelated
parts.

### 1. `README.md` — For coworkers setting up and using the fork

**Audience:** New users who may not be developers. Beginner-friendly.

**What it covers:**
- Setup steps (clone, .env, setup.sh, run)
- Env var table (which keys, when required)
- Available models by environment (CORP/DEV/HOME)
- Troubleshooting (common errors and fixes)
- Usage examples (interactive, one-shot, model selection)
- Telemetry (Langfuse setup)
- Python integration
- Architecture overview (brief)

**When to update:**
- Setup flow changes (new steps, changed scripts)
- New env vars added or removed
- Model list changes significantly
- New features users need to know about
- New troubleshooting scenarios discovered

**Style:** Short sentences, code blocks, tables. No jargon. A plumber should
be able to follow the setup steps.

### 2. `CLAUDE.md` — Technical context for Claude Code

**Audience:** Claude Code (this AI). Detailed technical reference.

**What it covers:**
- Fork purpose and key behavior change
- Architecture (packages, runtime, frameworks)
- Model configuration (how models.default.json works)
- Env file location and variables
- Known issues and fixes applied
- Startup/auth flow (detailed code path)
- ContentGenerator interface
- Build/run/test commands
- Coding conventions
- File inventory (files created, modified, not-to-modify)
- Upstream sync process

**When to update:**
- New files created or existing files renamed/removed
- New env vars or removed env vars
- Bug fixes applied (add to Known Issues)
- Architecture changes (new packages, changed flow)
- New coding conventions established
- Files modified by fork changes

**Style:** Technical, precise, with file paths and code references. Tables for
file inventories. Keep sections that serve as lookup references (file lists,
env vars) accurate above all else.

### 3. `GEMINI.md` — Technical context for Gemini CLI (the AI agent itself)

**Audience:** Gemini CLI's own AI agent. Project context for when users run
`gemini` interactively.

**What it covers:**
- Fork overview (what it is, link to CLAUDE.md for details)
- Project overview (technologies, architecture)
- Fork setup quick-start
- Model configuration
- Building and running commands
- Testing conventions
- Documentation pointers

**When to update:**
- Build/run commands change
- Setup flow changes
- New testing conventions
- New documentation locations

**Style:** Similar to CLAUDE.md but shorter. Points to CLAUDE.md for deep
detail rather than duplicating it.

### 4. `docs/fork/` — Detailed fork documentation

**Audience:** Developers maintaining or extending the fork.

**Structure:**
| Directory                 | Contents                                     |
| ------------------------- | -------------------------------------------- |
| `docs/fork/overview/`     | Fork philosophy, fork-vs-upstream comparison |
| `docs/fork/setup/`        | Install guide, troubleshooting               |
| `docs/fork/architecture/` | OpenAI-compatible mode, model registry       |
| `docs/fork/tracing/`      | Telemetry setup, Langfuse integration        |
| `docs/fork/upstream/`     | Sync guide, merge history                    |
| `docs/fork/tracking/`     | TODO, changelog, phase plans                 |

**When to update:**
- `architecture/` — When the OpenAI adapter, type mapper, model registry, or
  content generator changes
- `tracing/` — When telemetry behavior changes (new attributes, new exporters,
  trace structure changes)
- `tracking/todo.md` — After completing any phase or sub-phase (mark items
  `[x]`, add notes)
- `setup/` — When setup steps, env vars, or prerequisites change
- `upstream/` — After upstream merges

**Style:** In-depth, with code examples, architecture diagrams (ASCII), and
tables. These docs are for people who need to understand the internals.

### 5. `scripts/fork/` — Setup and utility scripts

**Audience:** Users running setup, and developers extending the fork.

**Scripts:**
| Script                    | Purpose                                      |
| ------------------------- | -------------------------------------------- |
| `setup.sh`          | One-shot setup: build, link, env, bashrc     |
| `test_openai_adapter.sh`  | Build/test/run script                        |
| `gemini_llm.py`           | Python LLM helper (langchain-openai)         |
| `test_glm5_tools.py`      | GLM-5 multi-turn tool call test              |
| `upstream-sync.sh`        | Upstream sync workflow                       |
| `verify-fork-features.sh` | Post-merge feature verification              |
| `fork-diff-report.sh`     | Pre-merge conflict analysis                  |

**When to update:**
- `setup.sh` — When setup flow changes (new env vars, file paths move,
  new templates, bashrc sourcing changes)
- `gemini_llm.py` — When model registry format changes (new fields, moved
  file path, env var resolution logic)
- `test_openai_adapter.sh` — When build commands or test flow changes
- `upstream-sync.sh` / `verify-fork-features.sh` / `fork-diff-report.sh` —
  When merge strategy or fork feature set changes

**Style:** Shell scripts use `info`/`warn`/`error` helper functions. Python
uses inline script dependencies (`uv` style). Keep scripts self-contained
and well-commented.

## Workflow

1. **Understand the change.** Read the recent git diff or ask the user what
   changed. Identify which documentation files are affected.

2. **Read before writing.** Always read each target file before editing. Check
   what's already there so you don't duplicate, contradict, or break existing
   content.

3. **Make surgical edits.** Update only the sections affected by the change.
   Don't rewrite entire files. Don't add sections that aren't needed.

4. **Cross-reference consistency.** If the same fact appears in multiple files
   (e.g., an env var in both README.md and CLAUDE.md), update all occurrences.
   Common cross-cutting changes:
   - Env vars: README.md (table), CLAUDE.md (env section), .env.example
   - New files: CLAUDE.md (file inventory), possibly GEMINI.md
   - Setup changes: README.md (steps), CLAUDE.md (build section), GEMINI.md
     (setup section)
   - Model changes: README.md (models table), docs/fork/architecture/,
     scripts/fork/gemini_llm.py
   - File path changes: all docs, scripts/fork/setup.sh,
     scripts/fork/gemini_llm.py

5. **Don't forget tracking.** If a phase or task was completed, update
   `docs/fork/tracking/todo.md`.

## What NOT to do

- Don't update docs for changes that are only visible in code (internal
  refactors with no user-facing or AI-facing impact)
- Don't add documentation for things that can be derived by reading the code
  (e.g., don't document every function signature)
- Don't create new doc files unless there's a clear gap — prefer updating
  existing files
- Don't change the style or tone of a file — match what's already there
