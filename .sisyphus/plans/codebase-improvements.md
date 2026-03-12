# Saddle (ai-config) — Codebase Improvements

## TL;DR

> **Quick Summary**: Fix 6 bugs, apply 8 simplifications, and implement 9 enhancements across the Saddle CLI codebase — all without changing existing user-facing behavior. The core refactoring (lazy config loading) unblocks several downstream improvements.
> 
> **Deliverables**:
> - All 6 identified bugs fixed
> - Dead code removed, duplicated logic consolidated
> - New CLI flags: `--verbose`, `--quiet`, `--check`, `--uninstall`
> - Source root validation on startup
> - Installed state lockfile for drift detection
> - All 146 existing tests still passing + new tests for new features
> 
> **Estimated Effort**: Large
> **Parallel Execution**: YES — 4 waves
> **Critical Path**: Task 1 (lazy config) → Task 3 (silent catches) → Task 10 (--verbose/--quiet) → Task 14 (--check) → Final Verification

---

## Context

### Original Request
Deep and thorough codebase analysis, collecting findings, recommendations, bug fixes, and simplifications without changing functionality.

### Interview Summary
**Key Discussions**:
- User wants ALL findings implemented: bugs, simplifications, and recommendations
- Dead `ActionPreviewRow` component should be removed
- Project stays build-free (no JSX) — published via npx
- Shared `h = React.createElement` extraction is the pragmatic approach

**Research Findings**:
- CJS/ESM module cache is NOT shared — current architecture correctly passes state via function parameters across the boundary
- `fs.rmSync()` has a broken symlink bug in Node.js v24+ — `--uninstall` must use `fs.unlinkSync()`
- Exit code convention: 0=clean, 1=changes needed for `--check` mode
- `--verbose` detail goes to stderr, `--quiet` suppresses stdout event output

### Metis Review
**Identified Gaps** (addressed):
- `selectedProfiles` recomputation in run effect must snapshot via ref (already uses `selectedActionKeysRef`)
- Column constant unification must pick ONE set of values and update both locations atomically
- CJS/ESM boundary: MUST NOT create shared state modules — continue passing via props
- `--uninstall` must use `unlinkSync`, never `rmSync` on symlinks
- `--check` must use exit code 0 (clean) / 1 (changes needed)

---

## Work Objectives

### Core Objective
Improve code quality, fix correctness issues, eliminate dead/duplicated code, and add professional CLI features — all while preserving 100% backward compatibility with existing behavior.

### Concrete Deliverables
- Refactored `install-core.js` with lazy config loading
- Fixed `groupByTool` enabled logic
- Removed 85 lines of dead `ActionPreviewRow` code
- New `--verbose`, `--quiet`, `--check`, `--uninstall` CLI flags
- Source root validation with user-facing warning
- Lockfile at `~/.config/ai-config/installed.json`
- Shared utilities extracted (`contractHome`, column constants, `h`)

### Definition of Done
- [ ] `npm test` → 146+ tests pass, 0 failures
- [ ] `npm run lint` → `agent-lint: ok`
- [ ] `node ./bin/ai-config.js --help` shows new flags
- [ ] `node ./bin/ai-config.js --check` exits 0 or 1 appropriately
- [ ] `node ./bin/ai-config.js --uninstall --dry-run` lists symlinks that would be removed
- [ ] No `ActionPreviewRow` in codebase
- [ ] No duplicate `const h = React.createElement` in TUI files

### Must Have
- All 146 existing tests pass without modification (test behavior, not implementation)
- CJS/ESM boundary preserved — state passed via function params, not shared modules
- `--uninstall` uses `unlinkSync`, never `rmSync` on symlinks
- Backup behavior preserved — never destructively replace
- All empty `catch {}` blocks replaced with specific error handling

### Must NOT Have (Guardrails)
- NO build step, NO JSX transpilation, NO bundling
- NO changes to the YAML rule file schema (add optional fields only)
- NO breaking changes to existing CLI flags or behavior
- NO shared state modules imported by both CJS and ESM
- NO `fs.rmSync()` for symlink removal
- NO changes to the `.husky/pre-commit` hook behavior
- NO modification to the `agent-lint.sh` validation checks (they must still pass)
- NO over-abstraction — don't create class hierarchies or dependency injection frameworks
- NO excessive comments or documentation bloat in source files

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — ALL verification is agent-executed. No exceptions.

### Test Decision
- **Infrastructure exists**: YES (Node.js built-in test runner)
- **Automated tests**: YES (Tests-after for new features, preserve existing)
- **Framework**: `node --test`
- **Test command**: `npm test` (runs `node --test tests/load-config.test.js tests/install-core.test.js tests/format.test.mjs`)

### QA Policy
Every task MUST include agent-executed QA scenarios.
Evidence saved to `.sisyphus/evidence/task-{N}-{scenario-slug}.{ext}`.

- **CLI features**: Use Bash — run commands, assert exit codes + stdout/stderr content
- **Core logic**: Use Bash — run `npm test`, check 0 exit code + "pass" counts
- **TUI**: Use Bash — run `node ./bin/ai-config.js --dry-run --all` in non-TTY mode to verify it still works

---

## Execution Strategy

### Parallel Execution Waves

```
Wave 1 (Foundation — shared utilities + config refactoring):
├── Task 1: Lazy config loading refactor [deep]
├── Task 2: Extract shared TUI utilities (h, contractHome) [quick]
├── Task 3: Replace silent catch blocks with specific handling [quick]
├── Task 4: Remove dead ActionPreviewRow + unify column constants [quick]
├── Task 5: Fix groupByTool enabled logic [quick]
└── Task 6: Add previewDiff broken symlink guard [quick]

Wave 2 (Core improvements — depend on Wave 1):
├── Task 7: Deduplicate ensureLink backup/replace branches (depends: 1) [quick]
├── Task 8: Merge sync/async inspection cache builders (depends: 1) [quick]
├── Task 9: Fix selectedProfiles recomputation + source root validation (depends: 1, 2) [quick]
├── Task 10: Add --verbose/--quiet flags (depends: 1, 3) [unspecified-high]
└── Task 11: Move inferItemType to rule YAML (depends: 1) [quick]

Wave 3 (New features — depend on Wave 2):
├── Task 12: Add lockfile for installed state (depends: 7, 10) [unspecified-high]
├── Task 13: Add --uninstall command (depends: 12) [deep]
├── Task 14: Add --check mode (depends: 10, 12) [unspecified-high]
└── Task 15: Update tests for all new features (depends: 10, 11, 12, 13, 14) [unspecified-high]

Wave FINAL (After ALL tasks — independent review, 4 parallel):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: Task 1 → Task 7 → Task 12 → Task 13 → Task 15 → F1-F4
Parallel Speedup: ~60% faster than sequential
Max Concurrent: 6 (Wave 1)
```

### Dependency Matrix

| Task | Depends On | Blocks | Wave |
|------|-----------|--------|------|
| 1 | — | 7, 8, 9, 10, 11 | 1 |
| 2 | — | 9 | 1 |
| 3 | — | 10 | 1 |
| 4 | — | — | 1 |
| 5 | — | — | 1 |
| 6 | — | — | 1 |
| 7 | 1 | 12 | 2 |
| 8 | 1 | — | 2 |
| 9 | 1, 2 | — | 2 |
| 10 | 1, 3 | 12, 14 | 2 |
| 11 | 1 | 15 | 2 |
| 12 | 7, 10 | 13, 14 | 3 |
| 13 | 12 | 15 | 3 |
| 14 | 10, 12 | 15 | 3 |
| 15 | 10, 11, 12, 13, 14 | F1-F4 | 3 |

### Agent Dispatch Summary

- **Wave 1**: **6 tasks** — T1 → `deep`, T2-T6 → `quick`
- **Wave 2**: **5 tasks** — T7-T9, T11 → `quick`, T10 → `unspecified-high`
- **Wave 3**: **4 tasks** — T13 → `deep`, T12, T14, T15 → `unspecified-high`
- **FINAL**: **4 tasks** — F1 → `oracle`, F2-F3 → `unspecified-high`, F4 → `deep`

---

## TODOs

- [ ] 1. Lazy config loading refactor

  **What to do**:
  - Refactor `scripts/load-config.js` to NOT call `loadConfig()` at module load time
  - Replace the module-level `const config = loadConfig(defaultRepoRoot)` in `install-core.js:12` with a lazy getter: `let _config; function getConfig() { if (!_config) _config = loadConfig(defaultRepoRoot); return _config; }`
  - Update all functions in `install-core.js` that reference `config.` to call `getConfig()` instead (there are ~10 call sites: `config.rules`, `config.expandHome`, `config.ignore`, `config.sourceRoot`)
  - Replace the module-level `_configError` singleton in `load-config.js:115` with a return value from `loadConfig()` — return `{ sourceRoot, ignore, rules, expandHome, configError }` instead of setting a module-level variable
  - Update `getConfigError()` to read from the config object, or remove it and have callers check `config.configError` directly
  - Update `install.js` to pass `configError` from the loaded config rather than calling `getConfigError()` as a separate import
  - Ensure the `clearConfigModules()` pattern in tests still works (it should, since the lazy getter resets when the module is re-required)
  - **CRITICAL**: Do NOT create a shared state module imported by both CJS and ESM. The TUI receives everything via function parameters at `install.js:190-200` — preserve this pattern

  **Must NOT do**:
  - Do not change the CJS/ESM boundary pattern
  - Do not introduce dependency injection frameworks
  - Do not change the public API of `loadConfig()` return value (add to it, don't remove)

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: Core architectural refactoring touching multiple files with ripple effects across the module boundary
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 2, 3, 4, 5, 6)
  - **Blocks**: Tasks 7, 8, 9, 10, 11
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `scripts/load-config.js:115-119` — Current `_configError` singleton pattern to replace
  - `scripts/install-core.js:11-12` — Module-level config evaluation to make lazy
  - `scripts/install-core.js:33,38,70,89-90` — All `config.` references that need updating to `getConfig().`

  **API/Type References**:
  - `scripts/load-config.js:151` — Current `loadConfig` return shape: `{ sourceRoot, ignore, rules, expandHome }`
  - `scripts/install-core.js:662-678` — Current module.exports (don't break these)
  - `scripts/install.js:18` — `getConfigError` import to update

  **Test References**:
  - `tests/load-config.test.js:430-452` — Tests for `getConfigError()` that need updating
  - `tests/helpers.js:24-33` — `clearConfigModules()` pattern to preserve compatibility with

  **WHY Each Reference Matters**:
  - `load-config.js:115-119` — This is the exact code being replaced; executor needs to see current pattern
  - `install-core.js:11-12` — This is the primary target: module-level side effect to eliminate
  - `install.js:18` — The `getConfigError` import must be updated to match new API
  - `tests/helpers.js:24-33` — Tests depend on cache-busting; lazy getter must still work after cache bust

  **Acceptance Criteria**:
  - [ ] `npm test` → 146 tests pass, 0 failures
  - [ ] `node -e "delete require.cache[require.resolve('./scripts/load-config')]; const m = require('./scripts/install-core'); console.log(typeof m.discoverProfiles)"` → prints "function" (lazy loading works)
  - [ ] No module-level `loadConfig()` call in `install-core.js`
  - [ ] No module-level `let _configError` in `load-config.js`

  **QA Scenarios**:
  ```
  Scenario: Lazy config loading — module loads without side effects
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: node -e "const m = require('./scripts/install-core'); console.log(Object.keys(m).join(','))"
      2. Verify the require succeeds without errors (exit code 0)
      3. Verify output includes "discoverProfiles,parseArgs,runInstallation"
    Expected Result: Module loads, exports are present, no side effects triggered
    Failure Indicators: Require throws an error, or exports are missing
    Evidence: .sisyphus/evidence/task-1-lazy-load.txt

  Scenario: Config error propagation without singleton
    Tool: Bash
    Preconditions: None
    Steps:
      1. Run: npm test 2>&1
      2. Verify exit code is 0
      3. Verify output contains "pass 146" or higher and "fail 0"
    Expected Result: All existing tests pass without modification to test logic
    Failure Indicators: Any test failure, especially in load-config.test.js
    Evidence: .sisyphus/evidence/task-1-tests.txt
  ```

  **Commit**: YES
  - Message: `refactor(config): make config loading lazy and eliminate singleton error state`
  - Files: `scripts/load-config.js`, `scripts/install-core.js`, `scripts/install.js`
  - Pre-commit: `npm test`

- [ ] 2. Extract shared TUI utilities

  **What to do**:
  - Create `scripts/tui/ui/react-helpers.mjs` exporting `const h = React.createElement` and `contractHome` utility
  - Update all TUI `.mjs` files to import `h` from the shared module instead of declaring it locally
  - Move the `contractHome` function from `LoadingScreen.mjs:22-28` to the shared module
  - Files to update (remove local `const h = React.createElement`):
    - `scripts/tui/index.mjs`
    - `scripts/tui/App.mjs`
    - `scripts/tui/components/SelectionScreen.mjs`
    - `scripts/tui/components/ConfirmScreen.mjs`
    - `scripts/tui/components/RunScreen.mjs`
    - `scripts/tui/components/LoadingScreen.mjs`
    - `scripts/tui/components/PathEditOverlay.mjs`
    - `scripts/tui/components/DiffOverlay.mjs`
    - `scripts/tui/ui/primitives.mjs`
    - `scripts/tui/ui/actions.mjs`
    - `scripts/tui/ui/chrome.mjs`
  - That's 11 files to update (remove local declaration, add import)

  **Must NOT do**:
  - Do not introduce JSX or a build step
  - Do not change any component behavior or rendering

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Mechanical find-replace across 11 files + create 1 new file
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 3, 4, 5, 6)
  - **Blocks**: Task 9
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `scripts/tui/index.mjs:7` — Example of `const h = React.createElement;` to replace
  - `scripts/tui/components/LoadingScreen.mjs:22-28` — `contractHome` function to extract

  **WHY Each Reference Matters**:
  - `index.mjs:7` — Shows the exact pattern being replaced in all 11 files
  - `LoadingScreen.mjs:22-28` — This is the utility being moved to shared module

  **Acceptance Criteria**:
  - [ ] `grep -rc "const h = React.createElement" scripts/tui/` → exactly 1 match (the shared module)
  - [ ] `npm run lint` → `agent-lint: ok`
  - [ ] `node ./bin/ai-config.js --dry-run --all 2>&1 | head -5` → runs without import errors

  **QA Scenarios**:
  ```
  Scenario: TUI loads without import errors
    Tool: Bash
    Preconditions: npm install completed
    Steps:
      1. Run: node -e "import('./scripts/tui/index.mjs').then(m => console.log(typeof m.runInkInstaller))"
      2. Verify exit code 0
      3. Verify output is "function"
    Expected Result: ESM import chain resolves correctly through shared utility
    Failure Indicators: Import error, "undefined" output
    Evidence: .sisyphus/evidence/task-2-import-check.txt

  Scenario: No duplicate h declarations remain
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: grep -rc "const h = React.createElement" scripts/tui/
      2. Count total matches
    Expected Result: Exactly 1 match (in react-helpers.mjs only)
    Failure Indicators: More than 1 match
    Evidence: .sisyphus/evidence/task-2-dedup-check.txt
  ```

  **Commit**: YES (groups with Task 4)
  - Message: `chore(tui): extract shared utilities and remove dead code`
  - Files: `scripts/tui/ui/react-helpers.mjs`, all 11 TUI `.mjs` files
  - Pre-commit: `npm test`

- [ ] 3. Replace silent catch blocks with specific error handling

  **What to do**:
  - `scripts/load-config.js:109` — Replace `catch {}` with `catch (err) { /* skip unparseable YAML rule file */ }` and optionally log to stderr in verbose mode
  - `scripts/load-config.js:159` — Replace `catch {}` with `catch { /* config file doesn't exist yet, start fresh */ }` — this one is actually correct behavior, just add a comment
  - `scripts/install-core.js:50-52` — `fileExists` `catch {}` — Replace with `catch { return false; }` and add a comment that this intentionally catches ENOENT and permission errors
  - `scripts/install-core.js:63` — `safeCanonicalPath` `catch {}` — Same pattern, add comment
  - `scripts/install-core.js:74` — `relativeTarget` fallback `catch {}` — Add comment explaining the fallback
  - For each: decide if the catch should log to stderr (for `--verbose` mode support later). At minimum, add a descriptive comment explaining WHY the error is swallowed.

  **Must NOT do**:
  - Do not make previously-silent errors into thrown errors (that would change behavior)
  - Do not add console.error calls that would appear in normal output

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Adding comments and minimal logic to 5 catch blocks
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with Tasks 1, 2, 4, 5, 6)
  - **Blocks**: Task 10
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `scripts/load-config.js:100-109` — Rule YAML parsing loop with silent catch
  - `scripts/load-config.js:155-159` — Config read in writeSourceRoot with silent catch
  - `scripts/install-core.js:46-52` — fileExists with silent catch
  - `scripts/install-core.js:59-64` — safeCanonicalPath with silent catch
  - `scripts/install-core.js:70-77` — relativeTarget with silent catch

  **WHY Each Reference Matters**:
  - These are the exact 5 locations to modify — executor needs line numbers

  **Acceptance Criteria**:
  - [ ] `grep -c "catch {}" scripts/load-config.js scripts/install-core.js` → 0 matches
  - [ ] `npm test` → 146 tests pass, 0 failures (behavior unchanged)

  **QA Scenarios**:
  ```
  Scenario: No empty catch blocks remain
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: grep -n "catch {}" scripts/load-config.js scripts/install-core.js
      2. Verify no output (no matches)
    Expected Result: 0 matches — all catch blocks have comments or handling
    Failure Indicators: Any match found
    Evidence: .sisyphus/evidence/task-3-catch-check.txt

  Scenario: Existing tests still pass (behavior unchanged)
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: npm test 2>&1
      2. Verify exit code 0
      3. Verify "fail 0"
    Expected Result: All 146 tests pass
    Failure Indicators: Any test failure
    Evidence: .sisyphus/evidence/task-3-tests.txt
  ```

  **Commit**: YES (groups with Tasks 5, 6)
  - Message: `fix(core): replace silent catches, fix enabled logic, guard broken symlinks`
  - Files: `scripts/load-config.js`, `scripts/install-core.js`
  - Pre-commit: `npm test`

- [ ] 4. Remove dead ActionPreviewRow + unify column constants

  **What to do**:
  - Delete the `ActionPreviewRow` component from `scripts/tui/ui/actions.mjs:58-143` (85 lines)
  - Remove any export of `ActionPreviewRow` from that file
  - Verify no imports of `ActionPreviewRow` exist anywhere (there shouldn't be any)
  - Unify column width constants: `actions.mjs` defines `ACTION_COL=9, VIA_COL=10, TYPE_COL=6` and `SelectionScreen.mjs` defines `SEL_VIA_COL=7, SEL_TYPE_COL=5, SEL_ACTION_COL=9`
  - Choose ONE set of values. The `actions.mjs` values are used by `ActionLineHeader` and `ActionLine` (which appear in `ToolDetail`). The `SelectionScreen.mjs` values are used by `ActionSelector`. Pick the values that look best in the TUI and export them from `actions.mjs` for both consumers.
  - Update `SelectionScreen.mjs` to import the constants from `actions.mjs` instead of defining its own

  **Must NOT do**:
  - Do not change the behavior of any remaining component
  - Do not remove the `ActionLine` or `ActionLineHeader` components (they ARE used)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Delete dead code, unify constants — mechanical changes
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `scripts/tui/ui/actions.mjs:10-12` — Column constants in actions (ACTION_COL, VIA_COL, TYPE_COL)
  - `scripts/tui/ui/actions.mjs:58-143` — Dead `ActionPreviewRow` component to delete
  - `scripts/tui/components/SelectionScreen.mjs:173-175` — Duplicate column constants (SEL_VIA_COL, etc.)

  **WHY Each Reference Matters**:
  - `actions.mjs:58-143` — Exact code to delete
  - `actions.mjs:10-12` and `SelectionScreen.mjs:173-175` — The two sets of constants to unify

  **Acceptance Criteria**:
  - [ ] `grep -r "ActionPreviewRow" scripts/` → 0 matches
  - [ ] `grep -r "SEL_VIA_COL\|SEL_TYPE_COL\|SEL_ACTION_COL" scripts/` → 0 matches (replaced with shared constants)

  **QA Scenarios**:
  ```
  Scenario: Dead code removed
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: grep -r "ActionPreviewRow" scripts/
      2. Verify no output
    Expected Result: 0 matches
    Failure Indicators: Any match
    Evidence: .sisyphus/evidence/task-4-dead-code.txt

  Scenario: Column constants unified
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: grep -rn "SEL_VIA_COL\|SEL_TYPE_COL\|SEL_ACTION_COL" scripts/
      2. Verify no output
      3. Run: grep -c "ACTION_COL\|VIA_COL\|TYPE_COL" scripts/tui/ui/actions.mjs
      4. Verify constants are defined once
    Expected Result: Constants defined in one place, no duplicates
    Failure Indicators: Duplicate constant definitions
    Evidence: .sisyphus/evidence/task-4-constants.txt
  ```

  **Commit**: YES (groups with Task 2)
  - Message: `chore(tui): extract shared utilities and remove dead code`
  - Files: `scripts/tui/ui/actions.mjs`, `scripts/tui/components/SelectionScreen.mjs`
  - Pre-commit: `npm test`

- [ ] 5. Fix groupByTool enabled logic

  **What to do**:
  - In `scripts/tui/ui/format.mjs:23-25`, change the logic so that a group is disabled only if ALL profiles for that tool are disabled, not if ANY one is disabled
  - Current (wrong): `if (profile.enabled === false) { group.enabled = false; }`
  - Fixed: Track as `group.enabled = group.profiles.every(p => p.enabled !== false)` after the loop, or use a counter approach
  - Update the test in `tests/format.test.mjs` to cover the case where one profile is disabled but another is enabled (group should stay enabled)
  - Add a new test case: `"group.enabled is true when mix of enabled and disabled profiles"`

  **Must NOT do**:
  - Do not change the sort order logic (enabled-first sorting should remain)

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Single logic fix + 1-2 test additions
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `scripts/tui/ui/format.mjs:1-37` — Full `groupByTool` function
  - `tests/format.test.mjs:140-143` — Existing test for `enabled: false`

  **WHY Each Reference Matters**:
  - `format.mjs:23-25` — The exact bug location
  - `format.test.mjs:140-143` — Existing test to ensure backward compatibility

  **Acceptance Criteria**:
  - [ ] `npm test` → all format tests pass
  - [ ] New test: mixed enabled/disabled profiles → group.enabled is true

  **QA Scenarios**:
  ```
  Scenario: Mixed enabled profiles keep group enabled
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: npm test 2>&1 | grep -A2 "group.enabled"
      2. Verify new test passes
    Expected Result: New test for mixed enabled/disabled passes
    Failure Indicators: Test failure
    Evidence: .sisyphus/evidence/task-5-enabled-logic.txt
  ```

  **Commit**: YES (groups with Tasks 3, 6)
  - Message: `fix(core): replace silent catches, fix enabled logic, guard broken symlinks`
  - Files: `scripts/tui/ui/format.mjs`, `tests/format.test.mjs`
  - Pre-commit: `npm test`

- [ ] 6. Add previewDiff broken symlink guard

  **What to do**:
  - In `scripts/install-core.js`, before the `spawnSync("diff", ...)` call in `previewDiff()` (line 148-167), check if either `sourcePath` or `targetPath` is a broken symlink
  - A broken symlink is one where `fs.lstatSync(path).isSymbolicLink()` is true but `fs.existsSync(path)` is false (the target doesn't resolve)
  - If either is broken, return a descriptive string like `"symlink ${path} is broken (points to ${fs.readlinkSync(path)})"` without spawning the diff subprocess
  - This saves unnecessary subprocess spawns and produces a more helpful message

  **Must NOT do**:
  - Do not change the behavior for non-broken-symlink cases

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Add a guard clause before one function call
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: None
  - **Blocked By**: None

  **References**:

  **Pattern References**:
  - `scripts/install-core.js:148-167` — Current `previewDiff` function
  - `scripts/install-core.js:46-52` — `fileExists` helper already available

  **WHY Each Reference Matters**:
  - `install-core.js:148-167` — The exact function to add the guard to
  - `install-core.js:46-52` — Can reuse `fileExists` to check symlink resolution

  **Acceptance Criteria**:
  - [ ] `npm test` → all tests pass
  - [ ] Broken symlink test: `previewDiff` returns descriptive string without spawning diff

  **QA Scenarios**:
  ```
  Scenario: previewDiff handles broken symlinks gracefully
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: npm test 2>&1
      2. Verify all tests pass including inspectAction broken symlink tests
    Expected Result: All tests pass, broken symlink tests still work
    Failure Indicators: Test failures in broken symlink describe blocks
    Evidence: .sisyphus/evidence/task-6-broken-symlink.txt
  ```

  **Commit**: YES (groups with Tasks 3, 5)
  - Message: `fix(core): replace silent catches, fix enabled logic, guard broken symlinks`
  - Files: `scripts/install-core.js`
  - Pre-commit: `npm test`

- [ ] 7. Deduplicate ensureLink backup/replace branches

  **What to do**:
  - In `scripts/install-core.js`, the `ensureLink` function (line 524-630) has two nearly identical branches for handling existing targets: one for symlinks (lines 537-581) and one for non-symlinks (lines 582-620)
  - Both branches: build prompt → emit "prompt" → check dry-run → confirm → handle decline → backup → rename
  - The only differences are: (a) the `reason` string, (b) how content match is detected
  - Collapse into a single flow:
    1. Detect reason string based on symlink vs non-symlink
    2. Build prompt object
    3. Single shared path for: emit → dry-run check → confirm → backup → rename
  - This should reduce ~80 lines to ~40 lines

  **Must NOT do**:
  - Do not change the backup behavior or event emissions
  - Do not change when confirmReplacement is called
  - Do not change the summary counters

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Collapsing two identical code blocks into one — straightforward dedup
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with Tasks 8, 9, 10, 11)
  - **Blocks**: Task 12
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `scripts/install-core.js:524-630` — Full `ensureLink` function with duplicated branches
  - `scripts/install-core.js:537-581` — Symlink branch
  - `scripts/install-core.js:582-620` — Non-symlink branch

  **WHY Each Reference Matters**:
  - These three references show the exact duplication to collapse

  **Acceptance Criteria**:
  - [ ] `npm test` → all runInstallation tests pass
  - [ ] `ensureLink` function is ~40 lines shorter
  - [ ] All event types still emitted correctly (backup, prompt, skip, link)

  **QA Scenarios**:
  ```
  Scenario: Installation behavior unchanged after dedup
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: npm test 2>&1
      2. Check all "runInstallation" describe blocks pass
    Expected Result: All installation tests pass
    Failure Indicators: Any failure in runInstallation tests
    Evidence: .sisyphus/evidence/task-7-dedup.txt
  ```

  **Commit**: YES
  - Message: `refactor(core): deduplicate ensureLink backup/replace branches`
  - Files: `scripts/install-core.js`
  - Pre-commit: `npm test`

- [ ] 8. Merge sync/async inspection cache builders

  **What to do**:
  - `buildInspectionCache` (sync, line 437-450) and `buildInspectionCacheAsync` (async, line 452-477) share identical logic except the async version yields with `setImmediate` and calls `onProgress`
  - Remove the sync `buildInspectionCache` function
  - Rename `buildInspectionCacheAsync` to `buildInspectionCache`
  - Make the `onProgress` parameter optional (default to `null`)
  - Update the export and all call sites:
    - `scripts/install-core.js:665` — export
    - `scripts/install.js:8` — import
    - `scripts/tui/App.mjs:57` — usage
  - The sync call site in `install-core.js` (if any — check buildInspectionCache usage) should just `await` the now-always-async function
  - Update tests in `tests/install-core.test.js:355-391` to await the result

  **Must NOT do**:
  - Do not change the caching behavior or Map key format

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Merge two functions, update imports — mechanical
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `scripts/install-core.js:437-477` — Both cache builder functions side by side
  - `tests/install-core.test.js:355-391` — Tests for `buildInspectionCache`

  **WHY Each Reference Matters**:
  - `install-core.js:437-477` — The two functions to merge
  - `tests/install-core.test.js:355-391` — Tests that must be updated to await

  **Acceptance Criteria**:
  - [ ] `grep -c "buildInspectionCache" scripts/install-core.js` → function defined once (not twice)
  - [ ] `npm test` → all buildInspectionCache tests pass

  **QA Scenarios**:
  ```
  Scenario: Cache builder tests pass after merge
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: npm test 2>&1 | grep -A1 "buildInspectionCache"
      2. Verify all pass
    Expected Result: All buildInspectionCache tests pass
    Failure Indicators: Test failure
    Evidence: .sisyphus/evidence/task-8-cache-merge.txt
  ```

  **Commit**: YES
  - Message: `refactor(core): merge sync/async inspection cache builders`
  - Files: `scripts/install-core.js`, `tests/install-core.test.js`
  - Pre-commit: `npm test`

- [ ] 9. Fix selectedProfiles recomputation + source root validation

  **What to do**:
  - In `scripts/tui/App.mjs`, the run `useEffect` (line 311-371) recomputes `profilesToInstall` at line 316-321 with the same logic as the `selectedProfiles` useMemo at line 73-78. Use the already-memoized `selectedProfiles` instead.
  - **IMPORTANT**: The run effect takes a ref snapshot of `selectedActionKeys` (line 315: `const keysSnapshot = selectedActionKeysRef.current`). The memoized `selectedProfiles` also uses `selectedActionKeys`. Verify they're equivalent — the ref ensures the keys are frozen at effect-start time, but the useMemo also captures the same value. Using the memoized version is safe because the effect runs on `stage` change, and `selectedActionKeys` doesn't change between stage transitions.
  - Add source root validation in `scripts/install.js` (or `install-core.js`): after loading config, check if `sourceRoot` directory exists. If not, print a warning to stderr: `"Warning: source root ${sourceRoot} does not exist. Profiles may be empty."`
  - In the TUI's `handleSourceRootSubmit` (App.mjs:301-309), add a check: if the new path doesn't exist, show a warning but still save (user might be setting up for later)

  **Must NOT do**:
  - Do not block execution if source root doesn't exist (just warn)
  - Do not change the ref snapshot pattern for `selectedActionKeys`

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Remove redundant computation + add one validation check
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: None
  - **Blocked By**: Tasks 1, 2

  **References**:

  **Pattern References**:
  - `scripts/tui/App.mjs:73-78` — Memoized `selectedProfiles`
  - `scripts/tui/App.mjs:315-321` — Redundant recomputation in run effect
  - `scripts/tui/App.mjs:301-309` — `handleSourceRootSubmit` to add validation
  - `scripts/install.js:168-169` — Where to add source root validation check

  **WHY Each Reference Matters**:
  - `App.mjs:73-78` vs `App.mjs:315-321` — Shows the exact duplication
  - `install.js:168-169` — Insertion point for validation warning

  **Acceptance Criteria**:
  - [ ] `npm test` → all tests pass
  - [ ] No `profilesToInstall` recomputation in run effect
  - [ ] Source root validation warning present in install.js

  **QA Scenarios**:
  ```
  Scenario: Source root validation warns on non-existent path
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: AI_CONFIG_PATH=/tmp/test-config.yaml node -e "require('fs').writeFileSync('/tmp/test-config.yaml', 'sourceRoot: /nonexistent/path\nignore: []\n'); require('./scripts/install.js').main(['--help']).catch(()=>{})" 2>&1
      2. Check stderr for warning about non-existent source root
    Expected Result: Warning printed to stderr
    Failure Indicators: No warning
    Evidence: .sisyphus/evidence/task-9-validation.txt
  ```

  **Commit**: YES
  - Message: `fix(tui): remove redundant profile recomputation, add source root validation`
  - Files: `scripts/tui/App.mjs`, `scripts/install.js`
  - Pre-commit: `npm test`

- [ ] 10. Add --verbose and --quiet flags

  **What to do**:
  - Add `--verbose` and `--quiet` to `parseArgs` in `scripts/install-core.js`:
    - `--verbose` sets `options.verbose = true` (default: false)
    - `--quiet` sets `options.quiet = true` (default: false)
    - They are mutually exclusive — if both specified, last one wins
  - Update `printUsage` to show the new flags
  - In the plain installer (`scripts/install.js`), use the flags to control output:
    - `--verbose`: Show full diff output (not truncated), expanded source paths, hash values in event handler
    - `--quiet`: Suppress `ok`, `link`, `skip`, `mkdir` event output. Only show `error` events and the final summary
  - Verbose detail goes to stderr (`process.stderr.write`), normal output stays on stdout
  - Pass `verbose`/`quiet` through to `runInkInstaller` props so TUI can use them later (even if TUI doesn't act on them yet)
  - Add tests for the new parseArgs options

  **Must NOT do**:
  - Do not add complex logging frameworks — simple if/else on the options
  - Do not change TUI rendering behavior (just pass the options through)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Touches parseArgs, printUsage, event handler, TUI props — moderate scope
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Tasks 12, 14
  - **Blocked By**: Tasks 1, 3

  **References**:

  **Pattern References**:
  - `scripts/install-core.js:256-317` — Current `parseArgs` function to extend
  - `scripts/install-core.js:319-331` — `printUsage` to update
  - `scripts/install.js:89-147` — Plain installer event handler to conditionally suppress
  - `scripts/install.js:190-200` — Props passed to `runInkInstaller`

  **WHY Each Reference Matters**:
  - `install-core.js:256-317` — Where to add new flag parsing
  - `install.js:89-147` — Where verbose/quiet behavior is applied
  - `install.js:190-200` — Where to pass new options through to TUI

  **Acceptance Criteria**:
  - [ ] `node ./bin/ai-config.js --help` → shows --verbose and --quiet
  - [ ] `node ./bin/ai-config.js --verbose --help` → no error
  - [ ] `node ./bin/ai-config.js --quiet --help` → no error
  - [ ] `npm test` → parseArgs tests pass including new flag tests

  **QA Scenarios**:
  ```
  Scenario: --verbose flag parsed correctly
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: node -e "const {parseArgs} = require('./scripts/install-core'); console.log(JSON.stringify(parseArgs(['--verbose'])))"
      2. Verify output contains "verbose":true
    Expected Result: verbose=true in parsed options
    Failure Indicators: verbose missing or false
    Evidence: .sisyphus/evidence/task-10-verbose-parse.txt

  Scenario: --quiet flag parsed correctly
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: node -e "const {parseArgs} = require('./scripts/install-core'); console.log(JSON.stringify(parseArgs(['--quiet'])))"
      2. Verify output contains "quiet":true
    Expected Result: quiet=true in parsed options
    Failure Indicators: quiet missing or false
    Evidence: .sisyphus/evidence/task-10-quiet-parse.txt
  ```

  **Commit**: YES
  - Message: `feat(cli): add --verbose and --quiet flags`
  - Files: `scripts/install-core.js`, `scripts/install.js`
  - Pre-commit: `npm test`

- [ ] 11. Move inferItemType to rule YAML (optional field)

  **What to do**:
  - Currently `inferItemType` in `install-core.js:79-86` guesses item type from source path strings. This is fragile.
  - Add an optional `itemType` field to the mapping schema in rule YAML files. Example:
    ```yaml
    mappings:
      - type: skills
        source: skills
        target: skills
        itemType: skill
    ```
  - Update `normalizeRule` in `load-config.js` to pass through `mapping.itemType` if present
  - Update `inferItemType` to check `mapping.itemType` first, falling back to the current string-splitting logic
  - Update the 6 bundled rule YAML files to include `itemType` on each mapping
  - Do NOT make `itemType` required — the fallback preserves backward compatibility for user-defined rules

  **Must NOT do**:
  - Do not make `itemType` a required field (would break user rules)
  - Do not change the rule file validation in agent-lint.sh

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: Add optional field to YAML schema + update 6 files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: Task 15
  - **Blocked By**: Task 1

  **References**:

  **Pattern References**:
  - `scripts/install-core.js:79-86` — Current `inferItemType` function
  - `scripts/load-config.js:62-72` — `normalizeRule` where itemType should be passed through
  - `rules/claude.yaml` — Example rule file to add itemType to

  **WHY Each Reference Matters**:
  - `install-core.js:79-86` — The fragile logic to add a fallback guard for
  - `load-config.js:62-72` — Where the new field gets preserved
  - `rules/claude.yaml` — Template for the 6 rule files to update

  **Acceptance Criteria**:
  - [ ] `npm test` → all tests pass
  - [ ] All 6 rule YAML files have `itemType` on each mapping
  - [ ] `inferItemType` checks `mapping.itemType` first

  **QA Scenarios**:
  ```
  Scenario: itemType from YAML takes precedence
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: npm test 2>&1
      2. Verify all discoverProfiles tests pass
    Expected Result: All tests pass, itemType used when present
    Failure Indicators: Test failure
    Evidence: .sisyphus/evidence/task-11-itemtype.txt
  ```

  **Commit**: YES
  - Message: `refactor(rules): add optional itemType to mapping schema`
  - Files: `scripts/install-core.js`, `scripts/load-config.js`, `rules/*.yaml`
  - Pre-commit: `npm test`

- [ ] 12. Add lockfile for installed state

  **What to do**:
  - After `runInstallation` completes (not dry-run), write an `installed.json` lockfile to `~/.config/ai-config/installed.json`
  - Lockfile format:
    ```json
    {
      "version": 1,
      "updatedAt": "2026-03-12T...",
      "sourceRoot": "/path/to/repo",
      "links": [
        {
          "source": "/absolute/source/path",
          "target": "/absolute/target/path",
          "profileId": "claude-skills-skills",
          "tool": "claude"
        }
      ]
    }
    ```
  - Add a `writeLockfile(summary, selectedProfiles, sourceRoot)` function to `install-core.js`
  - Call it from the `session-complete` event handler (only when not dry-run and no errors)
  - Add a `readLockfile()` function that reads and parses the lockfile (returns null if absent)
  - Export both functions for use by `--check` and `--uninstall` commands
  - Use the `CONFIG_DIR` constant for the lockfile directory

  **Must NOT do**:
  - Do not write the lockfile during dry-run
  - Do not fail if the lockfile can't be written (warn to stderr, continue)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New feature with JSON schema design, read/write, error handling
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3 (with Tasks 13, 14)
  - **Blocks**: Tasks 13, 14
  - **Blocked By**: Tasks 7, 10

  **References**:

  **Pattern References**:
  - `scripts/install-core.js:497-660` — `runInstallation` function where lockfile write goes
  - `scripts/load-config.js:10` — `CONFIG_DIR` constant for lockfile path

  **WHY Each Reference Matters**:
  - `install-core.js:497-660` — Insertion point for lockfile write after session-complete
  - `load-config.js:10` — Directory for lockfile storage

  **Acceptance Criteria**:
  - [ ] `npm test` → all tests pass
  - [ ] `readLockfile` and `writeLockfile` exported from install-core.js
  - [ ] Lockfile written after successful non-dry-run installation

  **QA Scenarios**:
  ```
  Scenario: Lockfile written after live installation
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Create a temp directory and run a test installation
      2. Check that installed.json exists in the config directory
      3. Parse the JSON and verify it has version, links array
    Expected Result: Valid JSON lockfile with links array
    Failure Indicators: File missing or invalid JSON
    Evidence: .sisyphus/evidence/task-12-lockfile.txt

  Scenario: Lockfile NOT written during dry-run
    Tool: Bash
    Preconditions: Task complete
    Steps:
      1. Run: node ./bin/ai-config.js --dry-run --all 2>&1
      2. Check config directory for installed.json
    Expected Result: No lockfile created
    Failure Indicators: Lockfile exists after dry-run
    Evidence: .sisyphus/evidence/task-12-lockfile-dryrun.txt
  ```

  **Commit**: YES (groups with Tasks 13, 14)
  - Message: `feat(cli): add lockfile, --uninstall, and --check commands`
  - Files: `scripts/install-core.js`, `scripts/load-config.js`
  - Pre-commit: `npm test`

- [ ] 13. Add --uninstall command

  **What to do**:
  - Add `--uninstall` flag to `parseArgs` in `install-core.js`
  - When `--uninstall` is specified:
    1. Read the lockfile via `readLockfile()`
    2. If no lockfile exists, print error and exit 1
    3. For each link in the lockfile:
       a. Check if target exists and is a symlink (`fs.lstatSync().isSymbolicLink()`)
       b. Check if the symlink points into `sourceRoot` (`fs.readlinkSync()` resolves to a path under sourceRoot)
       c. If both checks pass, remove with `fs.unlinkSync(target)` — **NEVER use `fs.rmSync()`**
       d. If the symlink points elsewhere, skip it (don't remove symlinks we didn't create)
    4. After removal, update the lockfile to remove unlinked entries
    5. Print summary: N removed, N skipped (foreign), N missing
  - Support `--dry-run` with `--uninstall` (show what would be removed without removing)
  - Support `--profile` with `--uninstall` (only remove specific profiles)
  - Add to `printUsage` output

  **Must NOT do**:
  - NEVER use `fs.rmSync()` on symlinks (Node.js v24+ bug)
  - Do not remove regular files or directories — only symlinks
  - Do not remove symlinks pointing to paths outside sourceRoot

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: New feature with safety-critical symlink removal, dry-run support, lockfile integration
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 15
  - **Blocked By**: Task 12

  **References**:

  **Pattern References**:
  - `scripts/install-core.js:256-317` — `parseArgs` to extend
  - `scripts/install-core.js:46-52` — `fileExists` helper
  - `scripts/install-core.js:55-57` — `canonicalPath` helper

  **WHY Each Reference Matters**:
  - `install-core.js:256-317` — Where to add --uninstall parsing
  - `install-core.js:46-57` — Existing helpers for symlink checking

  **Acceptance Criteria**:
  - [ ] `node ./bin/ai-config.js --help` → shows --uninstall
  - [ ] `node ./bin/ai-config.js --uninstall --dry-run` → shows what would be removed (or "no lockfile")
  - [ ] No `fs.rmSync` calls for symlink removal
  - [ ] `npm test` → all tests pass

  **QA Scenarios**:
  ```
  Scenario: --uninstall with no lockfile gives clear error
    Tool: Bash
    Preconditions: Task complete, no lockfile exists
    Steps:
      1. Run: AI_CONFIG_DIR=/tmp/no-lockfile node ./bin/ai-config.js --uninstall 2>&1
      2. Check exit code is 1
      3. Check output mentions "no lockfile" or similar
    Expected Result: Clear error message, exit 1
    Failure Indicators: Crashes, exit 0, or unclear error
    Evidence: .sisyphus/evidence/task-13-uninstall-no-lockfile.txt

  Scenario: --uninstall --dry-run shows removals without acting
    Tool: Bash
    Preconditions: Task complete, lockfile exists from prior installation
    Steps:
      1. Run: node ./bin/ai-config.js --uninstall --dry-run 2>&1
      2. Verify output lists symlinks that would be removed
      3. Verify symlinks still exist after command
    Expected Result: Lists targets, no actual removal
    Failure Indicators: Symlinks actually removed during dry-run
    Evidence: .sisyphus/evidence/task-13-uninstall-dryrun.txt
  ```

  **Commit**: YES (groups with Task 12)
  - Message: `feat(cli): add lockfile, --uninstall, and --check commands`
  - Files: `scripts/install-core.js`, `scripts/install.js`
  - Pre-commit: `npm test`

- [ ] 14. Add --check mode

  **What to do**:
  - Add `--check` flag to `parseArgs` in `install-core.js`
  - When `--check` is specified:
    1. Read the lockfile via `readLockfile()`. If no lockfile, also discover profiles and check ALL actions.
    2. For each link entry (from lockfile or discovered profiles):
       a. Run `inspectAction({ source, target })` to get the current state
       b. If kind is `already-linked`: mark as "in sync"
       c. If kind is anything else: mark as "out of sync"
    3. Print summary to stdout: "N in sync, M out of sync"
    4. If `--verbose`, print each out-of-sync item with details
    5. Exit code: 0 if ALL in sync, 1 if ANY out of sync
  - Support with `--profile` to check specific profiles only
  - Add to `printUsage` output

  **Must NOT do**:
  - Do not modify any files during --check (read-only operation)
  - Do not exit 2 for usage errors (keep existing exit(1) pattern — exit 2 is nice-to-have, not required)

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: New read-only feature integrating lockfile + inspection
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: Task 15
  - **Blocked By**: Tasks 10, 12

  **References**:

  **Pattern References**:
  - `scripts/install-core.js:345-435` — `inspectAction` function to reuse
  - `scripts/install-core.js:256-317` — `parseArgs` to extend

  **WHY Each Reference Matters**:
  - `install-core.js:345-435` — Core inspection logic to reuse for check
  - `install-core.js:256-317` — Where to add flag parsing

  **Acceptance Criteria**:
  - [ ] `node ./bin/ai-config.js --help` → shows --check
  - [ ] `node ./bin/ai-config.js --check` → exits 0 or 1 based on sync state
  - [ ] No file modifications during --check
  - [ ] `npm test` → all tests pass

  **QA Scenarios**:
  ```
  Scenario: --check exits 0 when all in sync
    Tool: Bash
    Preconditions: All symlinks are current (just ran installation)
    Steps:
      1. Run: node ./bin/ai-config.js --check 2>/dev/null; echo $?
      2. Verify exit code is 0
    Expected Result: Exit 0
    Failure Indicators: Exit 1 when everything is in sync
    Evidence: .sisyphus/evidence/task-14-check-insync.txt

  Scenario: --check exits 1 when out of sync
    Tool: Bash
    Preconditions: Remove one symlink that should exist
    Steps:
      1. Remove a known symlink
      2. Run: node ./bin/ai-config.js --check 2>/dev/null; echo $?
      3. Verify exit code is 1
    Expected Result: Exit 1
    Failure Indicators: Exit 0 when things are out of sync
    Evidence: .sisyphus/evidence/task-14-check-outsync.txt
  ```

  **Commit**: YES (groups with Tasks 12, 13)
  - Message: `feat(cli): add lockfile, --uninstall, and --check commands`
  - Files: `scripts/install-core.js`, `scripts/install.js`
  - Pre-commit: `npm test`

- [ ] 15. Add tests for all new features

  **What to do**:
  - Add to `tests/install-core.test.js`:
    - `parseArgs` tests for `--verbose`, `--quiet`, `--check`, `--uninstall`
    - `--verbose` and `--quiet` mutually exclusive behavior
    - `readLockfile` / `writeLockfile` tests:
      - Writes valid JSON
      - Reads back correctly
      - Returns null when file absent
      - Handles corrupt lockfile gracefully
    - `--uninstall` tests:
      - Removes symlinks pointing into sourceRoot
      - Skips foreign symlinks
      - Skips non-symlinks
      - Dry-run doesn't remove
      - Works with --profile filter
      - Uses `unlinkSync`, not `rmSync` (verify via test behavior)
    - `--check` tests:
      - Returns 0 when all in sync
      - Returns 1 when out of sync
      - Works without lockfile (discovers profiles)
  - Add to `tests/load-config.test.js`:
    - `normalizeRule` preserves `itemType` from mapping
    - `normalizeRule` omits `itemType` when absent (backward compat)
  - Add to `tests/format.test.mjs`:
    - Mixed enabled/disabled profiles test (from Task 5)
  - Update the `package.json` test script if any new test files are added

  **Must NOT do**:
  - Do not modify existing test assertions (only add new tests)
  - Do not create new test files — add to existing ones

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Comprehensive test additions across 3 test files
  - **Skills**: []

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Sequential (after all Wave 3 features)
  - **Blocks**: Final Verification
  - **Blocked By**: Tasks 10, 11, 12, 13, 14

  **References**:

  **Pattern References**:
  - `tests/install-core.test.js:88-154` — Existing `parseArgs` test pattern to follow
  - `tests/install-core.test.js:572-629` — Existing `runInstallation` dry-run tests to follow
  - `tests/load-config.test.js:165-315` — Existing `loadRules` tests to follow
  - `tests/helpers.js` — Test utilities available

  **WHY Each Reference Matters**:
  - These show the exact test patterns (assertions, setup/teardown, temp dirs) to follow

  **Acceptance Criteria**:
  - [ ] `npm test` → 170+ tests pass, 0 failures
  - [ ] New tests cover all new parseArgs flags
  - [ ] New tests cover lockfile read/write
  - [ ] New tests cover --uninstall safety (unlinkSync, not rmSync)
  - [ ] New tests cover --check exit codes

  **QA Scenarios**:
  ```
  Scenario: All new tests pass
    Tool: Bash
    Preconditions: All prior tasks complete
    Steps:
      1. Run: npm test 2>&1
      2. Verify exit code 0
      3. Verify test count is >= 170
      4. Verify "fail 0"
    Expected Result: 170+ tests, 0 failures
    Failure Indicators: Any failure or test count < 170
    Evidence: .sisyphus/evidence/task-15-all-tests.txt
  ```

  **Commit**: YES
  - Message: `test: add tests for new CLI features and refactored modules`
  - Files: `tests/install-core.test.js`, `tests/load-config.test.js`, `tests/format.test.mjs`
  - Pre-commit: `npm test`

---

## Final Verification Wave

> 4 review agents run in PARALLEL. ALL must APPROVE. Rejection → fix → re-run.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Read the plan end-to-end. For each "Must Have": verify implementation exists (read file, run command). For each "Must NOT Have": search codebase for forbidden patterns — reject with file:line if found. Check evidence files exist in .sisyphus/evidence/. Compare deliverables against plan.
  Output: `Must Have [N/N] | Must NOT Have [N/N] | Tasks [N/N] | VERDICT: APPROVE/REJECT`

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run `npm test` + `npm run lint`. Review all changed files for: empty catches (should be gone), `as any`/`@ts-ignore`, console.log in prod paths, commented-out code, unused imports. Check AI slop: excessive comments, over-abstraction, generic names. Verify no `ActionPreviewRow` anywhere.
  Output: `Tests [N pass/N fail] | Lint [PASS/FAIL] | Files [N clean/N issues] | VERDICT`

- [ ] F3. **Real Manual QA** — `unspecified-high`
  Run `node ./bin/ai-config.js --help` and verify new flags shown. Run `node ./bin/ai-config.js --check` and verify exit code. Run `node ./bin/ai-config.js --dry-run --all` and verify output. Run `node ./bin/ai-config.js --uninstall --dry-run` and verify output. Test `--verbose` and `--quiet` flags. Save terminal output to evidence.
  Output: `Scenarios [N/N pass] | VERDICT`

- [ ] F4. **Scope Fidelity Check** — `deep`
  For each task: read "What to do", read actual diff (git log/diff). Verify 1:1 — everything in spec was built, nothing beyond spec was built. Check "Must NOT do" compliance. Detect cross-task contamination. Flag unaccounted changes.
  Output: `Tasks [N/N compliant] | Contamination [CLEAN/N issues] | Unaccounted [CLEAN/N files] | VERDICT`

---

## Commit Strategy

- **Wave 1**: `refactor(config): make config loading lazy and injectable` — scripts/load-config.js, scripts/install-core.js
- **Wave 1**: `chore(tui): extract shared utilities and remove dead code` — scripts/tui/ui/*.mjs, scripts/tui/components/*.mjs
- **Wave 1**: `fix(core): replace silent catches, fix enabled logic, guard broken symlinks` — scripts/install-core.js, scripts/load-config.js, scripts/tui/ui/format.mjs
- **Wave 2**: `refactor(core): deduplicate ensureLink, merge cache builders, fix recomputation` — scripts/install-core.js, scripts/tui/App.mjs
- **Wave 2**: `feat(cli): add --verbose and --quiet flags` — scripts/install-core.js, scripts/install.js
- **Wave 3**: `feat(cli): add lockfile, --uninstall, and --check commands` — scripts/install-core.js, scripts/install.js, tests/*.js
- **Wave 3**: `test: add tests for new CLI features` — tests/*.js

---

## Success Criteria

### Verification Commands
```bash
npm test                                    # Expected: 146+ tests, 0 failures
npm run lint                                # Expected: agent-lint: ok
node ./bin/ai-config.js --help              # Expected: shows --verbose, --quiet, --check, --uninstall
node ./bin/ai-config.js --check 2>/dev/null # Expected: exit 0 or 1
node ./bin/ai-config.js --uninstall --dry-run --all  # Expected: lists symlinks, no changes
grep -r "ActionPreviewRow" scripts/         # Expected: no matches
grep -rc "const h = React.createElement" scripts/tui/ # Expected: 1 match (shared utility only)
```

### Final Checklist
- [ ] All "Must Have" present
- [ ] All "Must NOT Have" absent
- [ ] All 146+ tests pass
- [ ] Lint passes
- [ ] New flags work correctly
- [ ] No dead code remains
- [ ] No duplicate utilities
