#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const readline = require("readline/promises");
const { detectInstalledTools } = require("./install-core.js");
const { applyReorgPlan, buildReorgPlan, scanReorg, summarizePlan } = require("./reorg-core.js");
const { CONFIG_PATH, writeReorgSettings } = require("./load-config.js");

function parseReorgArgs(argv) {
  const options = {
    dryRun: false,
    assumeYes: false,
    json: false,
    check: false,
    help: false,
    quiet: false,
    sourceRoot: null,
    strategy: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "reorg") continue;
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--yes") options.assumeYes = true;
    else if (arg === "--json") {
      options.json = true;
      options.dryRun = true;
    } else if (arg === "--check") options.check = true;
    else if (arg === "--quiet") options.quiet = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (arg === "--source") {
      if (!argv[index + 1]) throw new Error("--source requires a path");
      options.sourceRoot = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--source=")) {
      options.sourceRoot = arg.slice("--source=".length);
    } else if (arg === "--strategy") {
      if (!argv[index + 1]) throw new Error("--strategy requires universal-first or provider-only");
      options.strategy = argv[index + 1];
      index += 1;
    } else if (arg.startsWith("--strategy=")) {
      options.strategy = arg.slice("--strategy=".length);
    } else {
      throw new Error(`Unknown reorg argument: ${arg}`);
    }
  }

  if (options.strategy && !["universal-first", "provider-only"].includes(options.strategy)) {
    throw new Error("--strategy must be universal-first or provider-only");
  }
  return options;
}

function printReorgUsage() {
  process.stdout.write(
    [
      "Usage: saddle reorg [options]",
      "",
      "Detect existing agent configuration, move it into one source root, and create symlinks.",
      "",
      "Options:",
      "  --source path        Canonical source root for imported configuration",
      "  --strategy value     universal-first or provider-only",
      "  --dry-run            Print the plan without changing files",
      "  --json               Print the plan as JSON without changing files",
      "  --check              Exit 1 when reorganization work or conflicts remain",
      "  --yes                Apply a conflict-free plan without prompting",
      "  --quiet              Suppress per-action output",
      "  --help, -h           Show this help",
      "",
      "Configuration precedence:",
      "  --source, SADDLE_SOURCE_ROOT, sourceRoot in config.yaml, interactive prompt",
      "  --strategy, SADDLE_LINK_STRATEGY, linkStrategy in config.yaml",
      "",
    ].join("\n"),
  );
}

function expandUserPath(value) {
  if (!value) return null;
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return path.resolve(value);
}

async function promptForSourceRoot() {
  const suggested = path.join(os.homedir(), ".config", "saddle", "shared");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = (await rl.question(`Canonical source root [${suggested}]: `)).trim();
    return expandUserPath(answer || suggested);
  } finally {
    rl.close();
  }
}

function printPlan(plan) {
  const counts = summarizePlan(plan);
  process.stdout.write(`\nReorganization plan ${plan.id}\n`);
  process.stdout.write(`Source:   ${plan.sourceRoot}\n`);
  process.stdout.write(`Strategy: ${plan.strategy}\n\n`);

  const supportedCoverage = plan.coverage.filter((item) => item.supported);
  const unsupportedCoverage = plan.coverage.filter((item) => !item.supported);
  if (supportedCoverage.length > 0) {
    process.stdout.write("Coverage\n");
    for (const item of supportedCoverage) {
      process.stdout.write(`  ${item.toolLabel} / ${item.kind}: ${item.targetClass} -> ${item.endpoints.join(", ")}\n`);
    }
  }
  if (unsupportedCoverage.length > 0) {
    process.stdout.write("Not covered\n");
    for (const item of unsupportedCoverage) {
      process.stdout.write(`  ${item.toolLabel} / ${item.kind}: no target for ${plan.strategy}\n`);
    }
  }

  process.stdout.write("\nChanges\n");
  process.stdout.write(`  ${counts.import} import\n`);
  process.stdout.write(`  ${counts.universal} universal link\n`);
  process.stdout.write(`  ${counts.provider} provider link\n`);
  process.stdout.write(`  ${counts.remove} duplicate removal\n`);
  process.stdout.write(`  ${counts.unchanged} unchanged\n`);
  process.stdout.write(`  ${counts.conflicts} conflict\n`);

  if (plan.actions.length > 0) {
    process.stdout.write("\nActions\n");
    for (const action of plan.actions) {
      const arrow = action.type === "remove-duplicate" ? "remove" : `${action.source} ->`;
      process.stdout.write(`  ${action.type.padEnd(16)} ${arrow} ${action.target}\n`);
    }
  }

  if (plan.conflicts.length > 0) {
    process.stdout.write("\nConflicts\n");
    for (const conflict of plan.conflicts) {
      process.stdout.write(`  ${conflict.kind}/${conflict.name}: ${conflict.reason}\n`);
      for (const source of conflict.sources) process.stdout.write(`    ${source.path}\n`);
    }
  }
  process.stdout.write("\n");
}

function applyWithOutput(plan, options) {
  return applyReorgPlan(plan, {
    onEvent: (event) => {
      if (options.quiet) return;
      if (event.type === "action-complete") {
        process.stdout.write(`${event.action.type.padEnd(16)} ${event.action.target}\n`);
      }
      if (event.type === "rollback") process.stderr.write(`Rollback: ${event.error}\n`);
    },
  });
}

async function runReorg(argv, config) {
  const options = parseReorgArgs(argv);
  if (options.help) {
    printReorgUsage();
    return { status: "help" };
  }

  let sourceRoot = expandUserPath(options.sourceRoot) || expandUserPath(config.configuredSourceRoot);
  const strategy = options.strategy || config.linkStrategy || "universal-first";
  let shouldPersistSettings = Boolean(options.sourceRoot || options.strategy);

  if (!sourceRoot && process.stdin.isTTY && process.stdout.isTTY) {
    sourceRoot = await promptForSourceRoot();
    shouldPersistSettings = true;
  }
  if (!sourceRoot) {
    throw new Error(
      `No source root configured. Use --source, SADDLE_SOURCE_ROOT, or set sourceRoot in ${CONFIG_PATH}.`,
    );
  }

  const detection = detectInstalledTools(config);
  const scan = scanReorg({
    rules: config.rules,
    detection,
    sourceRoot,
    expandHome: config.expandHome,
  });
  const plan = buildReorgPlan({ scan, strategy });

  if (options.json) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return { status: "planned", plan };
  }

  if (options.check) {
    printPlan(plan);
    process.exitCode = plan.hasChanges || plan.conflicts.length > 0 ? 1 : 0;
    return { status: process.exitCode === 0 ? "clean" : "drift", plan };
  }

  if (options.dryRun) {
    printPlan(plan);
    return { status: "planned", plan };
  }

  if (plan.conflicts.length > 0) {
    if (!options.assumeYes && process.stdin.isTTY && process.stdout.isTTY) {
      const { runInkReorg } = await import("./install-ui.mjs");
      await runInkReorg({ plan, applyReorgPlan });
    } else {
      printPlan(plan);
    }
    process.exitCode = 1;
    return { status: "conflicts", plan };
  }

  if (!plan.hasChanges) {
    process.stdout.write(`Already unified. No changes for ${sourceRoot}.\n`);
    return { status: "clean", plan };
  }

  let result;
  if (!options.assumeYes && process.stdin.isTTY && process.stdout.isTTY) {
    const { runInkReorg } = await import("./install-ui.mjs");
    result = await runInkReorg({ plan, applyReorgPlan });
    if (result.error) {
      process.exitCode = 1;
      return { status: "failed", plan, result };
    }
    if (!result.applied) return { status: "cancelled", plan };
  } else {
    if (!options.assumeYes) {
      throw new Error("Non-interactive reorganization requires --yes, --dry-run, --json, or --check.");
    }
    printPlan(plan);
    result = await applyWithOutput(plan, options);
  }

  if (shouldPersistSettings || !fs.existsSync(CONFIG_PATH)) {
    writeReorgSettings({ sourceRoot, linkStrategy: strategy });
  }
  process.stdout.write(
    `Reorganization complete. ${result.applied} action${result.applied === 1 ? "" : "s"} applied.\n`,
  );
  return { status: "applied", plan, result };
}

module.exports = {
  expandUserPath,
  parseReorgArgs,
  printPlan,
  printReorgUsage,
  runReorg,
};
