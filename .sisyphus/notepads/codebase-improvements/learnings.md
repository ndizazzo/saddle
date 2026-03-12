## 2026-03-12 Lazy config loading refactor
- `scripts/install-core.js` must avoid module-load side effects; caching with `getConfig()` preserves behavior while deferring config reads until first use.
- Returning `configError` on the `loadConfig()` result removes mutable cross-call singleton state and keeps parse status tied to the specific load attempt.

## 2026-03-12 Task 7: ensureLink dedup

- **Collapsed two ~30-line branches into one shared flow** in `ensureLink` function
- **Key insight**: The symlink and non-symlink branches differed only in:
  1. How `reason` string was calculated (symlink target vs content match detection)
  2. Everything else was identical (prompt, dry-run check, confirmation, backup, rename)
- **Refactoring pattern**: Extract the divergence point, compute the differing value, then merge into single path
- **Result**: ~40 lines removed, all 147 tests still pass, event emissions unchanged
- **Comment added**: "Determine reason for replacement" marks the critical transition point where code shifts from symlink-specific logic to unified flow


## 2026-03-12 Task 8: Cache builder merge

- Removed sync `buildInspectionCache`, renamed async `buildInspectionCacheAsync` to `buildInspectionCache`
- Made `onProgress` parameter optional (default `null`) in the merged function
- Updated exports in `install-core.js`: removed `buildInspectionCacheAsync`
- Updated imports in `install.js` and `install-ui.mjs` to use `buildInspectionCache`
- Updated TUI `App.mjs` to use `buildInspectionCache` with proper dependency array
- Updated all 3 tests in `install-core.test.js` to be async and await the function
- All 147 tests pass, 0 failures
- Verified: function defined exactly once in install-core.js

## Wave 2: --verbose and --quiet CLI flags (2026-03-12)

### Pattern: Adding boolean flags to parseArgs
- `parseArgs` in `install-core.js` is a simple manual loop — add new flags as `if (arg === "--flag") { options.flag = true; continue; }` after the existing flags
- Default values go in the `options` object literal at the top of `parseArgs`
- `printUsage` takes a flat `profiles` array; no need to pass options; update the usage line string and add flag descriptions inline with `console.log`

### Pattern: Quiet/verbose in event handlers
- The `onEvent` callback in `runPlainInstaller` (install.js) has `options` in closure scope — guard suppressed events with `if (!options.quiet)`, verbose extras with `if (options.verbose)`
- `--verbose` output goes to `process.stderr.write(...)` not `console.log` to keep stdout clean
- `--quiet` suppresses: `profile-start`, `mkdir`, `ok`, `skip`, `link` — keeps: `prompt` (for replace/dryRun), `backup`, `error`, `session-complete`

### Pattern: Pass-through to TUI
- `runInkInstaller` already receives the full `options` object, so new fields on `parseArgs` return value flow through automatically — no extra prop wiring needed

### Test pattern
- New boolean flags need 4 tests each: default false, flag=true, combined (no error), combined other order
- Also update the "all-false defaults" test to include the new fields (strict equality check fails otherwise)
- 6 new tests added; total went from 147 → 153
