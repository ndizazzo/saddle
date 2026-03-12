#!/usr/bin/env node

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { loadConfig } = require("./load-config");

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
    const entries = fs.readdirSync(currentPath, { withFileTypes: true })
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
  const args = (sourceStat.isDirectory() || targetStat.isDirectory())
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
    const dirs = fs.readdirSync(sourcePath, { withFileTypes: true })
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
    return [{
      source: sourcePath,
      target: path.join(targetHome, mapping.target),
      itemType,
    }];
  }

  if (mapping.type === "directory") {
    if (!fileExists(sourcePath)) return [];
    const resolvedTarget = mapping.target === "." ? targetHome : path.join(targetHome, mapping.target);
    const entries = fs.readdirSync(sourcePath, { withFileTypes: true })
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

function discoverProfiles(repoRoot = getDefaultRepoRoot(), detection = null) {
  const profiles = [];

  for (const rule of getConfig().rules) {
    const targetHome = getConfig().expandHome(rule.home);
    if (!targetHome) continue;

    const isInstalled = detection ? (detection[rule.name] !== false) : true;
    const isEnabled = rule.enabled !== false;

    for (const mapping of rule.mappings) {
      const actions = resolveMappingActions(mapping, repoRoot, targetHome);
      if (actions.length === 0) continue;

      const profileId = `${rule.name}-${mapping.type}-${mapping.source.replace(/\//g, "-")}`;
      const itemType = inferItemType(mapping);
      const typeLabel = mapping.type === "file"
        ? path.basename(mapping.source)
        : itemType === "skill" ? "skills"
        : itemType === "agent" ? "agents"
        : itemType === "command" ? "commands"
        : `${path.basename(mapping.source)} config`;

      profiles.push({
        id: profileId,
        label: `${rule.label} ${typeLabel}`,
        description: `Link ${typeLabel} into ${targetHome}`,
        recommended: true,
        installed: isInstalled,
        enabled: isEnabled,
        tool: rule.name,
        toolLabel: rule.label,
        actions,
      });
    }
  }

  return profiles;
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    assumeYes: false,
    selectAll: false,
    listOnly: false,
    profileIds: null,
    help: false,
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

    if (arg === "--profile") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--profile requires a comma-separated value");
      }
      options.profileIds = value.split(",").map((item) => item.trim()).filter(Boolean);
      index += 1;
      continue;
    }

    if (arg.startsWith("--profile=")) {
      options.profileIds = arg.slice("--profile=".length).split(",").map((item) => item.trim()).filter(Boolean);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printUsage(profiles) {
  console.log("Usage: ai-config [--dry-run] [--yes] [--all] [--profile id1,id2] [--list]");
  console.log("");
  console.log("Interactive Ink UI by default when running in a TTY.");
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
    const details = profile.informational ? "informational" : `${profile.actions.length} link${profile.actions.length === 1 ? "" : "s"}`;
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

function buildInspectionCache(profiles) {
  const cache = new Map();

  for (const profile of profiles) {
    for (const action of profile.actions) {
      const key = `${action.source}::${action.target}`;
      if (!cache.has(key)) {
        cache.set(key, inspectAction(action));
      }
    }
  }

  return cache;
}

async function buildInspectionCacheAsync(profiles, onProgress) {
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
    const inspected = inspectionCache
      ? (inspectionCache.get(key) || inspectAction(action))
      : inspectAction(action);
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

        const currentTarget = fs.readlinkSync(target);
        const prompt = {
          profile,
          source,
          target,
          reason: `symlink points to ${currentTarget}`,
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

        const confirmed = assumeYes
          ? true
          : await confirmReplacement(prompt);

        if (!confirmed) {
          emit("skip", { profile, source, target, reason: "user-declined" });
          summary.skipped += 1;
          summary.completedActions += 1;
          return;
        }

        const backup = `${target}.bak.${timestamp}`;
        emit("backup", { profile, path: target, backup, source, target });
        summary.backedUp += 1;
        fs.renameSync(target, backup);
      } else {
        const reason = contentMatches(source, target)
          ? `${stats.isDirectory() ? "existing directory" : "existing path"} matches content but is not a symlink`
          : "existing path differs";
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

        const confirmed = assumeYes
          ? true
          : await confirmReplacement(prompt);

        if (!confirmed) {
          emit("skip", { profile, source, target, reason: "user-declined" });
          summary.skipped += 1;
          summary.completedActions += 1;
          return;
        }

        const backup = `${target}.bak.${timestamp}`;
        emit("backup", { profile, path: target, backup, source, target });
        summary.backedUp += 1;
        fs.renameSync(target, backup);
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

module.exports = {
  binaryDetected,
  buildInspectionCache,
  buildInspectionCacheAsync,
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
  runInstallation,
};
