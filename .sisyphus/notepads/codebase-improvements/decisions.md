## 2026-03-12 Lazy config loading API decisions
- Exported `getDefaultRepoRoot()` from `install-core` instead of a computed `defaultRepoRoot` value so source root is resolved lazily.
- Updated `install.js` to read config parse errors from `loadConfig(...).configError` and removed `getConfigError` usage/imports.
