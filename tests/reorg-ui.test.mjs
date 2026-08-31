import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildCanonicalCollections,
  buildChangeGroups,
  buildHarnessBlocks,
} from "../scripts/tui/reorg-view-model.mjs";

describe("reorganization review groups", () => {
  it("groups actions by operation, kind, and path pair in apply order", () => {
    const actions = [
      {
        id: "remove-review",
        type: "remove-duplicate",
        kind: "skill",
        source: "/shared/skills/review",
        target: "/home/.cursor/skills/review",
        targetClass: "provider",
        tools: ["cursor"],
      },
      {
        id: "link-review",
        type: "link",
        kind: "skill",
        source: "/shared/skills/review",
        target: "/home/.claude/skills/review",
        targetClass: "provider",
        tools: ["claude"],
      },
      {
        id: "import-plan",
        type: "import",
        kind: "agent",
        source: "/home/.claude/agents/plan.md",
        target: "/shared/agents/claude/plan.md",
        targetClass: "canonical",
        tools: ["claude"],
      },
      {
        id: "import-review",
        type: "import",
        kind: "agent",
        source: "/home/.claude/agents/review.md",
        target: "/shared/agents/claude/review.md",
        targetClass: "canonical",
        tools: ["claude"],
      },
    ];

    const groups = buildChangeGroups(actions);

    assert.deepStrictEqual(groups.map((group) => group.type), ["import", "link", "remove-duplicate"]);
    assert.strictEqual(groups[0].actions.length, 2);
    assert.strictEqual(groups[0].sourceRoot, "/home/.claude/agents");
    assert.strictEqual(groups[0].targetRoot, "/shared/agents/claude");
    assert.deepStrictEqual(groups[0].tools, ["claude"]);
  });
});

describe("reorganization harness map", () => {
  const coverage = [
    {
      tool: "claude",
      toolLabel: "Claude Code",
      kind: "skill",
      targetClass: "provider",
      endpoints: ["/home/.claude/skills"],
      supported: true,
    },
    {
      tool: "codex",
      toolLabel: "Codex",
      kind: "skill",
      targetClass: "universal",
      endpoints: ["/home/.agents/skills"],
      supported: true,
    },
    {
      tool: "cursor",
      toolLabel: "Cursor",
      kind: "skill",
      targetClass: "universal",
      endpoints: ["/home/.agents/skills"],
      supported: true,
    },
  ];

  const actions = [
    {
      id: "link-review",
      type: "link",
      kind: "skill",
      name: "review",
      source: "/shared/skills/review",
      target: "/home/.claude/skills/review",
      targetClass: "provider",
      tools: ["claude"],
    },
    {
      id: "remove-cursor-review",
      type: "remove-duplicate",
      kind: "skill",
      name: "review",
      source: "/shared/skills/review",
      target: "/home/.cursor/skills/review",
      targetClass: "provider",
      tools: ["cursor"],
    },
  ];

  const unchanged = [
    {
      kind: "skill",
      name: "review",
      source: "/shared/skills/review",
      target: "/home/.agents/skills/review",
      targetClass: "universal",
      tools: ["codex", "cursor"],
    },
  ];

  it("marks changed destinations as active and existing destinations as ready", () => {
    const harnesses = buildHarnessBlocks({ coverage, actions, unchanged });

    assert.strictEqual(harnesses[0].label, "Claude Code");
    assert.strictEqual(harnesses[0].hasChanges, true);
    assert.strictEqual(harnesses[0].rows[0].operation, "LINK");
    assert.strictEqual(harnesses[1].label, "Codex");
    assert.strictEqual(harnesses[1].hasChanges, false);
    assert.strictEqual(harnesses[1].rows[0].operation, "READY");
    assert.strictEqual(harnesses[2].label, "Cursor");
    assert.strictEqual(harnesses[2].rows[0].operation, "READY");
    assert.strictEqual(harnesses[2].rows[1].displayKind, "cleanup");
    assert.strictEqual(harnesses[2].rows[1].operation, "CLEAN");
  });

  it("finds canonical collection paths from changed and unchanged items", () => {
    assert.deepStrictEqual(
      buildCanonicalCollections({ sourceRoot: "/shared", actions, unchanged }),
      [{ kind: "skill", path: "/shared/skills", changed: true }],
    );
  });
});
