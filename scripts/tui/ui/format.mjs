export function groupByTool(profiles) {
  const groups = new Map();

  for (const profile of profiles) {
    const tool = profile.tool;
    if (!groups.has(tool)) {
      groups.set(tool, {
        tool,
        label: profile.toolLabel || tool.charAt(0).toUpperCase() + tool.slice(1),
        installed: false,
        enabled: true,
        profiles: [],
        actionCount: 0,
      });
    }

    const group = groups.get(tool);
    group.profiles.push(profile);
    group.actionCount += profile.actions.length;
    if (profile.installed !== false) {
      group.installed = true;
    }
    if (profile.enabled === false) {
      group.enabled = false;
    }
  }

  return Array.from(groups.values()).sort((a, b) => {
    const enabledCompare = (b.enabled ? 1 : 0) - (a.enabled ? 1 : 0);
    if (enabledCompare !== 0) return enabledCompare;
    const installedCompare = (b.installed ? 1 : 0) - (a.installed ? 1 : 0);
    if (installedCompare !== 0) return installedCompare;
    const nameCompare = a.tool.localeCompare(b.tool);
    if (nameCompare !== 0) return nameCompare;
    return b.actionCount - a.actionCount;
  });
}
