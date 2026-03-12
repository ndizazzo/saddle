"use strict";

const { describe, it, before, after, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { makeTempDir, rmrf, mkfile, mkdir, clearConfigModules } = require("./helpers.js");

let globalTmpDir;
let testConfigPath;
let testRulesDir;
let homeAlpha;
let homeBeta;
let homeGamma;
let core;

before(() => {
  globalTmpDir = makeTempDir("ai-config-core-");
  testConfigPath = path.join(globalTmpDir, "config.yaml");
  testRulesDir = path.join(globalTmpDir, "rules");
  homeAlpha = path.join(globalTmpDir, "home-alpha");
  homeBeta  = path.join(globalTmpDir, "home-beta");
  homeGamma = path.join(globalTmpDir, "home-gamma");
  mkdir(homeAlpha);
  mkdir(homeBeta);
  mkdir(homeGamma);

  mkfile(testConfigPath, [
    `sourceRoot: ${globalTmpDir}`,
    "ignore:",
    "  - SKIP.txt",
    "  - '*.bak.*'",
  ].join("\n"));

  mkdir(testRulesDir);
  mkfile(path.join(testRulesDir, "alpha.yaml"), [
    "tool: alpha",
    "label: Alpha",
    `home: ${homeAlpha}`,
    "enabled: true",
    "mappings:",
    "  - type: skills",
    "    source: skills",
    "    target: skills",
  ].join("\n"));

  mkfile(path.join(testRulesDir, "beta.yaml"), [
    "tool: beta",
    "label: Beta",
    `home: ${homeBeta}`,
    "enabled: true",
    "mappings:",
    "  - type: file",
    "    source: agents/beta/AGENTS.md",
    "    target: AGENTS.md",
    "  - type: directory",
    "    source: configs/beta",
    "    target: .",
  ].join("\n"));

  mkfile(path.join(testRulesDir, "gamma.yaml"), [
    "tool: gamma",
    "label: Gamma",
    `home: ${homeGamma}`,
    "enabled: true",
    "mappings:",
    "  - type: skills",
    "    source: skills",
    "    target: skills",
  ].join("\n"));

  process.env.AI_CONFIG_PATH = testConfigPath;
  process.env.AI_CONFIG_RULES_DIR = testRulesDir;
  process.env.AI_CONFIG_DIR = globalTmpDir;
  clearConfigModules();
  core = require("../scripts/install-core.js");
});

after(() => {
  delete process.env.AI_CONFIG_PATH;
  delete process.env.AI_CONFIG_RULES_DIR;
  delete process.env.AI_CONFIG_DIR;
  clearConfigModules();
  rmrf(globalTmpDir);
});

describe("parseArgs", () => {
  it("returns all-false defaults for empty argv", () => {
    const opts = core.parseArgs([]);
    assert.strictEqual(opts.dryRun, false);
    assert.strictEqual(opts.assumeYes, false);
    assert.strictEqual(opts.selectAll, false);
    assert.strictEqual(opts.listOnly, false);
    assert.strictEqual(opts.help, false);
    assert.strictEqual(opts.profileIds, null);
    assert.strictEqual(opts.verbose, false);
    assert.strictEqual(opts.quiet, false);
  });

  it("--dry-run sets dryRun", () => {
    assert.strictEqual(core.parseArgs(["--dry-run"]).dryRun, true);
  });

  it("--yes sets assumeYes", () => {
    assert.strictEqual(core.parseArgs(["--yes"]).assumeYes, true);
  });

  it("--all sets selectAll", () => {
    assert.strictEqual(core.parseArgs(["--all"]).selectAll, true);
  });

  it("--list sets listOnly", () => {
    assert.strictEqual(core.parseArgs(["--list"]).listOnly, true);
  });

  it("--help sets help", () => {
    assert.strictEqual(core.parseArgs(["--help"]).help, true);
  });

  it("-h sets help", () => {
    assert.strictEqual(core.parseArgs(["-h"]).help, true);
  });

  it("'sync' subcommand is silently ignored", () => {
    const opts = core.parseArgs(["sync", "--dry-run"]);
    assert.strictEqual(opts.dryRun, true);
  });

  it("--profile foo,bar splits into array", () => {
    assert.deepStrictEqual(core.parseArgs(["--profile", "foo,bar"]).profileIds, ["foo", "bar"]);
  });

  it("--profile=foo,bar splits into array", () => {
    assert.deepStrictEqual(core.parseArgs(["--profile=foo,bar"]).profileIds, ["foo", "bar"]);
  });

  it("--profile trims whitespace from ids", () => {
    assert.deepStrictEqual(core.parseArgs(["--profile", " foo , bar "]).profileIds, ["foo", "bar"]);
  });

  it("combines multiple flags correctly", () => {
    const opts = core.parseArgs(["--dry-run", "--all", "--yes"]);
    assert.strictEqual(opts.dryRun, true);
    assert.strictEqual(opts.selectAll, true);
    assert.strictEqual(opts.assumeYes, true);
  });

  it("throws on unknown argument", () => {
    assert.throws(() => core.parseArgs(["--unknown"]), /Unknown argument/);
  });

  it("throws when --profile has no value", () => {
    assert.throws(() => core.parseArgs(["--profile"]), /requires/);
  });

  it("defaults verbose to false", () => {
    assert.strictEqual(core.parseArgs([]).verbose, false);
  });

  it("defaults quiet to false", () => {
    assert.strictEqual(core.parseArgs([]).quiet, false);
  });

  it("--verbose sets verbose: true", () => {
    assert.strictEqual(core.parseArgs(["--verbose"]).verbose, true);
  });

  it("--quiet sets quiet: true", () => {
    assert.strictEqual(core.parseArgs(["--quiet"]).quiet, true);
  });

  it("--verbose and --quiet can both be specified without error", () => {
    const opts = core.parseArgs(["--verbose", "--quiet"]);
    assert.strictEqual(opts.verbose, true);
    assert.strictEqual(opts.quiet, true);
  });

  it("--quiet then --verbose: both true (last one wins per-flag)", () => {
    const opts = core.parseArgs(["--quiet", "--verbose"]);
    assert.strictEqual(opts.verbose, true);
    assert.strictEqual(opts.quiet, true);
  });
});

describe("fileExists", () => {
  let tmpDir;
  before(() => { tmpDir = makeTempDir("ai-config-fe-"); });
  after(() => { rmrf(tmpDir); });

  it("returns true for an existing file", () => {
    const f = path.join(tmpDir, "file.txt");
    mkfile(f, "hello");
    assert.strictEqual(core.fileExists(f), true);
  });

  it("returns true for an existing directory", () => {
    const d = path.join(tmpDir, "subdir");
    mkdir(d);
    assert.strictEqual(core.fileExists(d), true);
  });

  it("returns true for a symlink", () => {
    const src = path.join(tmpDir, "src.txt");
    const lnk = path.join(tmpDir, "link.txt");
    mkfile(src, "x");
    fs.symlinkSync(src, lnk);
    assert.strictEqual(core.fileExists(lnk), true);
  });

  it("returns false for a non-existent path", () => {
    assert.strictEqual(core.fileExists(path.join(tmpDir, "no-such-thing")), false);
  });
});

describe("contentMatches", () => {
  let tmpDir;
  before(() => { tmpDir = makeTempDir("ai-config-cm-"); });
  after(() => { rmrf(tmpDir); });

  it("returns true for two files with identical content", () => {
    const a = path.join(tmpDir, "a.txt");
    const b = path.join(tmpDir, "b.txt");
    mkfile(a, "hello");
    mkfile(b, "hello");
    assert.strictEqual(core.contentMatches(a, b), true);
  });

  it("returns false for two files with different content", () => {
    const a = path.join(tmpDir, "c.txt");
    const b = path.join(tmpDir, "d.txt");
    mkfile(a, "hello");
    mkfile(b, "world");
    assert.strictEqual(core.contentMatches(a, b), false);
  });

  it("returns false when comparing a file to a directory", () => {
    const f = path.join(tmpDir, "e.txt");
    const d = path.join(tmpDir, "subdir-cm");
    mkfile(f, "x");
    mkdir(d);
    assert.strictEqual(core.contentMatches(f, d), false);
  });

  it("returns true for two directories with identical structure and content", () => {
    const d1 = path.join(tmpDir, "d1");
    const d2 = path.join(tmpDir, "d2");
    mkfile(path.join(d1, "a.txt"), "same");
    mkfile(path.join(d2, "a.txt"), "same");
    assert.strictEqual(core.contentMatches(d1, d2), true);
  });

  it("returns false for two directories with different content", () => {
    const d1 = path.join(tmpDir, "d3");
    const d2 = path.join(tmpDir, "d4");
    mkfile(path.join(d1, "a.txt"), "foo");
    mkfile(path.join(d2, "a.txt"), "bar");
    assert.strictEqual(core.contentMatches(d1, d2), false);
  });
});

describe("inspectAction", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir("ai-config-ia-"); });
  afterEach(() => { rmrf(tmpDir); });

  it("returns kind:new-link when target does not exist", () => {
    const src = path.join(tmpDir, "src.txt");
    mkfile(src, "data");
    const result = core.inspectAction({ source: src, target: path.join(tmpDir, "missing.txt") });
    assert.strictEqual(result.kind, "new-link");
    assert.strictEqual(result.label, "create");
  });

  it("returns kind:already-linked when target symlink resolves to same canonical path as source", () => {
    const src = path.join(tmpDir, "src.txt");
    const tgt = path.join(tmpDir, "tgt.txt");
    mkfile(src, "data");
    fs.symlinkSync(src, tgt);
    const result = core.inspectAction({ source: src, target: tgt });
    assert.strictEqual(result.kind, "already-linked");
  });

  it("returns kind:replace-link when target symlink points elsewhere", () => {
    const src    = path.join(tmpDir, "src.txt");
    const other  = path.join(tmpDir, "other.txt");
    const tgt    = path.join(tmpDir, "tgt.txt");
    mkfile(src, "new");
    mkfile(other, "old");
    fs.symlinkSync(other, tgt);
    const result = core.inspectAction({ source: src, target: tgt });
    assert.strictEqual(result.kind, "replace-link");
    assert.strictEqual(result.label, "replace");
  });

  it("returns kind:replace-match when target is a plain file with same content", () => {
    const src = path.join(tmpDir, "src.txt");
    const tgt = path.join(tmpDir, "tgt.txt");
    mkfile(src, "identical");
    mkfile(tgt, "identical");
    const result = core.inspectAction({ source: src, target: tgt });
    assert.strictEqual(result.kind, "replace-match");
  });

  it("returns kind:replace-diff when target is a plain file with different content", () => {
    const src = path.join(tmpDir, "src.txt");
    const tgt = path.join(tmpDir, "tgt.txt");
    mkfile(src, "source content");
    mkfile(tgt, "different content");
    const result = core.inspectAction({ source: src, target: tgt });
    assert.strictEqual(result.kind, "replace-diff");
  });

  it("inspected action includes source and target paths", () => {
    const src = path.join(tmpDir, "s.txt");
    const tgt = path.join(tmpDir, "missing.txt");
    mkfile(src, "x");
    const result = core.inspectAction({ source: src, target: tgt });
    assert.strictEqual(result.source, src);
    assert.strictEqual(result.target, tgt);
  });

  it("inspected action includes effectLabel", () => {
    const src = path.join(tmpDir, "s.txt");
    mkfile(src, "x");
    const result = core.inspectAction({ source: src, target: path.join(tmpDir, "missing") });
    assert.strictEqual(result.effectLabel, "symlink");
  });
});

describe("inspectProfile", () => {
  let tmpDir;
  before(() => { tmpDir = makeTempDir("ai-config-ip-"); });
  after(() => { rmrf(tmpDir); });

  function makeAction(kind) {
    return { source: path.join(tmpDir, `${kind}-src`), target: path.join(tmpDir, `${kind}-tgt`) };
  }

  it("returns correct counts for a mix of action kinds", () => {
    const newSrc = path.join(tmpDir, "new-src.txt");
    mkfile(newSrc, "x");
    const sameSrc = path.join(tmpDir, "same-src.txt");
    const sameTgt = path.join(tmpDir, "same-tgt.txt");
    mkfile(sameSrc, "y");
    fs.symlinkSync(sameSrc, sameTgt);

    const profile = {
      id: "test",
      actions: [
        { source: newSrc, target: path.join(tmpDir, "new-tgt.txt") },
        { source: sameSrc, target: sameTgt },
      ],
    };

    const result = core.inspectProfile(profile);
    assert.strictEqual(result.counts.total, 2);
    assert.strictEqual(result.counts.create, 1);
    assert.strictEqual(result.counts.noChange, 1);
    assert.strictEqual(result.counts.replace, 0);
  });

  it("uses the provided inspection cache", () => {
    const src = path.join(tmpDir, "cached-src.txt");
    const tgt = path.join(tmpDir, "cached-tgt.txt");
    mkfile(src, "x");
    const fakeResult = { kind: "already-linked", label: "no change", color: "gray", source: src, target: tgt, detail: "", effectLabel: "symlink", beforePath: tgt, beforeDetail: "", afterPath: src, afterDetail: "", preview: null };
    const cache = new Map([[`${src}::${tgt}`, fakeResult]]);
    const profile = { id: "cp", actions: [{ source: src, target: tgt }] };
    const result = core.inspectProfile(profile, cache);
    assert.strictEqual(result.actions[0].kind, "already-linked");
  });

  it("falls back to fresh inspect for a key missing from cache", () => {
    const src = path.join(tmpDir, "miss-src.txt");
    const tgt = path.join(tmpDir, "miss-tgt.txt");
    mkfile(src, "x");
    const cache = new Map();
    const profile = { id: "mp", actions: [{ source: src, target: tgt }] };
    const result = core.inspectProfile(profile, cache);
    assert.strictEqual(result.actions[0].kind, "new-link");
  });
});

describe("buildInspectionCache", () => {
  let tmpDir;
  before(() => { tmpDir = makeTempDir("ai-config-bic-"); });
  after(() => { rmrf(tmpDir); });

  it("creates a Map with source::target keys", async () => {
    const src = path.join(tmpDir, "s.txt");
    const tgt = path.join(tmpDir, "t.txt");
    mkfile(src, "x");
    const profiles = [{ id: "p1", actions: [{ source: src, target: tgt }] }];
    const cache = await core.buildInspectionCache(profiles);
    assert.ok(cache instanceof Map);
    assert.ok(cache.has(`${src}::${tgt}`));
  });

  it("does not duplicate entries for the same source::target pair", async () => {
    const src = path.join(tmpDir, "dup-s.txt");
    const tgt = path.join(tmpDir, "dup-t.txt");
    mkfile(src, "x");
    const action = { source: src, target: tgt };
    const profiles = [
      { id: "p1", actions: [action] },
      { id: "p2", actions: [action] },
    ];
    const cache = await core.buildInspectionCache(profiles);
    assert.strictEqual(cache.size, 1);
  });

  it("caches multiple distinct pairs", async () => {
    const s1 = path.join(tmpDir, "s1.txt"); mkfile(s1, "1");
    const s2 = path.join(tmpDir, "s2.txt"); mkfile(s2, "2");
    const t1 = path.join(tmpDir, "t1.txt");
    const t2 = path.join(tmpDir, "t2.txt");
    const profiles = [{ id: "p", actions: [{ source: s1, target: t1 }, { source: s2, target: t2 }] }];
    assert.strictEqual((await core.buildInspectionCache(profiles)).size, 2);
  });
});

describe("discoverProfiles", () => {
  let repoRoot;
  beforeEach(() => { repoRoot = makeTempDir("ai-config-dp-"); });
  afterEach(() => { rmrf(repoRoot); });

  it("skills mapping: returns one action per subdirectory", () => {
    mkdir(path.join(repoRoot, "skills", "skill-a"));
    mkdir(path.join(repoRoot, "skills", "skill-b"));
    const profiles = core.discoverProfiles(repoRoot, { alpha: true, beta: true, gamma: true });
    const alpha = profiles.filter((p) => p.tool === "alpha");
    assert.strictEqual(alpha.length, 1);
    assert.strictEqual(alpha[0].actions.length, 2);
  });

  it("skills mapping: ignores files (only links subdirectories)", () => {
    mkdir(path.join(repoRoot, "skills", "skill-a"));
    mkfile(path.join(repoRoot, "skills", "README.md"), "text");
    const profiles = core.discoverProfiles(repoRoot, { alpha: true, beta: false, gamma: false });
    const alpha = profiles.find((p) => p.tool === "alpha");
    assert.strictEqual(alpha.actions.length, 1);
  });

  it("skills mapping: produces no profile when source directory is absent", () => {
    const profiles = core.discoverProfiles(repoRoot, { alpha: true, beta: true, gamma: true });
    const alphaProfiles = profiles.filter((p) => p.tool === "alpha");
    assert.strictEqual(alphaProfiles.length, 0);
  });

  it("file mapping: returns one action for an existing file", () => {
    mkfile(path.join(repoRoot, "agents", "beta", "AGENTS.md"), "agent content");
    const profiles = core.discoverProfiles(repoRoot, { alpha: false, beta: true, gamma: false });
    const betaFile = profiles.find((p) => p.tool === "beta" && p.id.includes("file"));
    assert.ok(betaFile, "should have a file-type profile for beta");
    assert.strictEqual(betaFile.actions.length, 1);
    assert.ok(betaFile.actions[0].source.endsWith("AGENTS.md"));
  });

  it("file mapping: produces no profile when source file is absent", () => {
    const profiles = core.discoverProfiles(repoRoot, { alpha: false, beta: true, gamma: false });
    const betaFile = profiles.find((p) => p.tool === "beta" && p.id.includes("file"));
    assert.strictEqual(betaFile, undefined);
  });

  it("directory mapping: returns one action per non-ignored file", () => {
    mkfile(path.join(repoRoot, "configs", "beta", "settings.json"), "{}");
    mkfile(path.join(repoRoot, "configs", "beta", "other.json"), "{}");
    mkfile(path.join(repoRoot, "configs", "beta", "SKIP.txt"), "ignored");
    mkfile(path.join(repoRoot, "configs", "beta", "package.json"), "{}");
    const profiles = core.discoverProfiles(repoRoot, { alpha: false, beta: true, gamma: false });
    const betaDir = profiles.find((p) => p.tool === "beta" && p.id.includes("directory"));
    assert.ok(betaDir, "should have a directory-type profile for beta");
    assert.strictEqual(betaDir.actions.length, 2);
    const targetNames = betaDir.actions.map((a) => path.basename(a.target));
    assert.ok(targetNames.includes("settings.json"));
    assert.ok(targetNames.includes("other.json"));
    assert.ok(!targetNames.includes("SKIP.txt"), "SKIP.txt should be filtered");
    assert.ok(!targetNames.includes("package.json"), "package.json should be filtered");
  });

  it("directory mapping with target '.': links files directly into home", () => {
    mkfile(path.join(repoRoot, "configs", "beta", "settings.json"), "{}");
    const profiles = core.discoverProfiles(repoRoot, { alpha: false, beta: true, gamma: false });
    const betaDir = profiles.find((p) => p.tool === "beta" && p.id.includes("directory"));
    const action = betaDir.actions[0];
    assert.strictEqual(path.dirname(action.target), homeBeta);
  });

  it("profile id follows tool-type-source-with-dashes convention", () => {
    mkdir(path.join(repoRoot, "skills", "skill-a"));
    const profiles = core.discoverProfiles(repoRoot, { alpha: true, beta: false, gamma: false });
    const alpha = profiles.find((p) => p.tool === "alpha");
    assert.ok(alpha.id.startsWith("alpha-skills-"), `unexpected id: ${alpha.id}`);
  });

  it("profile has tool, toolLabel, installed, enabled, recommended, and actions", () => {
    mkdir(path.join(repoRoot, "skills", "s1"));
    const profiles = core.discoverProfiles(repoRoot, { alpha: true, beta: false, gamma: false });
    const alpha = profiles.find((p) => p.tool === "alpha");
    assert.strictEqual(alpha.tool, "alpha");
    assert.strictEqual(alpha.toolLabel, "Alpha");
    assert.strictEqual(alpha.installed, true);
    assert.strictEqual(alpha.enabled, true);
    assert.strictEqual(alpha.recommended, true);
    assert.ok(Array.isArray(alpha.actions));
  });

  it("installed reflects the detection parameter", () => {
    mkdir(path.join(repoRoot, "skills", "s1"));
    const profiles = core.discoverProfiles(repoRoot, { alpha: false, beta: false, gamma: false });
    const alpha = profiles.find((p) => p.tool === "alpha");
    assert.strictEqual(alpha.installed, false);
  });

  it("installed defaults to true when detection is null", () => {
    mkdir(path.join(repoRoot, "skills", "s1"));
    const profiles = core.discoverProfiles(repoRoot, null);
    const alpha = profiles.find((p) => p.tool === "alpha");
    assert.strictEqual(alpha.installed, true);
  });

  it("skills actions point into the configured target home", () => {
    mkdir(path.join(repoRoot, "skills", "my-skill"));
    const profiles = core.discoverProfiles(repoRoot, { alpha: true, beta: false, gamma: false });
    const alpha = profiles.find((p) => p.tool === "alpha");
    assert.ok(alpha.actions[0].target.startsWith(homeAlpha));
  });
});

describe("binaryDetected", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir("ai-config-bd-"); });
  afterEach(() => { rmrf(tmpDir); });

  it("returns false for null binary", () => {
    assert.strictEqual(core.binaryDetected(null), false);
  });

  it("returns false when which is null and paths is empty", () => {
    assert.strictEqual(core.binaryDetected({ which: null, paths: {} }), false);
  });

  it("returns true when which resolves on PATH", () => {
    assert.strictEqual(core.binaryDetected({ which: "node", paths: {} }), true);
  });

  it("returns false when which is not on PATH", () => {
    assert.strictEqual(core.binaryDetected({ which: "__no_such_binary__", paths: {} }), false);
  });

  it("returns true when platform path exists", () => {
    const appPath = path.join(tmpDir, "MyTool.app");
    mkdir(appPath);
    assert.strictEqual(core.binaryDetected({ which: null, paths: { [process.platform]: appPath } }), true);
  });

  it("returns false when platform path does not exist", () => {
    assert.strictEqual(core.binaryDetected({ which: null, paths: { [process.platform]: path.join(tmpDir, "NoApp.app") } }), false);
  });

  it("returns false when path is only defined for another platform", () => {
    const appPath = path.join(tmpDir, "MyTool.app");
    mkdir(appPath);
    const otherPlatform = process.platform === "darwin" ? "linux" : "darwin";
    assert.strictEqual(core.binaryDetected({ which: null, paths: { [otherPlatform]: appPath } }), false);
  });

  it("returns true via platform path even when which fails", () => {
    const appPath = path.join(tmpDir, "MyTool.app");
    mkdir(appPath);
    assert.strictEqual(core.binaryDetected({ which: "__no_such_binary__", paths: { [process.platform]: appPath } }), true);
  });
});

describe("detectInstalledTools", () => {
  it("returns true for tools whose home directories exist", () => {
    const detection = core.detectInstalledTools();
    assert.strictEqual(detection.alpha, true);
    assert.strictEqual(detection.beta, true);
    assert.strictEqual(detection.gamma, true);
  });

  it("returns false for a tool whose home directory does not exist", () => {
    fs.rmSync(homeAlpha, { recursive: true, force: true });
    try {
      const detection = core.detectInstalledTools();
      assert.strictEqual(detection.alpha, false);
    } finally {
      mkdir(homeAlpha);
    }
  });

  it("returns an entry for every loaded rule", () => {
    const detection = core.detectInstalledTools();
    assert.ok("alpha" in detection);
    assert.ok("beta" in detection);
    assert.ok("gamma" in detection);
  });
});

describe("runInstallation — dry-run", () => {
  let srcDir;
  let tgtDir;
  beforeEach(() => {
    srcDir = makeTempDir("ai-config-ri-src-");
    tgtDir = makeTempDir("ai-config-ri-tgt-");
  });
  afterEach(() => {
    rmrf(srcDir);
    rmrf(tgtDir);
  });

  function makeProfiles(pairs) {
    return [{
      id: "test-profile",
      label: "Test Profile",
      actions: pairs.map(([src, tgt]) => ({ source: src, target: tgt })),
    }];
  }

  it("emits session-start and session-complete events", async () => {
    const src = path.join(srcDir, "file.txt");
    mkfile(src, "data");
    const events = [];
    await core.runInstallation({
      selectedProfiles: makeProfiles([[src, path.join(tgtDir, "file.txt")]]),
      dryRun: true,
      onEvent: (e) => events.push(e.type),
    });
    assert.ok(events.includes("session-start"));
    assert.ok(events.includes("session-complete"));
  });

  it("does not create any filesystem entries in dry-run mode", async () => {
    const src = path.join(srcDir, "f.txt");
    mkfile(src, "x");
    const tgt = path.join(tgtDir, "f.txt");
    await core.runInstallation({
      selectedProfiles: makeProfiles([[src, tgt]]),
      dryRun: true,
      onEvent: () => {},
    });
    assert.ok(!fs.existsSync(tgt), "symlink should NOT be created in dry-run");
  });

  it("returns a summary object with correct totals", async () => {
    const src = path.join(srcDir, "g.txt");
    mkfile(src, "y");
    const tgt = path.join(tgtDir, "g.txt");
    const summary = await core.runInstallation({
      selectedProfiles: makeProfiles([[src, tgt]]),
      dryRun: true,
      onEvent: () => {},
    });
    assert.strictEqual(summary.totalProfiles, 1);
    assert.strictEqual(summary.totalActions, 1);
  });
});

describe("runInstallation — live", () => {
  let srcDir;
  let tgtDir;
  beforeEach(() => {
    srcDir = makeTempDir("ai-config-rl-src-");
    tgtDir = makeTempDir("ai-config-rl-tgt-");
  });
  afterEach(() => {
    rmrf(srcDir);
    rmrf(tgtDir);
  });

  function makeProfiles(pairs) {
    return [{ id: "live-p", label: "Live", actions: pairs.map(([s, t]) => ({ source: s, target: t })) }];
  }

  it("creates a symlink for a new-link action", async () => {
    const src = path.join(srcDir, "skill");
    mkdir(src);
    const tgt = path.join(tgtDir, "skill");
    await core.runInstallation({
      selectedProfiles: makeProfiles([[src, tgt]]),
      dryRun: false,
      assumeYes: true,
      onEvent: () => {},
    });
    assert.ok(fs.existsSync(tgt));
    assert.ok(fs.lstatSync(tgt).isSymbolicLink());
  });

  it("skips and counts already-linked targets as unchanged", async () => {
    const src = path.join(srcDir, "al.txt");
    const tgt = path.join(tgtDir, "al.txt");
    mkfile(src, "x");
    fs.symlinkSync(src, tgt);
    const summary = await core.runInstallation({
      selectedProfiles: makeProfiles([[src, tgt]]),
      dryRun: false,
      assumeYes: true,
      onEvent: () => {},
    });
    assert.strictEqual(summary.unchanged, 1);
    assert.strictEqual(summary.linked, 0);
  });

  it("creates parent directories when they do not exist", async () => {
    const src = path.join(srcDir, "nested.txt");
    mkfile(src, "x");
    const tgt = path.join(tgtDir, "deep", "nested", "nested.txt");
    await core.runInstallation({
      selectedProfiles: makeProfiles([[src, tgt]]),
      dryRun: false,
      assumeYes: true,
      onEvent: () => {},
    });
    assert.ok(fs.existsSync(tgt));
  });

  it("backs up an existing symlink pointing elsewhere before re-linking", async () => {
    const src    = path.join(srcDir, "src.txt");
    const other  = path.join(srcDir, "other.txt");
    const tgt    = path.join(tgtDir, "tgt.txt");
    mkfile(src, "new");
    mkfile(other, "old");
    fs.symlinkSync(other, tgt);
    const events = [];
    await core.runInstallation({
      selectedProfiles: makeProfiles([[src, tgt]]),
      dryRun: false,
      assumeYes: true,
      onEvent: (e) => events.push(e),
    });
    assert.ok(events.some((e) => e.type === "backup"));
    assert.ok(fs.lstatSync(tgt).isSymbolicLink());
  });

  it("summary.linked reflects number of created symlinks", async () => {
    const s1 = path.join(srcDir, "s1.txt"); mkfile(s1, "1");
    const s2 = path.join(srcDir, "s2.txt"); mkfile(s2, "2");
    const t1 = path.join(tgtDir, "t1.txt");
    const t2 = path.join(tgtDir, "t2.txt");
    const summary = await core.runInstallation({
      selectedProfiles: makeProfiles([[s1, t1], [s2, t2]]),
      dryRun: false,
      assumeYes: true,
      onEvent: () => {},
    });
    assert.strictEqual(summary.linked, 2);
  });
});

describe("runInstallation — multi-profile", () => {
  let srcDir;
  let tgtDirA;
  let tgtDirB;
  beforeEach(() => {
    srcDir = makeTempDir("ai-config-mp-src-");
    tgtDirA = makeTempDir("ai-config-mp-tgtA-");
    tgtDirB = makeTempDir("ai-config-mp-tgtB-");
  });
  afterEach(() => {
    rmrf(srcDir);
    rmrf(tgtDirA);
    rmrf(tgtDirB);
  });

  it("processes all profiles when multiple tool groups are selected", async () => {
    const s1 = path.join(srcDir, "a1.txt"); mkfile(s1, "1");
    const s2 = path.join(srcDir, "a2.txt"); mkfile(s2, "2");
    const s3 = path.join(srcDir, "b1.txt"); mkfile(s3, "3");
    const s4 = path.join(srcDir, "b2.txt"); mkfile(s4, "4");

    const selectedProfiles = [
      { id: "toolA-skills", label: "Tool A skills", actions: [
        { source: s1, target: path.join(tgtDirA, "a1.txt") },
        { source: s2, target: path.join(tgtDirA, "a2.txt") },
      ]},
      { id: "toolB-skills", label: "Tool B skills", actions: [
        { source: s3, target: path.join(tgtDirB, "b1.txt") },
        { source: s4, target: path.join(tgtDirB, "b2.txt") },
      ]},
    ];

    const profileStarts = [];
    const profileCompletes = [];
    const summary = await core.runInstallation({
      selectedProfiles,
      dryRun: false,
      assumeYes: true,
      onEvent: (e) => {
        if (e.type === "profile-start") profileStarts.push(e.profile.id);
        if (e.type === "profile-complete") profileCompletes.push(e.profile.id);
      },
    });

    assert.strictEqual(summary.linked, 4);
    assert.strictEqual(summary.totalProfiles, 2);
    assert.deepStrictEqual(profileStarts, ["toolA-skills", "toolB-skills"]);
    assert.deepStrictEqual(profileCompletes, ["toolA-skills", "toolB-skills"]);

    assert.ok(fs.lstatSync(path.join(tgtDirA, "a1.txt")).isSymbolicLink());
    assert.ok(fs.lstatSync(path.join(tgtDirA, "a2.txt")).isSymbolicLink());
    assert.ok(fs.lstatSync(path.join(tgtDirB, "b1.txt")).isSymbolicLink());
    assert.ok(fs.lstatSync(path.join(tgtDirB, "b2.txt")).isSymbolicLink());
  });

  it("continues processing remaining profiles when an action in the first profile errors", async () => {
    const s1 = path.join(srcDir, "good.txt"); mkfile(s1, "good");
    const s2 = path.join(srcDir, "bad.txt"); mkfile(s2, "bad");
    const s3 = path.join(srcDir, "also-good.txt"); mkfile(s3, "also good");

    const badTarget = path.join(tgtDirA, "no-such-parent", "deep", "bad.txt");
    // Create a FILE where the parent directory needs to be, so mkdirSync will fail
    mkfile(path.join(tgtDirA, "no-such-parent"), "blocker");

    const selectedProfiles = [
      { id: "toolA", label: "Tool A", actions: [
        { source: s1, target: path.join(tgtDirA, "good.txt") },
        { source: s2, target: badTarget },
      ]},
      { id: "toolB", label: "Tool B", actions: [
        { source: s3, target: path.join(tgtDirB, "also-good.txt") },
      ]},
    ];

    const errors = [];
    const profileCompletes = [];
    const summary = await core.runInstallation({
      selectedProfiles,
      dryRun: false,
      assumeYes: true,
      onEvent: (e) => {
        if (e.type === "error") errors.push(e.target);
        if (e.type === "profile-complete") profileCompletes.push(e.profile.id);
      },
    });

    // Tool A's first action succeeds, second fails
    assert.ok(fs.lstatSync(path.join(tgtDirA, "good.txt")).isSymbolicLink());
    assert.strictEqual(errors.length, 1);
    assert.strictEqual(errors[0], badTarget);

    // Tool B's action still gets processed despite Tool A's error
    assert.ok(fs.lstatSync(path.join(tgtDirB, "also-good.txt")).isSymbolicLink());
     assert.deepStrictEqual(profileCompletes, ["toolA", "toolB"]);
    assert.strictEqual(summary.errors, 1);
    assert.strictEqual(summary.linked, 2);
  });
});

describe("runInstallation — symlinked parent directories", () => {
  let srcDir;
  let realConfigDir;
  let symlinkedConfig;
  let tmpRoot;

  beforeEach(() => {
    tmpRoot = makeTempDir("ai-config-symparent-");
    srcDir = path.join(tmpRoot, "source");
    realConfigDir = path.join(tmpRoot, "real-dotfiles", "config");
    symlinkedConfig = path.join(tmpRoot, "home", ".config");

    mkdir(path.join(srcDir, "skills", "my-skill"));
    mkfile(path.join(srcDir, "skills", "my-skill", "SKILL.md"), "skill content");
    mkdir(realConfigDir);
    mkdir(path.join(tmpRoot, "home"));
    fs.symlinkSync(realConfigDir, symlinkedConfig);
  });
  afterEach(() => { rmrf(tmpRoot); });

  it("creates working symlinks when target is under a symlinked parent directory", async () => {
    const skillSource = path.join(srcDir, "skills", "my-skill");
    const skillTarget = path.join(symlinkedConfig, "tool", "skills", "my-skill");

    const selectedProfiles = [{
      id: "symlinked-tool-skills",
      label: "Symlinked Tool skills",
      actions: [{ source: skillSource, target: skillTarget }],
    }];

    await core.runInstallation({
      selectedProfiles,
      dryRun: false,
      assumeYes: true,
      onEvent: () => {},
    });

    assert.ok(fs.lstatSync(skillTarget).isSymbolicLink(), "target should be a symlink");
    assert.ok(fs.existsSync(skillTarget), "symlink should resolve to an existing path");

    const resolved = fs.realpathSync(skillTarget);
    const expectedResolved = fs.realpathSync(skillSource);
    assert.strictEqual(resolved, expectedResolved, "symlink should resolve to the source");
  });

  it("creates working symlinks for multiple items under a symlinked parent", async () => {
    mkdir(path.join(srcDir, "skills", "skill-b"));
    mkfile(path.join(srcDir, "skills", "skill-b", "SKILL.md"), "b content");

    const selectedProfiles = [{
      id: "symlinked-tool-skills",
      label: "Symlinked Tool skills",
      actions: [
        { source: path.join(srcDir, "skills", "my-skill"), target: path.join(symlinkedConfig, "tool", "skills", "my-skill") },
        { source: path.join(srcDir, "skills", "skill-b"), target: path.join(symlinkedConfig, "tool", "skills", "skill-b") },
      ],
    }];

    const summary = await core.runInstallation({
      selectedProfiles,
      dryRun: false,
      assumeYes: true,
      onEvent: () => {},
    });

    assert.strictEqual(summary.linked, 2);
    assert.ok(fs.existsSync(path.join(symlinkedConfig, "tool", "skills", "my-skill")));
    assert.ok(fs.existsSync(path.join(symlinkedConfig, "tool", "skills", "skill-b")));
  });
});

describe("inspectAction — broken symlinks (null canonical path)", () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTempDir("ai-config-null-cp-"); });
  afterEach(() => { rmrf(tmpDir); });

  it("returns replace-link when both source and target symlinks are broken", () => {
    const src = path.join(tmpDir, "src.txt");
    const tgt = path.join(tmpDir, "tgt.txt");
    fs.symlinkSync("/nonexistent/source", src);
    fs.symlinkSync("/nonexistent/target", tgt);
    const result = core.inspectAction({ source: src, target: tgt });
    assert.strictEqual(result.kind, "replace-link");
    assert.notStrictEqual(result.kind, "already-linked");
  });

  it("returns replace-link when target symlink is broken but source exists", () => {
    const src = path.join(tmpDir, "real-src.txt");
    const tgt = path.join(tmpDir, "broken-tgt.txt");
    mkfile(src, "real content");
    fs.symlinkSync("/nonexistent/target", tgt);
    const result = core.inspectAction({ source: src, target: tgt });
    assert.strictEqual(result.kind, "replace-link");
  });
});

describe("runInstallation — broken symlink replacement", () => {
  let srcDir;
  let tgtDir;
  beforeEach(() => {
    srcDir = makeTempDir("ai-config-bsr-src-");
    tgtDir = makeTempDir("ai-config-bsr-tgt-");
  });
  afterEach(() => {
    rmrf(srcDir);
    rmrf(tgtDir);
  });

  it("replaces a broken symlink with a working one when both canonical paths are null", async () => {
    const src = path.join(srcDir, "skill");
    mkdir(src);
    mkfile(path.join(src, "SKILL.md"), "content");
    const tgt = path.join(tgtDir, "skill");
    fs.symlinkSync("/nonexistent/old-target", tgt);

    const summary = await core.runInstallation({
      selectedProfiles: [{ id: "broken-fix", label: "Fix broken", actions: [{ source: src, target: tgt }] }],
      dryRun: false,
      assumeYes: true,
      onEvent: () => {},
    });

    assert.strictEqual(summary.linked, 1);
    assert.strictEqual(summary.backedUp, 1);
    assert.ok(fs.lstatSync(tgt).isSymbolicLink());
    assert.ok(fs.existsSync(tgt), "new symlink should resolve");
  });
});
