# Gemini CLI — Local Setup Guide (From Source)

This guide walks you through building and installing Gemini CLI from this cloned repo so you can type `gemini` anywhere in your terminal — just like `claude`.

## Prerequisites

- **Node.js >= 20** (check with `node --version`)
  - If your version is below 20 (e.g. v12, v14, v16, v18), you **must** upgrade or `npm install` will fail with syntax errors like `SyntaxError: Unexpected token '?'`.
  - Upgrade options:
    ```bash
    # Option 1: nvm (no sudo needed — installs to your home dir, best for company PCs)
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
    source ~/.bashrc
    nvm install 20
    nvm use 20

    # Option 2: NodeSource (requires sudo)
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs

    # Option 3: System package manager (may install an older version)
    sudo apt install nodejs npm
    ```
  - After upgrading, verify: `node --version` should show `v20.x.x` or higher.
- **Git** (already done since you cloned this repo)

## Step 1: Create Config Directory

Gemini CLI stores settings and project data in `~/.gemini/`. Create it before first run:

```bash
mkdir -p ~/.gemini
```

## Step 2: Install Dependencies

```bash
cd ~/workspace/gemini-cli-fork
npm install
```

## Step 3: Build

```bash
npm run build
```

This compiles all TypeScript packages (`core`, `cli`, `sdk`, etc.) into `dist/` directories.

## Step 4: Make `gemini` Available Globally

### Quick Test (no setup needed)

You can always run the fork directly without any alias or linking:

```bash
cd ~/workspace/gemini-cli-fork
node packages/cli
```

This works immediately after `npm run build` and does not affect your global `gemini` install. Good for quick testing before committing to a global setup.

### Permanent Setup

Pick **one** of the two methods below to make `gemini` available from any directory.

### Method A: Shell Alias (simple, no symlinks)

Add this line to your shell config file:

```bash
# For bash users:
echo 'alias gemini="node ~/workspace/gemini-cli-fork/packages/cli"' >> ~/.bashrc
source ~/.bashrc

# For zsh users:
echo 'alias gemini="node ~/workspace/gemini-cli-fork/packages/cli"' >> ~/.zshrc
source ~/.zshrc
```

### Method B: `npm link` (creates a real global binary)

From the repo root:

```bash
npm link ./packages/cli
```

This registers `gemini` as a global command via symlink.

To unlink later:

```bash
npm unlink -g @google/gemini-cli
```

### Verify it works

```bash
gemini --version
```

You should see something like `0.34.0-nightly.xxx`. Now `gemini` works from any directory.

## Step 5: Choose Your Mode

This fork supports two modes: **OpenAI-compatible mode** (on-prem/cloud LLMs) and the **original Google auth mode**.

### Mode A: OpenAI-Compatible Mode (LLM Model Picker)

This mode replaces the Google auth prompt with a model picker. It activates automatically when certain env vars are set.

**Setup: Load the env file before running.**

The env file at `~/workspace/main/research/a2g_packages/envs/.env` contains API keys and the `PROJECT_A2G_LOCATION` variable that controls which models are available.

```bash
# Option 1: Source the env file in your shell (recommended)
source ~/workspace/main/research/a2g_packages/envs/.env

# Option 2: Add to your shell profile for persistence
echo 'source ~/workspace/main/research/a2g_packages/envs/.env' >> ~/.bashrc
source ~/.bashrc
```

**Run:**

```bash
gemini
```

You'll see a model picker instead of an auth prompt. Select a model and start chatting.

**Which models you see depends on `PROJECT_A2G_LOCATION`:**

| Value | Environment | Models |
|-------|-------------|--------|
| `DEVELOPMENT` or `DEV` | Dev/Home | OpenRouter models (DeepSeek, Claude, Gemini) + OpenAI models (GPT-4o, GPT-5, etc.) |
| `HOME` | Home | Same as DEV |
| `COMPANY`, `PRODUCTION`, or `CORP` | Corporate | On-prem models (GLM-5, Kimi-K2.5, Qwen3.5, GaussO, etc.) |

**Trigger env vars** (any one of these activates OpenAI-compatible mode):
- `PROJECT_A2G_LOCATION` — environment detection (set in env file)
- `PROJECT_OPENROUTER_API_KEY` — OpenRouter API key (set in env file)
- `OPENAI_BASE_URL` — custom OpenAI base URL

**Using the test script** (alternative to manual source + run):

```bash
cd ~/workspace/gemini-cli-fork

./scripts/test_openai_adapter.sh --quick      # build + run
./scripts/test_openai_adapter.sh --run-only   # skip build, just run
./scripts/test_openai_adapter.sh --build-only # just build
./scripts/test_openai_adapter.sh --status     # check env vars and build status
./scripts/test_openai_adapter.sh --list-models # show available models
./scripts/test_openai_adapter.sh --python     # run Python LLM test (send "hello" to model)
```

### Mode B: Original Google Auth (unchanged)

If none of the OpenAI trigger env vars are set, the CLI behaves exactly like upstream Gemini CLI.

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

Or use dev mode (auto-checks build status) from the repo root:

```bash
npm start
```

## Quick Reference

```bash
# Full setup (run once)
mkdir -p ~/.gemini
cd ~/workspace/gemini-cli-fork
npm install
npm run build
npm link ./packages/cli     # or use alias method above

# ----- OpenAI-compatible mode (on-prem/cloud LLMs) -----
source ~/workspace/main/research/a2g_packages/envs/.env
gemini                      # shows model picker

# Or use the test script:
./scripts/test_openai_adapter.sh --quick

# ----- Original Google mode -----
# (don't source the env file, or unset the trigger vars)
unset PROJECT_A2G_LOCATION PROJECT_OPENROUTER_API_KEY OPENAI_BASE_URL
gemini                      # shows Google auth prompt

# ----- Common -----
gemini --version            # verify installation
gemini "explain this code"  # one-shot prompt

# After editing source code
cd ~/workspace/gemini-cli-fork
npm run build               # rebuild, then run gemini again
```

## Switching Between Modes

To switch from OpenAI mode back to Google auth mode in the same shell:

```bash
unset PROJECT_A2G_LOCATION PROJECT_OPENROUTER_API_KEY OPENAI_BASE_URL
gemini
```

To switch from Google mode to OpenAI mode:

```bash
source ~/workspace/main/research/a2g_packages/envs/.env
gemini
```
