#!/usr/bin/env node

"use strict";

const fs = require("fs");
const readline = require("readline/promises");
const { version } = require("../package.json");
const {
  buildInspectionCache,
  getDefaultRepoRoot,
  detectInstalledTools,
  discoverProfiles,
  inspectProfile,
  parseArgs,
  printProfiles,
  printUsage,
  runCheck,
  runUninstall,
  runInstallation,
  writeLockfile,
} = require("./install-core.js");
const { CONFIG_PATH, loadConfig, writeSourceRoot, writeDefaultConfig } = require("./load-config.js");

function standaloneProfileLabel(profile) {
  return `${profile.toolLabel} / ${profile.label}`;
}

async function handleInvalidConfig(configError) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write(`Invalid config: ${CONFIG_PATH}: ${configError}\nRe-run interactively to restore defaults.\n`);
    process.exit(1);
  }

  process.stdout.write(`\nInvalid config: ${CONFIG_PATH}\n  ${configError}\n\n[d] restore defaults  [x] exit: `);

  return new Promise((resolve) => {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.once("data", (chunk) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      const key = chunk.toString("utf8").toLowerCase();
      if (key === "d") {
        process.stdout.write("restore defaults\n");
        resolve("defaults");
      } else {
        process.stdout.write("exit\n");
        resolve("exit");
      }
    });
  });
}

async function runPlainInstaller({ profiles, options, initialSelectedIds, sourceRoot }) {
  const selectedIds = initialSelectedIds || (() => {
    if (!process.stdin.isTTY) {
      throw new Error("No profile selection provided. Re-run with --all or --profile in non-interactive mode.");
    }

    return profiles.filter((profile) => profile.recommended && !profile.informational).map((profile) => profile.id);
  })();

  const unknownProfiles = selectedIds.filter((id) => !profiles.some((profile) => profile.id === id));
  if (unknownProfiles.length > 0) {
    throw new Error(`Unknown profile ids: ${unknownProfiles.join(", ")}`);
  }

  const selectedProfiles = profiles.filter((profile) => selectedIds.includes(profile.id) && !profile.informational);
  if (selectedProfiles.length === 0) {
    console.log("No setup profiles selected.");
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("");
    console.log("Selected profiles:");
    for (const profile of selectedProfiles) {
      console.log(`- ${standaloneProfileLabel(profile)} (${profile.actions.length} link${profile.actions.length === 1 ? "" : "s"})`);
    }
    console.log("");

    await runInstallation({
      selectedProfiles,
      dryRun: options.dryRun,
      assumeYes: options.assumeYes,
      confirmReplacement: async (prompt) => {
        console.log(`replace ${prompt.target}`);
        console.log(`  reason: ${prompt.reason}`);
        console.log("  compare:");
        for (const line of prompt.preview.split("\n")) {
          console.log(`    ${line}`);
        }
        const answer = (await rl.question("Confirm replacement? [y/N] ")).trim();
        return /^y(es)?$/i.test(answer);
      },
      onEvent: (event) => {
        if (event.type === "profile-start") {
          if (!options.quiet) {
            console.log(`== ${standaloneProfileLabel(event.profile)} ==`);
          }
          return;
        }

        if (event.type === "mkdir") {
          if (!options.quiet) {
            console.log(`mkdir ${event.path}`);
          }
          return;
        }

        if (event.type === "ok") {
          if (!options.quiet) {
            console.log(`ok ${event.target}`);
          }
          if (options.verbose) {
            process.stderr.write(`  resolved: ${event.resolvedTarget || event.target}\n`);
          }
          return;
        }

        if (event.type === "prompt" && (event.dryRun || event.autoConfirm)) {
          console.log(`replace ${event.target}`);
          console.log(`  reason: ${event.reason}`);
          console.log("  compare:");
          for (const line of event.preview.split("\n")) {
            console.log(`    ${line}`);
          }
          if (event.dryRun) {
            console.log("  action: would prompt for confirmation");
          }
          return;
        }

        if (event.type === "skip") {
          if (!options.quiet) {
            console.log(`skip ${event.target}`);
          }
          return;
        }

        if (event.type === "backup") {
          console.log(`backup ${event.path} -> ${event.backup}`);
          return;
        }

        if (event.type === "link") {
          if (!options.quiet) {
            console.log(`link ${event.target} -> ${event.linkTarget}`);
          }
          if (options.verbose) {
            process.stderr.write(`  source: ${event.source || event.linkTarget}\n`);
          }
          return;
        }

        if (event.type === "error") {
          console.error(`error ${event.target}: ${event.message}`);
          return;
        }

        if (event.type === "session-complete") {
          console.log("");
          console.log("Setup complete.");
          if (options.dryRun) {
            console.log("Dry run only. No filesystem changes were made.");
          } else {
            console.log("Opencode still manages its own node_modules under ~/.config/opencode.");
            if (event.summary.errors === 0) {
              writeLockfile(selectedProfiles, sourceRoot);
            }
          }
        }
      },
    });
  } finally {
    rl.close();
  }
}

async function main(argv) {
  const options = parseArgs(argv);

  if (options.version) {
    console.log(version);
    return;
  }

  const config = loadConfig(getDefaultRepoRoot());
  const { configError, sourceRoot } = config;
  if (sourceRoot && !fs.existsSync(sourceRoot)) {
    process.stderr.write(`Warning: source root ${sourceRoot} does not exist. Profiles may be empty.\n`);
  }
  if (configError) {
    const choice = await handleInvalidConfig(configError);
    if (choice === "exit") {
      process.exit(0);
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
    const backupPath = `${CONFIG_PATH}.bak.${timestamp}`;
    fs.renameSync(CONFIG_PATH, backupPath);
    writeDefaultConfig();
    process.stdout.write(`Backed up to ${backupPath}\nRestored defaults.\n\n`);
  }

  const detection = detectInstalledTools();
  const profiles = discoverProfiles(undefined, detection);

  if (options.help) {
    printUsage(profiles);
    return;
  }

  if (options.listOnly) {
    printProfiles(profiles);
    return;
  }

  if (options.uninstall) {
    await runUninstall(options);
    return;
  }

  if (options.check) {
    await runCheck(options, config);
    return;
  }

  const initialSelectedIds = options.profileIds
    ? options.profileIds
    : options.selectAll
      ? profiles.filter((profile) => !profile.informational).map((profile) => profile.id)
      : null;

  if (process.stdin.isTTY && process.stdout.isTTY) {
    const { runInkInstaller } = await import("./install-ui.mjs");
    await runInkInstaller({
      profiles,
      options,
      initialSelectedIds,
      runInstallation,
      inspectProfile,
      buildInspectionCache,
      sourceRoot: getDefaultRepoRoot(),
      configPath: CONFIG_PATH,
      writeSourceRoot,
    });
    return;
  }

  await runPlainInstaller({ profiles, options, initialSelectedIds, sourceRoot });
}

module.exports = { main };

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
