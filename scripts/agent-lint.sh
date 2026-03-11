#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "${script_dir}/.." && pwd)"
cd "${repo_root}"

failures=0

fail() {
  echo "FAIL: $1" >&2
  failures=1
}

require_dir() {
  local path="$1"
  [[ -d "${path}" ]] || fail "missing directory: ${path}"
}

require_file() {
  local path="$1"
  [[ -f "${path}" ]] || fail "missing file: ${path}"
}

require_nonempty() {
  local path="$1"
  [[ -s "${path}" ]] || fail "empty file: ${path}"
}

require_executable() {
  local path="$1"
  [[ -x "${path}" ]] || fail "not executable: ${path}"
}

require_json() {
  local path="$1"
  node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' "${path}" >/dev/null 2>&1 \
    || fail "invalid JSON: ${path}"
}

require_no_matches() {
  local description="$1"
  shift
  mapfile -t matches < <(find "$@" 2>/dev/null | sort)
  if (( ${#matches[@]} > 0 )); then
    fail "${description}: ${matches[*]}"
  fi
}

require_dir "scripts"
require_dir ".husky"
require_dir "bin"

require_file "scripts/install.js"
require_executable "scripts/install.js"
require_file "scripts/install-core.js"
require_executable "scripts/install-core.js"
require_file "scripts/install-ui.mjs"
require_nonempty "scripts/install-ui.mjs"
require_file "scripts/agent-lint.sh"
require_executable "scripts/agent-lint.sh"
require_file "bin/saddle.js"
require_executable "bin/saddle.js"
require_file ".husky/pre-commit"
require_executable ".husky/pre-commit"
require_file "package.json"
require_json "package.json"

node <<'EOF' >/dev/null 2>&1 || fail "package.json is missing required fields or scripts"
const fs = require("fs");
const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
if (!pkg.name) process.exit(1);
if (!pkg.version) process.exit(1);
if (!pkg.license) process.exit(1);
if (!["husky", "husky || true"].includes(pkg.scripts?.prepare)) process.exit(1);
if (pkg.scripts?.["lint:agents"] !== "bash ./scripts/agent-lint.sh") process.exit(1);
const binVal = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.["saddle"];
if (!binVal || !binVal.includes("bin/saddle.js")) process.exit(1);
if (!pkg.dependencies?.ink) process.exit(1);
if (!pkg.dependencies?.react) process.exit(1);
if (!pkg.dependencies?.["@inkjs/ui"]) process.exit(1);
if (!pkg.devDependencies?.husky) process.exit(1);
EOF

if ! grep -q 'npm run lint:agents' .husky/pre-commit; then
  fail ".husky/pre-commit does not run npm run lint:agents"
fi

if ! grep -q 'install-ui.mjs' scripts/install.js; then
  fail "scripts/install.js must load the Ink UI entrypoint"
fi

if ! grep -q 'discoverProfiles' scripts/install-core.js; then
  fail "scripts/install-core.js must expose discoverProfiles"
fi

if ! grep -q 'config\.rules' scripts/install-core.js; then
  fail "scripts/install-core.js must use config-driven rules"
fi

if ! grep -q 'loadRules' scripts/load-config.js; then
  fail "scripts/load-config.js must define loadRules"
fi

if ! grep -rq 'Preview' scripts/tui/; then
  fail "scripts/tui must render a preview panel"
fi

if ! grep -rq 'inspectProfile' scripts/tui/; then
  fail "scripts/tui must use profile inspection data"
fi

if ! grep -q 'buildInspectionCache' scripts/install.js; then
  fail "scripts/install.js must build an inspection cache for the TUI"
fi

if ! grep -rq 'ConfirmInput' scripts/tui/; then
  fail "scripts/tui must use Ink UI confirm input"
fi

if (( failures != 0 )); then
  exit 1
fi

echo "agent-lint: ok"
