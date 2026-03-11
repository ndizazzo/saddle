## Canonical Layout

- `agents/`: per-tool instruction files (e.g. `agents/opencode/AGENTS.md`, `agents/gemini/GEMINI.md`, `agents/codex/AGENTS.md`) and shared agent definitions linked into each tool's `<home>/agents/`
- `commands/`: slash command files linked into each tool's `<home>/commands/`
- `skills/`: skill subdirectories linked into each tool's `<home>/skills/`
- `configurations/gemini/`: Gemini-specific config files linked into `~/.gemini/`
- `opencode/`: OpenCode-specific config files linked into `~/.config/opencode/`
- `rules/`: per-tool installer rules (YAML) defining what gets linked where
- `scripts/`: repo maintenance helpers

`~/.config/opencode/node_modules` is intentionally not tracked here.

If you want one canonical source across machines and across tools, keep the real files in this repo and rebuild tool-specific links on each machine. Do not sync `~/.claude`, `~/.codex`, `~/.cursor`, `~/.gemini`, `~/.copilot`, or `~/.config/opencode` symlinks directly between machines.

## Setup CLI

Run:

```bash
node ./bin/ai-config.js
```

The interactive installer is built with Ink and @inkjs/ui.

The installer detects which AI coding tools are installed (Claude Code, Codex, Copilot, Cursor, Gemini, OpenCode) and presents selectable profiles for:

- Claude Code: skills, agents, commands
- Codex: skills, agents, commands, root AGENTS.md
- Copilot: skills, agents, commands
- Cursor: skills, agents, commands
- Gemini: skills, agents, commands, root GEMINI.md, Gemini config files
- OpenCode: skills, agents, commands, root AGENTS.md, OpenCode config files

Profiles for tools not detected on the system are shown grayed out with a "NOT INSTALLED" badge and cannot be selected.

It compares existing destinations before replacing them, prompts per overwrite, and creates relative symlinks where possible.

Configuration environment variables:

- `AI_CONFIG_DIR` — base config directory (default: `~/.config/ai-config`)
- `AI_CONFIG_PATH` — path to `config.yaml` (default: `~/.config/ai-config/config.yaml`)
- `AI_CONFIG_RULES_DIR` — path to rules directory (default: `~/.config/ai-config/rules`)

Compatibility wrapper:

```bash
./scripts/symlink-home.sh
```

That wrapper installs only the OpenCode profiles.

Use `node ./bin/ai-config.js --dry-run --all` to preview all discovered profiles.

Use `node ./bin/ai-config.js --yes --all` to apply everything without prompts.

Local package-runner example:

```bash
npx . --list
```

Once this repo is published or consumed as a package source, the same bin can be launched with `npx`, `pnpm dlx`, or `bunx`.

## Tool Support Matrix

What each supported CLI syncs from this repo:

| Tool | Home | Skills | Agents | Commands | Root file | Config files |
|------|------|:------:|:------:|:--------:|:---------:|:------------:|
| Claude Code | `~/.claude` | ✓ | ✓ | ✓ | — | — |
| Codex | `~/.codex` | ✓ | ✓ | ✓ | `AGENTS.md` | — |
| Copilot | `~/.copilot` | ✓ | ✓ | ✓ | — | — |
| Cursor | `~/.cursor` | ✓ | ✓ | ✓ | — | — |
| Gemini | `~/.gemini` | ✓ | ✓ | ✓ | `GEMINI.md` | `configurations/gemini/` → `~/.gemini/` |
| OpenCode | `~/.config/opencode` | ✓ | ✓ | ✓ | `AGENTS.md` | `opencode/` → `~/.config/opencode/` |

## CLI Documentation Reference

Links to official documentation grouped by agent harness, for each supported AI coding tool.

### Claude Code

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

### Cursor

- [CLI Overview](https://cursor.com/docs/cli/overview) — getting started with the CLI
- [Using Agent in CLI](https://cursor.com/docs/cli/using) — interactive agent usage
- [Parameters Reference](https://cursor.com/docs/cli/reference/parameters) — all CLI flags
- [Slash Commands](https://cursor.com/docs/cli/reference/slash-commands) — in-session commands
- [Agent Modes](https://cursor.com/docs/agent/modes) — plan, ask, and agent modes
- [Rules](https://cursor.com/docs/context/rules) — .cursor/rules/ configuration
- [Skills](https://cursor.com/docs/context/commands) — multi-step workflow files
- [MCP in CLI](https://cursor.com/docs/cli/mcp) — MCP server management
- [Headless / CI](https://cursor.com/docs/cli/headless) — non-interactive scripting

### Codex (OpenAI)

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

### Gemini

- [CLI Cheatsheet](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md) — launch flags and model flags
- [Interactive Commands](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/commands.md) — slash, at, and shell commands
- [Configuration Reference](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md) — settings.json schema
- [GEMINI.md Context Files](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/gemini-md.md) — agent memory and instructions
- [Custom Commands](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/custom-commands.md) — .toml custom slash commands
- [Skills](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md) — agent skills system
- [MCP Server Integration](https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md) — MCP setup
- [Plan Mode](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/plan-mode.md) — read-only planning
- [Headless / Non-interactive](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md) — CI/automation usage

### OpenCode

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

## Validation

Run:

```bash
npm install
npm run lint:agents
```

The same validator runs from the Husky pre-commit hook.
