# Gemini CLI Startup Log — Explained Step by Step

This document walks through every log line you see when running `gemini`,
explaining what each step does, why it matters, and whether any warnings are
cause for concern.

The log is from a real session on WSL2 with VS Code's integrated terminal.

**Reference log:** [startup-debug.log](startup-debug.log)

---

## Table of Contents

1. [Ignore Patterns](#1-ignore-patterns)
2. [Telemetry / Metrics Setup](#2-telemetry--metrics-setup)
3. [Keychain (Credential Storage)](#3-keychain-credential-storage)
4. [Experiments](#4-experiments)
5. [Terminal Detection](#5-terminal-detection)
6. [IDE Connection (MCP)](#6-ide-connection-mcp)
7. [Keyboard Protocol](#7-keyboard-protocol)
8. [Ignore Patterns (Reload)](#8-ignore-patterns-reload)
9. [Hook System](#9-hook-system)
10. [Memory Discovery (GEMINI.md)](#10-memory-discovery-geminimd)
11. [Startup Profiler](#11-startup-profiler)
12. [Session Summary](#12-session-summary)
13. [Duplicate Log Blocks](#13-why-some-blocks-appear-twice)

---

## 1. Ignore Patterns

```
[DEBUG] Loading ignore patterns from: .geminiignore
```

**What:** The CLI reads `.geminiignore` — a file that works exactly like
`.gitignore` but tells Gemini which files/folders to skip when indexing your
project.

**Why it matters:** Without this, the CLI would try to read every file in your
repo, including `node_modules/`, build artifacts, and binary files. The ignore
file keeps context small and relevant.

**Where in code:** The ignore-pattern loader lives in the core package's file
utilities.

---

## 2. Telemetry / Metrics Setup

```
[LOG]  Timeout of 30000 exceeds the interval of 10000. Clamping timeout to interval duration.
[WARN] The 'metricReader' option is deprecated. Please use 'metricReaders' instead.
```

**What:** The CLI initializes OpenTelemetry, a standard framework for collecting
performance metrics and traces. Two harmless warnings appear:

| Warning | Meaning |
|---|---|
| "Timeout exceeds interval" | The metric export timeout (30s) is longer than the export interval (10s). OTel auto-clamps it. |
| "'metricReader' is deprecated" | Upstream code uses an older OTel API. The newer API renamed the option to `metricReaders` (plural). |

**Should I worry?** No. Both are cosmetic — telemetry still works correctly.
These will go away when upstream updates their OpenTelemetry dependency.

---

## 3. Keychain (Credential Storage)

```
[DEBUG] Keychain initialization encountered an error: Cannot find module '../build/Release/keytar.node'
Require stack:
- /home/jetlee/workspace/gemini-cli-fork/node_modules/keytar/lib/keytar.js

[DEBUG] Using FileKeychain fallback for secure storage.
```

**What:** The CLI tries to use `keytar`, a native Node.js module that stores
secrets in your OS keychain (macOS Keychain, Windows Credential Manager, or
Linux Secret Service). On WSL2, the native binary often isn't compiled, so
keytar fails to load.

**Fallback:** The CLI gracefully falls back to `FileKeychain`, which stores
credentials in an encrypted file on disk instead.

**Should I worry?** No. In our fork, API keys come from `.env` environment
variables anyway — the keychain is mainly used for Google auth tokens (which we
skip in OpenAI-compatible mode). The fallback is perfectly safe.

---

## 4. Experiments

```
[DEBUG] Experiments loaded {
  experimentIds: [],
  flags: []
}
```

**What:** Google uses an experiment/feature-flag system to A/B test new features
in the official Gemini CLI. The CLI checks which experiments are active for your
account.

**Why it's empty:** Our fork doesn't connect to Google's experiment service, so
no experiments or flags are loaded. This is completely expected.

**Should I worry?** No. Empty experiments just means you get the default behavior
for everything — no features are hidden or modified by remote flags.

---

## 5. Terminal Detection

```
[LOG] Detected terminal background color: #121314
[LOG] Detected terminal name: xterm.js(6.1.0-beta.191)
```

**What:** The CLI probes your terminal to figure out:

- **Background color** (`#121314` = very dark gray) — used to pick readable text
  colors. A dark background means the CLI will use light-colored text.
- **Terminal type** (`xterm.js`) — this is the terminal emulator built into VS
  Code. The version `6.1.0-beta.191` tells the CLI which escape sequences and
  features are supported.

**Why it matters:** Different terminals support different features (256 colors,
true color, mouse events, etc.). Knowing the terminal type lets the CLI render
its UI correctly.

---

## 6. IDE Connection (MCP)

```
[DEBUG] Selected IDE connection file: gemini-ide-server-6496-33613.json
[DEBUG] Attempting to connect to IDE via HTTP SSE
[DEBUG] Server URL: http://127.0.0.1:33613/mcp
[DEBUG] Discovering tools from IDE...
[DEBUG] Discovered 2 tools from IDE: openDiff, closeDiff
```

**What:** This is one of the most interesting parts. The CLI connects to VS
Code's Gemini extension through the **Model Context Protocol (MCP)** — an open
standard for AI tools to communicate with external systems.

Step by step:

1. **Find the connection file** — VS Code writes a JSON file
   (`gemini-ide-server-6496-33613.json`) containing the port it's listening on.
   The numbers are the VS Code PID (`6496`) and port (`33613`).

2. **Connect via SSE** — The CLI opens an HTTP Server-Sent Events connection to
   `http://127.0.0.1:33613/mcp` (localhost, so it never leaves your machine).

3. **Discover tools** — Through MCP, the CLI asks "what can you do?" and the IDE
   responds with 2 tools:
   - `openDiff` — Opens a diff view in VS Code to show proposed changes
   - `closeDiff` — Closes the diff view

**Why it matters:** This is how the CLI can show file changes directly in your
editor instead of just printing them to the terminal. When Gemini wants to edit a
file, it can open a VS Code diff so you can review and accept/reject changes
visually.

**What if VS Code isn't running?** The CLI still works — it just won't have the
diff tools available and will show changes in the terminal instead.

---

## 7. Keyboard Protocol

```
[LOG] Enabling Kitty keyboard protocol
```

**What:** The [Kitty keyboard protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/)
is a modern standard that gives terminal apps much richer keyboard input than the
traditional method. It can distinguish between:

- `Ctrl+I` vs `Tab` (traditionally identical)
- Key press vs key release vs key repeat
- Modified keys like `Ctrl+Shift+Enter`

**Why it matters:** This enables the CLI to have keyboard shortcuts that would be
impossible with the basic terminal input protocol. For example, using `Escape` to
cancel without conflicting with arrow key sequences.

**Compatibility:** Most modern terminals support it (Kitty, WezTerm, VS Code
terminal, Ghostty). Older terminals (plain xterm) may not, but the CLI falls
back gracefully.

---

## 8. Ignore Patterns (Reload)

```
[DEBUG] Loading ignore patterns from: .geminiignore
[DEBUG] Loading ignore patterns from: .geminiignore
```

**What:** The ignore patterns are loaded again (sometimes multiple times).

**Why?** Different subsystems initialize independently and each needs its own
copy of the ignore rules — for example, the file indexer and the tool system both
need to know which files to skip. This is slightly redundant but harmless.

---

## 9. Hook System

```
[DEBUG] Hook registry initialized with 0 hook entries
[DEBUG] Hook system initialized successfully
```

**What:** Hooks are shell commands that run automatically in response to CLI
events — similar to git hooks. For example, you could set up a hook to run a
linter every time Gemini edits a file.

**Why it's 0:** You haven't configured any hooks. Hooks are defined in your
Gemini settings file and are entirely optional.

---

## 10. Memory Discovery (GEMINI.md)

```
[MemoryDiscovery] Loading environment memory for trusted root: /home/jetlee/workspace/gemini-cli-fork
[MemoryDiscovery] Starting upward search from /home/jetlee/workspace/gemini-cli-fork
[MemoryDiscovery] Loading environment memory for trusted root: /home/jetlee/.gemini
[MemoryDiscovery] deduplication: keeping .../GEMINI.md (dev: 2096, ino: 203129)
[MemoryDiscovery] Successfully read and processed imports: GEMINI.md (Length: 5209)
```

**What:** The CLI searches for `GEMINI.md` files — project instruction files
that tell Gemini about your codebase (like `CLAUDE.md` for Claude Code).

The search process:

1. **Walk upward** from the current working directory to the git root, looking
   for `GEMINI.md` at each level.
2. **Check global config** at `~/.gemini/` for user-level instructions.
3. **Deduplicate** — If the same file is found via multiple paths, keep only one
   copy (identified by device + inode number).
4. **Load and process** — Read the file (5,209 characters) and inject its
   contents into the system prompt so the LLM knows your project's conventions.

**Why it matters:** This is how you give the CLI persistent, project-specific
context without repeating yourself every conversation. It's the equivalent of a
senior developer's onboarding doc that the AI reads before every session.

---

## 11. Startup Profiler

```
[STARTUP] StartupProfiler.flush() called with 7 phases
[STARTUP] Recording metric for phase: cli_startup           duration: 428ms
[STARTUP] Recording metric for phase: load_settings         duration:   4ms
[STARTUP] Recording metric for phase: parse_arguments       duration:   8ms
[STARTUP] Recording metric for phase: load_cli_config       duration:  13ms
[STARTUP] Recording metric for phase: initialize_app        duration: 190ms
[STARTUP] Recording metric for phase: load_builtin_commands duration:  93ms
[STARTUP] Recording metric for phase: discover_tools        duration:  37ms
```

**What:** The startup profiler measures how long each initialization phase takes.
Here's the breakdown:

| Phase | Time | What it does |
|---|---|---|
| `cli_startup` | 428ms | **Total** end-to-end startup time |
| `load_settings` | 4ms | Read user settings/preferences from disk |
| `parse_arguments` | 8ms | Parse command-line flags (`gemini -p "..."`, etc.) |
| `load_cli_config` | 13ms | Load CLI configuration (models, auth, etc.) |
| `initialize_app` | 190ms | **Heaviest phase** — keychain, experiments, auth check |
| `load_builtin_commands` | 93ms | Register all built-in slash commands |
| `discover_tools` | 37ms | Find available tools (file edit, search, shell, IDE, etc.) |

**Key takeaway:** Total cold start is ~430ms, which is fast for a Node.js CLI
app. The `initialize_app` phase dominates because it does I/O (keychain,
network). The phases don't add up to exactly 428ms because some run in parallel.

---

## 12. Session Summary

```
[SessionSummary] Generated: "Ask about a project later"
[SessionSummary] Saved summary for .../session-2026-04-01T07-27-e92d3fe0.json
```

**What:** The CLI auto-generates a one-line summary of your previous chat session
and saves it. This is used to show a history list when you run `gemini` — each
past session gets a short description so you can find and resume it.

The summary is generated by sending the conversation to an LLM with a prompt
like "summarize this chat in one sentence." The result is saved alongside the
session file.

---

## 13. Why Some Blocks Appear Twice

You'll notice that blocks 1-4 (ignore patterns, telemetry, keychain,
experiments) appear twice in the log with a ~1.2 second gap:

- **First time (T+0.0s):** The CLI's **main process** initializes.
- **Second time (T+1.2s):** The **core package** initializes separately when the
  React UI mounts.

This happens because the CLI has a two-layer architecture: the outer CLI shell
(`packages/cli`) and the inner core engine (`packages/core`) both run their own
initialization. It's slightly redundant but ensures each layer has its own
properly configured instances.

---

## Summary: The Full Startup Timeline

```
T+0.000s  Load .geminiignore
T+0.020s  Initialize telemetry (OTel metrics)
T+0.028s  Try native keychain -> fail -> use file fallback
T+0.061s  Load experiments (empty)
T+1.173s  [Core reinitializes: ignore, telemetry, keychain, experiments]
T+1.244s  Detect terminal (dark theme, xterm.js)
T+1.438s  Connect to VS Code via MCP, discover 2 tools
T+1.745s  Enable Kitty keyboard protocol
T+1.810s  Load .geminiignore (for tool system)
T+1.881s  Initialize hook system (0 hooks)
T+1.882s  Discover and load GEMINI.md (5,209 chars)
T+1.904s  Flush startup profiler (428ms total)
T+2.747s  Generate session summary for previous chat
T+6.333s  Load experiments (final check)
```

Total time from launch to ready: **~2 seconds**, with the session summary
generation happening in the background.
