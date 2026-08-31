# One-shot reorganization

`saddle reorg` turns reusable configuration scattered across coding harnesses into one canonical tree. It inventories installed tools, hashes existing items, builds a deterministic plan, and waits for confirmation before it imports or links anything.

The command manages declared assets such as skills, agents, and commands. It does not move credentials, session data, caches, or undeclared provider configuration.

## Choose a source root

The canonical source path belongs to the user. It does not need to be `~/dev/ai`, the Saddle package, or a particular repository layout.

```bash
saddle reorg --source ~/dotfiles/agents
```

Source precedence is:

1. `--source path`
2. `SADDLE_SOURCE_ROOT`
3. `sourceRoot` in `~/.config/saddle/config.yaml`
4. an interactive prompt

Saddle stores a CLI- or TUI-confirmed source after a successful apply. Read-only modes and a rejected TUI do not create the config file.

The bundled rules currently organize imported definitions like this, creating only collections that exist on the machine:

```text
<sourceRoot>/
├── agents/<harness>/
├── commands/<harness>/
└── skills/<skill>/SKILL.md
```

Provider rules are Saddle configuration, not canonical content. Bundled rules ship with the CLI and user overrides live in `~/.config/saddle/rules`.

## Choose one routing strategy

The two strategies are mutually exclusive for each harness asset.

### `universal-first`

Use a universal location such as `~/.agents/skills` when the harness declares support for it. If that asset has no universal location, use its provider-specific directory.

For example, skills shared by Codex, Copilot, Cursor, OpenCode, Gemini, and Goose can use one `~/.agents/skills` link set, while Claude agents remain under `~/.claude/agents`.

```bash
saddle reorg --source ~/dotfiles/agents --strategy universal-first
```

### `provider-only`

Use only provider-specific locations. A harness with no declared provider-specific target is reported as unsupported for that asset. Saddle does not also create a universal link.

```bash
saddle reorg --source ~/dotfiles/agents --strategy provider-only
```

Switching strategy produces a plan that creates the selected endpoint and removes matching duplicates from the suppressed endpoint. Different content is a conflict and is never deleted automatically.

## Review and apply

In a terminal, Saddle presents the routing decision, canonical root, action counts, and each affected item. Enter confirms the exact plan. Escape or `q` rejects it without writing.

For automation:

```bash
# Human-readable preview
saddle reorg --source ~/dotfiles/agents --dry-run

# Machine-readable preview
saddle reorg --source ~/dotfiles/agents --json

# Drift check: 0 clean, 1 changes or conflicts remain
saddle reorg --check

# Apply a conflict-free plan without the TUI
saddle reorg --source ~/dotfiles/agents --yes
```

Non-interactive apply requires `--yes`. JSON output is always read-only.

## Planning rules

For each canonical collection, Saddle:

1. inventories immediate files or directories at every declared location;
2. hashes content and file modes using stable ordering;
3. imports an item when it exists in a harness but not in the canonical tree;
4. creates relative symlinks at only the selected endpoint class;
5. removes a suppressed duplicate only when its digest matches the canonical item; and
6. blocks the plan if the same name has different content.

Actions are ordered as imports, universal links, provider fallbacks, then duplicate removals. The plan records filesystem signatures. Apply rejects stale plans if a target changes after inspection.

## Transactions and recovery

Every non-empty apply creates `~/.config/saddle/transactions/<transaction-id>/manifest.json`. Replaced files and directories are copied into that transaction's backup directory; symlink destinations are recorded directly.

Imports and links are hashed or resolved after creation. If any action fails, completed actions are rolled back in reverse order. The manifest ends in `rolled-back`, or `rollback-failed` with per-target errors if the operating system prevents complete restoration.

The latest successful layout is summarized in `~/.config/saddle/reorg-state.json`. Planning does not rely on that file: the filesystem remains the source of truth, so deleted state can be reconstructed on the next scan.

## Idempotency and drift

After a successful run, the same command produces an empty plan while the filesystem is unchanged. If a harness later creates one new skill or replaces one local item, the next run plans only the affected name. Existing correct links are listed as unchanged.

## Bundled harness behavior

| Harness             | Universal skills   | Provider-specific assets                          |
| ------------------- | ------------------ | ------------------------------------------------- |
| Claude Code         | —                  | `~/.claude/skills`, `agents`, `commands`          |
| Codex               | `~/.agents/skills` | —                                                 |
| Copilot             | `~/.agents/skills` | `~/.copilot/skills`, `agents`                     |
| Cursor              | `~/.agents/skills` | `~/.cursor/skills`, `agents`, `commands`          |
| Gemini              | `~/.agents/skills` | `~/.gemini/skills`, `agents`, `commands`          |
| Goose               | `~/.agents/skills` | `~/.config/goose/skills`                          |
| OpenCode            | `~/.agents/skills` | `~/.config/opencode/skills`, `agents`, `commands` |
| Reasonix (DeepSeek) | —                  | `~/.reasonix/skills`                              |

DeepSeek is a model provider, not an on-disk harness format. Saddle's bundled DeepSeek-oriented rule targets Reasonix, the coding harness that owns `~/.reasonix`. A DeepSeek model used through Codex, Claude Code, or OpenCode follows that harness's rule instead.

## Provider rule schema

Reorganization metadata is available in provider rule schema version 2:

```yaml
schemaVersion: 2
tool: example
label: Example Agent
binary: example
home: ~/.config/example
enabled: true

reorg:
  assets:
    - kind: skill
      canonical: skills
      entries: directories
      locations:
        - path: ~/.agents/skills
          targetClass: universal
        - path: ~/.config/example/skills
          targetClass: provider
    - kind: agent
      canonical: agents/example
      entries: files
      locations:
        - path: ~/.config/example/agents
          targetClass: provider

mappings: []
```

- `kind` is `skill`, `agent`, `command`, `instruction`, or `config`.
- `canonical` is a relative directory beneath the selected source root. Absolute and parent-traversal paths are rejected.
- `entries` is `directories` for directory-packaged assets such as Agent Skills, or `files` for flat Markdown definitions.
- `locations[].path` is an absolute or tilde-prefixed harness directory.
- `targetClass` is exactly `universal` or `provider`. Unknown values fail closed.

The same physical location must not claim different canonical collections. Keep credential files and broad config directories out of `reorg.assets`.
