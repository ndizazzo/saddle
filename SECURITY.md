# Security Policy

## Scope

Saddle creates symlinks between a user-selected canonical source root and supported AI tool config directories. `saddle reorg` reads only the reusable asset locations declared in provider rules; bundled rules do not scan credential files. No network requests are made and no credentials are stored.

## Supported Versions

Security fixes are applied to the latest release on `main`. There are no long-term support branches at this time.

| Version | Supported |
| ------- | --------- |
| 0.10.x  | ✓ Yes     |

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
- Reorganization rules that escape the canonical source root or overlap a managed harness root
- Incomplete rollback that leaves a replaced target without its transaction backup

## What We Do Not Consider a Vulnerability

- A local user with write access to the repo being able to modify what gets linked (this is by design — Saddle is a personal dotfile management tool)
- Symlinks pointing to world-readable files (intended behavior)
