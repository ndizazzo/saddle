# Changelog

All notable changes to Saddle are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

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

## [0.1.0] — 2026-03-12

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

[Unreleased]: https://github.com/ndizazzo/saddle/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ndizazzo/saddle/releases/tag/v0.1.0
