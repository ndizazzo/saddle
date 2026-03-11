# Security Policy

## Scope

Saddle creates symlinks from this repository into your AI tool config directories (`~/.claude`, `~/.codex`, `~/.cursor`, `~/.gemini`, `~/.copilot`, `~/.config/opencode`). No network requests are made. No credentials are read or stored.

## Supported Versions

Security fixes are applied to the latest release on `main`. There are no long-term support branches at this time.

| Version | Supported |
|---------|-----------|
| 0.1.x   | ✓ Yes     |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Report security issues privately by emailing the maintainer directly or using [GitHub's private vulnerability reporting](https://github.com/ndizazzo/saddle/security/advisories/new).

Include:
- A description of the vulnerability
- Steps to reproduce (or a proof-of-concept)
- The potential impact
- Any suggested remediation (optional)

You should receive an acknowledgement within 72 hours. If you do not, follow up by opening a GitHub issue with subject "Security disclosure follow-up" (without disclosing the vulnerability details).

## What We Consider a Vulnerability

- Path traversal: crafted rule YAML causing links to be created outside the expected target directories
- Arbitrary code execution triggered by malformed YAML rule files or config files
- Symlink following attacks during install or uninstall that could overwrite unintended files

## What We Do Not Consider a Vulnerability

- A local user with write access to the repo being able to modify what gets linked (this is by design — Saddle is a personal dotfile management tool)
- Symlinks pointing to world-readable files (intended behavior)
