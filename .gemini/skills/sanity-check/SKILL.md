---
name: sanity-check
description: Verifies the codebase still works after changes by running the Vitest test suite — all packages, a single package, a single file, or integration/e2e tests. This fork is constantly evolving (new models, upstream merges, adapter fixes), so use this skill whenever the user wants to check nothing is broken. Trigger on "sanity check", "run tests", "check tests", "test core", "test cli", "did I break anything?", "verify my changes", "npm test", or any mention of testing a specific package or file. Even "does it still pass?" or "quick check" should trigger this skill.
---

# Sanity Check

The codebase changes constantly — new models, upstream merges, adapter tweaks,
telemetry fixes. This skill runs the Vitest suite to make sure nothing is broken.
Per-package configs, npm workspaces.

## Workspace Map

| Short name     | Workspace identifier              | Path                   |
| -------------- | --------------------------------- | ---------------------- |
| `core`         | `@google/gemini-cli-core`         | `packages/core`        |
| `cli`          | `@google/gemini-cli`              | `packages/cli`         |
| `a2a-server`   | `@google/gemini-cli-a2a-server`   | `packages/a2a-server`  |
| `sdk`          | `@google/gemini-cli-sdk`          | `packages/sdk`         |
| `test-utils`   | `@google/gemini-cli-test-utils`   | `packages/test-utils`  |
| `devtools`     | `@google/gemini-cli-devtools`     | `packages/devtools`    |

Integration tests live in `integration-tests/` (not a workspace — run via
`npm run test:e2e`).

## How to Run

Always run from the repo root: `/home/jetlee/workspace/gemini-cli-fork`

### All unit tests

```bash
npm test
```

This runs `npm run test --workspaces --if-present` which hits every package that
has a `test` script, then runs `test:sea-launch`. Note: `posttest` triggers a
full build, so this is slow (~2-5 min).

### Single package

```bash
npm test -w @google/gemini-cli-core
```

Replace the workspace identifier as needed. If the user says "test core" or
"test cli", map it using the table above.

### Single file

```bash
npm test -w @google/gemini-cli-core -- src/core/openaiContentGenerator.test.ts
```

The `--` separator passes the file path to Vitest. The file path is relative to
the package root. If the user gives an absolute or repo-relative path, strip the
`packages/<name>/` prefix before passing it.

### Integration / E2E tests

```bash
npm run test:e2e
```

This sets `VERBOSE=true KEEP_OUTPUT=true` and runs integration tests from
`integration-tests/` with a 5-minute timeout per test and 2 retries.

### Eval tests

```bash
npm run test:always_passing_evals   # Safe subset
RUN_EVALS=1 npm run test:all_evals  # Full eval suite (needs API keys)
```

### Script tests

```bash
npm run test:scripts
```

## Parsing the Output

Vitest prints a summary at the end like:

```
 Test Files  42 passed | 3 failed (45)
      Tests  312 passed | 5 failed | 2 skipped (319)
```

After running tests:

1. **Look for the summary line** — report the pass/fail/skip counts clearly.
2. **If there are failures** — extract the failing test names and the error
   messages. Show them prominently so the user can act on them.
3. **If all pass** — confirm success briefly, no need to list every test.

## Interpreting Arguments

The user's request maps to commands like this:

| User says                              | Command                                                              |
| -------------------------------------- | -------------------------------------------------------------------- |
| "run tests"                            | `npm test`                                                           |
| "test core"                            | `npm test -w @google/gemini-cli-core`                                |
| "test cli"                             | `npm test -w @google/gemini-cli`                                     |
| "test the sdk"                         | `npm test -w @google/gemini-cli-sdk`                                 |
| "test a2a" / "test a2a-server"         | `npm test -w @google/gemini-cli-a2a-server`                          |
| "test openaiContentGenerator"          | Find the file, then `npm test -w <pkg> -- <relative-path>`          |
| "run e2e" / "run integration tests"    | `npm run test:e2e`                                                   |
| "run evals"                            | `npm run test:always_passing_evals`                                  |
| "test this file" + context             | Determine package from path, run single-file command                 |

When the user references a test file by partial name (e.g., "test
openaiContentGenerator"), use Glob or Grep to find the exact `.test.ts` /
`.test.tsx` file, determine which package it belongs to, then run the
single-file command.

## Important Notes

- **Build first if needed:** If tests fail with module-not-found errors, run
  `npm run build` before retesting. The `posttest` hook does this automatically
  for full `npm test`, but single-package runs may need a manual build.
- **Timeouts:** Unit tests have 60s timeout. Integration tests have 300s (5 min).
  If a test hangs, it's likely a real bug, not a timeout config issue.
- **Coverage:** Core and CLI packages generate coverage reports in their
  `coverage/` directories. The user can ask for coverage info after a run.
- **Pool:** Tests run in forked processes (`pool: 'forks'`), not threads. This
  matters if debugging isolation issues.
- **Silent mode:** Core and CLI configs use `silent: true` — console.log output
  from test code is suppressed by default.
