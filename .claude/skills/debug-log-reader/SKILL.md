---
name: debug-log-reader
description: >-
  Parse and display Gemini CLI debug logs (GEMINI_DEBUG_LOG_FILE) in a clean,
  human-readable format. Merges verbose per-token stream chunks into complete
  messages, collapses duplicate log noise, deduplicates repeated warnings, and
  presents the conversation as OpenAI-style message dicts ({role, content,
  tool_calls, ...}) with TTFT and stream duration timing. Use this skill
  whenever the user mentions "debug log", "gemini log", "show the log",
  "read the log", "what happened in that session", "log viewer", "parse the
  log", or references GEMINI_DEBUG_LOG_FILE or ~/gemini_debug.log. Also trigger
  when the user opens or mentions gemini_debug.log in their editor.
---

# Debug Log Reader

You help the user read Gemini CLI debug logs. The raw logs are extremely verbose
(each streaming token gets its own line, policy checks are duplicated, startup
noise is repeated). Your job is to parse them into a clean, chronological
conversation view using the bundled parser script.

## How to use

Run the parser script bundled with this skill:

```bash
python3 SKILL_DIR/scripts/parse_debug_log.py [OPTIONS]
```

Where `SKILL_DIR` is the directory containing this SKILL.md file.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--file PATH` | `$GEMINI_DEBUG_LOG_FILE` or `~/gemini_debug.log` | Log file path |
| `--lines N` | `10000` | Read last N lines |
| `--session WHICH` | `last` | Which session: `last`, `all`, or 1-based index |
| `--level LEVEL` | `all` | Filter: `all`, `error`, `warn`, `info` |
| `-o, --output PATH` | stdout | Write output to file instead of printing |
| `--raw` | off | Show raw entries (skip chunk merging) |
| `--json` | off | Output as JSON array |

### Examples

```bash
# Last session, formatted (default)
python3 SKILL_DIR/scripts/parse_debug_log.py

# Only errors and warnings
python3 SKILL_DIR/scripts/parse_debug_log.py --level warn

# All sessions, save to file
python3 SKILL_DIR/scripts/parse_debug_log.py --session all -o /tmp/parsed_log.txt

# JSON output for programmatic use
python3 SKILL_DIR/scripts/parse_debug_log.py --json -o /tmp/parsed_log.json

# Specific log file, last 5000 lines
python3 SKILL_DIR/scripts/parse_debug_log.py --file /path/to/debug.log --lines 5000
```

## Output format

The script outputs the conversation in **OpenAI-style message format** with
timing annotations:

```
======================================================================
SESSION #1 — 2026-03-25 07:10:13 — gpt-4o
Startup: 363ms | Models: 27 | IDE tools: openDiff, closeDiff
======================================================================

[07:10:22] ROUTING
  model: gpt-4o
  source: agent-router/override
  reasoning: Routing bypassed by forced model directive.

[07:10:22] >>> SENDING 4 messages to gpt-4o

  {"role": "system", "content": "You are Gemini CLI, an interactive..."}
  {"role": "user", "content": "<session_context>..."}
  {"role": "user", "content": "안녕"}

[07:10:27] <<< RESPONSE (TTFT 4.6s, stream 0.3s, stop)

  {"role": "assistant", "content": "안녕하세요! 무엇을 도와드릴까요?"}

[07:11:47] ⚠ WARN (x3): Approval mode overridden to "default"...

----------------------------------------------------------------------
```

For tool calls:

```
[07:12:14] <<< RESPONSE (TTFT 2.0s, stream 0.1s, tool_calls)

  {"role": "assistant", "content": null, "tool_calls": [
    {"id": "call_93Gw...", "function": {"name": "activate_skill", "arguments": {"name": "docx"}}}
  ]}

[07:12:14] POLICY: activate_skill -> ask_user (priority=1.01)
```

### Timing fields

- **TTFT** (Time To First Token): delay from sending the request to receiving
  the first stream chunk. This is what the user "feels" as latency.
- **stream**: duration of the streaming response (first chunk to last chunk).

## What the script does under the hood

1. **Reads** the last N lines of the log file
2. **Splits** into sessions by detecting startup boundaries (LLMRegistry load
   events with >5s gap)
3. **Merges stream chunks** — consecutive `[OpenAI] Stream chunk: text=` lines
   become one assembled string; tool call arg chunks become one complete JSON
4. **Deduplicates**:
   - Repeated identical warnings → `⚠ WARN (x3): ...`
   - Duplicate startup phases → keeps last value per phase
   - Duplicate policy engine checks → one per tool+decision combo
   - Conseca/ContextBuilder/experiment entries → removed entirely
5. **Promotes** DEBUG-level entries that are semantically warnings (YAML parsing
   failures, approval mode overrides) so they appear in `--level warn` output
6. **Extracts conversation structure**:
   - `[OpenAI] Sending N messages` → outgoing request with message list
   - Stream chunks → assembled response with TTFT + stream duration
   - `[Routing]` → model selection with reasoning
   - `[PolicyEngine.check]` → tool approval decisions (deduplicated)
   - `[STARTUP]` phases → one-line summary in session header
   - `[WARN]`/`[ERROR]` → highlighted with count
7. **Formats** as OpenAI-style dicts with timestamps

## When presenting results to the user

After running the script, present the output directly. If the user asked to save
to a file, use the `-o` flag. If the output is very long (>200 lines), summarize
the key points:

- How many sessions, which models were used
- The conversation flow (what the user asked, what tools were called, what the
  model responded)
- Any errors or warnings worth noting
- TTFT latency for each request

If the user asks for more detail on a specific part, re-run with appropriate
filters or read the raw log for that time range.
