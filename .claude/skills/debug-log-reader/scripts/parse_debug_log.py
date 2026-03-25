#!/usr/bin/env python3
"""
Gemini CLI Debug Log Parser

Transforms raw debug logs into human-readable OpenAI-style conversation format.
Merges per-token stream chunks, collapses duplicate noise, deduplicates repeated
warnings, and presents a clean chronological view of sessions.

Usage:
    python3 parse_debug_log.py [OPTIONS]

Options:
    --file PATH       Log file (default: $GEMINI_DEBUG_LOG_FILE or ~/gemini_debug.log)
    --lines N         Read last N lines (default: 10000)
    --session WHICH   last | all | 1-based index (default: last)
    --level LEVEL     all | error | warn | info (default: all)
    --output PATH     Write output to file instead of stdout
    --raw             Show raw entries (skip chunk merging)
    --json            Output as JSON array
"""

import argparse
import json
import os
import re
import sys
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional


# ─── Log Entry Parsing ────────────────────────────────────────────────────────

LOG_LINE_RE = re.compile(
    r"^\[(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\]\s+\[(\w+)\]\s*(.*)"
)

# Entries logged at DEBUG but semantically warnings/errors
PROMOTED_WARN_PATTERNS = [
    "YAML frontmatter parsing failed",
    "Approval mode overridden",
]


@dataclass
class LogEntry:
    timestamp: datetime
    level: str  # LOG, DEBUG, WARN, ERROR
    message: str
    raw_lines: list[str] = field(default_factory=list)
    effective_level: str = ""  # level after promotion

    def __post_init__(self):
        if not self.effective_level:
            self.effective_level = self.level
        # Promote DEBUG entries that are semantically warnings
        if self.effective_level == "DEBUG":
            for pattern in PROMOTED_WARN_PATTERNS:
                if pattern in self.message:
                    self.effective_level = "WARN"
                    break


def parse_log_lines(lines: list[str]) -> list[LogEntry]:
    """Parse raw log lines into structured LogEntry objects.
    Handles multi-line entries (stack traces, JSON blobs)."""
    entries: list[LogEntry] = []
    current: Optional[LogEntry] = None

    for line in lines:
        m = LOG_LINE_RE.match(line)
        if m:
            if current:
                entries.append(current)
            ts_str, level, message = m.groups()
            try:
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except ValueError:
                ts = datetime.min
            current = LogEntry(
                timestamp=ts, level=level, message=message, raw_lines=[line]
            )
        else:
            # Continuation line (multi-line JSON, stack trace, etc.)
            if current:
                current.message += "\n" + line
                current.raw_lines.append(line)

    if current:
        entries.append(current)
    return entries


# ─── Session Detection ────────────────────────────────────────────────────────

@dataclass
class Session:
    entries: list[LogEntry] = field(default_factory=list)
    start_time: Optional[datetime] = None
    model: Optional[str] = None
    startup_ms: Optional[float] = None
    models_loaded: Optional[int] = None
    ide_tools: list[str] = field(default_factory=list)


def split_sessions(entries: list[LogEntry]) -> list[Session]:
    """Split entries into sessions by detecting startup boundaries."""
    sessions: list[Session] = []
    current = Session()

    for entry in entries:
        msg = entry.message
        is_session_start = (
            "[LLMRegistry] Auto-exported registry" in msg
            or "[LLMRegistry] Loaded" in msg
        )

        if is_session_start and current.entries:
            gap = (entry.timestamp - current.entries[-1].timestamp).total_seconds()
            if gap > 5:
                sessions.append(current)
                current = Session()

        current.entries.append(entry)
        if current.start_time is None:
            current.start_time = entry.timestamp

        # Extract metadata (keep last seen values to handle duplicates)
        if "[LLMRegistry] Loaded" in msg:
            m = re.search(r"Loaded (\d+) models", msg)
            if m:
                current.models_loaded = int(m.group(1))
        elif "cli_startup duration:" in msg:
            m = re.search(r"duration: ([\d.]+)", msg)
            if m:
                current.startup_ms = float(m.group(1))
        elif "[IDEClient] Discovered" in msg:
            m = re.search(r"Discovered \d+ tools from IDE: (.+)", msg)
            if m:
                current.ide_tools = [t.strip() for t in m.group(1).split(",")]

    if current.entries:
        sessions.append(current)

    return sessions


# ─── Regex Patterns ───────────────────────────────────────────────────────────

STREAM_TEXT_RE = re.compile(r'\[OpenAI\] Stream chunk: text="(.*?)" finish=')
STREAM_TC_START_RE = re.compile(
    r'\[OpenAI\] Stream chunk: tool_call idx=(\d+) id=(?!\(none\))(\S+) name=(\S+) args=(.*?) finish='
)
STREAM_TC_CONT_RE = re.compile(
    r'\[OpenAI\] Stream chunk: tool_call idx=(\d+) id=\(none\) name=\(cont\) args=(.*?) finish='
)
STREAM_FINISH_RE = re.compile(r"\[OpenAI\] Stream chunk: finish_reason=(\S+)")
SENDING_RE = re.compile(r"\[OpenAI\] Sending (\d+) messages to (\S+):")
MSG_PREVIEW_RE = re.compile(r"^\[(system|user|assistant|tool)\]\s*(.*)", re.DOTALL)
ROUTING_RE = re.compile(
    r"\[Routing\] Selected model: (\S+) \(Source: ([^,]+), Latency: (\S+)\)"
)
ROUTING_REASON_RE = re.compile(r"\[Routing\] Reasoning: (.+)")
POLICY_MATCH_RE = re.compile(
    r"\[PolicyEngine\.check\] MATCHED rule: toolName=(\S+), decision=(\S+), priority=([\d.]+)"
)
TOOL_RESPONSE_RE = re.compile(
    r"\[WebFetchTool\] Formatted tool response for prompt \"(.+?)\":"
)
SESSION_SUMMARY_RE = re.compile(r'\[SessionSummary\] Generated: "(.+)"')
SESSION_SUMMARY_SAVED_RE = re.compile(r'\[SessionSummary\] Saved summary for .+: "(.+)"')

# Noise patterns to skip entirely
NOISE_PATTERNS = [
    "Experiments loaded",
    "Keychain initialization encountered",
    "Using FileKeychain fallback",
    "Loading ignore patterns from:",
    "Ignore file not found:",
    "[Conseca] check",
    "[ContextBuilder] buildFullContext",
    "Enabling Kitty keyboard protocol",
    "[MemoryDiscovery]",
    "Detected terminal background",
    "Detected terminal name",
    "Hook registry initialized",
    "Hook system initialized",
    "[IDEClient]",
    "[IDEConnectionUtils]",
    "[LLMRegistry]",
    "[STARTUP] StartupProfiler.flush()",
    "[PolicyEngine.check] toolCall.name:",
    "[PolicyEngine.check] Running safety",
]


# ─── Data Classes ─────────────────────────────────────────────────────────────

@dataclass
class StreamResponse:
    """An assembled streaming response."""
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    text: str = ""
    tool_calls: list[dict] = field(default_factory=list)
    finish_reason: str = ""
    _tc_args: dict = field(default_factory=dict)
    _tc_meta: dict = field(default_factory=dict)


@dataclass
class ConversationEvent:
    """A high-level event in the conversation."""
    timestamp: datetime
    event_type: str
    data: dict = field(default_factory=dict)


# ─── Session Processing ──────────────────────────────────────────────────────

def process_session(session: Session, *, no_truncate: bool = False) -> list[ConversationEvent]:
    """Process a session's entries into high-level conversation events."""
    events: list[ConversationEvent] = []
    entries = session.entries
    i = 0

    startup_phases: dict[str, float] = {}  # deduplicated: phase -> duration
    seen_policy: set[str] = set()
    last_request_ts: Optional[datetime] = None  # for TTFT calculation

    while i < len(entries):
        entry = entries[i]
        msg = entry.message

        # ── Skip noise ──
        if any(skip in msg for skip in NOISE_PATTERNS):
            i += 1
            continue

        # ── Startup profiler (deduplicated — keep last duration per phase) ──
        if "[STARTUP] Recording metric" in msg:
            m = re.search(r"phase: (\S+) duration: ([\d.]+)", msg)
            if m:
                startup_phases[m.group(1)] = round(float(m.group(2)), 1)
            i += 1
            continue

        # ── Session Summary ──
        m = SESSION_SUMMARY_RE.search(msg)
        if m:
            events.append(ConversationEvent(
                timestamp=entry.timestamp,
                event_type="session_summary",
                data={"summary": m.group(1)},
            ))
            i += 1
            continue

        # Skip duplicate "Saved summary" line
        if SESSION_SUMMARY_SAVED_RE.search(msg):
            i += 1
            continue

        # ── Routing ──
        m = ROUTING_RE.search(msg)
        if m:
            routing_data: dict = {
                "model": m.group(1),
                "source": m.group(2),
                "latency": m.group(3),
            }
            # Check next entry for reasoning
            if i + 1 < len(entries):
                mr = ROUTING_REASON_RE.search(entries[i + 1].message)
                if mr:
                    routing_data["reasoning"] = mr.group(1)
                    i += 1
            session.model = m.group(1)
            events.append(ConversationEvent(
                timestamp=entry.timestamp,
                event_type="routing",
                data=routing_data,
            ))
            i += 1
            continue

        # ── Outgoing Request ──
        m = SENDING_RE.search(msg)
        if m:
            last_request_ts = entry.timestamp
            messages: list[dict] = []
            model = m.group(2)
            num_messages = int(m.group(1))

            j = i + 1
            while j < len(entries):
                mp = MSG_PREVIEW_RE.match(entries[j].message)
                if mp:
                    role = mp.group(1)
                    content_preview = mp.group(2).strip()
                    if "tool_calls=" in content_preview:
                        tc_match = re.search(r'tool_calls=\[(.+)\]', content_preview)
                        if tc_match:
                            messages.append({
                                "role": role,
                                "content": None,
                                "tool_calls": tc_match.group(1),
                            })
                        else:
                            messages.append({"role": role, "content": content_preview})
                    elif role == "tool":
                        tc_id_match = re.search(
                            r'tool_call_id=(\S+)\s+content=(.*)',
                            content_preview,
                        )
                        if tc_id_match:
                            raw_content = tc_id_match.group(2)
                            messages.append({
                                "role": "tool",
                                "tool_call_id": tc_id_match.group(1),
                                "content": raw_content
                                if no_truncate
                                else (raw_content[:120] + "...")
                                if len(raw_content) > 120
                                else raw_content,
                            })
                        else:
                            messages.append({
                                "role": role,
                                "content": content_preview
                                if no_truncate
                                else (content_preview[:120] + "...")
                                if len(content_preview) > 120
                                else content_preview,
                            })
                    else:
                        messages.append({"role": role, "content": content_preview})
                    j += 1
                else:
                    break

            events.append(ConversationEvent(
                timestamp=entry.timestamp,
                event_type="request",
                data={
                    "model": model,
                    "num_messages": num_messages,
                    "messages": messages,
                },
            ))
            i = j
            continue

        # ── Stream chunks → assembled response ──
        if "[OpenAI] Stream chunk:" in msg:
            resp = StreamResponse(start_time=entry.timestamp)
            j = i
            while j < len(entries) and "[OpenAI] Stream chunk:" in entries[j].message:
                chunk_msg = entries[j].message

                # Text chunk
                tm = STREAM_TEXT_RE.search(chunk_msg)
                if tm:
                    resp.text += tm.group(1)
                    j += 1
                    continue

                # Tool call start (negative lookahead ensures id != (none))
                tc_start = STREAM_TC_START_RE.search(chunk_msg)
                if tc_start:
                    idx = tc_start.group(1)
                    resp._tc_meta[idx] = {
                        "id": tc_start.group(2),
                        "name": tc_start.group(3),
                    }
                    resp._tc_args[idx] = tc_start.group(4)
                    j += 1
                    continue

                # Tool call continuation
                tc_cont = STREAM_TC_CONT_RE.search(chunk_msg)
                if tc_cont:
                    idx = tc_cont.group(1)
                    if idx in resp._tc_args:
                        resp._tc_args[idx] += tc_cont.group(2)
                    j += 1
                    continue

                # Finish reason
                fm = STREAM_FINISH_RE.search(chunk_msg)
                if fm:
                    resp.finish_reason = fm.group(1)
                    resp.end_time = entries[j].timestamp
                    j += 1
                    break

                j += 1

            # Assemble tool calls
            for idx in sorted(resp._tc_meta.keys()):
                meta = resp._tc_meta[idx]
                args_str = resp._tc_args.get(idx, "")
                try:
                    args = json.loads(args_str)
                except (json.JSONDecodeError, ValueError):
                    args = args_str
                resp.tool_calls.append({
                    "id": meta["id"],
                    "function": {"name": meta["name"], "arguments": args},
                })

            # Latency: TTFT (request → first chunk) and total (first → last chunk)
            ttft_s = None
            stream_duration_s = None
            if last_request_ts and resp.start_time:
                ttft_s = round(
                    (resp.start_time - last_request_ts).total_seconds(), 1
                )
            if resp.start_time and resp.end_time:
                stream_duration_s = round(
                    (resp.end_time - resp.start_time).total_seconds(), 1
                )

            response_data: dict = {"finish_reason": resp.finish_reason}
            if ttft_s is not None:
                response_data["ttft_s"] = ttft_s
            if stream_duration_s is not None:
                response_data["stream_duration_s"] = stream_duration_s

            if resp.tool_calls:
                response_data["role"] = "assistant"
                response_data["content"] = None
                response_data["tool_calls"] = resp.tool_calls
            else:
                response_data["role"] = "assistant"
                response_data["content"] = resp.text

            events.append(ConversationEvent(
                timestamp=resp.start_time or entry.timestamp,
                event_type="response",
                data=response_data,
            ))
            last_request_ts = None  # reset after consuming
            i = j
            continue

        # ── Policy Engine (deduplicated) ──
        pm = POLICY_MATCH_RE.search(msg)
        if pm:
            key = f"{pm.group(1)}:{pm.group(2)}"
            if key not in seen_policy:
                seen_policy.add(key)
                events.append(ConversationEvent(
                    timestamp=entry.timestamp,
                    event_type="policy",
                    data={
                        "tool": pm.group(1),
                        "decision": pm.group(2),
                        "priority": pm.group(3),
                    },
                ))
            i += 1
            continue

        # ── Tool responses ──
        tm = TOOL_RESPONSE_RE.search(msg)
        if tm:
            response_text = ""
            j = i + 1
            while j < len(entries):
                next_entry = entries[j]
                if LOG_LINE_RE.match(next_entry.raw_lines[0] if next_entry.raw_lines else ""):
                    if not next_entry.message.startswith("[") and not next_entry.message.startswith("  ["):
                        response_text += next_entry.message + "\n"
                        j += 1
                    else:
                        break
                else:
                    break

            stripped = response_text.strip()
            prompt_text = tm.group(1)
            if not no_truncate:
                if len(prompt_text) > 80:
                    prompt_text = prompt_text[:80] + "..."
                if len(stripped) > 200:
                    stripped = stripped[:200] + "..."
            events.append(ConversationEvent(
                timestamp=entry.timestamp,
                event_type="tool_result",
                data={
                    "prompt": prompt_text,
                    "response": stripped,
                },
            ))
            i = j
            continue

        # ── Warnings (real WARN level + promoted DEBUG entries) ──
        if entry.effective_level == "WARN":
            events.append(ConversationEvent(
                timestamp=entry.timestamp,
                event_type="warn",
                data={"message": _extract_warn_message(msg)},
            ))
            i += 1
            continue

        # ── Errors ──
        if entry.effective_level == "ERROR":
            # Include first line of stack trace if present
            error_msg = msg.split("\n")[0] if "\n" in msg else msg
            events.append(ConversationEvent(
                timestamp=entry.timestamp,
                event_type="error",
                data={"message": error_msg, "full": msg if "\n" in msg else None},
            ))
            i += 1
            continue

        # ── Catch-all: skip ──
        i += 1

    # Add startup summary as first event (deduplicated phases)
    if startup_phases or session.startup_ms or session.models_loaded:
        events.insert(0, ConversationEvent(
            timestamp=session.start_time or datetime.min,
            event_type="startup",
            data={
                "total_ms": session.startup_ms,
                "models_loaded": session.models_loaded,
                "ide_tools": session.ide_tools,
                "phases": [
                    {"phase": p, "duration_ms": d}
                    for p, d in startup_phases.items()
                ],
            },
        ))

    # Deduplicate consecutive identical warnings
    events = _dedup_consecutive_events(events)

    return events


def _extract_warn_message(msg: str) -> str:
    """Extract clean warning message, handling special cases."""
    if "YAML frontmatter parsing failed" in msg:
        return "YAML frontmatter parsing failed for a skill file"
    return msg.split("\n")[0]  # first line only for multi-line warnings


def _dedup_consecutive_events(events: list[ConversationEvent]) -> list[ConversationEvent]:
    """Collapse consecutive identical warn/error events into one with a count."""
    if not events:
        return events

    deduped: list[ConversationEvent] = []
    i = 0
    while i < len(events):
        event = events[i]
        if event.event_type in ("warn", "error"):
            # Count consecutive identical messages
            count = 1
            j = i + 1
            while (
                j < len(events)
                and events[j].event_type == event.event_type
                and events[j].data.get("message") == event.data.get("message")
            ):
                count += 1
                j += 1
            new_data = dict(event.data)
            if count > 1:
                new_data["count"] = count
            deduped.append(ConversationEvent(
                timestamp=event.timestamp,
                event_type=event.event_type,
                data=new_data,
            ))
            i = j
        else:
            deduped.append(event)
            i += 1

    return deduped


# ─── Formatting ───────────────────────────────────────────────────────────────

def fmt_time(ts: datetime) -> str:
    return ts.strftime("%H:%M:%S")


def fmt_msg_dict(msg: dict, indent: int = 2, *, no_truncate: bool = False) -> str:
    """Format a message dict as a compact OpenAI-style representation."""
    prefix = " " * indent
    role = msg.get("role", "?")

    if role == "tool":
        tool_content = msg.get("content", "")
        if no_truncate and "\n" in str(tool_content):
            content_indent = prefix + "  "
            indented = str(tool_content).replace("\n", "\n" + content_indent)
            tid = msg.get("tool_call_id", "")
            return f"{prefix}[tool] tool_call_id={tid}\n{content_indent}{indented}"
        d: dict = {"role": "tool"}
        if "tool_call_id" in msg:
            d["tool_call_id"] = msg["tool_call_id"]
        d["content"] = tool_content
        return f"{prefix}{json.dumps(d, ensure_ascii=False)}"

    if "tool_calls" in msg and isinstance(msg["tool_calls"], str):
        return (
            f'{prefix}{{"role": "{role}", "content": null, '
            f'"tool_calls": [{msg["tool_calls"]}]}}'
        )

    if "tool_calls" in msg and isinstance(msg["tool_calls"], list):
        tc_strs = []
        for tc in msg["tool_calls"]:
            func = tc.get("function", {})
            tc_strs.append(json.dumps({
                "id": tc.get("id", ""),
                "function": {
                    "name": func.get("name", ""),
                    "arguments": func.get("arguments", {}),
                },
            }, ensure_ascii=False))
        return (
            f'{prefix}{{"role": "{role}", "content": null, '
            f'"tool_calls": [{", ".join(tc_strs)}]}}'
        )

    content = msg.get("content", "")
    if no_truncate and "\n" in content:
        # Human-readable block format: show content with real newlines
        content_indent = prefix + "  "
        indented = content.replace("\n", "\n" + content_indent)
        return f"{prefix}[{role}]\n{content_indent}{indented}"
    d2 = {"role": role, "content": content}
    s = json.dumps(d2, ensure_ascii=False)
    if not no_truncate and len(s) > 200:
        s = json.dumps({"role": role, "content": content[:150] + "..."}, ensure_ascii=False)
    return f"{prefix}{s}"


def format_events(
    events: list[ConversationEvent], session_idx: int, session: Session,
    *, no_truncate: bool = False,
) -> str:
    """Format conversation events into human-readable output."""
    lines: list[str] = []

    # ── Session Header ──
    start = (
        session.start_time.strftime("%Y-%m-%d %H:%M:%S")
        if session.start_time
        else "?"
    )
    model = session.model or "unknown"

    lines.append("")
    lines.append("=" * 70)
    lines.append(f"SESSION #{session_idx} — {start} — {model}")

    startup_parts = []
    if session.startup_ms:
        startup_parts.append(f"Startup: {session.startup_ms:.0f}ms")
    if session.models_loaded:
        startup_parts.append(f"Models: {session.models_loaded}")
    if session.ide_tools:
        startup_parts.append(f"IDE tools: {', '.join(session.ide_tools)}")
    if startup_parts:
        lines.append(" | ".join(startup_parts))

    lines.append("=" * 70)

    # ── Events ──
    for event in events:
        ts = fmt_time(event.timestamp)
        etype = event.event_type

        if etype == "startup":
            continue  # already in header

        elif etype == "session_summary":
            lines.append(f"\n[{ts}] SESSION SUMMARY")
            lines.append(f"  {event.data['summary']}")

        elif etype == "routing":
            lines.append(f"\n[{ts}] ROUTING")
            lines.append(f"  model: {event.data['model']}")
            lines.append(f"  source: {event.data['source']}")
            if event.data.get("reasoning"):
                lines.append(f"  reasoning: {event.data['reasoning']}")

        elif etype == "request":
            lines.append(
                f"\n[{ts}] >>> SENDING {event.data['num_messages']} "
                f"messages to {event.data['model']}"
            )
            lines.append("")
            for msg in event.data["messages"]:
                lines.append(fmt_msg_dict(msg, no_truncate=no_truncate))
            lines.append("")

        elif etype == "response":
            # Build latency string: "TTFT 4.6s, stream 0.3s"
            latency_parts = []
            if event.data.get("ttft_s") is not None:
                latency_parts.append(f"TTFT {event.data['ttft_s']}s")
            if event.data.get("stream_duration_s") is not None:
                latency_parts.append(f"stream {event.data['stream_duration_s']}s")
            latency_str = ", ".join(latency_parts) if latency_parts else "?"
            finish = event.data.get("finish_reason", "?")

            lines.append(f"[{ts}] <<< RESPONSE ({latency_str}, {finish})")
            lines.append("")
            if event.data.get("tool_calls"):
                resp_dict: dict = {"role": "assistant", "content": None, "tool_calls": event.data["tool_calls"]}
                lines.append(f"  {json.dumps(resp_dict, ensure_ascii=False)}")
            else:
                resp_content = event.data.get("content", "")
                if no_truncate and "\n" in resp_content:
                    indented = resp_content.replace("\n", "\n    ")
                    lines.append(f"  [assistant]\n    {indented}")
                else:
                    lines.append(f"  {json.dumps({'role': 'assistant', 'content': resp_content}, ensure_ascii=False)}")
            lines.append("")

        elif etype == "policy":
            lines.append(
                f"[{ts}] POLICY: {event.data['tool']} -> "
                f"{event.data['decision']} (priority={event.data['priority']})"
            )

        elif etype == "tool_result":
            lines.append(f"\n[{ts}] TOOL RESULT")
            lines.append(f"  prompt: {event.data['prompt']}")
            if event.data.get("response"):
                lines.append(f"  response: {event.data['response']}")

        elif etype == "warn":
            count = event.data.get("count", 1)
            count_str = f" (x{count})" if count > 1 else ""
            lines.append(
                f"\n[{ts}] ⚠ WARN{count_str}: {event.data['message']}"
            )

        elif etype == "error":
            count = event.data.get("count", 1)
            count_str = f" (x{count})" if count > 1 else ""
            lines.append(
                f"\n[{ts}] ✗ ERROR{count_str}: {event.data['message']}"
            )

    lines.append("")
    lines.append("-" * 70)
    return "\n".join(lines)


def format_json(
    events: list[ConversationEvent], session_idx: int, session: Session
) -> dict:
    """Format as JSON-serializable dict."""
    return {
        "session": session_idx,
        "start_time": (
            session.start_time.isoformat() if session.start_time else None
        ),
        "model": session.model,
        "startup_ms": session.startup_ms,
        "models_loaded": session.models_loaded,
        "ide_tools": session.ide_tools,
        "events": [
            {
                "timestamp": e.timestamp.isoformat(),
                "type": e.event_type,
                **e.data,
            }
            for e in events
        ],
    }


# ─── Main ─────────────────────────────────────────────────────────────────────

def read_last_n_lines(filepath: Path, n: int) -> list[str]:
    """Efficiently read the last N lines of a file."""
    with open(filepath, "r", encoding="utf-8", errors="replace") as f:
        return list(deque(f, maxlen=n))


def main():
    parser = argparse.ArgumentParser(
        description="Parse Gemini CLI debug logs into human-readable format"
    )
    parser.add_argument(
        "--file",
        type=str,
        default=None,
        help="Log file path (default: $GEMINI_DEBUG_LOG_FILE or ~/gemini_debug.log)",
    )
    parser.add_argument(
        "--lines",
        type=int,
        default=10000,
        help="Read last N lines (default: 10000)",
    )
    parser.add_argument(
        "--session",
        type=str,
        default="last",
        help="Which session: 'last', 'all', or 1-based index (default: last)",
    )
    parser.add_argument(
        "--level",
        type=str,
        default="all",
        choices=["all", "error", "warn", "info"],
        help="Filter by effective level (default: all)",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=str,
        default=None,
        help="Write output to file instead of stdout",
    )
    parser.add_argument(
        "--no-truncate",
        action="store_true",
        help="Show full message content without truncation",
    )
    parser.add_argument(
        "--raw",
        action="store_true",
        help="Show raw entries (skip chunk merging)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output as JSON array",
    )

    args = parser.parse_args()

    # Resolve log file path
    if args.file:
        log_path = Path(args.file)
    else:
        env_path = os.environ.get("GEMINI_DEBUG_LOG_FILE")
        log_path = Path(env_path) if env_path else Path.home() / "gemini_debug.log"

    if not log_path.exists():
        print(f"Error: Log file not found: {log_path}", file=sys.stderr)
        sys.exit(1)

    # Read lines
    raw_lines = [line.rstrip("\n") for line in read_last_n_lines(log_path, args.lines)]

    if not raw_lines:
        print("Log file is empty.", file=sys.stderr)
        sys.exit(0)

    # Raw mode
    if args.raw:
        output = "\n".join(raw_lines)
        _write_output(output, args.output)
        return

    # Parse
    entries = parse_log_lines(raw_lines)

    # Level filter — uses effective_level (includes promoted DEBUG→WARN)
    if args.level == "error":
        entries = [e for e in entries if e.effective_level == "ERROR"]
    elif args.level == "warn":
        entries = [e for e in entries if e.effective_level in ("ERROR", "WARN")]
    elif args.level == "info":
        entries = [e for e in entries if e.effective_level in ("ERROR", "WARN", "LOG")]

    if not entries:
        print("No matching log entries found.", file=sys.stderr)
        sys.exit(0)

    # Split into sessions
    sessions = split_sessions(entries)
    if not sessions:
        print("No sessions found.", file=sys.stderr)
        sys.exit(0)

    # Select sessions
    if args.session == "last":
        selected = [(len(sessions), sessions[-1])]
    elif args.session == "all":
        selected = [(i + 1, s) for i, s in enumerate(sessions)]
    else:
        try:
            idx = int(args.session)
            if 1 <= idx <= len(sessions):
                selected = [(idx, sessions[idx - 1])]
            else:
                print(
                    f"Session index {idx} out of range (1-{len(sessions)})",
                    file=sys.stderr,
                )
                sys.exit(1)
        except ValueError:
            print(f"Invalid session value: {args.session}", file=sys.stderr)
            sys.exit(1)

    # Process and output
    if args.json:
        results = []
        for idx, session in selected:
            ev = process_session(session, no_truncate=args.no_truncate)
            results.append(format_json(ev, idx, session))
        output = json.dumps(results, indent=2, ensure_ascii=False, default=str)
    else:
        parts = []
        for idx, session in selected:
            ev = process_session(session, no_truncate=args.no_truncate)
            parts.append(format_events(ev, idx, session, no_truncate=args.no_truncate))
        output = "\n".join(parts)

    _write_output(output, args.output)


def _write_output(output: str, output_path: Optional[str]):
    """Write output to file or stdout."""
    if output_path:
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(output + "\n", encoding="utf-8")
        print(f"Output written to: {path}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
