#!/usr/bin/env node

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadConfig, CONFIG_DIR } = require("./load-config");

/**
 * @typedef {Object} Action
 * @property {string} source - Absolute path to the source file or directory in the repo
 * @property {string} target - Absolute path to the desired symlink location on the user's machine
 * @property {string} [itemType] - Semantic type of the item ("skill", "agent", "command", "config")
 */

/**
 * @typedef {"new-link"|"already-linked"|"replace-link"|"replace-match"|"replace-diff"} ActionKind
 */

/**
 * @typedef {Object} InspectedAction
 * @property {ActionKind} kind - Describes the current state of the target relative to the source
 * @property {string} label - Short display label (e.g. "create", "replace", "no change")
 * @property {string} color - Suggested display color for the label
 * @property {string} target - Absolute target path
 * @property {string} source - Absolute source path
 * @property {string} detail - Human-readable explanation of the current state
 * @property {string} effectLabel - What the install action will do (e.g. "symlink")
 * @property {string} beforePath - Path shown in the "before" column of a diff preview
 * @property {string} beforeDetail - Description of the current item at the target
 * @property {string} afterPath - Path shown in the "after" column of a diff preview
 * @property {string} afterDetail - Description of the incoming item from the repo
 * @property {string|null} preview - Truncated unified diff output, or null when not applicable
 * @property {string} [itemType] - Forwarded from the source action
 */

/**
 * @typedef {Object} Profile
 * @property {string} id - Stable unique identifier in the form `tool-type-source`
 * @property {string} label - Short display name (e.g. "skills", "AGENTS.md")
 * @property {string} description - Destination-focused description (e.g. "Links to ~/.claude/skills")
 * @property {boolean} recommended - Whether this profile is selected by default
 * @property {boolean} installed - Whether the target tool was detected on this machine
 * @property {boolean} enabled - Whether the source rule has enabled:true
 * @property {boolean} [informational] - When true the profile is display-only and never installed
 * @property {string} tool - Tool identifier matching the rule name (e.g. "claude")
 * @property {string} toolLabel - Human-readable tool name (e.g. "Claude Code")
 * @property {'multi-select'|'single-select'} mode - Selection mode inherited from the parent rule
 * @property {Action[]} actions - Resolved list of source→target symlink actions
 */

/**
 * @typedef {Object} InspectionCounts
 * @property {number} total - Total number of actions in the profile
 * @property {number} create - Actions that will create a new symlink
 * @property {number} noChange - Actions where the symlink is already correct
 * @property {number} replace - Actions that will replace an existing file or symlink
 */

/**
 * @typedef {Object} ProfileInspection
 * @property {InspectedAction[]} actions - Per-action inspection results
 * @property {InspectionCounts} counts - Aggregated counts across all actions
 */

/**
 * @typedef {Object} LockfileLink
 * @property {string} source - Absolute source path recorded at install time
 * @property {string} target - Absolute target path recorded at install time
 * @property {string} profileId - ID of the profile that created this link
 * @property {string} tool - Tool identifier for the link
 */

/**
 * @typedef {Object} Lockfile
 * @property {1} version - Schema version (currently always 1)
 * @property {string} updatedAt - ISO 8601 timestamp of the last install
 * @property {string} sourceRoot - Absolute path to the repo root at install time
 * @property {LockfileLink[]} links - Every symlink created during the install session
 */

/**
 * @typedef {Object} InstallSummary
 * @property {number} totalProfiles - Number of profiles processed
 * @property {number} totalActions - Total number of actions across all profiles
 * @property {number} completedActions - Actions that finished (success or error)
 * @property {number} linked - Symlinks successfully created
 * @property {number} skipped - Actions skipped (dry-run or user-declined)
 * @property {number} unchanged - Targets that were already correctly linked
 * @property {number} backedUp - Existing non-symlink targets that were backed up
 * @property {number} createdDirectories - Parent directories created during install
 * @property {number} errors - Actions that failed with an error
 */

const defaultRepoRoot = path.resolve(__dirname, "..");
let _config = null;

function getConfig() {
  if (!_config) _config = loadConfig(defaultRepoRoot);
  return _config;
}

function getDefaultRepoRoot() {
  return getConfig().sourceRoot;
}

function commandExists(name) {
  const result = spawnSync("which", [name], { encoding: "utf8", stdio: "pipe" });
  return result.status === 0;
}

function binaryDetected(binary) {
  if (!binary) return false;
  if (binary.which && commandExists(binary.which)) return true;
  const platformPath = binary.paths && binary.paths[process.platform];
  if (platformPath) {
    const expanded = getConfig().expandHome(platformPath);
    if (expanded && fileExists(expanded)) return true;
  }
  return false;
}

function detectInstalledTools() {
  const config = getConfig();
  const detection = {};

  for (const rule of config.rules) {
    if (!rule.home && !rule.binary) {
      detection[rule.name] = true;
      continue;
    }
    const expandedHome = rule.home ? config.expandHome(rule.home) : null;
    const homeFound = expandedHome ? fileExists(expandedHome) : false;
    detection[rule.name] = homeFound || binaryDetected(rule.binary);
  }

  return detection;
}

function fileExists(targetPath) {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function canonicalPath(targetPath) {
  return fs.realpathSync.native(targetPath);
}

function safeCanonicalPath(targetPath) {
  try {
    return canonicalPath(targetPath);
  } catch {
    return null;
  }
}

function relativeTarget(sourcePath, targetPath) {
  const targetDir = path.dirname(targetPath);
  // When a parent dir is itself a symlink (e.g. ~/.config → dotfiles/.config),
  // the OS resolves relative symlinks through the physical path, not the logical one.
  try {
    const realTargetDir = fs.realpathSync(targetDir);
    return path.relative(realTargetDir, sourcePath);
  } catch {
    return path.relative(targetDir, sourcePath);
  }
}

function inferItemType(mapping) {
  if (mapping.itemType) return mapping.itemType;
  if (mapping.type === "skills") return "skill";
  const src = mapping.source.replace(/\\/g, "/");
  const root = src.split("/")[0];
  if (root === "agents") return "agent";
  if (root === "commands") return "command";
  return "config";
}

function isNonConfigFile(name) {
  if (getConfig().ignore.names.has(name)) return true;
  return getConfig().ignore.globRegexes.some((re) => re.test(name));
}

function hashFile(filePath) {
  return crypto.createHash("sha1").update(fs.readFileSync(filePath)).digest("hex");
}

function snapshotDirectory(rootPath) {
  const lines = [];

  function walk(currentPath, relativePathname) {
    const entries = fs
      .readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    lines.push(`D:${relativePathname}`);

    for (const entry of entries) {
      const childRelativePath = relativePathname ? path.posix.join(relativePathname, entry.name) : entry.name;
      const childPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        walk(childPath, childRelativePath);
        continue;
      }

      if (entry.isFile()) {
        lines.push(`F:${childRelativePath}:${hashFile(childPath)}`);
        continue;
      }

      if (entry.isSymbolicLink()) {
        lines.push(`L:${childRelativePath}:${fs.readlinkSync(childPath)}`);
        continue;
      }

      lines.push(`O:${childRelativePath}`);
    }
  }

  walk(rootPath, "");
  return lines.join("\n");
}

function contentMatches(sourcePath, targetPath) {
  const sourceStat = fs.lstatSync(sourcePath);
  const targetStat = fs.lstatSync(targetPath);

  if (sourceStat.isDirectory() && targetStat.isDirectory()) {
    return snapshotDirectory(sourcePath) === snapshotDirectory(targetPath);
  }

  if (sourceStat.isFile() && targetStat.isFile()) {
    return hashFile(sourcePath) === hashFile(targetPath);
  }

  return false;
}

function previewDiff(sourcePath, targetPath) {
  const sourceStat = fs.lstatSync(sourcePath);
  const targetStat = fs.lstatSync(targetPath);
  const args =
    sourceStat.isDirectory() || targetStat.isDirectory()
      ? ["-qr", targetPath, sourcePath]
      : ["-u", targetPath, sourcePath];

  const result = spawnSync("diff", args, { encoding: "utf8" });
  if (result.error) {
    return "no diff preview available";
  }

  const combined = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (!combined) {
    return "no textual diff preview available";
  }

  const limit = sourceStat.isDirectory() || targetStat.isDirectory() ? 20 : 40;
  return combined.split("\n").slice(0, limit).join("\n");
}

function resolveMappingActions(mapping, repoRoot, targetHome) {
  const sourcePath = path.join(repoRoot, mapping.source);
  const itemType = inferItemType(mapping);

  if (mapping.type === "skills") {
    if (!fileExists(sourcePath)) return [];
    const dirs = fs
      .readdirSync(sourcePath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    return dirs.map((name) => ({
      source: path.join(sourcePath, name),
      target: path.join(targetHome, mapping.target, name),
      itemType,
    }));
  }

  if (mapping.type === "file") {
    if (!fileExists(sourcePath)) return [];
    return [
      {
        source: sourcePath,
        target: path.join(targetHome, mapping.target),
        itemType,
      },
    ];
  }

  if (mapping.type === "directory") {
    if (!fileExists(sourcePath)) return [];
    const resolvedTarget = mapping.target === "." ? targetHome : path.join(targetHome, mapping.target);
    const entries = fs
      .readdirSync(sourcePath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    const actions = [];
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (isNonConfigFile(entry.name)) continue;
      actions.push({
        source: path.join(sourcePath, entry.name),
        target: path.join(resolvedTarget, entry.name),
        itemType,
      });
    }
    return actions;
  }

  return [];
}

function profileTargetPath(mapping, targetHome) {
  if (mapping.type === "skills") {
    return path.join(targetHome, mapping.target);
  }

  if (mapping.type === "file") {
    return path.join(targetHome, mapping.target);
  }

  if (mapping.type === "directory") {
    return mapping.target === "." ? targetHome : path.join(targetHome, mapping.target);
  }

  return targetHome;
}

function profileLabelForMapping(mapping) {
  const itemType = inferItemType(mapping);

  if (mapping.type === "file" || itemType === "root") {
    return path.basename(mapping.source);
  }

  if (mapping.type === "skills") {
    return "skills";
  }

  if (itemType === "agent") {
    return "agents";
  }

  if (itemType === "command") {
    return "commands";
  }

  if (itemType === "config") {
    return "config files";
  }

  return path.basename(mapping.source);
}

function profileDescriptionForMapping(mapping, targetHome) {
  return `Links to ${profileTargetPath(mapping, targetHome)}`;
}

function discoverProfiles(repoRoot = getDefaultRepoRoot(), detection = null) {
  const profiles = [];

  for (const rule of getConfig().rules) {
    const targetHome = getConfig().expandHome(rule.home);
    if (!targetHome) continue;

    const isInstalled = detection ? detection[rule.name] !== false : true;
    const isEnabled = rule.enabled !== false;

    for (const mapping of rule.mappings) {
      const actions = resolveMappingActions(mapping, repoRoot, targetHome);
      if (actions.length === 0) continue;

      const profileId = `${rule.name}-${mapping.type}-${mapping.source.replace(/\//g, "-")}`;

      profiles.push({
        id: profileId,
        label: profileLabelForMapping(mapping),
        description: profileDescriptionForMapping(mapping, targetHome),
        recommended: true,
        installed: isInstalled,
        enabled: isEnabled,
        tool: rule.name,
        toolLabel: rule.label,
        mode: rule.mode || "multi-select",
        actions,
      });
    }
  }

  return profiles;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    uninstall: false,
    assumeYes: false,
    selectAll: false,
    listOnly: false,
    check: false,
    profileIds: null,
    help: false,
    verbose: false,
    quiet: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "sync") {
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--uninstall") {
      options.uninstall = true;
      continue;
    }

    if (arg === "--yes") {
      options.assumeYes = true;
      continue;
    }

    if (arg === "--all") {
      options.selectAll = true;
      continue;
    }

    if (arg === "--list") {
      options.listOnly = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--verbose") {
      options.verbose = true;
      continue;
    }

    if (arg === "--quiet") {
      options.quiet = true;
      continue;
    }

    if (arg === "--check") {
      options.check = true;
      continue;
    }

    if (arg === "--profile") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--profile requires a comma-separated value");
      }
      options.profileIds = value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      index += 1;
      continue;
    }

    if (arg.startsWith("--profile=")) {
      options.profileIds = arg
        .slice("--profile=".length)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage(profiles) {
  console.log(
    "Usage: saddle [--dry-run] [--uninstall] [--check] [--yes] [--all] [--profile id1,id2] [--list] [--verbose] [--quiet]",
  );
  console.log("");
  console.log("Interactive Ink UI by default when running in a TTY.");
  console.log("");
  console.log("Flags:");
  console.log("  --dry-run    Preview changes without writing to disk");
  console.log("  --uninstall  Remove installed symlinks recorded in lockfile");
  console.log("  --yes        Auto-confirm replacements without prompting");
  console.log("  --all        Select all profiles");
  console.log("  --profile    Comma-separated list of profile IDs to apply");
  console.log("  --list       List available profiles and exit");
  console.log("  --check      Inspect installed symlinks and exit 0 if in sync, 1 if out of sync");
  console.log("  --verbose    Show extra detail (source paths, symlink targets) on stderr");
  console.log("  --quiet      Suppress ok/link/skip/mkdir output; show only errors and summary");
  console.log("");
  if (profiles.length > 0) {
    console.log("Available profiles:");
    for (const profile of profiles) {
      const suffix = profile.informational ? " (informational)" : "";
      console.log(`- ${profile.id}: ${profile.label}${suffix}`);
    }
  }
}

function printProfiles(profiles, selectedIds = new Set()) {
  console.log("");
  console.log("Setup profiles");
  for (const [index, profile] of profiles.entries()) {
    const mark = selectedIds.has(profile.id) ? "x" : " ";
    const details = profile.informational
      ? "informational"
      : `${profile.actions.length} link${profile.actions.length === 1 ? "" : "s"}`;
    console.log(`${index + 1}. [${mark}] ${profile.label} (${profile.id})`);
    console.log(`   ${profile.description}`);
    console.log(`   ${details}`);
  }
}

function inspectAction(action) {
  const { source, target } = action;

  if (!fileExists(target)) {
    return {
      kind: "new-link",
      label: "create",
      color: "cyan",
      target,
      source,
      detail: "Target does not exist yet",
      effectLabel: "symlink",
      beforePath: target,
      beforeDetail: "No current item at destination",
      afterPath: source,
      afterDetail: "Repo definition",
      preview: null,
    };
  }

  const stats = fs.lstatSync(target);

  if (stats.isSymbolicLink()) {
    const currentTarget = fs.readlinkSync(target);
    const resolvedTarget = safeCanonicalPath(target);
    const resolvedSource = safeCanonicalPath(source);
    if (resolvedTarget !== null && resolvedSource !== null && resolvedTarget === resolvedSource) {
      return {
        kind: "already-linked",
        label: "no change",
        color: "gray",
        target,
        source,
        detail: "Already linked to this repo",
        effectLabel: "symlink",
        beforePath: target,
        beforeDetail: "Already points at repo definition",
        afterPath: source,
        afterDetail: "Repo definition",
        preview: null,
      };
    }

    return {
      kind: "replace-link",
      label: "replace",
      color: "#ff9f1c",
      target,
      source,
      detail: `Currently points to ${currentTarget}`,
      effectLabel: "symlink",
      beforePath: target,
      beforeDetail: currentTarget,
      afterPath: source,
      afterDetail: "Repo definition",
      preview: previewDiff(source, target),
    };
  }

  if (contentMatches(source, target)) {
    return {
      kind: "replace-match",
      label: "replace",
      color: "magenta",
      target,
      source,
      detail: "Same content, but not a symlink",
      effectLabel: "symlink",
      beforePath: target,
      beforeDetail: "Same content, plain file or directory",
      afterPath: source,
      afterDetail: "Repo definition",
      preview: null,
    };
  }

  return {
    kind: "replace-diff",
    label: "replace",
    color: "red",
    target,
    source,
    detail: "Existing content differs",
    effectLabel: "symlink",
    beforePath: target,
    beforeDetail: "Different local content",
    afterPath: source,
    afterDetail: "Repo definition",
    preview: previewDiff(source, target),
  };
}

async function buildInspectionCache(profiles, onProgress = null) {
  const cache = new Map();
  const allActions = [];

  for (const profile of profiles) {
    for (const action of profile.actions) {
      allActions.push(action);
    }
  }

  const total = allActions.length;

  if (onProgress) onProgress({ done: 0, total, current: "" });

  for (let i = 0; i < allActions.length; i++) {
    const action = allActions[i];
    const key = `${action.source}::${action.target}`;
    if (!cache.has(key)) {
      cache.set(key, inspectAction(action));
    }
    if (onProgress) onProgress({ done: i + 1, total, current: action.target });
    await new Promise((resolve) => setImmediate(resolve));
  }

  return cache;
}

function inspectProfile(profile, inspectionCache = null) {
  const actions = profile.actions.map((action) => {
    const key = `${action.source}::${action.target}`;
    const inspected = inspectionCache ? inspectionCache.get(key) || inspectAction(action) : inspectAction(action);
    return { ...inspected, itemType: action.itemType || "config" };
  });
  const counts = {
    total: actions.length,
    create: actions.filter((action) => action.kind === "new-link").length,
    noChange: actions.filter((action) => action.kind === "already-linked").length,
    replace: actions.filter((action) => action.kind !== "new-link" && action.kind !== "already-linked").length,
  };

  return { actions, counts };
}

async function runInstallation({
  selectedProfiles,
  dryRun = false,
  assumeYes = false,
  onEvent = () => {},
  confirmReplacement,
}) {
  const timestamp = new Date().toISOString().replace(/[:]/g, "-").replace(/\..+/, "");
  const totalActions = selectedProfiles.reduce((sum, profile) => sum + profile.actions.length, 0);
  const summary = {
    totalProfiles: selectedProfiles.length,
    totalActions,
    completedActions: 0,
    linked: 0,
    skipped: 0,
    unchanged: 0,
    backedUp: 0,
    createdDirectories: 0,
    errors: 0,
  };

  const emit = (type, payload = {}) => {
    onEvent({ type, ...payload });
  };

  emit("session-start", { selectedProfiles, dryRun, assumeYes, totalActions });

  async function ensureLink({ source, target, profile }) {
    const targetDir = path.dirname(target);
    if (!fs.existsSync(targetDir)) {
      emit("mkdir", { path: targetDir, profile, source, target });
      summary.createdDirectories += 1;
      if (!dryRun) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
    }

    if (fileExists(target)) {
      const stats = fs.lstatSync(target);

      if (stats.isSymbolicLink()) {
        const resolvedTarget = safeCanonicalPath(target);
        const resolvedSource = safeCanonicalPath(source);
        if (resolvedTarget !== null && resolvedSource !== null && resolvedTarget === resolvedSource) {
          emit("ok", { profile, source, target });
          summary.unchanged += 1;
          summary.completedActions += 1;
          return;
        }
      }

      // Determine reason for replacement (works for both symlink and non-symlink)
      let reason;
      if (stats.isSymbolicLink()) {
        const currentTarget = fs.readlinkSync(target);
        reason = `symlink points to ${currentTarget}`;
      } else {
        reason = contentMatches(source, target)
          ? `${stats.isDirectory() ? "existing directory" : "existing path"} matches content but is not a symlink`
          : "existing path differs";
      }

      const prompt = {
        profile,
        source,
        target,
        reason,
        preview: previewDiff(source, target),
        autoConfirm: assumeYes,
        dryRun,
      };

      emit("prompt", prompt);

      if (dryRun) {
        emit("skip", { profile, source, target, reason: "dry-run" });
        summary.skipped += 1;
        summary.completedActions += 1;
        return;
      }

      const confirmed = assumeYes ? true : await confirmReplacement(prompt);

      if (!confirmed) {
        emit("skip", { profile, source, target, reason: "user-declined" });
        summary.skipped += 1;
        summary.completedActions += 1;
        return;
      }

      if (!stats.isSymbolicLink()) {
        const backup = `${target}.bak.${timestamp}`;
        emit("backup", { profile, path: target, backup, source, target });
        summary.backedUp += 1;
        fs.renameSync(target, backup);
      } else {
        fs.unlinkSync(target);
      }
    }

    const linkTarget = relativeTarget(source, target);
    emit("link", { profile, source, target, linkTarget });
    summary.linked += 1;
    summary.completedActions += 1;
    if (!dryRun) {
      fs.symlinkSync(linkTarget, target);
    }
  }

  for (const [profileIndex, profile] of selectedProfiles.entries()) {
    emit("profile-start", {
      profile,
      profileIndex,
      profileCount: selectedProfiles.length,
    });

    for (const action of profile.actions) {
      try {
        await ensureLink({ ...action, profile });
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : String(actionError);
        emit("error", { profile, source: action.source, target: action.target, message });
        summary.errors += 1;
        summary.completedActions += 1;
      }
    }

    emit("profile-complete", {
      profile,
      profileIndex,
      profileCount: selectedProfiles.length,
      summary: { ...summary },
    });
  }

  emit("session-complete", { summary: { ...summary } });
  return summary;
}

function writeLockfile(selectedProfiles, sourceRoot) {
  const links = [];
  for (const profile of selectedProfiles) {
    for (const action of profile.actions) {
      links.push({
        source: action.source,
        target: action.target,
        profileId: profile.id,
        tool: profile.tool,
      });
    }
  }
  const lockfile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    sourceRoot,
    links,
  };
  const lockfilePath = path.join(CONFIG_DIR, "installed.json");
  try {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(lockfilePath, JSON.stringify(lockfile, null, 2) + "\n", "utf8");
  } catch (err) {
    process.stderr.write(`Warning: could not write lockfile: ${err.message}\n`);
  }
}

function readLockfile() {
  const lockfilePath = path.join(CONFIG_DIR, "installed.json");
  try {
    const content = fs.readFileSync(lockfilePath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    return null;
  }
}

async function runUninstall(options) {
  const { dryRun, profileIds } = options;
  const lockfile = readLockfile();

  if (!lockfile) {
    process.stderr.write("Error: no lockfile found. Run the installer first.\n");
    process.exit(1);
  }

  const sourceRoot = lockfile.sourceRoot;
  let links = lockfile.links;

  if (profileIds && profileIds.length > 0) {
    links = links.filter((link) => profileIds.includes(link.profileId));
  }

  let removed = 0;
  let skipped = 0;
  let missing = 0;

  for (const link of links) {
    const { target } = link;

    let stats;
    try {
      stats = fs.lstatSync(target);
    } catch {
      missing += 1;
      if (!options.quiet) process.stdout.write(`missing  ${target}\n`);
      continue;
    }

    if (!stats.isSymbolicLink()) {
      skipped += 1;
      if (!options.quiet) process.stdout.write(`skip     ${target} (not a symlink)\n`);
      continue;
    }

    let linkDest;
    try {
      linkDest = fs.readlinkSync(target);
      if (!path.isAbsolute(linkDest)) {
        linkDest = path.resolve(path.dirname(target), linkDest);
      }
      linkDest = safeCanonicalPath(linkDest) || linkDest;
    } catch {
      skipped += 1;
      if (!options.quiet) process.stdout.write(`skip     ${target} (cannot read symlink)\n`);
      continue;
    }

    if (!(linkDest === sourceRoot || linkDest.startsWith(`${sourceRoot}${path.sep}`))) {
      skipped += 1;
      if (!options.quiet) process.stdout.write(`skip     ${target} (points outside sourceRoot)\n`);
      continue;
    }

    if (dryRun) {
      if (!options.quiet) process.stdout.write(`would remove  ${target}\n`);
      removed += 1;
      continue;
    }

    fs.unlinkSync(target);
    removed += 1;
    if (!options.quiet) process.stdout.write(`removed  ${target}\n`);
  }

  process.stdout.write(`\nUninstall complete: ${removed} removed, ${skipped} skipped, ${missing} missing\n`);
}

async function runCheck(options, _config) {
  const lockfile = readLockfile();

  let linksToCheck;

  if (lockfile) {
    linksToCheck = lockfile.links;
    if (options.profileIds && options.profileIds.length > 0) {
      linksToCheck = linksToCheck.filter((l) => options.profileIds.includes(l.profileId));
    }
  } else {
    const profiles = discoverProfiles();
    linksToCheck = [];
    for (const profile of profiles) {
      for (const action of profile.actions) {
        linksToCheck.push({
          source: action.source,
          target: action.target,
          profileId: profile.id,
          tool: profile.tool,
        });
      }
    }
  }

  let inSync = 0;
  let outOfSync = 0;

  for (const link of linksToCheck) {
    const result = inspectAction({ source: link.source, target: link.target });
    if (result.kind === "already-linked") {
      inSync += 1;
    } else {
      outOfSync += 1;
      if (options.verbose) {
        process.stderr.write(`out-of-sync: ${link.target} (${result.kind})\n`);
      }
    }
  }

  process.stdout.write(`${inSync} in sync, ${outOfSync} out of sync\n`);
  process.exit(outOfSync > 0 ? 1 : 0);
}

module.exports = {
  binaryDetected,
  buildInspectionCache,
  contentMatches,
  getDefaultRepoRoot,
  detectInstalledTools,
  discoverProfiles,
  fileExists,
  inspectAction,
  inspectProfile,
  parseArgs,
  previewDiff,
  printProfiles,
  printUsage,
  readLockfile,
  runCheck,
  runUninstall,
  runInstallation,
  writeLockfile,
};
