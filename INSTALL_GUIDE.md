# Gemini CLI — Local Setup Guide (From Source)

This guide walks you through building and installing Gemini CLI from this cloned repo so you can type `gemini` anywhere in your terminal — just like `claude`.

## Prerequisites

- **Node.js >= 20** (recommended `~20.19.0` for development)
  - Use [nvm](https://github.com/nvm-sh/nvm) to manage versions:
    ```bash
    nvm install 20.19.0
    nvm use 20.19.0
    ```
- **Git** (already done since you cloned this repo)

## Step 1: Install Dependencies

```bash
cd ~/workspace/gemini-cli-fork
npm install
```

## Step 2: Build

```bash
npm run build
```

This compiles all TypeScript packages (`core`, `cli`, `sdk`, etc.) into `dist/` directories.

## Step 3: Make `gemini` Available Globally

Pick **one** of the two methods below.

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

## Step 4: Authenticate

On first run, Gemini CLI will prompt you to choose an auth method.

### Option 1: Login with Google (easiest)

1. Run `gemini`
2. Select **Login with Google**
3. A browser window opens — sign in with your Google account
4. Credentials are cached locally for future sessions

Free tier: 60 requests/min, 1,000 requests/day.

### Option 2: Use a Gemini API Key

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
cd ~/workspace/gemini-cli-fork
npm install
npm run build
npm link ./packages/cli     # or use alias method above

# Daily usage (from any directory)
gemini                      # start interactive session
gemini "explain this code"  # one-shot prompt
gemini --version            # verify installation

# After editing source code
cd ~/workspace/gemini-cli-fork
npm run build               # rebuild, then run gemini again
```
