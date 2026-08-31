<p align="center">
  <pre align="center">
   _______   ___  ___  __   ____ 
  / __/ _ | / _ \/ _ \/ /  / __/
 _\ \/ __ |/ // / // / /__/ _/  
/___/_/ |_/____/____/____/___/  </pre>
</p>

<p align="center">
  <strong>One repo. One source of truth. Sync your AI tool configs everywhere.</strong>
</p>

<p align="center">
  <a href="https://github.com/ndizazzo/saddle/actions/workflows/ci.yml"><img src="https://github.com/ndizazzo/saddle/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen" alt="Node.js >=18"></a>
  <a href="https://www.npmjs.com/package/saddle-cli"><img src="https://img.shields.io/npm/v/saddle-cli.svg?color=blue" alt="npm"></a>
</p>

<p align="center">
  Detect, reorganize, and sync agents, skills, commands, and configurations across<br>
  Claude Code, Codex, Copilot, Cursor, Gemini, Goose, OpenCode, and Reasonix.
</p>

<p align="center">
  <a href="https://github.com/ndizazzo/saddle">GitHub</a> · <a href="https://www.npmjs.com/package/saddle-cli">npm</a> · <a href="CHANGELOG.md">Changelog</a>
</p>

---

## Quick Start

```bash
# Install the CLI
npm install -g saddle-cli

# Import scattered agent configuration into a source root you choose
saddle reorg --source ~/dotfiles/agents

# Or inspect and apply non-interactively
saddle reorg --source ~/dotfiles/agents --dry-run
saddle reorg --source ~/dotfiles/agents --yes
saddle reorg --check
```

The source root is not tied to `~/dev/ai` or to the Saddle checkout. Use any durable local path, dotfiles repository, or synced directory. Saddle stores the confirmed choice in `~/.config/saddle/config.yaml`.

For an existing canonical tree, run `saddle` (or `saddle sync`) to choose individual mappings. See [One-shot reorganization](docs/reorg.md) for the migration workflow and safety model.

---

## One-shot Reorganization

`saddle reorg` scans supported coding harnesses, builds a deterministic plan, and shows the proposed imports, links, and duplicate removals before writing anything.

```bash
# Prefer ~/.agents/* where a harness supports it; use native folders as fallback
saddle reorg --source ~/dotfiles/agents --strategy universal-first

# Use harness-specific locations only
saddle reorg --source ~/dotfiles/agents --strategy provider-only
```

The strategies are mutually exclusive. A compatible harness/asset is never linked to both a universal and a provider-specific location in the same plan. Press Enter to apply in the TUI or Esc to reject without creating config, state, or symlinks.

Every apply is precondition-checked and transaction-journaled. If an action fails, Saddle restores completed changes from the transaction backup. A clean repeat run produces no actions; if one harness adds a new local definition later, the next plan contains only that drift.

---

## What Gets Synced

| Tool        | Home                 | Skills | Agents | Commands |  Root File  |              Config Files               |
| ----------- | -------------------- | :----: | :----: | :------: | :---------: | :-------------------------------------: |
| Claude Code | `~/.claude`          |   ✓    |   ✓    |    ✓     |      —      |                    —                    |
| Codex       | `~/.codex`           |   ✓    |   ✓    |    ✓     | `AGENTS.md` |                    —                    |
| Copilot     | `~/.copilot`         |   ✓    |   ✓    |    —     |      —      |                    —                    |
| Cursor      | `~/.cursor`          |   ✓    |   ✓    |    ✓     |      —      |                    —                    |
| Gemini      | `~/.gemini`          |   ✓    |   ✓    |    ✓     | `GEMINI.md` | `configurations/gemini/` → `~/.gemini/` |
| OpenCode    | `~/.config/opencode` |   ✓    |   ✓    |    ✓     | `AGENTS.md` |   `opencode/` → `~/.config/opencode/`   |
| Goose       | `~/.config/goose`    |   ✓    |   —    |    —     |      —      |                    —                    |
| Reasonix    | `~/.reasonix`        |   ✓    |   —    |    —     |      —      |                    —                    |

---

## Features

**Interactive TUI** — A beautiful terminal interface built with Ink. Browse tools, preview diffs, toggle individual actions — all from your terminal.

**One-shot Reorganization** — Inventory scattered definitions, import them into a configurable canonical root, and replace duplicates with verified relative symlinks.

**Headless-ready** — Full non-interactive mode for CI/CD. `--dry-run`, `--yes`, `--all`, `--check` — automate everything.

**Smart Symlinks** — Creates relative symlinks, detects existing content, shows diffs before replacing, and backs up what was there.

**Lockfile Tracking** — Know exactly what Saddle installed. Verify sync status with `--check`. Safely uninstall with `--uninstall`.

**YAML Rules** — Declarative per-tool rules define what gets linked where. Add new tools by writing a single YAML file.

**Zero Config** — Detects installed tools automatically. Grays out what's missing. Just run `saddle` and go.

---

## How It Works

**1. Define** — Keep agents, skills, commands, and configs in one canonical repo.

**2. Detect** — Saddle finds which AI tools are installed on your machine.

**3. Link** — Symlinks wire each tool to your canonical definitions. Done.

---

## Canonical Layout

```
<sourceRoot>/
├── agents/              # Provider-format agent definitions
│   ├── claude/
│   ├── copilot/
│   ├── cursor/
│   ├── gemini/
│   └── opencode/
├── commands/            # Provider-format slash command files
│   ├── claude/
│   ├── cursor/
│   ├── gemini/
│   └── opencode/
└── skills/              # Portable Agent Skills directories
    └── <skill>/SKILL.md
```

Only collections found on the machine are created. Existing `saddle sync` sources may also contain tool configuration collections. Bundled provider rules ship with Saddle; user overrides live in `~/.config/saddle/rules`, outside the canonical source root.

Keep the real files in the source root and rebuild tool-specific links on each machine. Do not sync `~/.claude`, `~/.codex`, `~/.cursor`, `~/.gemini`, `~/.copilot`, or `~/.config/opencode` symlinks directly between machines.

---

## CLI Reference

```
saddle [sync] [options]
saddle reorg [options]
```

| Flag                | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `--dry-run`         | Preview changes without writing to disk                       |
| `--yes`             | Auto-confirm replacements without prompting                   |
| `--all`             | Select every available profile                                |
| `--profile id1,id2` | Apply specific profile IDs by name                            |
| `--list`            | Print available profiles and exit                             |
| `--check`           | Verify installed symlinks are in sync (exit 0 clean, 1 drift) |
| `--uninstall`       | Remove symlinks recorded in lockfile                          |
| `--verbose`         | Show extra detail (source paths, resolved targets)            |
| `--quiet`           | Suppress ok/link/skip/mkdir output; errors and summary only   |

### Reorganization Options

| Flag               | Description                                                            |
| ------------------ | ---------------------------------------------------------------------- |
| `--source path`    | Canonical root to import into; overrides environment and config        |
| `--strategy value` | `universal-first` or `provider-only`                                   |
| `--dry-run`        | Print the complete plan without creating config, state, or links       |
| `--json`           | Emit a machine-readable read-only plan                                 |
| `--check`          | Exit 1 when changes or conflicts remain; otherwise exit 0              |
| `--yes`            | Apply a conflict-free plan without the interactive confirmation screen |
| `--quiet`          | Suppress per-action apply output                                       |

### Interactive Mode

The TUI is built with [Ink](https://github.com/vadimdemedes/ink) and [@inkjs/ui](https://github.com/vadimdemedes/ink-ui). It presents selectable profiles grouped by tool, with per-action toggling and diff previews.

Profiles for tools not detected on the system are shown grayed out with a "NOT INSTALLED" badge and cannot be selected.

### Non-Interactive Mode

When piped or used with `--yes`, Saddle falls back to a plain-text installer. Ideal for CI/CD pipelines and headless environments.

```bash
# Preview all changes
npx saddle --dry-run --all

# Apply everything, no prompts
npx saddle --yes --all

# Apply specific profiles
npx saddle --profile claude-skills-skills,cursor-directory-agents --yes
```

---

## Configuration

| Variable               | Default                        | Description                                      |
| ---------------------- | ------------------------------ | ------------------------------------------------ |
| `SADDLE_DIR`           | `~/.config/saddle`             | Base config directory                            |
| `SADDLE_CONFIG`        | `~/.config/saddle/config.yaml` | Path to config file                              |
| `SADDLE_RULES_DIR`     | `~/.config/saddle/rules`       | Path to rules directory                          |
| `SADDLE_SOURCE_ROOT`   | unset                          | Canonical root; overrides `sourceRoot` in config |
| `SADDLE_LINK_STRATEGY` | `universal-first`              | Reorganization routing strategy                  |

The equivalent config keys are `sourceRoot` and `linkStrategy`. `sourceRoot` has no machine-specific default; interactive commands ask before using one.

---

## Writing Rules

Rules are YAML files that define how to sync a tool's configurations. Each rule describes what to link and where. Place custom rules in `~/.config/saddle/rules/` (or set `SADDLE_RULES_DIR` to override).

### Rule Schema

```yaml
schemaVersion: 2 # Required for reorganization rules
tool: claude # Unique identifier for this tool
label: Claude Code # Display name in the TUI
binary: # How to detect if tool is installed (optional)
  which: claude # Try `which claude` to detect
  # OR
  paths: # Or check these paths on specific platforms
    darwin: /Applications/Claude.app
    linux: /usr/bin/claude
home: ~/.claude # Tool's config directory (supports ~)
enabled: true # Include in sync (default: true)
mode: multi-select # Selection mode: multi-select (default) or single-select

reorg:
  assets:
    - kind: skill # skill | agent | command | instruction | config
      canonical: skills # Directory relative to the configured source root
      entries: directories # directories | files
      locations:
        - path: ~/.agents/skills
          targetClass: universal
        - path: ~/.config/example/skills
          targetClass: provider

mappings: # List of what to link
  - type: skills # Type: skills | file | directory
    source: skills # Path relative to repo root
    target: skills # Path relative to home (or . for home itself)
    itemType: skill # Optional: type hint for skills mapping

  - type: file # Link a single file
    source: agents/claude/AGENTS.md
    target: AGENTS.md # File name in home

  - type: directory # Link files from a directory
    source: configs/claude
    target: . # Flatten files directly into home
```

### Key Fields

| Field           | Required | Type    | Notes                                                        |
| --------------- | -------- | ------- | ------------------------------------------------------------ |
| `schemaVersion` | reorg    | integer | Use `2` for the reorganization schema                        |
| `tool`          | ✓        | string  | Machine-readable identifier (lowercase, no spaces)           |
| `label`         | ✗        | string  | Display name; defaults to `tool`                             |
| `binary`        | ✗        | object  | Binary and platform-path detection                           |
| `home`          | ✓        | string  | Tool's config directory; supports `~`                        |
| `enabled`       | ✗        | boolean | Default: `true`. Set `false` to skip                         |
| `mode`          | ✗        | string  | Sync selection mode                                          |
| `reorg.assets`  | ✗        | array   | Canonical collections and universal/provider discovery roots |
| `mappings`      | ✓        | array   | Existing-source sync definitions                             |

Reorganization locations fail closed: unsafe canonical paths, relative harness paths, unknown entry modes, and mistyped target classes are ignored. See [the full reorganization rule contract](docs/reorg.md#provider-rule-schema).

### Selection Mode

Control how users can select items from this rule:

- **`multi-select`** (default) — User can select any combination of profiles. UI shows checkboxes `[x]` / `[ ]`. Useful for skills, agents, commands where you might want multiple at once.

- **`single-select`** — User can select only one profile from this rule at a time. UI shows radio buttons `(•)` / `( )`. Useful when alternatives are mutually exclusive (e.g., multiple config files targeting the same destination).

**Example:** `oh-my-openagent.yaml` has 3 file mappings all targeting `oh-my-openagent.json`. Setting `mode: single-select` ensures only one alternative config gets installed:

```yaml
tool: oh-my-openagent
label: OpenCode Config
home: ~/.config/opencode
enabled: true
mode: single-select # Only allow ONE of the three files

mappings:
  - type: file
    source: oh-my-openagent/config.openai.json
    target: oh-my-openagent.json

  - type: file
    source: oh-my-openagent/config.claude.json
    target: oh-my-openagent.json

  - type: file
    source: oh-my-openagent/config.copilot.json
    target: oh-my-openagent.json
```

### Mapping Types

**`skills`** — Discovers subdirectories in source and creates one action per skill.

```yaml
- type: skills
  source: skills
  target: skills
  itemType: skill # optional type hint
```

**`file`** — Links a single file. Source file must exist.

```yaml
- type: file
  source: agents/claude/AGENTS.md
  target: AGENTS.md
```

**`directory`** — Discovers files in source directory (non-recursive) and creates one action per file.

```yaml
- type: directory
  source: configs/claude
  target: .          # Flatten into home
  # OR
  target: config/    # Put into subdirectory
```

### Binary Detection

Detect if a tool is installed:

```yaml
# Method 1: `which` command (cross-platform)
binary:
  which: claude

# Method 2: Platform-specific paths
binary:
  paths:
    darwin: /Applications/Claude.app
    linux: /usr/bin/claude
    win32: C:\Program Files\Claude\claude.exe

# Method 3: Both (tries `which` first, falls back to paths)
binary:
  which: cursor
  paths:
    darwin: /Applications/Cursor.app
```

---

## CLI Documentation Reference

Links to official documentation for each supported AI coding tool.

<details>
<summary><strong>Claude Code</strong></summary>

- [CLI Reference](https://code.claude.com/docs/en/cli-reference.md) — commands and flags
- [Interactive Mode](https://code.claude.com/docs/en/interactive-mode.md) — slash commands and shortcuts
- [Skills](https://code.claude.com/docs/en/skills.md) — custom slash commands via SKILL.md
- [Subagents](https://code.claude.com/docs/en/sub-agents.md) — agent delegation
- [Agent Teams](https://code.claude.com/docs/en/agent-teams.md) — multi-agent collaboration
- [Settings](https://code.claude.com/docs/en/settings.md) — settings.json reference
- [Memory / CLAUDE.md](https://code.claude.com/docs/en/memory.md) — project instructions
- [Hooks](https://code.claude.com/docs/en/hooks.md) — lifecycle event hooks
- [MCP](https://code.claude.com/docs/en/mcp.md) — MCP server integration
- [Plugins](https://code.claude.com/docs/en/plugins.md) — plugin system

</details>

<details>
<summary><strong>Cursor</strong></summary>

- [CLI Overview](https://cursor.com/docs/cli/overview) — getting started with the CLI
- [Using Agent in CLI](https://cursor.com/docs/cli/using) — interactive agent usage
- [Parameters Reference](https://cursor.com/docs/cli/reference/parameters) — all CLI flags
- [Slash Commands](https://cursor.com/docs/cli/reference/slash-commands) — in-session commands
- [Agent Modes](https://cursor.com/docs/agent/modes) — plan, ask, and agent modes
- [Rules](https://cursor.com/docs/context/rules) — .cursor/rules/ configuration
- [Skills](https://cursor.com/docs/skills) — portable Agent Skills and discovery roots
- [Subagents](https://cursor.com/docs/subagents) — user and project agent definitions
- [MCP in CLI](https://cursor.com/docs/cli/mcp) — MCP server management
- [Headless / CI](https://cursor.com/docs/cli/headless) — non-interactive scripting

</details>

<details>
<summary><strong>GitHub Copilot CLI</strong></summary>

- [CLI Command Reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference) — commands, settings, skill roots, and customization reference
- [Agent Skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills) — personal skills in `~/.copilot/skills` or `~/.agents/skills`
- [Custom Agents](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/create-custom-agents-for-cli) — user agents in `~/.copilot/agents`

</details>

<details>
<summary><strong>Codex (OpenAI)</strong></summary>

- [CLI Reference](https://developers.openai.com/codex/cli/reference) — all subcommands and flags
- [CLI Features](https://developers.openai.com/codex/cli/features) — feature overview
- [Slash Commands](https://developers.openai.com/codex/cli/slash-commands) — in-session TUI commands
- [Config Basics](https://developers.openai.com/codex/config-basic) — config.toml setup
- [Config Reference](https://developers.openai.com/codex/config-reference) — all config keys
- [AGENTS.md Guide](https://developers.openai.com/codex/guides/agents-md) — agent instruction files
- [Rules](https://developers.openai.com/codex/rules) — rule system
- [Skills](https://developers.openai.com/codex/skills) — skill system
- [MCP Integration](https://developers.openai.com/codex/mcp) — MCP server setup
- [Non-interactive Mode](https://developers.openai.com/codex/noninteractive) — codex exec for CI/CD

</details>

<details>
<summary><strong>Gemini</strong></summary>

- [CLI Cheatsheet](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md) — launch flags and model flags
- [Interactive Commands](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md) — slash, at, and shell commands
- [Configuration Reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md) — settings.json schema
- [GEMINI.md Context Files](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md) — agent memory and instructions
- [Custom Commands](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/custom-commands.md) — .toml custom slash commands
- [Skills](https://geminicli.com/docs/cli/using-agent-skills/) — agent skills system and discovery roots
- [MCP Server Integration](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md) — MCP setup
- [Plan Mode](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/plan-mode.md) — read-only planning
- [Headless / Non-interactive](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md) — CI/automation usage

</details>

<details>
<summary><strong>Goose</strong></summary>

- [Using Skills](https://goose-docs.ai/docs/guides/context-engineering/using-skills/) — global Agent Skills discovery and Goose-specific skills
- [Goose Documentation](https://goose-docs.ai/) — installation, configuration, and extensions

</details>

<details>
<summary><strong>Reasonix (DeepSeek)</strong></summary>

- [Reasonix Documentation](https://reasonix.io/docs/) — DeepSeek-oriented coding harness configuration
- [DeepSeek API Documentation](https://api-docs.deepseek.com/) — model-provider reference; on-disk definitions remain owned by the client harness

</details>

<details>
<summary><strong>OpenCode</strong></summary>

- [CLI Reference](https://opencode.ai/docs/cli/) — all commands and flags
- [Config Reference](https://opencode.ai/docs/config/) — opencode.json setup
- [Agents](https://opencode.ai/docs/agents/) — agent definitions and built-in agents
- [Skills](https://opencode.ai/docs/skills/) — SKILL.md skill system
- [Custom Commands](https://opencode.ai/docs/commands/) — slash command files
- [Rules / AGENTS.md](https://opencode.ai/docs/rules/) — project instruction files
- [MCP Servers](https://opencode.ai/docs/mcp-servers/) — MCP integration
- [Providers](https://opencode.ai/docs/providers/) — model provider configuration
- [Plugins](https://opencode.ai/docs/plugins/) — plugin system
- [TUI Usage](https://opencode.ai/docs/tui/) — terminal UI reference

</details>

---

## Validation

```bash
pnpm install
pnpm run lint:agents
```

The same validator runs from the Husky pre-commit hook.

---

## Built With

<p>
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=react,nodejs,npm,github" alt="Tech stack">
  </a>
</p>

- **[Ink](https://github.com/vadimdemedes/ink)** — React for CLIs
- **[@inkjs/ui](https://github.com/vadimdemedes/ink-ui)** — Terminal UI components
- **[React](https://react.dev)** — Component framework
- **[yaml](https://github.com/eemeli/yaml)** — YAML parser

---

<sub>MIT License · Made by <a href="https://github.com/ndizazzo">ndizazzo</a></sub>
