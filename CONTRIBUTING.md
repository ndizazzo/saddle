# Contributing to Saddle

Thank you for considering a contribution. This document covers how to get set up, run the tests, and submit a pull request.

## Prerequisites

- **Node.js 18 or newer** (the project enforces `engines.node >= 18`)
- **pnpm 10**
- **Git**

## Getting Started

```bash
git clone https://github.com/ndizazzo/saddle.git
cd saddle
pnpm install
```

Husky installs the Git hooks during `pnpm install`.

## Project Structure

| Path                      | Purpose                                           |
| ------------------------- | ------------------------------------------------- |
| `bin/saddle.js`           | CLI entry point                                   |
| `scripts/install.js`      | Main installer orchestrator                       |
| `scripts/install-core.js` | Core logic (profile discovery, linking, lockfile) |
| `scripts/reorg-core.js`   | Reorganization scan, plan, transaction, rollback  |
| `scripts/reorg.js`        | `saddle reorg` CLI orchestration                  |
| `scripts/install-ui.mjs`  | Ink TUI (ESM)                                     |
| `scripts/load-config.js`  | Config loading + rule normalisation               |
| `scripts/tui/`            | TUI components and utilities                      |
| `rules/`                  | Bundled YAML rules, one per supported tool        |
| `tests/`                  | Node built-in test runner suites                  |

## Running Tests

```bash
pnpm test
```

All tests must pass before any PR is merged. The suite uses the Node.js built-in `node:test` runner — no additional test dependencies.

## Running the Linter

```bash
pnpm lint
pnpm run lint:agents
```

This validates structural invariants (required files, executables, scripts, dependencies). It runs automatically on every commit via the Husky pre-commit hook.

## Running the CLI Locally

```bash
# Interactive TUI (requires a real terminal)
saddle

# Non-interactive / headless
saddle --dry-run --all
saddle --list
saddle --help
saddle reorg --source /tmp/saddle-fixture --dry-run
```

## Code Style

- CommonJS (`require`/`module.exports`) for all `scripts/*.js` files
- ESM (`import`/`export`) for `scripts/tui/*.mjs` and `scripts/install-ui.mjs`
- `"use strict"` at the top of every `.js` file
- No build step, no JSX transpilation — plain Node.js
- No empty `catch {}` blocks — always include a comment explaining why the error is swallowed

## Submitting a Pull Request

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Ensure `npm test` passes with 0 failures
4. Ensure `npm run lint:agents` outputs `agent-lint: ok`
5. Open a PR against `main` — fill in the PR template

## Adding a New Tool

To add support for a new AI coding tool:

1. Create `rules/<toolname>.yaml` following the schema of an existing rule file
2. Add the tool to the support matrix in `README.md`
3. Add `schemaVersion: 2` and `reorg.assets` when the harness has reusable global definitions
4. Test both routing strategies and repeat-run idempotency
5. Run `pnpm test` to confirm nothing regressed

The installer picks up new rule files automatically via `loadRules()`.

See the **Writing Rules** section in `README.md` for the complete YAML schema, including:

- `tool`, `label`, `home`, `binary`, `enabled`, `mode`
- `mappings` for skills, files, and directories
- `reorg.assets` for canonical collections and universal/provider target locations
- `mode: single-select` for mutually exclusive options (vs. `multi-select` default)

Reorganization rules must use documented harness paths. A provider name such as DeepSeek is not itself a harness; map the actual client that owns the on-disk format (for example, Reasonix). Never include credential files or broad configuration homes in a reorganization asset.

## Reporting Issues

Please use the GitHub [issue tracker](https://github.com/ndizazzo/saddle/issues). Bug reports and feature requests are both welcome — use the templates provided.
