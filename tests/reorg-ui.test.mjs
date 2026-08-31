import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildChangeGroups } from "../scripts/tui/ReorgApp.mjs";

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
