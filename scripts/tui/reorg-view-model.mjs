import path from "path";

export function buildChangeGroups(actions) {
  const groups = new Map();

  for (const action of actions) {
    const sourceRoot = path.dirname(action.source);
    const targetRoot = path.dirname(action.target);
    const key = [action.type, action.kind, sourceRoot, targetRoot].join("::");
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        type: action.type,
        kind: action.kind,
        sourceRoot,
        targetRoot,
        targetClass: action.targetClass,
        tools: new Set(),
        actions: [],
      });
    }
    const group = groups.get(key);
    group.actions.push(action);
    for (const tool of action.tools) group.tools.add(tool);
  }

  const priority = { import: 0, link: 1, "remove-duplicate": 2 };
  return Array.from(groups.values())
    .map((group) => ({ ...group, tools: Array.from(group.tools).sort() }))
    .sort(
      (left, right) =>
        priority[left.type] - priority[right.type] ||
        left.targetRoot.localeCompare(right.targetRoot) ||
        left.sourceRoot.localeCompare(right.sourceRoot),
    );
}
