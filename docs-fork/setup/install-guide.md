# Gemini CLI — Local Setup Guide (From Source)

This guide walks you through building and installing Gemini CLI from this cloned
repo so you can type `gemini` anywhere in your terminal — just like `claude`.

## Prerequisites

- **Node.js >= 20** (check with `node --version`)
  - If your version is below 20 (e.g. v12, v14, v16, v18), you **must** upgrade
    or `npm install` will fail with syntax errors like
    `SyntaxError: Unexpected token '?'`.
  - Upgrade options:

    ```bash
    # Option 1: nvm (no sudo needed — installs to your home dir, best for company PCs)
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    source ~/.bashrc
    nvm install node
    
    # Option 2: NodeSource (requires sudo)
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs

    # Option 3: System package manager (may install an older version)
    sudo apt install nodejs npm
    ```

  - After upgrading, verify: `node --version` should show `v20.x.x` or higher.

- **Git** (already done since you cloned this repo)

## Step 1: Create Config Directory

Gemini CLI stores settings and project data in `~/.gemini/`. Create it before
first run:

```bash
mkdir -p ~/.gemini
```

## Step 2: Install Dependencies & Build

```bash
cd ~/workspace/gemini-cli-fork
npm install --ignore-scripts
npm run build
```

`--ignore-scripts` skips the postinstall bundling step that can fail before the
core package is compiled. Since we run `npm run build` right after, this is
always safe.

This compiles all TypeScript packages (`core`, `cli`, `sdk`, etc.) into `dist/`
directories.

## Step 4: Make `gemini` Available Globally

```bash
# Remove the upstream gemini-cli if installed (prevents conflicts)
npm uninstall -g @google/gemini-cli

# Link this fork so `gemini` points to your code
cd ~/workspace/gemini-cli-fork
npm link ./packages/cli
```

Verify:

```bash
gemini --version
```

You should see `0.34.0-nightly.20260304.28af4e127` (or similar with your fork's
date/hash). This works in any terminal, any directory.

> **Tip:** If you don't want to touch your global install, you can use a shell
> alias instead:
>
> ```bash
> # Add to ~/.bashrc (persists across terminals)
> echo 'alias gemini="node ~/workspace/gemini-cli-fork/packages/cli"' >> ~/.bashrc
> source ~/.bashrc
> ```
>
> Then `gemini --yolo` works from anywhere, no `npm link` needed.

### If `gemini` stops working (shows Google auth instead of model picker)

This can happen if you accidentally install the upstream gemini-cli globally
(e.g., `npm install -g @google/gemini-cli`), which overwrites the link to your
fork.

**How to tell:** Run `gemini --version`. If the date/hash doesn't match your
fork, you're running the upstream version.

**Fix — run these 3 commands:**

```bash
npm uninstall -g @google/gemini-cli
cd ~/workspace/gemini-cli-fork
npm link ./packages/cli
```

That's it. `gemini` now points back to your fork in all terminals.

## Step 5: Choose Your Mode

This fork supports two modes: **OpenAI-compatible mode** (on-prem/cloud LLMs)
and the **original Google auth mode**.

### Mode A: OpenAI-Compatible Mode (LLM Model Picker)

This mode replaces the Google auth prompt with a model picker. It activates
automatically when certain env vars are set.

**Setup: Load the env file before running.**

The env file at `~/workspace/main/research/a2g_packages/envs/.env` contains API
keys and the `PROJECT_A2G_LOCATION` variable that controls which models are
available.

```bash
# Option 1: Source the env file in your current shell
set -a && source ~/workspace/main/research/a2g_packages/envs/.env && set +a

# Option 2: Add to your shell profile for persistence (auto-loads on every new terminal)
echo 'set -a && source ~/workspace/main/research/a2g_packages/envs/.env && set +a' >> ~/.bashrc
source ~/.bashrc
```

> **Why `set -a`?** The `.env` file uses `KEY=VALUE` format without `export`.
> `set -a` tells bash to automatically export all variables so child processes
> (like `node`) can see them. `set +a` turns it off after sourcing.

**Run:**

```bash
gemini
```

You'll see a model picker instead of an auth prompt. Select a model and start
chatting.

**Which models you see depends on `PROJECT_A2G_LOCATION`:**

| Value                              | Environment | Models                                                                             |
| ---------------------------------- | ----------- | ---------------------------------------------------------------------------------- |
| `DEVELOPMENT` or `DEV`             | Dev/Home    | OpenRouter models (DeepSeek, Claude, Gemini) + OpenAI models (GPT-4o, GPT-5, etc.) |
| `HOME`                             | Home        | Same as DEV                                                                        |
| `COMPANY`, `PRODUCTION`, or `CORP` | Corporate   | On-prem models (GLM-5, Kimi-K2.5, Qwen3.5, GaussO, etc.)                           |

**Trigger env vars** (any one of these activates OpenAI-compatible mode):

- `PROJECT_A2G_LOCATION` — environment detection (set in env file)
- `PROJECT_OPENROUTER_API_KEY` — OpenRouter API key (set in env file)
- `OPENAI_BASE_URL` — custom OpenAI base URL

**Using the test script** (alternative to manual source + run):

```bash
cd ~/workspace/gemini-cli-fork

./scripts/fork/test_openai_adapter.sh --quick      # build + run
./scripts/fork/test_openai_adapter.sh --run-only   # skip build, just run
./scripts/fork/test_openai_adapter.sh --build-only # just build
./scripts/fork/test_openai_adapter.sh --status     # check env vars and build status
./scripts/fork/test_openai_adapter.sh --list-models # show available models
./scripts/fork/test_openai_adapter.sh --python     # run Python LLM test (send "hello" to model)
```

### Mode B: Original Google Auth (unchanged)

If none of the OpenAI trigger env vars are set, the CLI behaves exactly like
upstream Gemini CLI.

#### Option 1: Login with Google (easiest)

1. Run `gemini`
2. Select **Login with Google**
3. A browser window opens — sign in with your Google account
4. Credentials are cached locally for future sessions

Free tier: 60 requests/min, 1,000 requests/day.

#### Option 2: Use a Gemini API Key

1. Get a key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Set and persist the environment variable:

   ```bash
   # For bash:
   echo 'export GEMINI_API_KEY="your-key-here"' >> ~/.bashrc
   source ~/.bashrc

   # For zsh:
   echo 'export GEMINI_API_KEY="your-key-here"' >> ~/.zshrc
   source ~/.zshrc
   ```

3. Run `gemini` and select **Use Gemini API key**

## After Code Changes

When you modify source code in this repo, rebuild before running:

```bash
npm run build
```

Or use the link script which builds, re-links, and verifies everything:

```bash
./scripts/fork/link_global.sh           # build + link + verify (recommended)
./scripts/fork/link_global.sh --link    # link only (skip build)
./scripts/fork/link_global.sh --verify  # just check if gemini points to the fork
```

> **When to use which:**
>
> - `npm run build` — fast, sufficient for day-to-day rebuilds (the link
>   persists across builds)
> - `./scripts/fork/link_global.sh` — use if the link breaks (e.g. after
>   accidentally installing the upstream package globally), or if you want a
>   single command that always guarantees correctness
> - `./scripts/fork/link_global.sh --verify` — quick sanity check, run this if
>   `gemini` starts behaving unexpectedly

## Quick Reference

```bash
# Full setup (run once)
mkdir -p ~/.gemini
cd ~/workspace/gemini-cli-fork
npm install --ignore-scripts
npm run build
npm link ./packages/cli     # or use alias method above

# ----- OpenAI-compatible mode (on-prem/cloud LLMs) -----
set -a && source ~/workspace/main/research/a2g_packages/envs/.env && set +a
gemini                      # shows model picker

# Or use the test script:
./scripts/fork/test_openai_adapter.sh --quick

# ----- Original Google mode -----
# (don't source the env file, or unset the trigger vars)
unset PROJECT_A2G_LOCATION PROJECT_OPENROUTER_API_KEY OPENAI_BASE_URL
gemini                      # shows Google auth prompt

# ----- Common -----
gemini --version            # verify installation
gemini "explain this code"  # one-shot prompt

# After editing source code
cd ~/workspace/gemini-cli-fork
npm run build               # rebuild (link persists)
./scripts/fork/link_global.sh    # or: build + re-link + verify (safer)
```

## Switching Between Modes

To switch from OpenAI mode back to Google auth mode in the same shell:

```bash
unset PROJECT_A2G_LOCATION PROJECT_OPENROUTER_API_KEY OPENAI_BASE_URL
gemini
```

To switch from Google mode to OpenAI mode:

```bash
set -a && source ~/workspace/main/research/a2g_packages/envs/.env && set +a
gemini
```

## Troubleshooting

### Model picker doesn't appear (shows Google auth instead)

There are 3 possible causes. Check them in this order:

**Cause 1: You're running the upstream gemini-cli, not your fork.**

```bash
gemini --version
```

If the version doesn't match your fork (wrong date or hash), fix it:

```bash
npm uninstall -g @google/gemini-cli
cd ~/workspace/gemini-cli-fork
npm link ./packages/cli
```

**Cause 2: Env vars aren't exported to child processes.**

```bash
node -e "console.log(process.env.PROJECT_A2G_LOCATION)"
```

If this prints `undefined`, you sourced the `.env` file without `set -a`. Fix:

```bash
set -a && source ~/workspace/main/research/a2g_packages/envs/.env && set +a
```

If you already added `source .env` to `~/.bashrc` without `set -a`, fix it:

```bash
sed -i 's|source ~/workspace/main/research/a2g_packages/envs/.env|set -a \&\& source ~/workspace/main/research/a2g_packages/envs/.env \&\& set +a|' ~/.bashrc
source ~/.bashrc
```

**Cause 3: Cached Google auth session.**

If you previously used Google auth, the cached session triggers OAuth before the
model picker loads. Delete the cached config and restart:

```bash
rm -rf ~/.gemini
mkdir -p ~/.gemini
gemini
```

This removes the cached `selectedType: oauth-personal` and lets the OpenAI mode
detection take effect.

### `gemini` command not found

You need to link the fork globally:

```bash
cd ~/workspace/gemini-cli-fork
npm link ./packages/cli
```

Or run directly without linking:

```bash
cd ~/workspace/gemini-cli-fork
node packages/cli
```

### `npm install` fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (company network)

Your company's SSL proxy/firewall is intercepting HTTPS traffic. Tell npm to
skip SSL verification:

```bash
npm config set strict-ssl false
npm install
```

### `npm install` fails with `ENOTEMPTY` error

A previous partial install left stale files. Clean and retry:

```bash
rm -rf node_modules
npm install
```

### `npm install` fails with `No matching export for import "getAvailableModels"`

The postinstall script tries to bundle the CLI before the core package is
compiled. This won't happen if you followed Step 2 (which uses
`--ignore-scripts`). If you ran `npm install` without the flag, just rebuild:

```bash
npm run build
```

### `npm install` fails with `EEXIST` on `bundle/docs` (Node.js v25+)

Node.js v25 changed `cpSync` behavior. Clean the bundle directory and retry:

```bash
rm -rf bundle
npm install
```

### TLS warning on startup

```
Warning: Setting the NODE_TLS_REJECT_UNAUTHORIZED environment variable to '0'...
```

This is harmless — it comes from `NODE_TLS_REJECT_UNAUTHORIZED=0` in the env
file (needed for some on-prem endpoints). You can safely ignore it.

### Vulnerabilities warning from `npm install` / `npm link`

These are upstream dependency issues, not from our code. Safe to ignore.
