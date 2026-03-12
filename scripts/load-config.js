#!/usr/bin/env node

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { parse, stringify } = require("yaml");

const CONFIG_DIR = process.env.AI_CONFIG_DIR || path.join(os.homedir(), ".config", "ai-config");
const CONFIG_PATH = process.env.AI_CONFIG_PATH || path.join(CONFIG_DIR, "config.yaml");
const RULES_DIR = process.env.AI_CONFIG_RULES_DIR || path.join(CONFIG_DIR, "rules");

const DEFAULT_IGNORE_NAMES = [".gitignore", "package.json", "bun.lock", "yarn.lock", "package-lock.json", ".DS_Store"];
const DEFAULT_IGNORE_GLOBS = ["*.bak.*"];

const DEFAULT_SOURCE_ROOT = "~/dev/ai";

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

function normalizeRule(raw) {
  if (!raw || typeof raw.tool !== "string") return null;
  return {
    name: raw.tool,
    label: raw.label || raw.tool,
    binary: normalizeBinary(raw.binary),
    home: raw.home || null,
    enabled: raw.enabled !== false,
    mappings: Array.isArray(raw.mappings) ? raw.mappings.filter((m) => m && m.type && m.source && m.target !== undefined).map((m) => ({
      type: m.type,
      source: m.source,
      target: m.target,
      ...(m.itemType ? { itemType: m.itemType } : {}),
    })) : [],
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

function loadRules() {
  if (!fs.existsSync(RULES_DIR)) {
    seedDefaultRules();
  }

  if (!fs.existsSync(RULES_DIR)) {
    return [];
  }

  const files = fs.readdirSync(RULES_DIR).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  const rules = [];

   for (const file of files) {
     const filePath = path.join(RULES_DIR, file);
     try {
       const raw = fs.readFileSync(filePath, "utf8");
       const parsed = parse(raw);
       const rule = normalizeRule(parsed);
       if (rule) {
         rules.push(rule);
       }
     } catch {
       /* skip unparseable rule file — malformed YAML should not crash the whole config load */
     }
   }

  return rules;
}

function writeDefaultConfig() {
  const defaultObj = {
    sourceRoot: DEFAULT_SOURCE_ROOT,
    ignore: [],
  };
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, stringify(defaultObj, { lineWidth: 120 }), "utf8");
  seedDefaultRules();
}

function loadConfig(fallbackSourceRoot) {
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
    if (err.code === "ENOENT") {
      writeDefaultConfig();
    }
  }

  const sourceRoot = expandHome(parsed.sourceRoot) || expandHome(DEFAULT_SOURCE_ROOT) || fallbackSourceRoot;
  const ignore = buildIgnore(Array.isArray(parsed.ignore) ? parsed.ignore : []);
  const rules = loadRules();

  return { sourceRoot, ignore, rules, expandHome, configError };
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

module.exports = { loadConfig, loadRules, writeSourceRoot, writeDefaultConfig, seedDefaultRules, CONFIG_PATH, CONFIG_DIR, RULES_DIR, DEFAULT_SOURCE_ROOT, BUNDLED_RULES_DIR };
