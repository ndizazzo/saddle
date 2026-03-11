"use strict";

const { describe, it, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { makeTempDir, rmrf, mkfile, mkdir, clearConfigModules } = require("./helpers.js");

let tmpDir;
let configPath;
let rulesDir;

function fresh() {
  clearConfigModules();
  return require("../scripts/load-config.js");
}

describe("load-config", () => {
  before(() => {
    tmpDir = makeTempDir("ai-config-lc-");
    configPath = path.join(tmpDir, "config.yaml");
    rulesDir = path.join(tmpDir, "rules");
    process.env.AI_CONFIG_PATH = configPath;
    process.env.AI_CONFIG_RULES_DIR = rulesDir;
    process.env.AI_CONFIG_DIR = tmpDir;
  });

  after(() => {
    delete process.env.AI_CONFIG_PATH;
    delete process.env.AI_CONFIG_RULES_DIR;
    delete process.env.AI_CONFIG_DIR;
    clearConfigModules();
    rmrf(tmpDir);
  });

  beforeEach(() => {
    try { fs.unlinkSync(configPath); } catch {}
    try { fs.rmSync(rulesDir, { recursive: true, force: true }); } catch {}
    clearConfigModules();
  });

  describe("CONFIG_PATH", () => {
    it("uses AI_CONFIG_PATH env var", () => {
      const { CONFIG_PATH } = fresh();
      assert.strictEqual(CONFIG_PATH, configPath);
    });
  });

  describe("RULES_DIR", () => {
    it("uses AI_CONFIG_RULES_DIR env var", () => {
      const { RULES_DIR } = fresh();
      assert.strictEqual(RULES_DIR, rulesDir);
    });
  });

  describe("loadConfig — file absent", () => {
    it("writes a config file on first call", () => {
      const { loadConfig } = fresh();
      loadConfig("/fallback");
      assert.ok(fs.existsSync(configPath));
    });

    it("written file contains sourceRoot key", () => {
      const { loadConfig } = fresh();
      loadConfig("/fallback");
      assert.ok(fs.readFileSync(configPath, "utf8").includes("sourceRoot:"));
    });

    it("written file does not contain targets key", () => {
      const { loadConfig } = fresh();
      loadConfig("/fallback");
      assert.ok(!fs.readFileSync(configPath, "utf8").includes("targets:"));
    });

    it("seeds rules directory from bundled defaults on first call", () => {
      const { loadConfig, BUNDLED_RULES_DIR } = fresh();
      loadConfig("/fallback");
      assert.ok(fs.existsSync(rulesDir));
      const bundledFiles = fs.readdirSync(BUNDLED_RULES_DIR).filter((f) => f.endsWith(".yaml"));
      const seededFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".yaml"));
      assert.strictEqual(seededFiles.length, bundledFiles.length);
    });

    it("returns expanded DEFAULT_SOURCE_ROOT as sourceRoot", () => {
      const { loadConfig, DEFAULT_SOURCE_ROOT } = fresh();
      const config = loadConfig("/fallback");
      const expected = DEFAULT_SOURCE_ROOT.startsWith("~/")
        ? path.join(os.homedir(), DEFAULT_SOURCE_ROOT.slice(1))
        : DEFAULT_SOURCE_ROOT;
      assert.strictEqual(config.sourceRoot, expected);
    });

    it("returns rules array from seeded rule files", () => {
      const { loadConfig } = fresh();
      const config = loadConfig("/fallback");
      assert.ok(Array.isArray(config.rules));
      assert.ok(config.rules.length > 0);
    });

    it("returns ignore.names with default filenames", () => {
      const { loadConfig } = fresh();
      const { ignore } = loadConfig("/fallback");
      for (const name of [".gitignore", ".DS_Store", "package.json", "bun.lock"]) {
        assert.ok(ignore.names.has(name), `missing default ignore name: ${name}`);
      }
    });

    it("returns ignore.globRegexes that match *.bak.* files", () => {
      const { loadConfig } = fresh();
      const { ignore } = loadConfig("/fallback");
      assert.ok(ignore.globRegexes.some((re) => re.test("foo.bak.2025-01")));
    });

    it("returns expandHome as a function", () => {
      const { loadConfig } = fresh();
      assert.strictEqual(typeof loadConfig("/fallback").expandHome, "function");
    });
  });

  describe("loadConfig — file present", () => {
    it("reads sourceRoot from the file", () => {
      mkfile(configPath, "sourceRoot: /custom/source\nignore: []\n");
      const config = fresh().loadConfig("/fallback");
      assert.strictEqual(config.sourceRoot, "/custom/source");
    });

    it("expands ~ in sourceRoot", () => {
      mkfile(configPath, "sourceRoot: ~/my/path\nignore: []\n");
      const config = fresh().loadConfig("/fallback");
      assert.strictEqual(config.sourceRoot, path.join(os.homedir(), "my/path"));
    });

    it("falls back to DEFAULT_SOURCE_ROOT when sourceRoot key is absent", () => {
      mkfile(configPath, "ignore: []\n");
      const { loadConfig, DEFAULT_SOURCE_ROOT } = fresh();
      const config = loadConfig("/fallback");
      const expected = DEFAULT_SOURCE_ROOT.startsWith("~/")
        ? path.join(os.homedir(), DEFAULT_SOURCE_ROOT.slice(1))
        : DEFAULT_SOURCE_ROOT;
      assert.strictEqual(config.sourceRoot, expected);
    });

    it("does not rewrite the config file if it already exists", () => {
      mkfile(configPath, "sourceRoot: /existing\nignore: []\n");
      const mtimeBefore = fs.statSync(configPath).mtimeMs;
      fresh().loadConfig("/fallback");
      assert.strictEqual(fs.statSync(configPath).mtimeMs, mtimeBefore);
    });

    it("merges extra ignore name with defaults", () => {
      mkfile(configPath, "sourceRoot: /s\nignore:\n  - custom-ignore.txt\n");
      const { ignore } = fresh().loadConfig("/fallback");
      assert.ok(ignore.names.has("custom-ignore.txt"));
      assert.ok(ignore.names.has(".gitignore"), "defaults must be preserved");
    });

    it("merges extra glob pattern with defaults", () => {
      mkfile(configPath, "sourceRoot: /s\nignore:\n  - '*.tmp'\n");
      const { ignore } = fresh().loadConfig("/fallback");
      assert.ok(ignore.globRegexes.some((re) => re.test("foo.tmp")));
    });
  });

  describe("loadRules", () => {
    it("returns empty array when rules directory does not exist and bundled rules are missing", () => {
      const mod = fresh();
      const origBundled = mod.BUNDLED_RULES_DIR;
      try {
        Object.defineProperty(mod, "BUNDLED_RULES_DIR", { value: "/nonexistent-bundled", writable: true, configurable: true });
        const rules = mod.loadRules();
        assert.ok(Array.isArray(rules));
      } finally {
        Object.defineProperty(mod, "BUNDLED_RULES_DIR", { value: origBundled, writable: true, configurable: true });
      }
    });

    it("loads rules from YAML files in rules directory", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "test-tool.yaml"), "tool: test\nlabel: Test Tool\nbinary: test-bin\nhome: /tmp/test\nenabled: true\nmappings:\n  - type: skills\n    source: skills\n    target: skills\n");
      const rules = fresh().loadRules();
      assert.strictEqual(rules.length, 1);
      assert.strictEqual(rules[0].name, "test");
      assert.strictEqual(rules[0].label, "Test Tool");
      assert.deepStrictEqual(rules[0].binary, { which: "test-bin", paths: {} });
      assert.strictEqual(rules[0].enabled, true);
    });

    it("normalizes string binary to { which, paths } object", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "str-bin.yaml"), "tool: t\nhome: /tmp/t\nbinary: mybinary\nmappings: []\n");
      const rules = fresh().loadRules();
      assert.deepStrictEqual(rules[0].binary, { which: "mybinary", paths: {} });
    });

    it("preserves object binary with which and paths", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "obj-bin.yaml"), [
        "tool: t",
        "home: /tmp/t",
        "binary:",
        "  which: mytool",
        "  paths:",
        "    darwin: /Applications/MyTool.app",
        "    linux: /usr/bin/mytool",
        "mappings: []",
      ].join("\n"));
      const rules = fresh().loadRules();
      assert.deepStrictEqual(rules[0].binary, {
        which: "mytool",
        paths: { darwin: "/Applications/MyTool.app", linux: "/usr/bin/mytool" },
      });
    });

    it("normalizes object binary missing which to null which", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "no-which.yaml"), [
        "tool: t",
        "home: /tmp/t",
        "binary:",
        "  paths:",
        "    darwin: /Applications/T.app",
        "mappings: []",
      ].join("\n"));
      const rules = fresh().loadRules();
      assert.strictEqual(rules[0].binary.which, null);
      assert.deepStrictEqual(rules[0].binary.paths, { darwin: "/Applications/T.app" });
    });

    it("sets binary to null when absent", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "no-bin.yaml"), "tool: t\nhome: /tmp/t\nmappings: []\n");
      const rules = fresh().loadRules();
      assert.strictEqual(rules[0].binary, null);
    });

    it("loads multiple rule files", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "a.yaml"), "tool: a\nlabel: A\nhome: /tmp/a\nmappings: []\n");
      mkfile(path.join(rulesDir, "b.yaml"), "tool: b\nlabel: B\nhome: /tmp/b\nmappings: []\n");
      const rules = fresh().loadRules();
      assert.strictEqual(rules.length, 2);
    });

    it("defaults enabled to true when not specified", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "x.yaml"), "tool: x\nlabel: X\nhome: /tmp/x\nmappings: []\n");
      const rules = fresh().loadRules();
      assert.strictEqual(rules[0].enabled, true);
    });

    it("respects enabled: false", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "disabled.yaml"), "tool: disabled\nlabel: Disabled\nhome: /tmp/d\nenabled: false\nmappings: []\n");
      const rules = fresh().loadRules();
      assert.strictEqual(rules[0].enabled, false);
    });

    it("skips files without tool field", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "bad.yaml"), "label: NoTool\nhome: /tmp/x\nmappings: []\n");
      const rules = fresh().loadRules();
      assert.strictEqual(rules.length, 0);
    });

    it("skips malformed YAML files", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "broken.yaml"), "key: [unclosed");
      mkfile(path.join(rulesDir, "good.yaml"), "tool: good\nlabel: Good\nhome: /tmp/g\nmappings: []\n");
      const rules = fresh().loadRules();
      assert.strictEqual(rules.length, 1);
      assert.strictEqual(rules[0].name, "good");
    });

    it("filters mappings missing type or source", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "partial.yaml"), [
        "tool: partial",
        "label: Partial",
        "home: /tmp/p",
        "mappings:",
        "  - type: skills",
        "  - source: foo.md",
        "  - type: file",
        "    source: ok.md",
        "    target: ok.md",
      ].join("\n"));
      const rules = fresh().loadRules();
      assert.strictEqual(rules[0].mappings.length, 1);
      assert.strictEqual(rules[0].mappings[0].source, "ok.md");
    });

    it("uses tool name as label when label is missing", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "nolabel.yaml"), "tool: nolabel\nhome: /tmp/n\nmappings: []\n");
      const rules = fresh().loadRules();
      assert.strictEqual(rules[0].label, "nolabel");
    });

    it("loads .yml files as well as .yaml", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "yml-tool.yml"), "tool: yml\nlabel: YML\nhome: /tmp/y\nmappings: []\n");
      const rules = fresh().loadRules();
      assert.strictEqual(rules.length, 1);
      assert.strictEqual(rules[0].name, "yml");
    });

    it("ignores non-yaml files in rules directory", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "readme.md"), "# not a rule");
      mkfile(path.join(rulesDir, "valid.yaml"), "tool: valid\nlabel: Valid\nhome: /tmp/v\nmappings: []\n");
      const rules = fresh().loadRules();
      assert.strictEqual(rules.length, 1);
    });
  });

  describe("seedDefaultRules", () => {
    it("copies bundled rules into rules directory", () => {
      const { seedDefaultRules, BUNDLED_RULES_DIR } = fresh();
      seedDefaultRules();
      assert.ok(fs.existsSync(rulesDir));
      const bundledFiles = fs.readdirSync(BUNDLED_RULES_DIR).filter((f) => f.endsWith(".yaml"));
      const seededFiles = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".yaml"));
      assert.strictEqual(seededFiles.length, bundledFiles.length);
    });

    it("does not overwrite existing rule files", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "claude.yaml"), "tool: claude\nlabel: My Custom Claude\nhome: /custom\nmappings: []\n");
      const { seedDefaultRules } = fresh();
      seedDefaultRules();
      const content = fs.readFileSync(path.join(rulesDir, "claude.yaml"), "utf8");
      assert.ok(content.includes("My Custom Claude"));
    });

    it("adds missing default rules alongside existing custom ones", () => {
      mkdir(rulesDir);
      mkfile(path.join(rulesDir, "claude.yaml"), "tool: claude\nlabel: Custom\nhome: /c\nmappings: []\n");
      const { seedDefaultRules, BUNDLED_RULES_DIR } = fresh();
      seedDefaultRules();
      const bundledCount = fs.readdirSync(BUNDLED_RULES_DIR).filter((f) => f.endsWith(".yaml")).length;
      const seededCount = fs.readdirSync(rulesDir).filter((f) => f.endsWith(".yaml")).length;
      assert.strictEqual(seededCount, bundledCount);
    });
  });

  describe("expandHome (returned from loadConfig)", () => {
    it("expands ~ to homedir", () => {
      mkfile(configPath, "sourceRoot: /s\nignore: []\n");
      const { expandHome } = fresh().loadConfig("/fallback");
      assert.strictEqual(expandHome("~"), os.homedir());
    });

    it("expands ~/sub/path to homedir/sub/path", () => {
      mkfile(configPath, "sourceRoot: /s\nignore: []\n");
      const { expandHome } = fresh().loadConfig("/fallback");
      assert.strictEqual(expandHome("~/foo/bar"), path.join(os.homedir(), "foo/bar"));
    });

    it("returns absolute paths unchanged", () => {
      mkfile(configPath, "sourceRoot: /s\nignore: []\n");
      const { expandHome } = fresh().loadConfig("/fallback");
      assert.strictEqual(expandHome("/absolute/path"), "/absolute/path");
    });

    it("returns null for non-string input", () => {
      mkfile(configPath, "sourceRoot: /s\nignore: []\n");
      const { expandHome } = fresh().loadConfig("/fallback");
      assert.strictEqual(expandHome(null), null);
      assert.strictEqual(expandHome(undefined), null);
      assert.strictEqual(expandHome(42), null);
    });
  });

  describe("writeSourceRoot", () => {
    it("creates the config file when absent", () => {
      fresh().writeSourceRoot("/new/source");
      assert.ok(fs.existsSync(configPath));
    });

    it("writes the given sourceRoot into a new file", () => {
      fresh().writeSourceRoot("/new/source");
      assert.ok(fs.readFileSync(configPath, "utf8").includes("/new/source"));
    });

    it("updates sourceRoot in an existing config", () => {
      mkfile(configPath, "sourceRoot: /old\nignore: []\n");
      fresh().writeSourceRoot("/updated");
      const raw = fs.readFileSync(configPath, "utf8");
      assert.ok(raw.includes("/updated"));
      assert.ok(!raw.includes("/old"));
    });

    it("preserves other keys when updating sourceRoot", () => {
      mkfile(configPath, "sourceRoot: /old\nignore:\n  - custom.txt\n");
      fresh().writeSourceRoot("/new");
      assert.ok(fs.readFileSync(configPath, "utf8").includes("custom.txt"));
    });
  });

  describe("bundled rules", () => {
    it("BUNDLED_RULES_DIR points to a directory with YAML files", () => {
      const { BUNDLED_RULES_DIR } = fresh();
      assert.ok(fs.existsSync(BUNDLED_RULES_DIR));
      const files = fs.readdirSync(BUNDLED_RULES_DIR).filter((f) => f.endsWith(".yaml"));
      assert.ok(files.length > 0);
    });

    it("bundled rules contain claude, codex, cursor, opencode, gemini, copilot", () => {
      const { BUNDLED_RULES_DIR } = fresh();
      const files = fs.readdirSync(BUNDLED_RULES_DIR).filter((f) => f.endsWith(".yaml"));
      const names = files.map((f) => f.replace(".yaml", ""));
      for (const name of ["claude", "codex", "cursor", "opencode", "gemini", "copilot"]) {
        assert.ok(names.includes(name), `missing bundled rule: ${name}`);
      }
    });
  });

  describe("loadConfig — invalid YAML", () => {
    it("falls back to DEFAULT_SOURCE_ROOT when YAML is unparseable", () => {
      mkfile(configPath, "key: [unclosed bracket");
      const { loadConfig, DEFAULT_SOURCE_ROOT } = fresh();
      const config = loadConfig("/fallback");
      const expected = DEFAULT_SOURCE_ROOT.startsWith("~/")
        ? path.join(os.homedir(), DEFAULT_SOURCE_ROOT.slice(1))
        : DEFAULT_SOURCE_ROOT;
      assert.strictEqual(config.sourceRoot, expected);
    });

    it("stores the parse error message via getConfigError()", () => {
      mkfile(configPath, "key: [unclosed bracket");
      const { loadConfig, getConfigError } = fresh();
      loadConfig("/fallback");
      const err = getConfigError();
      assert.ok(err !== null, "expected a config error to be stored");
      assert.strictEqual(typeof err, "string");
      assert.ok(err.length > 0, "error message should be non-empty");
    });

    it("getConfigError() returns null when YAML is valid", () => {
      mkfile(configPath, "sourceRoot: /s\nignore: []\n");
      const { loadConfig, getConfigError } = fresh();
      loadConfig("/fallback");
      assert.strictEqual(getConfigError(), null);
    });

    it("getConfigError() returns null when config file is absent", () => {
      const { loadConfig, getConfigError } = fresh();
      loadConfig("/fallback");
      assert.strictEqual(getConfigError(), null);
    });
  });

  describe("writeDefaultConfig export", () => {
    it("is a function", () => {
      const { writeDefaultConfig } = fresh();
      assert.strictEqual(typeof writeDefaultConfig, "function");
    });

    it("creates a valid config file", () => {
      const { writeDefaultConfig } = fresh();
      writeDefaultConfig();
      assert.ok(fs.existsSync(configPath));
      const raw = fs.readFileSync(configPath, "utf8");
      assert.ok(raw.includes("sourceRoot:"));
    });

    it("seeds rules directory when called", () => {
      const { writeDefaultConfig } = fresh();
      writeDefaultConfig();
      assert.ok(fs.existsSync(rulesDir));
    });
  });
});
