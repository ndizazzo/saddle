# Changelog

All notable changes to Saddle are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.10.0] — 2026-08-30

### Added

- `saddle reorg` one-shot migration command with interactive review, `--dry-run`, `--json`, `--check`, and headless `--yes` modes
- Configurable canonical roots through `--source`, `SADDLE_SOURCE_ROOT`, or `sourceRoot` in `config.yaml`; new installations no longer assume `~/dev/ai`
- Mutually exclusive `universal-first` and `provider-only` routing strategies
- Version 2 provider-rule schema for rule-based discovery of skills, agents, and commands
- Transaction manifests, verified imports and links, precondition checks, and automatic rollback on apply failure
- Idempotent drift planning: repeat runs are empty when clean and include only newly diverged items
- Reorganization rules for Claude Code, Codex, Copilot, Cursor, Gemini, Goose, OpenCode, and Reasonix (the supported DeepSeek coding harness)

### Changed

- Codex skill sync now targets the shared `~/.agents/skills` location
- Copilot detection now uses the standalone `copilot` CLI; skills support both current personal roots and the unsupported `~/.copilot/commands` mapping has been removed
- Bundled reorganization metadata is merged into older user-copied provider rules without overwriting custom sync mappings
- Dry-run, JSON, check, and rejected TUI plans do not initialize Saddle config or state

### Fixed

- Managed collection symlinks that already point to their canonical collection no longer trigger a false overlap error or risk changes through the alias

### Security

- Canonical paths are constrained to the selected source root, overlapping managed roots are rejected, and rule locations fail closed on malformed classifications
- Apply validates the complete plan before writing and revalidates each target immediately before mutation

---

## [0.9.3] — 2026-04-08

### Changed

- Renamed bundled rule `oh-my-opencode.yaml` → `oh-my-openagent.yaml` to reflect the upstream package rename; tool identifier, labels, source paths, and target config filename updated throughout

---

## [0.9.2] — 2026-03-25

### Added

- `mode` configuration option in rules: `multi-select` (default, allows selecting any combination of profiles) or `single-select` (enforces one-at-a-time selection)
- Radio button indicators `(•)` / `( )` in TUI for single-select rule groups (vs. checkboxes `[x]` / `[ ]` for multi-select)
- Single-select enforcement in headless mode (`--all` flag now respects mode for each rule)
- "Writing Rules" section in README.md with complete YAML schema documentation, mode explanation, and real-world examples
- All bundled rules now explicitly declare their selection mode in YAML

### Changed

- `oh-my-opencode.yaml` now uses `mode: single-select` to prevent accidental installation of multiple conflicting provider configs (now renamed to `oh-my-openagent.yaml`)

---

## [0.9.1] — 2026-03-12

### Fixed

- Backup on replace now only applies when the existing target is a real file; symlinks pointing
  elsewhere are removed without creating a backup copy

### Changed

- Backup policy limited to one copy per target (`.bak.<timestamp>`); no backup is created when
  replacing a symlink

### Added

- commitlint with `@commitlint/config-conventional` enforces conventional commit messages
- Husky `commit-msg` hook wires commitlint into every commit
- Migrated package manager from npm to pnpm; `pnpm-lock.yaml` replaces `package-lock.json`
- CI workflow updated to use `pnpm/action-setup` and pnpm commands

## [0.9.0] — 2026-03-12

### Added

- Interactive Ink TUI with per-profile selection, diff overlay, and path editing
- Non-interactive plain-text installer for CI/headless use
- `--dry-run` flag — preview all changes without writing to disk
- `--yes` flag — auto-confirm replacements without prompting
- `--all` flag — select every available profile
- `--profile` flag — apply specific profile IDs by name
- `--list` flag — print available profiles and exit
- `--check` flag — verify installed symlinks are in sync; exits 0 (clean) or 1 (drift)
- `--uninstall` flag — remove symlinks recorded in the lockfile
- `--verbose` flag — show extra detail (source paths, resolved targets) on stderr
- `--quiet` flag — suppress ok/link/skip/mkdir output; show only errors and summary
- Lockfile at `~/.config/saddle/installed.json` tracking all installed links
- Config-driven rule system: YAML files in `~/.config/saddle/rules/` define what gets linked where
- Bundled rules for Claude Code, Codex, Copilot, Cursor, Gemini, and OpenCode
- Tool detection via `which` and platform-specific binary paths
- Relative symlink creation (handles cases where parent dirs are themselves symlinks)
- Backup on replace: existing files/dirs moved to `<target>.bak.<timestamp>` before linking
- `SADDLE_DIR`, `SADDLE_CONFIG`, `SADDLE_RULES_DIR` environment variables for path overrides
- Compatibility wrapper `scripts/symlink-home.sh` for OpenCode-only installs
- `scripts/agent-lint.sh` structural validator; runs on every commit via Husky pre-commit hook
- GitHub Actions CI: Node 18, 20, 22 matrix on push and pull_request to main
- 171 unit tests covering config loading, installation logic, and TUI formatting utilities
