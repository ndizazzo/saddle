"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawnSync } = require("node:child_process");
const { makeTempDir, rmrf, mkfile, mkdir } = require("./helpers.js");
const { applyReorgPlan, buildReorgPlan, hashEntry, scanReorg, selectEndpoints } = require("../scripts/reorg-core.js");
const { parseReorgArgs } = require("../scripts/reorg.js");

function makeRule({ name, label = name, assets }) {
  return {
    name,
    label,
    enabled: true,
    reorgAssets: assets,
  };
}

function skillAsset(canonical, locations) {
  return {
    kind: "skill",
    canonical,
    entries: "directories",
    locations,
  };
}

function writeSkill(root, name, body = "Use this skill.\n") {
  mkfile(path.join(root, name, "SKILL.md"), `---\nname: ${name}\ndescription: Test ${name}\n---\n\n${body}`);
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

describe("reorganization core", () => {
  let root;
  let sourceRoot;
  let universalRoot;
  let opencodeRoot;
  let claudeRoot;
  let transactionRoot;

  beforeEach(() => {
    root = makeTempDir("saddle-reorg-");
    sourceRoot = path.join(root, "source");
    universalRoot = path.join(root, "home", ".agents", "skills");
    opencodeRoot = path.join(root, "home", ".config", "opencode", "skills");
    claudeRoot = path.join(root, "home", ".claude", "skills");
    transactionRoot = path.join(root, "state");
  });

  afterEach(() => rmrf(root));

  function rules() {
    return [
      makeRule({
        name: "codex",
        label: "Codex",
        assets: [skillAsset("skills", [{ path: universalRoot, targetClass: "universal" }])],
      }),
      makeRule({
        name: "opencode",
        label: "OpenCode",
        assets: [
          skillAsset("skills", [
            { path: universalRoot, targetClass: "universal" },
            { path: opencodeRoot, targetClass: "provider" },
          ]),
        ],
      }),
      makeRule({
        name: "claude",
        label: "Claude Code",
        assets: [skillAsset("skills", [{ path: claudeRoot, targetClass: "provider" }])],
      }),
    ];
  }

  function scan() {
    return scanReorg({
      rules: rules(),
      detection: { codex: true, opencode: true, claude: true },
      sourceRoot,
      expandHome,
    });
  }

  it("deduplicates a universal endpoint declared by several tools", () => {
    const result = scan();
    const universal = result.endpoints.filter((endpoint) => endpoint.targetClass === "universal");
    assert.strictEqual(universal.length, 1);
    assert.deepStrictEqual(universal[0].tools.sort(), ["codex", "opencode"]);
  });

  it("universal-first selects the shared endpoint and only native fallbacks", () => {
    const selection = selectEndpoints(scan(), "universal-first");
    assert.deepStrictEqual(
      selection.selected.map((endpoint) => endpoint.path).sort(),
      [universalRoot, claudeRoot].sort(),
    );
    assert.ok(!selection.selected.some((endpoint) => endpoint.path === opencodeRoot));
  });

  it("provider-only selects provider endpoints and reports universal-only tools as unsupported", () => {
    const selection = selectEndpoints(scan(), "provider-only");
    assert.deepStrictEqual(
      selection.selected.map((endpoint) => endpoint.path).sort(),
      [opencodeRoot, claudeRoot].sort(),
    );
    const codex = selection.coverage.find((item) => item.tool === "codex");
    assert.strictEqual(codex.supported, false);
  });

  it("universal-first never links both target classes for one compatible tool", () => {
    writeSkill(path.join(sourceRoot, "skills"), "release");
    writeSkill(universalRoot, "release");
    writeSkill(opencodeRoot, "release");
    writeSkill(claudeRoot, "release");

    const plan = buildReorgPlan({ scan: scan(), strategy: "universal-first" });
    const linkTargets = plan.actions.filter((action) => action.type === "link").map((action) => action.target);
    assert.ok(linkTargets.includes(path.join(universalRoot, "release")));
    assert.ok(linkTargets.includes(path.join(claudeRoot, "release")));
    assert.ok(!linkTargets.includes(path.join(opencodeRoot, "release")));
    assert.ok(
      plan.actions.some(
        (action) => action.type === "remove-duplicate" && action.target === path.join(opencodeRoot, "release"),
      ),
    );
  });

  it("provider-only links provider targets and removes matching universal duplicates", () => {
    writeSkill(path.join(sourceRoot, "skills"), "release");
    writeSkill(universalRoot, "release");
    writeSkill(opencodeRoot, "release");
    writeSkill(claudeRoot, "release");

    const plan = buildReorgPlan({ scan: scan(), strategy: "provider-only" });
    const linkTargets = plan.actions.filter((action) => action.type === "link").map((action) => action.target);
    assert.ok(linkTargets.includes(path.join(opencodeRoot, "release")));
    assert.ok(linkTargets.includes(path.join(claudeRoot, "release")));
    assert.ok(!linkTargets.includes(path.join(universalRoot, "release")));
    assert.ok(
      plan.actions.some(
        (action) => action.type === "remove-duplicate" && action.target === path.join(universalRoot, "release"),
      ),
    );
  });

  it("orders universal links before provider fallbacks", () => {
    writeSkill(path.join(sourceRoot, "skills"), "release");
    const plan = buildReorgPlan({ scan: scan(), strategy: "universal-first" });
    const links = plan.actions.filter((action) => action.type === "link");
    assert.strictEqual(links[0].targetClass, "universal");
    assert.strictEqual(links.at(-1).targetClass, "provider");
  });

  it("produces the same ordered plan when rule discovery order changes", () => {
    writeSkill(path.join(sourceRoot, "skills"), "release");
    const detection = { codex: true, opencode: true, claude: true };
    const build = (inputRules) =>
      buildReorgPlan({
        scan: scanReorg({ rules: inputRules, detection, sourceRoot, expandHome }),
        strategy: "universal-first",
      });

    const forward = build(rules());
    const reverse = build(rules().reverse());
    assert.strictEqual(forward.id, reverse.id);
    assert.deepStrictEqual(
      forward.actions.map(({ id, target }) => ({ id, target })),
      reverse.actions.map(({ id, target }) => ({ id, target })),
    );
    assert.deepStrictEqual(
      forward.coverage.map(({ tool, kind }) => ({ tool, kind })),
      reverse.coverage.map(({ tool, kind }) => ({ tool, kind })),
    );
  });

  it("imports provider content, links it, and becomes idempotent", async () => {
    writeSkill(claudeRoot, "review");
    const firstPlan = buildReorgPlan({ scan: scan(), strategy: "universal-first" });
    assert.strictEqual(firstPlan.conflicts.length, 0);
    assert.ok(firstPlan.actions.some((action) => action.type === "import"));

    const result = await applyReorgPlan(firstPlan, { configDir: transactionRoot });
    assert.ok(result.transactionId);
    const canonical = path.join(sourceRoot, "skills", "review");
    assert.ok(fs.statSync(canonical).isDirectory());
    assert.ok(fs.lstatSync(path.join(claudeRoot, "review")).isSymbolicLink());
    assert.strictEqual(hashEntry(canonical), hashEntry(path.join(claudeRoot, "review")));

    const secondPlan = buildReorgPlan({ scan: scan(), strategy: "universal-first" });
    assert.strictEqual(secondPlan.actions.length, 0);
    assert.strictEqual(secondPlan.conflicts.length, 0);
  });

  it("follows an existing provider root symlink without replacing the root", async () => {
    const physicalClaudeRoot = path.join(root, "dotfiles", "claude-skills");
    writeSkill(physicalClaudeRoot, "review");
    mkdir(path.dirname(claudeRoot));
    fs.symlinkSync(physicalClaudeRoot, claudeRoot);

    const plan = buildReorgPlan({ scan: scan(), strategy: "universal-first" });
    await applyReorgPlan(plan, { configDir: transactionRoot });

    assert.ok(fs.lstatSync(claudeRoot).isSymbolicLink());
    assert.ok(fs.lstatSync(path.join(physicalClaudeRoot, "review")).isSymbolicLink());
    assert.ok(fs.statSync(path.join(sourceRoot, "skills", "review")).isDirectory());
  });

  it("rejects a regular file at a managed collection root", () => {
    mkfile(claudeRoot, "not a directory\n");
    assert.throws(() => scan(), /Managed collection root is not a directory/);
  });

  it("plans only new drift after an idempotent run", async () => {
    writeSkill(claudeRoot, "review");
    const initialPlan = buildReorgPlan({ scan: scan(), strategy: "universal-first" });
    await applyReorgPlan(initialPlan, { configDir: transactionRoot });
    assert.strictEqual(buildReorgPlan({ scan: scan(), strategy: "universal-first" }).actions.length, 0);

    writeSkill(claudeRoot, "release");
    const driftPlan = buildReorgPlan({ scan: scan(), strategy: "universal-first" });
    assert.ok(driftPlan.actions.length > 0);
    assert.ok(driftPlan.actions.every((action) => action.name === "release"));
    assert.ok(driftPlan.unchanged.every((action) => action.name === "review"));
  });

  it("blocks differing content with the same canonical name", async () => {
    writeSkill(path.join(sourceRoot, "skills"), "review", "Canonical version.\n");
    writeSkill(claudeRoot, "review", "Claude version.\n");
    const plan = buildReorgPlan({ scan: scan(), strategy: "universal-first" });
    assert.strictEqual(plan.canApply, false);
    assert.strictEqual(plan.conflicts.length, 1);
    await assert.rejects(applyReorgPlan(plan, { configDir: transactionRoot }), /unresolved conflicts/);
  });

  it("rolls back completed imports when a later action fails", async () => {
    writeSkill(claudeRoot, "review");
    const plan = buildReorgPlan({ scan: scan(), strategy: "universal-first" });
    const canonical = path.join(sourceRoot, "skills", "review");

    await assert.rejects(
      applyReorgPlan(plan, {
        configDir: transactionRoot,
        beforeAction: ({ index }) => {
          if (index === 1) throw new Error("injected failure");
        },
      }),
      /injected failure/,
    );
    assert.strictEqual(fs.existsSync(canonical), false);
    assert.ok(fs.statSync(path.join(claudeRoot, "review")).isDirectory());

    const manifests = fs
      .readdirSync(path.join(transactionRoot, "transactions"))
      .map((name) =>
        JSON.parse(fs.readFileSync(path.join(transactionRoot, "transactions", name, "manifest.json"), "utf8")),
      );
    assert.strictEqual(manifests[0].status, "rolled-back");
  });

  it("restores a replaced target when link verification fails", async () => {
    writeSkill(claudeRoot, "review");
    const plan = buildReorgPlan({ scan: scan(), strategy: "universal-first" });
    const link = plan.actions.find(
      (action) => action.type === "link" && action.target === path.join(claudeRoot, "review"),
    );
    link.source = path.join(root, "missing-source");

    await assert.rejects(applyReorgPlan(plan, { configDir: transactionRoot }), /ENOENT/);
    assert.ok(fs.statSync(path.join(claudeRoot, "review")).isDirectory());
    assert.strictEqual(fs.existsSync(path.join(sourceRoot, "skills", "review")), false);
  });

  it("rejects a plan when canonical content changes before apply", async () => {
    writeSkill(path.join(sourceRoot, "skills"), "review", "Original.\n");
    const plan = buildReorgPlan({ scan: scan(), strategy: "universal-first" });
    writeSkill(path.join(sourceRoot, "skills"), "review", "Changed after planning.\n");

    await assert.rejects(applyReorgPlan(plan, { configDir: transactionRoot }), /Filesystem changed after planning/);
    assert.strictEqual(fs.existsSync(path.join(universalRoot, "review")), false);
    assert.strictEqual(fs.existsSync(transactionRoot), false);
  });

  it("rejects source roots that overlap managed harness locations", () => {
    assert.throws(
      () =>
        scanReorg({
          rules: rules(),
          detection: { codex: true, opencode: true, claude: true },
          sourceRoot: path.dirname(universalRoot),
          expandHome,
        }),
      /overlaps a managed harness location/,
    );
  });

  it("rejects overlapping source roots through a symlinked parent", () => {
    mkdir(path.dirname(universalRoot));
    const sourceAlias = path.join(root, "source-alias");
    fs.symlinkSync(path.dirname(universalRoot), sourceAlias);

    assert.throws(
      () =>
        scanReorg({
          rules: rules(),
          detection: { codex: true, opencode: true, claude: true },
          sourceRoot: sourceAlias,
          expandHome,
        }),
      /overlaps a managed harness location/,
    );
  });

  it("rejects canonical collections that escape the source root through a symlink", () => {
    mkdir(sourceRoot);
    const externalSkills = path.join(root, "external-skills");
    mkdir(externalSkills);
    fs.symlinkSync(externalSkills, path.join(sourceRoot, "skills"));

    assert.throws(
      () =>
        scanReorg({
          rules: rules(),
          detection: { codex: true, opencode: true, claude: true },
          sourceRoot,
          expandHome,
        }),
      /escapes source root through a symlink/,
    );
  });

  it("rejects one harness location claiming different canonical collections", () => {
    const ambiguousRule = makeRule({
      name: "ambiguous",
      assets: [
        skillAsset("skills", [{ path: universalRoot, targetClass: "universal" }]),
        skillAsset("other-skills", [{ path: universalRoot, targetClass: "universal" }]),
      ],
    });
    assert.throws(
      () =>
        scanReorg({
          rules: [ambiguousRule],
          detection: { ambiguous: true },
          sourceRoot,
          expandHome,
        }),
      /maps to multiple canonical collections/,
    );
  });
});

describe("parseReorgArgs", () => {
  it("parses source and strategy", () => {
    const options = parseReorgArgs(["reorg", "--source", "/tmp/shared", "--strategy=provider-only"]);
    assert.strictEqual(options.sourceRoot, "/tmp/shared");
    assert.strictEqual(options.strategy, "provider-only");
  });

  it("makes JSON output read-only", () => {
    const options = parseReorgArgs(["reorg", "--json"]);
    assert.strictEqual(options.json, true);
    assert.strictEqual(options.dryRun, true);
  });

  it("rejects unknown strategies", () => {
    assert.throws(() => parseReorgArgs(["reorg", "--strategy", "both"]), /must be universal-first/);
  });
});

describe("reorg CLI", () => {
  it("does not initialize Saddle state during a dry run", () => {
    const root = makeTempDir("saddle-reorg-cli-");
    const configDir = path.join(root, "state");
    const configPath = path.join(configDir, "config.yaml");
    const sourceRoot = path.join(root, "canonical");
    const fakeHome = path.join(root, "home");
    mkdir(sourceRoot);
    mkdir(fakeHome);

    try {
      const result = spawnSync(
        process.execPath,
        [path.join(__dirname, "..", "bin", "saddle.js"), "reorg", "--source", sourceRoot, "--dry-run"],
        {
          cwd: path.join(__dirname, ".."),
          encoding: "utf8",
          env: {
            ...process.env,
            HOME: fakeHome,
            SADDLE_DIR: configDir,
            SADDLE_CONFIG: configPath,
          },
        },
      );

      assert.strictEqual(result.status, 0, result.stderr);
      assert.match(result.stdout, /Reorganization plan/);
      assert.strictEqual(fs.existsSync(configPath), false);
      assert.strictEqual(fs.existsSync(configDir), false);
    } finally {
      rmrf(root);
    }
  });

  it("applies a provider rule end to end, then reports only later drift", () => {
    const root = makeTempDir("saddle-reorg-cli-live-");
    const fakeHome = path.join(root, "home");
    const configDir = path.join(root, "state");
    const configPath = path.join(configDir, "config.yaml");
    const rulesDir = path.join(root, "rules");
    const sourceRoot = path.join(root, "canonical");
    const providerSkills = path.join(fakeHome, ".claude", "skills");
    mkdir(rulesDir);
    writeSkill(providerSkills, "review");
    mkfile(
      path.join(rulesDir, "claude.yaml"),
      [
        "schemaVersion: 2",
        "tool: claude",
        "label: Claude Code",
        "home: ~/.claude",
        "enabled: true",
        "reorg:",
        "  assets:",
        "    - kind: skill",
        "      canonical: skills",
        "      entries: directories",
        "      locations:",
        "        - path: ~/.claude/skills",
        "          targetClass: provider",
        "mappings: []",
      ].join("\n"),
    );

    const env = {
      ...process.env,
      HOME: fakeHome,
      SADDLE_DIR: configDir,
      SADDLE_CONFIG: configPath,
      SADDLE_RULES_DIR: rulesDir,
    };
    const run = (args) =>
      spawnSync(process.execPath, [path.join(__dirname, "..", "bin", "saddle.js"), ...args], {
        cwd: path.join(__dirname, ".."),
        encoding: "utf8",
        env,
      });

    try {
      const unconfirmedResult = run(["reorg", "--source", sourceRoot, "--strategy", "provider-only"]);
      assert.strictEqual(unconfirmedResult.status, 1);
      assert.match(unconfirmedResult.stderr, /requires --yes/);
      assert.ok(fs.statSync(path.join(providerSkills, "review")).isDirectory());
      assert.strictEqual(fs.existsSync(configPath), false);

      const applyResult = run(["reorg", "--source", sourceRoot, "--strategy", "provider-only", "--yes"]);
      assert.strictEqual(applyResult.status, 0, applyResult.stderr);
      assert.ok(fs.statSync(path.join(sourceRoot, "skills", "review")).isDirectory());
      assert.ok(fs.lstatSync(path.join(providerSkills, "review")).isSymbolicLink());
      assert.ok(fs.existsSync(path.join(configDir, "reorg-state.json")));

      const cleanResult = run(["reorg", "--json"]);
      assert.strictEqual(cleanResult.status, 0, cleanResult.stderr);
      assert.strictEqual(JSON.parse(cleanResult.stdout).actions.length, 0);
      assert.strictEqual(run(["reorg", "--check"]).status, 0);

      writeSkill(providerSkills, "release");
      const driftResult = run(["reorg", "--json"]);
      assert.strictEqual(driftResult.status, 0, driftResult.stderr);
      const driftPlan = JSON.parse(driftResult.stdout);
      assert.ok(driftPlan.actions.length > 0);
      assert.ok(driftPlan.actions.every((action) => action.name === "release"));
      assert.strictEqual(run(["reorg", "--check"]).status, 1);
    } finally {
      rmrf(root);
    }
  });
});
