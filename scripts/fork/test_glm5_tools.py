#!/usr/bin/env python3
# /// script
# dependencies = [
#   "openai>=1.0.0",
# ]
# ///
"""
Quick test to see if GLM-5 handles multi-turn tool calling properly
via the OpenAI-compatible API (vLLM endpoint).

Run with:
  set -a && source ~/workspace/main/research/a2g_packages/envs/.env && set +a
  cd ~/workspace/gemini-cli-fork
  uv run scripts/test_glm5_tools.py
"""

import json
import os
from openai import OpenAI

# Config
BASE_URL = "http://a2g.samsungds.net:7620/v1"
API_KEY = os.environ.get("PROJECT_OPENAI_API_KEY", "dummy")
MODEL = "GLM-5-Non-Thinking"  # Try both Thinking and Non-Thinking

client = OpenAI(base_url=BASE_URL, api_key=API_KEY)

tools = [
    {
        "type": "function",
        "function": {
            "name": "run_command",
            "description": "Run a shell command and return its output",
            "parameters": {
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The shell command to run",
                    }
                },
                "required": ["command"],
            },
        },
    }
]

# Turn 1: User asks something that should trigger tool use
messages = [
    {"role": "system", "content": "You are a helpful assistant. Use the run_command tool when needed."},
    {"role": "user", "content": "What is the current date? Use the run_command tool to find out."},
]

print("=" * 60)
print(f"Testing model: {MODEL}")
print("=" * 60)
print(f"\n--- Turn 1: Sending user message ---")
print(f"Messages: {json.dumps(messages, indent=2)}")

response1 = client.chat.completions.create(
    model=MODEL,
    messages=messages,
    tools=tools,
    stream=False,
)

choice1 = response1.choices[0]
print(f"\nResponse finish_reason: {choice1.finish_reason}")
print(f"Response message: {choice1.message}")

if choice1.message.tool_calls:
    tc = choice1.message.tool_calls[0]
    print(f"\nTool call: id={tc.id}, name={tc.function.name}, args={tc.function.arguments}")

    # Turn 2: Send tool result back
    messages.append(choice1.message.model_dump())  # Add assistant message with tool_calls

    # Simulate tool result
    tool_result = json.dumps({"output": "Mon Mar  9 14:30:00 KST 2026"})

    messages.append({
        "role": "tool",
        "tool_call_id": tc.id,
        "content": tool_result,
    })

    print(f"\n--- Turn 2: Sending tool result ---")
    print(f"Tool message: role=tool, tool_call_id={tc.id}, content={tool_result}")
    print(f"\nFull messages being sent:")
    for i, msg in enumerate(messages):
        role = msg.get("role", "?")
        if role == "tool":
            print(f"  [{i}] role={role} tool_call_id={msg.get('tool_call_id')} content={str(msg.get('content', ''))[:100]}")
        elif role == "assistant" and msg.get("tool_calls"):
            tcs = msg["tool_calls"]
            print(f"  [{i}] role={role} tool_calls={json.dumps([{'id': t['id'], 'name': t['function']['name']} for t in tcs])}")
        else:
            print(f"  [{i}] role={role} content={str(msg.get('content', ''))[:100]}")

    response2 = client.chat.completions.create(
        model=MODEL,
        messages=messages,
        tools=tools,
        stream=False,
    )

    choice2 = response2.choices[0]
    print(f"\nResponse 2 finish_reason: {choice2.finish_reason}")
    print(f"Response 2 content: {choice2.message.content}")
    if choice2.message.tool_calls:
        print(f"Response 2 tool_calls: {[(tc.id, tc.function.name, tc.function.arguments) for tc in choice2.message.tool_calls]}")
        print("\n⚠️  Model made ANOTHER tool call after receiving results - this is the loop behavior!")
    else:
        print("\n✅ Model responded with text (no loop)")
else:
    print(f"\nNo tool calls in response. Content: {choice1.message.content}")

# Also test with streaming
print("\n" + "=" * 60)
print("Testing with streaming...")
print("=" * 60)

messages_stream = [
    {"role": "system", "content": "You are a helpful assistant. Use the run_command tool when needed."},
    {"role": "user", "content": "What is the current date? Use the run_command tool to find out."},
]

stream = client.chat.completions.create(
    model=MODEL,
    messages=messages_stream,
    tools=tools,
    stream=True,
    stream_options={"include_usage": True},
)

accumulated_tool_calls = {}
accumulated_content = ""
finish_reason = None

for chunk in stream:
    if not chunk.choices:
        if chunk.usage:
            print(f"  Usage chunk: {chunk.usage}")
        continue

    delta = chunk.choices[0].delta
    finish_reason = chunk.choices[0].finish_reason

    if delta.content:
        accumulated_content += delta.content

    if delta.tool_calls:
        for tc in delta.tool_calls:
            if tc.index not in accumulated_tool_calls:
                accumulated_tool_calls[tc.index] = {
                    "id": tc.id or "",
                    "name": tc.function.name if tc.function and tc.function.name else "",
                    "arguments": tc.function.arguments if tc.function and tc.function.arguments else "",
                }
            else:
                # FIX: If tc.id is set, vLLM/GLM-5 is sending a new complete
                # tool call on the same index — replace, don't append.
                if tc.id:
                    accumulated_tool_calls[tc.index]["id"] = tc.id
                    if tc.function and tc.function.name:
                        accumulated_tool_calls[tc.index]["name"] = tc.function.name
                    accumulated_tool_calls[tc.index]["arguments"] = tc.function.arguments if tc.function and tc.function.arguments else ""
                elif tc.function and tc.function.arguments:
                    accumulated_tool_calls[tc.index]["arguments"] += tc.function.arguments

    if finish_reason:
        print(f"  Stream finish_reason: {finish_reason}")

print(f"  Accumulated content: {accumulated_content[:200]}")
print(f"  Accumulated tool_calls: {json.dumps(accumulated_tool_calls, indent=2)}")

if accumulated_tool_calls:
    tc_data = accumulated_tool_calls[0]
    # Sanitize arguments - if JSON is garbled, try to extract last valid JSON
    try:
        json.loads(tc_data["arguments"])
    except json.JSONDecodeError:
        last_brace = tc_data["arguments"].rfind("{")
        if last_brace > 0:
            candidate = tc_data["arguments"][last_brace:]
            try:
                json.loads(candidate)
                print(f"  ⚠️  Repaired garbled args: {tc_data['arguments']} → {candidate}")
                tc_data["arguments"] = candidate
            except json.JSONDecodeError:
                print(f"  ⚠️  Could not repair args: {tc_data['arguments']}")
                tc_data["arguments"] = "{}"
    print(f"\n  Streaming tool call: id={tc_data['id']}, name={tc_data['name']}, args={tc_data['arguments']}")

    # Turn 2 with streaming results
    messages_stream.append({
        "role": "assistant",
        "content": accumulated_content or None,
        "tool_calls": [
            {
                "id": tc_data["id"],
                "type": "function",
                "function": {
                    "name": tc_data["name"],
                    "arguments": tc_data["arguments"],
                },
            }
        ],
    })
    messages_stream.append({
        "role": "tool",
        "tool_call_id": tc_data["id"],
        "content": json.dumps({"output": "Mon Mar  9 14:30:00 KST 2026"}),
    })

    print(f"\n--- Turn 2 (streaming): Sending tool result ---")
    response_stream2 = client.chat.completions.create(
        model=MODEL,
        messages=messages_stream,
        tools=tools,
        stream=False,
    )

    choice_s2 = response_stream2.choices[0]
    print(f"  Response: finish_reason={choice_s2.finish_reason}")
    print(f"  Content: {choice_s2.message.content}")
    if choice_s2.message.tool_calls:
        print(f"  ⚠️  Still making tool calls: {[(tc.id, tc.function.name) for tc in choice_s2.message.tool_calls]}")
    else:
        print(f"  ✅ No more tool calls")
