# Model Registry Reference

This file contains the complete model registry tables moved from CLAUDE.md for
reference. The authoritative TypeScript implementation is in
`packages/core/src/config/llmRegistry.ts`. The original Python source is at
`~/workspace/main/research/a2g_packages/src/a2g_models/`.

---

## Corporate (on-prem, corp=True, home=False, dev=False)

All use `http://a2g.samsungds.net:7620/v1` except GaussO.

| Name                      | context_length | max_tokens | Modality         | Notes                                                      |
| ------------------------- | -------------- | ---------- | ---------------- | ---------------------------------------------------------- |
| GLM-5-Thinking            | 157000         | 157000     | text             | reasoning                                                  |
| GLM-5-Non-Thinking        | 157000         | 157000     | text             | reasoning                                                  |
| Kimi-K2.5-Thinking        | 262000         | 262000     | text+image+video | reasoning                                                  |
| Kimi-K2.5-Non-Thinking    | 262000         | 262000     | text+image+video | reasoning                                                  |
| Qwen3.5-35B-A3B           | 128000         | 128000     | text+image       | reasoning                                                  |
| Qwen3.5-122B-A10B         | 262000         | 262000     | text+image       | reasoning                                                  |
| gpt-oss-120b              | 262000         | 262000     | text+image       | reasoning                                                  |
| GaussO-Owl-Ultra-Instruct | 128000         | 128000     | text             | url: `http://apigw.samsungds.net:8000/...`, custom headers |

## Dev/Home (OpenRouter, corp=False, home=True, dev=True)

All use `https://openrouter.ai/api/v1`,
api_key_env=`PROJECT_OPENROUTER_API_KEY`.

| Name                            | model_alias                   | context_length | max_tokens | extra_body       |
| ------------------------------- | ----------------------------- | -------------- | ---------- | ---------------- |
| dev-DeepSeek-V3.2               | deepseek/deepseek-v3.2        | 128000         | 128000     | reasoning: true  |
| dev-DeepSeek-V3.2-non-reasoning | deepseek/deepseek-v3.2        | 128000         | 128000     | reasoning: false |
| dev-claude-haiku-4.5            | anthropic/claude-haiku-4.5    | 200000         | 64000      | --               |
| dev-claude-haiku-4.5-generic    | anthropic/claude-haiku-4.5    | 200000         | 64000      | custom endpoint  |
| dev-Gemini-3.1-Pro-Preview      | google/gemini-3.1-pro-preview | 1000000        | 64000      | reasoning: true  |
| dev-Claude-Opus-4.6             | anthropic/claude-opus-4.6     | 1000000        | 128000     | reasoning: true  |

## Default Models (OpenAI direct, corp=False, home=True, dev=True)

All use `https://api.openai.com/v1`, api_key_env=`PROJECT_OPENAI_API_KEY`
(implicit).

| Name         | context_length | max_tokens | supports_responses_api |
| ------------ | -------------- | ---------- | ---------------------- |
| gpt-4o       | 128000         | 16384      | true                   |
| gpt-4o-mini  | 128000         | 16384      | true                   |
| gpt-4.1      | 1047576        | 32768      | true                   |
| gpt-4.1-mini | 1047576        | 32768      | true                   |
| gpt-4.1-nano | 1047576        | 32768      | true                   |
| o1           | 200000         | 100000     | true (reasoning)       |
| o3-mini      | 128000         | 100000     | true (reasoning)       |
| o4-mini      | 200000         | 100000     | true (reasoning)       |
| gpt-5        | 400000         | 128000     | true (reasoning)       |
| gpt-5-nano   | 400000         | 128000     | true (reasoning)       |
| gpt-5-mini   | 400000         | 128000     | true (reasoning)       |
| gpt-5.2      | 400000         | 128000     | true (reasoning)       |

## Anthropic (custom class, not ChatOpenAI)

| Name             | model_alias      | url                          | Notes                 |
| ---------------- | ---------------- | ---------------------------- | --------------------- |
| claude-haiku-4.5 | claude-haiku-4-5 | https://api.anthropic.com/v1 | custom=CHAT_ANTHROPIC |
