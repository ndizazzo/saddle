#!/usr/bin/env node

"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { CONFIG_DIR } = require("./load-config.js");

const STATE_VERSION = 2;
const PLAN_VERSION = 1;
const ACTION_PRIORITY = {
  import: 10,
  link: 20,
  "remove-duplicate": 40,
};

function pathExists(targetPath) {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch {
    return false;
  }
}

function ensureCanonicalChild(rootPath, relativePath) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedChild = path.resolve(rootPath, relativePath);
  if (resolvedChild !== resolvedRoot && !resolvedChild.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Canonical path escapes source root: ${relativePath}`);
  }

  const physicalRoot = resolveThroughExistingAncestor(resolvedRoot);
  const physicalChild = resolveThroughExistingAncestor(resolvedChild);
  if (physicalChild !== physicalRoot && !physicalChild.startsWith(`${physicalRoot}${path.sep}`)) {
    throw new Error(`Canonical path escapes source root through a symlink: ${relativePath}`);
  }
  return resolvedChild;
}

function resolveThroughExistingAncestor(targetPath) {
  const resolved = path.resolve(targetPath);
  const suffix = [];
  let current = resolved;

  while (!pathExists(current)) {
    const parent = path.dirname(current);
    if (parent === current) return resolved;
    suffix.unshift(path.basename(current));
    current = parent;
  }

  try {
    return path.join(fs.realpathSync.native(current), ...suffix);
  } catch {
    return resolved;
  }
}

function pathsOverlap(leftPath, rightPath) {
  const left = resolveThroughExistingAncestor(leftPath);
  const right = resolveThroughExistingAncestor(rightPath);
  return left === right || left.startsWith(`${right}${path.sep}`) || right.startsWith(`${left}${path.sep}`);
}

function isCanonicalCollectionAlias(endpointPath, canonicalPath) {
  if (!pathExists(endpointPath)) return false;

  const stat = fs.lstatSync(endpointPath);
  if (!stat.isSymbolicLink()) return false;

  try {
    return fs.realpathSync.native(endpointPath) === resolveThroughExistingAncestor(canonicalPath);
  } catch {
    return false;
  }
}

function resolveContentPath(entryPath) {
  const stat = fs.lstatSync(entryPath);
  return stat.isSymbolicLink() ? fs.realpathSync(entryPath) : entryPath;
}

function hashEntry(entryPath) {
  const hash = crypto.createHash("sha256");
  const contentPath = resolveContentPath(entryPath);

  function walk(currentPath, relativePath) {
    const stat = fs.lstatSync(currentPath);
    const mode = stat.mode & 0o777;

    if (stat.isSymbolicLink()) {
      hash.update(`L\0${relativePath}\0${fs.readlinkSync(currentPath)}\0`);
      return;
    }

    if (stat.isFile()) {
      hash.update(`F\0${relativePath}\0${mode}\0`);
      hash.update(fs.readFileSync(currentPath));
      hash.update("\0");
      return;
    }

    if (!stat.isDirectory()) {
      hash.update(`O\0${relativePath}\0${mode}\0`);
      return;
    }

    hash.update(`D\0${relativePath}\0${mode}\0`);
    const entries = fs
      .readdirSync(currentPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      walk(path.join(currentPath, entry.name), relativePath ? path.posix.join(relativePath, entry.name) : entry.name);
    }
  }

  walk(contentPath, "");
  return hash.digest("hex");
}

function captureSignature(entryPath) {
  if (!pathExists(entryPath)) return { type: "missing" };

  const stat = fs.lstatSync(entryPath);
  if (stat.isSymbolicLink()) {
    let resolved = null;
    let digest = null;
    try {
      resolved = fs.realpathSync.native(entryPath);
      digest = hashEntry(entryPath);
    } catch {
      /* broken links retain their raw destination as the precondition */
    }
    return {
      type: "symlink",
      linkTarget: fs.readlinkSync(entryPath),
      resolved,
      digest,
    };
  }

  return {
    type: stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other",
    digest: stat.isDirectory() || stat.isFile() ? hashEntry(entryPath) : null,
  };
}

function signaturesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function listEntries(rootPath, entryMode) {
  if (!pathExists(rootPath)) return [];
  let rootStat;
  try {
    rootStat = fs.statSync(rootPath);
  } catch {
    throw new Error(`Managed collection root is not a readable directory: ${rootPath}`);
  }
  if (!rootStat.isDirectory()) {
    throw new Error(`Managed collection root is not a directory: ${rootPath}`);
  }

  return fs
    .readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => {
      if (entry.name === ".DS_Store") return false;
      const entryPath = path.join(rootPath, entry.name);
      if (entry.isSymbolicLink()) {
        try {
          const resolvedStat = fs.statSync(entryPath);
          return entryMode === "files" ? resolvedStat.isFile() : resolvedStat.isDirectory();
        } catch {
          return false;
        }
      }
      return entryMode === "files" ? entry.isFile() : entry.isDirectory();
    })
    .map((entry) => {
      const entryPath = path.join(rootPath, entry.name);
      return {
        name: entry.name,
        path: entryPath,
        digest: hashEntry(entryPath),
        signature: captureSignature(entryPath),
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
}

function endpointKey(endpoint) {
  return `${endpoint.collectionKey}::${endpoint.targetClass}::${endpoint.path}`;
}

function collectionKeyFor(kind, canonicalPath, entries) {
  return `${kind}::${entries}::${canonicalPath}`;
}

function scanReorg({ rules, detection = {}, sourceRoot, expandHome }) {
  if (!sourceRoot) throw new Error("A source root is required for reorganization.");

  const resolvedSourceRoot = path.resolve(sourceRoot);
  const collections = new Map();
  const endpoints = new Map();
  const endpointOwners = new Map();
  const toolAssets = [];

  for (const rule of rules) {
    if (rule.enabled === false || rule.reorgAssets.length === 0) continue;
    const installed = detection[rule.name] !== false;

    for (const asset of rule.reorgAssets) {
      const canonicalPath = ensureCanonicalChild(sourceRoot, asset.canonical);
      const collectionKey = collectionKeyFor(asset.kind, canonicalPath, asset.entries);
      if (!collections.has(collectionKey)) {
        collections.set(collectionKey, {
          key: collectionKey,
          kind: asset.kind,
          entries: asset.entries,
          canonicalPath,
          items: listEntries(canonicalPath, asset.entries),
        });
      }

      const locations = [];
      for (const location of asset.locations) {
        const expandedPath = expandHome(location.path);
        if (!expandedPath) continue;
        const resolvedEndpointPath = path.resolve(expandedPath);
        const canonicalAlias = isCanonicalCollectionAlias(resolvedEndpointPath, canonicalPath);
        if (!canonicalAlias && pathsOverlap(resolvedSourceRoot, resolvedEndpointPath)) {
          throw new Error(
            `Source root overlaps a managed harness location: ${resolvedSourceRoot} and ${resolvedEndpointPath}`,
          );
        }
        const ownerKey = `${location.targetClass}::${resolvedEndpointPath}`;
        const existingOwner = endpointOwners.get(ownerKey);
        if (existingOwner && existingOwner !== collectionKey) {
          throw new Error(`Managed harness location maps to multiple canonical collections: ${resolvedEndpointPath}`);
        }
        endpointOwners.set(ownerKey, collectionKey);
        const endpoint = {
          collectionKey,
          kind: asset.kind,
          entries: asset.entries,
          path: resolvedEndpointPath,
          targetClass: location.targetClass,
          canonicalAlias,
          tools: [rule.name],
          toolLabels: [rule.label],
          installed,
        };
        const key = endpointKey(endpoint);
        const existing = endpoints.get(key);
        if (existing) {
          if (!existing.tools.includes(rule.name)) existing.tools.push(rule.name);
          if (!existing.toolLabels.includes(rule.label)) existing.toolLabels.push(rule.label);
          existing.installed = existing.installed || installed;
          locations.push(existing);
        } else {
          endpoint.items = installed ? listEntries(endpoint.path, asset.entries) : [];
          endpoints.set(key, endpoint);
          locations.push(endpoint);
        }
      }

      toolAssets.push({
        tool: rule.name,
        toolLabel: rule.label,
        installed,
        collectionKey,
        kind: asset.kind,
        locations,
      });
    }
  }

  const sortedEndpoints = Array.from(endpoints.values()).sort(
    (left, right) =>
      left.collectionKey.localeCompare(right.collectionKey) ||
      left.targetClass.localeCompare(right.targetClass) ||
      left.path.localeCompare(right.path),
  );
  for (const endpoint of sortedEndpoints) {
    endpoint.tools.sort();
    endpoint.toolLabels.sort();
  }

  return {
    sourceRoot: resolvedSourceRoot,
    collections: Array.from(collections.values()).sort((left, right) => left.key.localeCompare(right.key)),
    endpoints: sortedEndpoints,
    toolAssets: toolAssets.sort(
      (left, right) =>
        left.tool.localeCompare(right.tool) ||
        left.kind.localeCompare(right.kind) ||
        left.collectionKey.localeCompare(right.collectionKey),
    ),
  };
}

function selectEndpoints(scan, strategy) {
  const selected = new Map();
  const coverage = [];

  for (const toolAsset of scan.toolAssets) {
    if (!toolAsset.installed) continue;
    const universal = toolAsset.locations.filter((location) => location.targetClass === "universal");
    const provider = toolAsset.locations.filter((location) => location.targetClass === "provider");
    const chosen = strategy === "provider-only" ? provider : universal.length > 0 ? universal : provider;

    coverage.push({
      tool: toolAsset.tool,
      toolLabel: toolAsset.toolLabel,
      kind: toolAsset.kind,
      targetClass: chosen.length > 0 ? chosen[0].targetClass : null,
      endpoints: chosen.map((endpoint) => endpoint.path),
      supported: chosen.length > 0,
    });

    for (const endpoint of chosen) selected.set(endpointKey(endpoint), endpoint);
  }

  coverage.sort((left, right) => left.tool.localeCompare(right.tool) || left.kind.localeCompare(right.kind));
  return {
    selected: Array.from(selected.values()).sort(
      (left, right) =>
        left.targetClass.localeCompare(right.targetClass) ||
        left.path.localeCompare(right.path) ||
        left.collectionKey.localeCompare(right.collectionKey),
    ),
    coverage,
  };
}

function itemMap(items) {
  return new Map(items.map((item) => [item.name, item]));
}

function pointsTo(targetPath, sourcePath) {
  if (!pathExists(targetPath)) return false;
  const stat = fs.lstatSync(targetPath);
  if (!stat.isSymbolicLink()) return false;
  try {
    return fs.realpathSync.native(targetPath) === fs.realpathSync.native(sourcePath);
  } catch {
    return false;
  }
}

function buildReorgPlan({ scan, strategy = "universal-first" }) {
  if (strategy !== "universal-first" && strategy !== "provider-only") {
    throw new Error(`Unknown link strategy: ${strategy}`);
  }

  const selection = selectEndpoints(scan, strategy);
  const selectedKeys = new Set(selection.selected.map(endpointKey));
  const actions = [];
  const conflicts = [];
  const unchanged = [];

  for (const collection of scan.collections) {
    const canonicalItems = itemMap(collection.items);
    const collectionEndpoints = scan.endpoints.filter(
      (endpoint) => endpoint.collectionKey === collection.key && endpoint.installed,
    );
    const selectedEndpoints = collectionEndpoints.filter((endpoint) => selectedKeys.has(endpointKey(endpoint)));
    const suppressedEndpoints = collectionEndpoints.filter((endpoint) => !selectedKeys.has(endpointKey(endpoint)));
    const names = new Set(collection.items.map((item) => item.name));
    for (const endpoint of collectionEndpoints) {
      for (const item of endpoint.items) names.add(item.name);
    }

    for (const name of Array.from(names).sort()) {
      const canonicalItem = canonicalItems.get(name) || null;
      const occurrences = collectionEndpoints.flatMap((endpoint) => {
        if (endpoint.canonicalAlias) return [];
        const item = endpoint.items.find((candidate) => candidate.name === name);
        return item ? [{ endpoint, item }] : [];
      });
      const uniqueDigests = new Set(occurrences.map(({ item }) => item.digest));
      const canonicalTarget = path.join(collection.canonicalPath, name);
      let expectedDigest = canonicalItem ? canonicalItem.digest : null;

      if (canonicalItem) uniqueDigests.add(canonicalItem.digest);
      if (uniqueDigests.size > 1) {
        conflicts.push({
          id: `${collection.key}::${name}`,
          kind: collection.kind,
          name,
          canonicalPath: canonicalItem ? canonicalItem.path : null,
          sources: [
            ...(canonicalItem
              ? [
                  {
                    path: canonicalItem.path,
                    digest: canonicalItem.digest,
                    targetClass: "canonical",
                    tools: [],
                  },
                ]
              : []),
            ...occurrences.map(({ endpoint, item }) => ({
              path: item.path,
              digest: item.digest,
              targetClass: endpoint.targetClass,
              tools: endpoint.tools,
            })),
          ],
          reason: "Different content claims the same canonical name",
        });
        continue;
      }

      if (!canonicalItem) {
        const origin = occurrences.slice().sort((left, right) => {
          const leftRank = left.endpoint.targetClass === "universal" ? 0 : 1;
          const rightRank = right.endpoint.targetClass === "universal" ? 0 : 1;
          return leftRank - rightRank || left.item.path.localeCompare(right.item.path);
        })[0];
        if (!origin) continue;
        expectedDigest = origin.item.digest;
        actions.push({
          id: `import::${collection.key}::${name}`,
          type: "import",
          kind: collection.kind,
          name,
          source: origin.item.path,
          target: canonicalTarget,
          targetClass: "canonical",
          tools: origin.endpoint.tools,
          precondition: captureSignature(canonicalTarget),
          expectedDigest,
        });
      }

      for (const endpoint of selectedEndpoints) {
        const target = path.join(endpoint.path, name);
        if (endpoint.canonicalAlias) {
          if (canonicalItem) {
            unchanged.push({
              kind: collection.kind,
              name,
              target,
              source: canonicalTarget,
              targetClass: endpoint.targetClass,
              tools: endpoint.tools,
            });
          }
          continue;
        }
        const existing = endpoint.items.find((item) => item.name === name) || null;
        if (pointsTo(target, canonicalTarget)) {
          unchanged.push({
            kind: collection.kind,
            name,
            target,
            source: canonicalTarget,
            targetClass: endpoint.targetClass,
            tools: endpoint.tools,
          });
          continue;
        }

        if (existing && existing.digest !== expectedDigest) {
          conflicts.push({
            id: `target::${endpointKey(endpoint)}::${name}`,
            kind: collection.kind,
            name,
            canonicalPath: canonicalTarget,
            sources: [{ path: existing.path, digest: existing.digest, tools: endpoint.tools }],
            reason: "Selected target differs from canonical content",
          });
          continue;
        }

        actions.push({
          id: `link::${endpointKey(endpoint)}::${name}`,
          type: "link",
          kind: collection.kind,
          name,
          source: canonicalTarget,
          target,
          targetClass: endpoint.targetClass,
          tools: endpoint.tools,
          precondition: captureSignature(target),
          expectedDigest,
        });
      }

      for (const endpoint of suppressedEndpoints) {
        if (endpoint.canonicalAlias) continue;
        const existing = endpoint.items.find((item) => item.name === name);
        if (!existing || selectedEndpoints.some((selectedEndpoint) => selectedEndpoint.path === endpoint.path))
          continue;
        if (existing.digest !== expectedDigest) continue;
        actions.push({
          id: `remove::${endpointKey(endpoint)}::${name}`,
          type: "remove-duplicate",
          kind: collection.kind,
          name,
          source: canonicalTarget,
          target: existing.path,
          targetClass: endpoint.targetClass,
          tools: endpoint.tools,
          precondition: existing.signature,
          expectedDigest,
        });
      }
    }
  }

  actions.sort((left, right) => {
    const leftPriority = left.type === "link" && left.targetClass === "provider" ? 30 : ACTION_PRIORITY[left.type];
    const rightPriority = right.type === "link" && right.targetClass === "provider" ? 30 : ACTION_PRIORITY[right.type];
    return leftPriority - rightPriority || left.target.localeCompare(right.target);
  });
  conflicts.sort((left, right) => left.id.localeCompare(right.id));
  unchanged.sort((left, right) => left.target.localeCompare(right.target));

  const planSeed = JSON.stringify({
    sourceRoot: scan.sourceRoot,
    strategy,
    actions: actions.map(({ id, type, source, target, precondition }) => ({ id, type, source, target, precondition })),
    conflicts,
  });

  return {
    version: PLAN_VERSION,
    id: crypto.createHash("sha256").update(planSeed).digest("hex").slice(0, 16),
    createdAt: new Date().toISOString(),
    sourceRoot: scan.sourceRoot,
    strategy,
    actions,
    conflicts,
    unchanged,
    coverage: selection.coverage,
    canApply: conflicts.length === 0,
    hasChanges: actions.length > 0,
  };
}

function removeEntry(entryPath) {
  if (!pathExists(entryPath)) return;
  const stat = fs.lstatSync(entryPath);
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    fs.rmSync(entryPath, { recursive: true, force: true });
  } else {
    fs.unlinkSync(entryPath);
  }
}

function copyEntry(sourcePath, targetPath) {
  const contentPath = resolveContentPath(sourcePath);
  const stat = fs.lstatSync(contentPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (stat.isDirectory()) {
    fs.cpSync(contentPath, targetPath, { recursive: true, dereference: false, preserveTimestamps: true });
    return;
  }
  if (stat.isFile()) {
    fs.copyFileSync(contentPath, targetPath);
    fs.chmodSync(targetPath, stat.mode & 0o777);
    return;
  }
  throw new Error(`Unsupported entry type: ${sourcePath}`);
}

function backupEntry(targetPath, backupPath) {
  if (!pathExists(targetPath)) return { type: "missing" };
  const stat = fs.lstatSync(targetPath);
  if (stat.isSymbolicLink()) {
    return { type: "symlink", linkTarget: fs.readlinkSync(targetPath) };
  }
  copyEntry(targetPath, backupPath);
  return { type: stat.isDirectory() ? "directory" : "file", path: backupPath };
}

function restoreBackup(targetPath, backup) {
  removeEntry(targetPath);
  if (!backup || backup.type === "missing") return;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (backup.type === "symlink") {
    fs.symlinkSync(backup.linkTarget, targetPath);
    return;
  }
  copyEntry(backup.path, targetPath);
}

function relativeLinkTarget(sourcePath, targetPath) {
  const targetDir = path.dirname(targetPath);
  try {
    return path.relative(fs.realpathSync(targetDir), sourcePath);
  } catch {
    return path.relative(targetDir, sourcePath);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function applyReorgPlan(
  plan,
  { configDir = CONFIG_DIR, onEvent = () => {}, beforeAction = () => {}, yieldAfterAction = true } = {},
) {
  if (!plan.canApply) throw new Error("The reorganization plan has unresolved conflicts.");
  if (!plan.hasChanges) return { applied: 0, transactionId: null };

  for (const action of plan.actions) {
    const current = captureSignature(action.target);
    if (!signaturesEqual(current, action.precondition)) {
      throw new Error(`Filesystem changed after planning: ${action.target}`);
    }
    if (pathExists(action.source) && hashEntry(action.source) !== action.expectedDigest) {
      throw new Error(`Filesystem changed after planning: ${action.source}`);
    }
  }

  const transactionId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${plan.id}`;
  const transactionDir = path.join(configDir, "transactions", transactionId);
  const backupDir = path.join(transactionDir, "backup");
  const manifestPath = path.join(transactionDir, "manifest.json");
  const completed = [];
  const manifest = {
    version: STATE_VERSION,
    id: transactionId,
    planId: plan.id,
    sourceRoot: plan.sourceRoot,
    strategy: plan.strategy,
    status: "applying",
    startedAt: new Date().toISOString(),
    completed: [],
    rollbackErrors: [],
  };
  writeJson(manifestPath, manifest);

  try {
    for (let index = 0; index < plan.actions.length; index += 1) {
      const action = plan.actions[index];
      const current = captureSignature(action.target);
      if (!signaturesEqual(current, action.precondition)) {
        throw new Error(`Filesystem changed while applying the plan: ${action.target}`);
      }
      if (pathExists(action.source) && hashEntry(action.source) !== action.expectedDigest) {
        throw new Error(`Filesystem changed while applying the plan: ${action.source}`);
      }
      onEvent({ type: "action-start", action, index, total: plan.actions.length });
      beforeAction({ action, index, total: plan.actions.length });

      if (action.type === "import") {
        const tempTarget = `${action.target}.saddle-tmp-${plan.id}`;
        if (pathExists(tempTarget)) {
          throw new Error(`Import staging path already exists: ${tempTarget}`);
        }
        try {
          copyEntry(action.source, tempTarget);
          if (hashEntry(tempTarget) !== action.expectedDigest) {
            throw new Error(`Import verification failed: ${action.source}`);
          }
          fs.mkdirSync(path.dirname(action.target), { recursive: true });
          fs.renameSync(tempTarget, action.target);
        } catch (importError) {
          removeEntry(tempTarget);
          throw importError;
        }
        completed.push({ action, backup: { type: "missing" } });
      } else if (action.type === "link") {
        const backupPath = path.join(backupDir, String(index));
        const backup = backupEntry(action.target, backupPath);
        completed.push({ action, backup });
        removeEntry(action.target);
        fs.mkdirSync(path.dirname(action.target), { recursive: true });
        const linkTarget = relativeLinkTarget(action.source, action.target);
        const sourceStat = fs.statSync(action.source);
        const linkType = process.platform === "win32" ? (sourceStat.isDirectory() ? "junction" : "file") : undefined;
        fs.symlinkSync(linkTarget, action.target, linkType);
        if (!pointsTo(action.target, action.source)) {
          throw new Error(`Link verification failed: ${action.target}`);
        }
        if (hashEntry(action.target) !== action.expectedDigest) {
          throw new Error(`Link content verification failed: ${action.target}`);
        }
      } else if (action.type === "remove-duplicate") {
        const backupPath = path.join(backupDir, String(index));
        const backup = backupEntry(action.target, backupPath);
        completed.push({ action, backup });
        removeEntry(action.target);
      } else {
        throw new Error(`Unsupported reorganization action: ${action.type}`);
      }

      manifest.completed = completed.map(({ action, backup }) => ({
        actionId: action.id,
        target: action.target,
        backup,
      }));
      writeJson(manifestPath, manifest);
      onEvent({ type: "action-complete", action, index: index + 1, total: plan.actions.length });
      if (yieldAfterAction) await new Promise((resolve) => setImmediate(resolve));
    }

    manifest.status = "complete";
    manifest.completedAt = new Date().toISOString();
    writeJson(manifestPath, manifest);
    writeJson(path.join(configDir, "reorg-state.json"), {
      version: STATE_VERSION,
      updatedAt: manifest.completedAt,
      sourceRoot: plan.sourceRoot,
      strategy: plan.strategy,
      lastTransactionId: transactionId,
      links: [...plan.actions, ...plan.unchanged]
        .filter((action) => action.type === "link" || !action.type)
        .map((action) => ({
          source: action.source,
          target: action.target,
          targetClass: action.targetClass,
          tools: action.tools,
          kind: action.kind,
        })),
    });
    onEvent({ type: "complete", transactionId, total: plan.actions.length });
    return { applied: plan.actions.length, transactionId };
  } catch (error) {
    for (const record of completed.slice().reverse()) {
      try {
        restoreBackup(record.action.target, record.backup);
      } catch (rollbackError) {
        manifest.rollbackErrors.push({
          target: record.action.target,
          message: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
    }
    manifest.status = manifest.rollbackErrors.length > 0 ? "rollback-failed" : "rolled-back";
    manifest.completed = completed.map(({ action, backup }) => ({
      actionId: action.id,
      target: action.target,
      backup,
    }));
    manifest.failedAt = new Date().toISOString();
    manifest.error = error instanceof Error ? error.message : String(error);
    writeJson(manifestPath, manifest);
    onEvent({ type: "rollback", error: manifest.error });
    throw error;
  }
}

function summarizePlan(plan) {
  const counts = {
    import: 0,
    universal: 0,
    provider: 0,
    remove: 0,
    unchanged: plan.unchanged.length,
    conflicts: plan.conflicts.length,
  };
  for (const action of plan.actions) {
    if (action.type === "import") counts.import += 1;
    if (action.type === "link" && action.targetClass === "universal") counts.universal += 1;
    if (action.type === "link" && action.targetClass === "provider") counts.provider += 1;
    if (action.type === "remove-duplicate") counts.remove += 1;
  }
  return counts;
}

module.exports = {
  PLAN_VERSION,
  STATE_VERSION,
  applyReorgPlan,
  buildReorgPlan,
  captureSignature,
  hashEntry,
  listEntries,
  pathExists,
  scanReorg,
  selectEndpoints,
  signaturesEqual,
  summarizePlan,
};
