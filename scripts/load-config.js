#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { parse, stringify } = require("yaml");

/**
 * @typedef {Object} BinarySpec
 * @property {string|null} which - Command name to look up via `which`
 * @property {Object.<string, string>} paths - Platform-specific absolute paths keyed by `process.platform`
 */

/**
 * @typedef {Object} Mapping
 * @property {"skills"|"file"|"directory"} type - How to enumerate source items
 * @property {string} source - Repo-relative path to the source file or directory
 * @property {string} target - Tool-home-relative destination path (or "." for home root)
 * @property {string} [itemType] - Override the inferred item type label (e.g. "skill", "agent", "command")
 */

/**
 * @typedef {Object} ReorgLocation
 * @property {string} path - Absolute or tilde-prefixed directory scanned and linked by the reorg command
 * @property {'universal'|'provider'} targetClass - Whether the location is shared by several tools or owned by one tool
 */

/**
 * @typedef {Object} ReorgAsset
 * @property {'skill'|'agent'|'command'|'instruction'|'config'} kind - Canonical asset category
 * @property {string} canonical - Source-root-relative canonical directory
 * @property {'directories'|'files'} entries - How items are enumerated inside each location
 * @property {ReorgLocation[]} locations - Supported discovery and link locations
 */

/**
 * @typedef {Object} Rule
 * @property {string} name - Tool identifier (e.g. "claude", "codex")
 * @property {string} label - Human-readable display name
 * @property {BinarySpec|null} binary - Binary detection spec; null when detection is home-only
 * @property {string|null} home - Tilde-prefixed home directory path for the tool (e.g. "~/.claude")
 * @property {boolean} enabled - Whether this rule is active
 * @property {'multi-select'|'single-select'} mode - Selection mode: "multi-select" (default) allows selecting any combination; "single-select" allows only one item at a time
 * @property {Mapping[]} mappings - Ordered list of source→target mapping definitions
 * @property {number} schemaVersion - Provider rule schema version
 * @property {ReorgAsset[]} reorgAssets - Provider locations used by `saddle reorg`
 */

/**
 * @typedef {Object} IgnoreSpec
 * @property {Set<string>} names - Exact filenames to skip
 * @property {RegExp[]} globRegexes - Compiled regexes for glob-style ignore patterns
 */

/**
 * @typedef {Object} Config
 * @property {string} sourceRoot - Absolute path to the canonical definitions repo
 * @property {string|null} configuredSourceRoot - Explicit source root from CLI environment or config, null when unset
 * @property {'universal-first'|'provider-only'} linkStrategy - Reorganization target selection strategy
 * @property {IgnoreSpec} ignore - Compiled ignore rules for directory mappings
 * @property {Rule[]} rules - Loaded and normalised tool rules
 * @property {function(string|any): string|null} expandHome - Expands a leading `~/` to the OS home directory
 * @property {string|null} configError - YAML parse error message when the config file is malformed; null otherwise
 */

const CONFIG_DIR = process.env.SADDLE_DIR || path.join(os.homedir(), ".config", "saddle");
const CONFIG_PATH = process.env.SADDLE_CONFIG || path.join(CONFIG_DIR, "config.yaml");
const RULES_DIR = process.env.SADDLE_RULES_DIR || path.join(CONFIG_DIR, "rules");

const DEFAULT_IGNORE_NAMES = [".gitignore", "package.json", "bun.lock", "yarn.lock", "package-lock.json", ".DS_Store"];
const DEFAULT_IGNORE_GLOBS = ["*.bak.*"];

const DEFAULT_SOURCE_ROOT = null;
const DEFAULT_LINK_STRATEGY = "universal-first";
const CURRENT_RULE_SCHEMA_VERSION = 2;

const BUNDLED_RULES_DIR = path.join(__dirname, "..", "rules");

function expandHome(p) {
  if (typeof p !== "string") return null;
  if (p === "~" || p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function buildIgnore(extraPatterns) {
  const names = new Set(DEFAULT_IGNORE_NAMES);
  const globs = [...DEFAULT_IGNORE_GLOBS];

  for (const pattern of extraPatterns) {
    if (typeof pattern !== "string") continue;
    if (pattern.includes("*")) {
      globs.push(pattern);
    } else {
      names.add(pattern);
    }
  }

  const globRegexes = globs.map((glob) => {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`);
  });

  return { names, globRegexes };
}

function normalizeBinary(raw) {
  if (!raw) return null;
  if (typeof raw === "string") return { which: raw, paths: {} };
  if (typeof raw === "object") {
    return {
      which: typeof raw.which === "string" ? raw.which : null,
      paths: raw.paths && typeof raw.paths === "object" ? { ...raw.paths } : {},
    };
  }
  return null;
}

function normalizeLinkStrategy(value) {
  return value === "provider-only" ? "provider-only" : DEFAULT_LINK_STRATEGY;
}

function normalizeReorgAssets(raw) {
  const assets = raw && Array.isArray(raw.assets) ? raw.assets : [];
  const supportedKinds = new Set(["skill", "agent", "command", "instruction", "config"]);

  return assets
    .filter(
      (asset) =>
        asset &&
        supportedKinds.has(asset.kind) &&
        typeof asset.canonical === "string" &&
        asset.canonical.length > 0 &&
        !path.isAbsolute(asset.canonical) &&
        path.normalize(asset.canonical) !== ".." &&
        path.normalize(asset.canonical) !== "." &&
        !path.normalize(asset.canonical).startsWith(`..${path.sep}`) &&
        ["directories", "files"].includes(asset.entries) &&
        Array.isArray(asset.locations),
    )
    .map((asset) => ({
      kind: asset.kind,
      canonical: asset.canonical,
      entries: asset.entries === "files" ? "files" : "directories",
      locations: asset.locations
        .filter(
          (location) =>
            location &&
            typeof location.path === "string" &&
            (path.isAbsolute(location.path) || location.path === "~" || location.path.startsWith("~/")) &&
            ["universal", "provider"].includes(location.targetClass),
        )
        .map((location) => ({
          path: location.path,
          targetClass: location.targetClass,
        })),
    }))
    .filter((asset) => asset.locations.length > 0);
}

function normalizeRule(raw) {
  if (!raw || typeof raw.tool !== "string") return null;
  const schemaVersion = Number.isInteger(raw.schemaVersion) ? raw.schemaVersion : 1;
  return {
    name: raw.tool,
    label: raw.label || raw.tool,
    binary: normalizeBinary(raw.binary),
    home: raw.home || null,
    enabled: raw.enabled !== false,
    mode: raw.mode === "single-select" ? "single-select" : "multi-select",
    schemaVersion,
    reorgAssets: schemaVersion === CURRENT_RULE_SCHEMA_VERSION ? normalizeReorgAssets(raw.reorg) : [],
    mappings: Array.isArray(raw.mappings)
      ? raw.mappings
          .filter((m) => m && m.type && m.source && m.target !== undefined)
          .map((m) => ({
            type: m.type,
            source: m.source,
            target: m.target,
            ...(m.itemType ? { itemType: m.itemType } : {}),
          }))
      : [],
  };
}

function seedDefaultRules() {
  if (!fs.existsSync(BUNDLED_RULES_DIR)) return;

  fs.mkdirSync(RULES_DIR, { recursive: true });

  const bundledFiles = fs.readdirSync(BUNDLED_RULES_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  for (const file of bundledFiles) {
    const targetPath = path.join(RULES_DIR, file);
    if (!fs.existsSync(targetPath)) {
      fs.copyFileSync(path.join(BUNDLED_RULES_DIR, file), targetPath);
    }
  }
}

function readRawRules(directoryPath) {
  if (!fs.existsSync(directoryPath)) return [];
  const files = fs
    .readdirSync(directoryPath)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  const rawRules = [];
  for (const file of files) {
    const filePath = path.join(directoryPath, file);
    try {
      const raw = fs.readFileSync(filePath, "utf8");
      const parsed = parse(raw);
      if (parsed && typeof parsed.tool === "string") rawRules.push(parsed);
    } catch {
      /* skip unparseable rule file — malformed YAML should not crash the whole config load */
    }
  }
  return rawRules;
}

function loadRules({ initialize = true } = {}) {
  if (initialize && !fs.existsSync(RULES_DIR)) seedDefaultRules();

  const customRules = readRawRules(RULES_DIR);
  if (process.env.SADDLE_RULES_DIR) {
    return customRules.map(normalizeRule).filter(Boolean);
  }

  const mergedRules = new Map();
  for (const bundled of readRawRules(BUNDLED_RULES_DIR)) mergedRules.set(bundled.tool, bundled);
  for (const custom of customRules) {
    const bundled = mergedRules.get(custom.tool);
    const inheritsBundledReorg = Boolean(bundled?.reorg) && !Object.hasOwn(custom, "reorg");
    const hasUnversionedCustomReorg = Object.hasOwn(custom, "reorg") && !Object.hasOwn(custom, "schemaVersion");
    const inheritedSchemaVersion = inheritsBundledReorg
      ? Math.max(
          Number.isInteger(bundled.schemaVersion) ? bundled.schemaVersion : 1,
          Number.isInteger(custom.schemaVersion) ? custom.schemaVersion : 1,
        )
      : custom.schemaVersion;
    mergedRules.set(
      custom.tool,
      bundled
        ? {
            ...bundled,
            ...custom,
            ...(inheritsBundledReorg ? { reorg: bundled.reorg, schemaVersion: inheritedSchemaVersion } : {}),
            ...(hasUnversionedCustomReorg ? { schemaVersion: 1 } : {}),
          }
        : custom,
    );
  }

  return Array.from(mergedRules.values()).map(normalizeRule).filter(Boolean);
}

function writeDefaultConfig() {
  const defaultObj = {
    sourceRoot: DEFAULT_SOURCE_ROOT,
    linkStrategy: DEFAULT_LINK_STRATEGY,
    ignore: [],
  };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, stringify(defaultObj, { lineWidth: 120 }), "utf8");
  seedDefaultRules();
}

function loadConfig(fallbackSourceRoot, { initialize = true } = {}) {
  let parsed = {};
  let configError = null;

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    try {
      parsed = parse(raw) || {};
    } catch (yamlErr) {
      configError = yamlErr.message || String(yamlErr);
    }
  } catch (err) {
    if (err.code === "ENOENT" && initialize) {
      writeDefaultConfig();
    }
  }

  const configuredSourceRoot =
    expandHome(process.env.SADDLE_SOURCE_ROOT) || expandHome(parsed.sourceRoot) || expandHome(DEFAULT_SOURCE_ROOT);
  const sourceRoot = configuredSourceRoot || fallbackSourceRoot;
  const linkStrategy = normalizeLinkStrategy(process.env.SADDLE_LINK_STRATEGY || parsed.linkStrategy);
  const ignore = buildIgnore(Array.isArray(parsed.ignore) ? parsed.ignore : []);
  const rules = loadRules({ initialize });

  return { sourceRoot, configuredSourceRoot, linkStrategy, ignore, rules, expandHome, configError };
}

function writeSourceRoot(newPath) {
  let parsed = {};
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    parsed = parse(raw) || {};
  } catch {
    /* config file doesn't exist yet — writing fresh config, start with empty object */
  }
  parsed.sourceRoot = newPath;
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, stringify(parsed, { lineWidth: 120 }), "utf8");
}

function writeReorgSettings({ sourceRoot, linkStrategy }) {
  let parsed = {};
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    parsed = parse(raw) || {};
  } catch {
    /* config file doesn't exist yet - write a fresh one */
  }

  if (sourceRoot !== undefined) parsed.sourceRoot = sourceRoot;
  if (linkStrategy !== undefined) parsed.linkStrategy = normalizeLinkStrategy(linkStrategy);
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, stringify(parsed, { lineWidth: 120 }), "utf8");
}

module.exports = {
  loadConfig,
  loadRules,
  writeSourceRoot,
  writeReorgSettings,
  writeDefaultConfig,
  seedDefaultRules,
  CONFIG_PATH,
  CONFIG_DIR,
  RULES_DIR,
  DEFAULT_SOURCE_ROOT,
  DEFAULT_LINK_STRATEGY,
  CURRENT_RULE_SCHEMA_VERSION,
  BUNDLED_RULES_DIR,
};
