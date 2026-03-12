import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { groupByTool } from "../scripts/tui/ui/format.mjs";

function makeProfile(tool, toolLabel, installed, actionCount) {
  return {
    id: `${tool}-${actionCount}`,
    tool,
    toolLabel,
    installed,
    actions: Array.from({ length: actionCount }, (_, i) => ({ source: `/s/${i}`, target: `/t/${i}` })),
  };
}

describe("groupByTool", () => {
  it("returns empty array for empty input", () => {
    assert.deepStrictEqual(groupByTool([]), []);
  });

  it("creates one group per unique tool", () => {
    const groups = groupByTool([
      makeProfile("a", "A", true, 1),
      makeProfile("b", "B", true, 1),
    ]);
    assert.strictEqual(groups.length, 2);
  });

  it("groups all profiles for the same tool", () => {
    const groups = groupByTool([
      makeProfile("a", "A", true, 1),
      makeProfile("a", "A", true, 2),
    ]);
    assert.strictEqual(groups.length, 1);
    assert.strictEqual(groups[0].profiles.length, 2);
  });

  it("sums actionCount across profiles for the same tool", () => {
    const groups = groupByTool([
      makeProfile("a", "A", true, 3),
      makeProfile("a", "A", true, 7),
    ]);
    assert.strictEqual(groups[0].actionCount, 10);
  });

  it("installed tools sort before not-installed", () => {
    const groups = groupByTool([
      makeProfile("zzz", "ZZZ", false, 1),
      makeProfile("aaa", "AAA", true, 1),
    ]);
    assert.strictEqual(groups[0].tool, "aaa");
    assert.strictEqual(groups[1].tool, "zzz");
  });

  it("within installed status, sorts alphabetically by tool name", () => {
    const groups = groupByTool([
      makeProfile("c", "C", true, 1),
      makeProfile("a", "A", true, 1),
      makeProfile("b", "B", true, 1),
    ]);
    assert.deepStrictEqual(groups.map((g) => g.tool), ["a", "b", "c"]);
  });

  it("within not-installed, sorts alphabetically", () => {
    const groups = groupByTool([
      makeProfile("z", "Z", false, 1),
      makeProfile("m", "M", false, 1),
    ]);
    assert.deepStrictEqual(groups.map((g) => g.tool), ["m", "z"]);
  });

  it("within same name+installed, larger actionCount sorts first", () => {
    const groups = groupByTool([
      makeProfile("b", "B", true, 1),
      makeProfile("a", "A", true, 10),
      makeProfile("a", "A", true, 5),
    ]);
    assert.strictEqual(groups[0].tool, "a");
    assert.strictEqual(groups[0].actionCount, 15);
  });

  it("group.installed is true when at least one profile is installed", () => {
    const groups = groupByTool([
      makeProfile("a", "A", false, 1),
      makeProfile("a", "A", true, 1),
    ]);
    assert.strictEqual(groups[0].installed, true);
  });

  it("group.installed is false when all profiles are not installed", () => {
    const groups = groupByTool([
      makeProfile("a", "A", false, 2),
      makeProfile("a", "A", false, 1),
    ]);
    assert.strictEqual(groups[0].installed, false);
  });

  it("profile.installed=undefined counts as installed (truthy)", () => {
    const p = makeProfile("a", "A", undefined, 1);
    assert.strictEqual(groupByTool([p])[0].installed, true);
  });

  it("uses toolLabel as the group label", () => {
    const groups = groupByTool([makeProfile("x", "My Tool Label", true, 1)]);
    assert.strictEqual(groups[0].label, "My Tool Label");
  });

  it("capitalises tool name as label when toolLabel is absent", () => {
    const p = { id: "y-p", tool: "mytool", toolLabel: undefined, installed: true, actions: [{ source: "/s", target: "/t" }] };
    assert.strictEqual(groupByTool([p])[0].label, "Mytool");
  });

  it("group.profiles contains all profiles for that tool in insertion order", () => {
    const p1 = makeProfile("a", "A", true, 1);
    const p2 = makeProfile("a", "A", true, 2);
    const groups = groupByTool([p1, p2]);
    assert.strictEqual(groups[0].profiles[0], p1);
    assert.strictEqual(groups[0].profiles[1], p2);
  });

  it("produces correct tool and label fields on each group", () => {
    const groups = groupByTool([makeProfile("claude", "Claude", true, 5)]);
    assert.strictEqual(groups[0].tool, "claude");
    assert.strictEqual(groups[0].label, "Claude");
  });

  it("not-installed group always trails installed groups of any tool name", () => {
    const groups = groupByTool([
      makeProfile("aaa", "AAA", false, 10),
      makeProfile("zzz", "ZZZ", true, 1),
    ]);
    assert.strictEqual(groups[0].tool, "zzz");
    assert.strictEqual(groups[1].tool, "aaa");
  });

  it("group.enabled defaults to true", () => {
    const groups = groupByTool([makeProfile("a", "A", true, 1)]);
    assert.strictEqual(groups[0].enabled, true);
  });

  it("group.enabled is false when profile has enabled=false", () => {
    const p = { ...makeProfile("a", "A", true, 1), enabled: false };
    assert.strictEqual(groupByTool([p])[0].enabled, false);
  });

  it("group.enabled is true when mix of enabled and disabled profiles", () => {
    const p1 = makeProfile("a", "A", true, 1);
    const p2 = { ...makeProfile("a", "A", true, 1), enabled: false };
    assert.strictEqual(groupByTool([p1, p2])[0].enabled, true);
  });

  it("enabled tools sort before disabled tools", () => {
    const disabled = { ...makeProfile("aaa", "AAA", true, 1), enabled: false };
    const enabled = makeProfile("zzz", "ZZZ", true, 1);
    const groups = groupByTool([disabled, enabled]);
    assert.strictEqual(groups[0].tool, "zzz");
    assert.strictEqual(groups[1].tool, "aaa");
  });

  it("disabled group always trails enabled groups regardless of name", () => {
    const disabled = { ...makeProfile("aaa", "AAA", true, 10), enabled: false };
    const enabled = makeProfile("zzz", "ZZZ", true, 1);
    const groups = groupByTool([disabled, enabled]);
    assert.strictEqual(groups[0].tool, "zzz");
    assert.strictEqual(groups[1].tool, "aaa");
  });
});
