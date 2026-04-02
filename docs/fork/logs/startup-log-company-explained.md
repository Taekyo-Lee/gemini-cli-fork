# Gemini CLI Startup Log (Company) — Explained Step by Step

This document walks through the startup log captured on the **company PC**,
explaining each step and highlighting differences from the
[home/development network PC log](startup-log-explained.md).

**Reference log:** [startup-debug-company.log](startup-debug-company.log)

**Environment:** WSL2, VS Code integrated terminal, corporate network,
running from `/home/jetlee/workspace/Skills-for-SWE/` (not the fork repo itself).

---

## Table of Contents

1. [Ignore Patterns (Not Found)](#1-ignore-patterns-not-found)
2. [Telemetry / Metrics Setup](#2-telemetry--metrics-setup)
3. [Keychain (Credential Storage)](#3-keychain-credential-storage)
4. [Experiments](#4-experiments)
5. [Terminal Detection](#5-terminal-detection)
6. [IDE Connection (FAILED)](#6-ide-connection-failed)
7. [Keyboard Protocol](#7-keyboard-protocol)
8. [Custom Skill Override](#8-custom-skill-override)
9. [Hook System](#9-hook-system)
10. [Memory Discovery (Global Only)](#10-memory-discovery-global-only)
11. [Startup Profiler (~5x Slower)](#11-startup-profiler-5x-slower)
12. [Session Summary](#12-session-summary)
13. [Update Check (FAILED)](#13-update-check-failed)
14. [Duplicate Log Blocks](#14-duplicate-log-blocks)
15. [Comparison: home/development network vs Company](#15-comparison-home/development network-vs-company)

---

## 1. Ignore Patterns (Not Found)

```
[DEBUG] Ignore file not found: /home/jetlee/workspace/Skills-for-SWE/.geminiignore, continue without it.
```

**What:** The CLI looks for `.geminiignore` in the current working directory but
doesn't find one.

**Difference from home/developmet network:** At home/developmet network, the CLI runs from the fork repo which has a
`.geminiignore`. Here it runs from `Skills-for-SWE/` which doesn't have one.

**Impact:** None — the CLI simply skips ignore filtering and processes all files.
If this project grows large, adding a `.geminiignore` would help keep context
focused.

---

## 2. Telemetry / Metrics Setup

```
[LOG]  Timeout of 30000 exceeds the interval of 10000. Clamping timeout to interval duration.
[WARN] The 'metricReader' option is deprecated. Please use 'metricReaders' instead.
```

**What:** Same OpenTelemetry warnings as the home/developmet network log. Harmless.

**No difference from home/developmet network.**

---

## 3. Keychain (Credential Storage)

```
[DEBUG] Keychain initialization encountered an error: Cannot find module '../build/Release/keytar.node'
[DEBUG] Using FileKeychain fallback for secure storage.
```

**What:** Same keytar failure and FileKeychain fallback as home/developmet network. Expected on
WSL2.

**No difference from home/developmet network.**

---

## 4. Experiments

```
[DEBUG] Experiments loaded {
  experimentIds: [],
  flags: []
}
```

**What:** Google's experiment system loads empty. Expected for the fork.

**No difference from home/developmet network.**

---

## 5. Terminal Detection

```
[LOG] Detected terminal background color: #191a1b
[LOG] Detected terminal name: xterm.js(6.1.0-beta.191)
```

**What:** Same terminal type (VS Code's xterm.js), but a slightly different dark
theme color.

| | home/developmet network | Company |
|---|---|---|
| Background | `#121314` (darker) | `#191a1b` (slightly lighter) |
| Terminal | xterm.js 6.1.0-beta.191 | xterm.js 6.1.0-beta.191 |

**Impact:** None — both are dark themes, so the CLI renders light-colored text
either way.

---

## 6. IDE Connection (FAILED)

```
[DEBUG] [IDEConnectionUtils] Failed to read IDE connection directory:
  Error: ENOENT: no such file or directory, scandir '/tmp/gemini/ide'

[ERROR] [IDEClient] Failed to connect to IDE companion extension.
  Please ensure the extension is running. To install the extension, run /ide install.
```

**What:** This is the biggest difference from the home/developmet network log. The CLI tries to
connect to VS Code's Gemini companion extension via MCP, but the connection
directory (`/tmp/gemini/ide`) doesn't exist.

**Why it fails:** The Gemini VS Code extension isn't installed or running on the
company PC. The extension creates the `/tmp/gemini/ide/` directory with a
connection JSON file when it starts — no extension means no directory.

**home/developmet network comparison:**

| | home/developmet network | Company |
|---|---|---|
| IDE connection | Connected to `127.0.0.1:33613/mcp` | ENOENT — directory missing |
| Tools discovered | `openDiff`, `closeDiff` | None |
| Impact | Can show diffs in VS Code | Diffs shown in terminal only |

**Performance impact:** The CLI spends ~1.8 seconds waiting for the IDE
connection before giving up. This is the main reason company startup is ~5x
slower (see [Startup Profiler](#11-startup-profiler-5x-slower)).

**How to fix (optional):**
- Install the Gemini VS Code extension: run `/ide install` inside the CLI
- Or accept the slower startup — the CLI works fine without IDE integration

---

## 7. Keyboard Protocol

```
[LOG] Enabling Kitty keyboard protocol
```

**What:** Same as home/developmet network. Enables rich keyboard input handling.

**No difference from home/developmet network.**

---

## 8. Custom Skill Override

```
[DEBUG] Skill "skill-creator" from "/home/jetlee/.agents/skills/skill-creator/SKILL.md"
  is overriding the built-in skill.
```

**What:** The CLI found a custom `skill-creator` skill at
`~/.agents/skills/skill-creator/SKILL.md` that overrides the built-in
`skill-creator` skill.

**This is unique to the company PC** — the home/developmet network log doesn't show this. It means
you've installed a customized version of the skill-creator skill in your global
agents directory.

**How skills work:** The CLI searches for skills in multiple locations (global
`~/.agents/skills/`, project-level, etc.). When a custom skill has the same name
as a built-in one, the custom version takes priority.

---

## 9. Hook System

```
[DEBUG] Hook registry initialized with 0 hook entries
[DEBUG] Hook system initialized successfully
```

**What:** Same as home/developmet network — no hooks configured.

**No difference from home/developmet network.**

---

## 10. Memory Discovery (Global Only)

```
[MemoryDiscovery] Found global memory file: /home/jetlee/.gemini/GEMINI.md
[MemoryDiscovery] Loading environment memory for trusted root: /home/jetlee/workspace/Skills-for-SWE
[MemoryDiscovery] Starting upward search from /home/jetlee/workspace/Skills-for-SWE
[MemoryDiscovery] deduplication: keeping /home/jetlee/.gemini/GEMINI.md (dev: 2064, ino: 459143)
[MemoryDiscovery] Successfully read and processed imports: /home/jetlee/.gemini/GEMINI.md (Length: 91)
```

**What:** The CLI searches for `GEMINI.md` files but only finds the global one at
`~/.gemini/GEMINI.md` (91 characters). The `Skills-for-SWE` project doesn't have
its own `GEMINI.md`.

**home/developmet network comparison:**

| | home/developmet network | Company |
|---|---|---|
| Project GEMINI.md | Yes (5,209 chars) | No |
| Global GEMINI.md | Checked but deduped | Found (91 chars) |
| Total context | Rich project instructions | Minimal global instructions |

**Impact:** At home/developmet network, the LLM gets detailed project context (build commands,
architecture, conventions). At company (in `Skills-for-SWE`), it only gets 91
characters of global instructions — much less context to work with.

**How to improve:** Add a `GEMINI.md` to the `Skills-for-SWE` project with
project-specific instructions.

---

## 11. Startup Profiler (~5x Slower)

```
[STARTUP] Recording metric for phase: cli_startup           duration: 2047ms
[STARTUP] Recording metric for phase: load_settings         duration:    8ms
[STARTUP] Recording metric for phase: parse_arguments       duration:   11ms
[STARTUP] Recording metric for phase: load_cli_config       duration:   23ms
[STARTUP] Recording metric for phase: initialize_app        duration: 1779ms
[STARTUP] Recording metric for phase: load_builtin_commands duration:  137ms
[STARTUP] Recording metric for phase: discover_tools        duration:  118ms
```

**What:** Total startup takes ~2 seconds — nearly **5x slower** than home/developmet network
(428ms). Here's a side-by-side:

| Phase | home/developmet network | Company | Diff |
|---|---|---|---|
| `cli_startup` (total) | 428ms | 2047ms | **+1619ms** |
| `load_settings` | 4ms | 8ms | +4ms |
| `parse_arguments` | 8ms | 11ms | +3ms |
| `load_cli_config` | 13ms | 23ms | +10ms |
| `initialize_app` | 190ms | **1779ms** | **+1589ms** |
| `load_builtin_commands` | 93ms | 137ms | +44ms |
| `discover_tools` | 37ms | 118ms | +81ms |

**Root cause:** Almost all the extra time (1589ms) is in `initialize_app`. This
phase includes the IDE connection attempt, which at home/developmet network succeeds quickly (VS
Code responds) but at company **times out** waiting for a response from an
extension that isn't running.

**Secondary factors:**
- `load_builtin_commands` is +44ms slower — likely due to the custom skill
  override loading from disk
- `discover_tools` is +81ms slower — without the IDE connection, the tool
  discovery path may take a different (slower) fallback route

---

## 12. Session Summary

```
[SessionSummary] Most recent session already has summary
```

**What:** Unlike home/developmet network where a new summary was generated, the most recent session
here already had a summary saved from a previous run.

**home/developmet network comparison:**
- **home/developmet network:** `Generated: "Ask about a project later"` (new summary created)
- **Company:** `Most recent session already has summary` (skipped)

**Impact:** None — this just means the previous session was already summarized,
so no LLM call is needed. Slightly faster.

---

## 13. Update Check (FAILED)

```
[WARN] Failed to check for updates: TypeError: fetch failed
```

**What:** The CLI tries to check if a newer version is available by fetching from
an update server. On the corporate network, this HTTP request fails.

**This is unique to the company PC** — the home/developmet network log doesn't show this error.

**Why it fails:** Corporate firewalls/proxies block or restrict outbound HTTP
requests to external update servers. The `fetch failed` error means the request
couldn't even establish a connection.

**Impact:** None for functionality — you just won't see "a new version is
available" notifications. You can update manually with `npm install` when needed.

---

## 14. Duplicate Log Blocks

The company log contains **two full startup sequences** (lines 1-76 and 77-153).
This means the CLI was started twice during this log capture session — likely the
first session was exited and a new one started ~8 minutes later
(05:43:18 → 05:51:22). Both sessions show the same behavior.

Within each startup, the init blocks (ignore, telemetry, keychain, experiments)
appear twice due to the two-layer architecture (CLI + Core), same as the home/developmet network
log. See [Section 13 of the home/developmet network log explanation](startup-log-explained.md#13-why-some-blocks-appear-twice).

---

## 15. Comparison: home/developmet network vs Company

### What's the Same

| Feature | Status |
|---|---|
| Keychain fallback | FileKeychain (keytar not available on WSL2) |
| Experiments | Empty (expected for fork) |
| Terminal | xterm.js in VS Code |
| Keyboard | Kitty protocol enabled |
| Hooks | None configured |

### What's Different

| Feature | home/developmet network | Company | Impact |
|---|---|---|---|
| `.geminiignore` | Found | Not found | Minor — different project |
| IDE connection | Connected (openDiff, closeDiff) | **FAILED** (no extension) | No in-editor diffs |
| Custom skills | None | skill-creator override | Different skill behavior |
| GEMINI.md | 5,209 chars (project) | 91 chars (global only) | Less LLM context |
| Startup time | **428ms** | **2,047ms** | 5x slower |
| Update check | OK | **Failed** (corp firewall) | No update notifications |
| Session summary | Generated new | Already existed | No impact |

### Actionable Items

1. **Speed up startup** — The 1.6s penalty comes from the IDE connection timeout.
   Installing the Gemini VS Code extension (`/ide install`) or finding a way to
   skip the IDE connection attempt when the extension isn't present would help.
2. **Add project GEMINI.md** — Creating a `GEMINI.md` in `Skills-for-SWE/` would
   give the LLM much better project context.
3. **Add .geminiignore** — If `Skills-for-SWE` has large directories to skip,
   adding a `.geminiignore` would improve file indexing performance.
