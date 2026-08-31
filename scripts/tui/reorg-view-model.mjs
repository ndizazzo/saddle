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

function actionPathMatchesEndpoint(action, endpoint) {
  if (action.type === "import") return path.dirname(action.source) === endpoint;
  return path.dirname(action.target) === endpoint;
}

function operationFor(actions) {
  const types = new Set(actions.map((action) => action.type));
  if (types.has("import") && types.has("link")) return "MOVE+LINK";
  if (types.has("link")) return "LINK";
  if (types.has("remove-duplicate")) return "CLEAN";
  return "MOVE";
}

export function buildHarnessBlocks({ coverage, actions, unchanged }) {
  const harnesses = new Map();

  for (const item of coverage) {
    if (!harnesses.has(item.tool)) {
      harnesses.set(item.tool, {
        tool: item.tool,
        label: item.toolLabel,
        rows: [],
      });
    }

    const harness = harnesses.get(item.tool);
    const relevantActions = actions.filter(
      (action) => action.kind === item.kind && action.tools.includes(item.tool),
    );
    const relevantUnchanged = unchanged.filter(
      (entry) => entry.kind === item.kind && entry.tools.includes(item.tool),
    );
    const endpoints = item.endpoints.length > 0 ? item.endpoints : [null];

    for (const endpoint of endpoints) {
      const matchingActions = endpoint
        ? relevantActions.filter((action) => actionPathMatchesEndpoint(action, endpoint))
        : [];
      const rowUnchanged = endpoint
        ? relevantUnchanged.filter((entry) => path.dirname(entry.target) === endpoint)
        : [];
      const changedNames = new Set(matchingActions.map((action) => action.name));
      const readyNames = new Set(rowUnchanged.map((entry) => entry.name));

      harness.rows.push({
        kind: item.kind,
        endpoint,
        targetClass: item.targetClass,
        supported: item.supported,
        status: !item.supported ? "unsupported" : matchingActions.length > 0 ? "change" : "ready",
        operation: matchingActions.length > 0 ? operationFor(matchingActions) : item.supported ? "READY" : "UNSUPPORTED",
        count: matchingActions.length > 0 ? changedNames.size : readyNames.size,
        actions: matchingActions,
      });
    }

    const unmatched = relevantActions.filter(
      (action) => !item.endpoints.some((endpoint) => actionPathMatchesEndpoint(action, endpoint)),
    );
    const cleanupRoots = new Map();
    for (const action of unmatched) {
      const cleanupRoot = action.type === "import" ? path.dirname(action.source) : path.dirname(action.target);
      if (!cleanupRoots.has(cleanupRoot)) cleanupRoots.set(cleanupRoot, []);
      cleanupRoots.get(cleanupRoot).push(action);
    }
    for (const [cleanupRoot, cleanupActions] of cleanupRoots) {
      harness.rows.push({
        kind: item.kind,
        displayKind: "cleanup",
        auxiliary: true,
        endpoint: cleanupRoot,
        targetClass: "cleanup",
        supported: true,
        status: "change",
        operation: operationFor(cleanupActions),
        count: new Set(cleanupActions.map((action) => action.name)).size,
        actions: cleanupActions,
      });
    }
  }

  const kindRank = { skill: 0, agent: 1, command: 2 };
  return Array.from(harnesses.values())
    .map((harness) => {
      harness.rows.sort(
        (left, right) =>
          kindRank[left.kind] - kindRank[right.kind] || Number(left.auxiliary) - Number(right.auxiliary),
      );
      harness.hasChanges = harness.rows.some((row) => row.status === "change");
      harness.changeCount = new Set(
        harness.rows.flatMap((row) => row.actions.map((action) => `${action.kind}:${action.name}`)),
      ).size;
      return harness;
    })
    .sort((left, right) => left.label.localeCompare(right.label));
}

export function buildCanonicalCollections({ sourceRoot, actions, unchanged }) {
  const collections = new Map();

  const add = (kind, itemPath, changed) => {
    if (!itemPath.startsWith(`${sourceRoot}${path.sep}`)) return;
    const root = path.dirname(itemPath);
    const key = `${kind}:${root}`;
    if (!collections.has(key)) collections.set(key, { kind, path: root, changed: false });
    if (changed) collections.get(key).changed = true;
  };

  for (const action of actions) {
    const canonicalPath = action.targetClass === "canonical" ? action.target : action.source;
    add(action.kind, canonicalPath, true);
  }
  for (const entry of unchanged) add(entry.kind, entry.source, false);

  const kindRank = { skill: 0, agent: 1, command: 2 };
  return Array.from(collections.values()).sort(
    (left, right) => kindRank[left.kind] - kindRank[right.kind] || left.path.localeCompare(right.path),
  );
}
