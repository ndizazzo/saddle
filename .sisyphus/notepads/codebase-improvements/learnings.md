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

## Task: Lockfile (writeLockfile/readLockfile) — 2026-03-12

- `CONFIG_DIR` is exported from `load-config.js` — already available, just needed adding to the destructure in `install-core.js`'s require
- `install-core.js` uses `require()` (CJS) — pattern: add import, add functions before `module.exports`, extend exports object
- `runPlainInstaller` in `install.js` needed `sourceRoot` threaded in from `main()` via argument; `selectedProfiles` was already in closure scope for the `onEvent` handler
- Dry-run guard: check `options.dryRun` in the `session-complete` branch (already inside `else` block for non-dry-run)
- Error guard: `event.summary.errors === 0` inside the `session-complete` handler
- `writeLockfile` catches filesystem errors and warns to stderr rather than throwing

## Task: --uninstall CLI mode — 2026-03-12

- `parseArgs` accepts new mode flags with the existing boolean pattern and no downstream changes needed for option plumbing.
- `runUninstall(options)` belongs in `install-core.js` next to lockfile helpers so `readLockfile()` and shared path helpers are reused.
- Symlink safety check should resolve relative `readlinkSync()` output against `path.dirname(target)` and only remove links that canonicalize under `sourceRoot`.
- Use `fs.unlinkSync()` for symlink deletion; do not call `fs.rmSync()` for uninstall flow.

## Task: --check mode for CLI (Task 14)

- `discoverProfiles()` uses internal `getConfig()` singleton — no need to pass config fields as params; just call `discoverProfiles()` with no args for check mode
- `runCheck(options, config)` signature keeps `config` for API consistency even though `discoverProfiles()` doesn't use it
- The file had already evolved past the plan's line numbers (e.g. `--uninstall` was added before this task); always re-read files before editing
- `process.exit()` is called inside `runCheck`, so the `return` after `await runCheck(...)` in `install.js` is defensive only
- Pattern: new CLI modes are dispatched in `main()` in `install.js` after `options.listOnly` / `options.uninstall` blocks

## Wave 4 Test Patterns (readLockfile/writeLockfile/runUninstall/runCheck)

- `process.exit` mocking pattern: assign a throwing function, use try/finally to restore, catch only "process.exit" errors
- `process.stderr.write` mocking: save original, replace with function that logs + calls `origWrite.apply(process.stderr, args)`, restore in finally
- `fs.realpathSync(makeTempDir(...))` is critical on macOS — `/tmp` is a symlink to `/private/tmp`; canonical paths required for `runUninstall` sourceRoot comparison
- `CONFIG_DIR` is computed from `AI_CONFIG_DIR` env var at module load time; global `before` sets it before `require`; all lockfile tests share `globalTmpDir/installed.json`; clean up with `afterEach`
- `runUninstall` skips symlinks not inside `sourceRoot`; tests verify both removal (lstatSync throws ENOENT) and skip (lstatSync succeeds)
- `runCheck` always calls `process.exit` at the end (0 or 1); all `runCheck` tests must mock process.exit
- `normalizeRule` itemType tests were already added in Task 11 (load-config.test.js lines 317-352) — no duplication needed
- 171 tests pass after Wave 4 additions (16 new tests: 6 lockfile + 6 uninstall + 4 check)
