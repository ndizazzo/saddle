import { useMemo } from "react";
import path from "path";
import { Box, Text } from "ink";
import { palette } from "../theme/catalog.mjs";
import { theme } from "../theme/index.mjs";
import { Frame, ShortLabel, ShortPath } from "../ui/primitives.mjs";
import {
  ActionLine,
  ActionLineHeader,
  actionKindMeta,
  itemTypeMeta,
  ACTION_COL,
  VIA_COL,
  TYPE_COL,
} from "../ui/actions.mjs";
import { h } from "../ui/react-helpers.mjs";

export function ToolList({ toolGroups, depth, toolIndex, selectedActionKeys, focusedPane, inspectProfile }) {
  const groupSelectionState = (group) => {
    const selectableActions = group.profiles
      .filter((profile) => profile.installed !== false && profile.enabled !== false)
      .flatMap((profile) => profile.actions.map((action) => `${profile.id}::${action.target}`));
    if (selectableActions.length === 0) return "none";
    const selectedCount = selectableActions.filter((key) => selectedActionKeys.has(key)).length;
    if (selectedCount === 0) return "none";
    if (selectedCount === selectableActions.length) return "all";
    return "partial";
  };

  const checkboxForState = (state) => {
    if (state === "all") return "[x]";
    if (state === "partial") return "[-]";
    return "[ ]";
  };

  const radioForState = (state) => {
    if (state === "all" || state === "partial") return "(•)";
    return "( )";
  };

  const isGroupSelectable = (group) => group.installed && group.enabled;

  const getGroupCounts = (group) => {
    let existing = 0;
    let actions = 0;
    for (const profile of group.profiles) {
      if (profile.installed === false) continue;
      const result = inspectProfile(profile);
      existing += result.counts.noChange;
      actions += result.counts.create + result.counts.replace;
    }
    return { existing, actions };
  };

  return h(
    Frame,
    { title: "Install targets", color: "blue", focused: depth === 0 && focusedPane === "tools", flexGrow: 1 },
    h(
      Box,
      { height: 1, justifyContent: "space-between" },
      h(Box, { columnGap: 1 }, h(Text, {}, " "), h(Text, {}, "   "), h(Text, { color: theme.color.fg.dim }, "TOOL")),
      h(
        Box,
        { columnGap: 2 },
        h(Box, { width: 6, justifyContent: "flex-end" }, h(Text, { color: theme.color.fg.dim }, "READY")),
        h(Box, { width: 5, justifyContent: "flex-end" }, h(Text, { color: theme.color.fg.dim }, "TODO")),
      ),
    ),
    ...toolGroups.map((group, index) => {
      const isFocused = toolIndex === index;
      const isDrilled = depth === 1 && isFocused;
      const selectable = isGroupSelectable(group);
      const state = groupSelectionState(group);
      const counts = group.installed ? getGroupCounts(group) : null;

      const badgeElement = !group.enabled
        ? h(Text, { color: palette.graySoft }, "DISABLED")
        : !group.installed
          ? h(Text, { color: palette.red }, "NOT INSTALLED")
          : null;

      return h(
        Box,
        {
          key: group.tool,
          height: 1,
          justifyContent: "space-between",
          backgroundColor: depth === 0 && isFocused ? theme.color.selectionBg : undefined,
        },
        h(
          Box,
          { columnGap: 1 },
          h(
            Text,
            { color: isFocused ? theme.color.accent.bright : theme.color.fg.dim, bold: isFocused },
            isDrilled ? "▸" : isFocused ? "▍" : " ",
          ),
          h(
            Text,
            {
              color: selectable
                ? depth === 0 && isFocused
                  ? theme.color.fg.primary
                  : theme.color.fg.muted
                : theme.color.fg.dim,
              bold: depth === 0 && isFocused && selectable,
            },
            group.mode === "single-select" ? radioForState(state) : checkboxForState(state),
          ),
          h(ShortLabel, {
            text: group.label,
            color: selectable ? (depth === 0 && isFocused ? "white" : "gray") : "graySoft",
            bold: depth === 0 && isFocused && selectable,
          }),
        ),
        badgeElement
          ? badgeElement
          : h(
              Box,
              { columnGap: 2 },
              h(
                Box,
                { width: 6, justifyContent: "flex-end" },
                h(Text, { color: theme.color.fg.muted }, `${counts.existing}`),
              ),
              h(
                Box,
                { width: 5, justifyContent: "flex-end" },
                h(
                  Text,
                  { color: counts.actions > 0 ? theme.color.accent.primary : theme.color.fg.dim },
                  `${counts.actions}`,
                ),
              ),
            ),
      );
    }),
  );
}

export function ToolDetail({ toolGroups, toolIndex, inspectProfile, layout }) {
  const group = toolGroups[toolIndex] || null;

  const previewData = useMemo(() => {
    if (!group) return null;
    const aggregate = { actions: [], counts: { total: 0, create: 0, noChange: 0, replace: 0 } };
    for (const profile of group.profiles) {
      const result = inspectProfile(profile);
      aggregate.actions.push(...result.actions);
      aggregate.counts.total += result.counts.total;
      aggregate.counts.create += result.counts.create;
      aggregate.counts.noChange += result.counts.noChange;
      aggregate.counts.replace += result.counts.replace;
    }
    return { title: group.label, profiles: group.profiles, actions: aggregate.actions, counts: aggregate.counts };
  }, [group, inspectProfile]);

  if (!previewData) {
    return h(
      Frame,
      { title: "Detail", color: "cyan", focused: false, flexGrow: 1 },
      h(Text, { color: theme.color.fg.muted }, "No tool groups available."),
    );
  }

  if (!group.installed) {
    return h(
      Frame,
      { title: "Detail", color: "cyan", focused: false, flexGrow: 1 },
      h(
        Box,
        { flexGrow: 1, alignItems: "center", justifyContent: "center" },
        h(Text, { color: theme.color.fg.dim }, `Install ${group.label} to enable`),
      ),
    );
  }

  const isDisabled = group.enabled === false;
  const dimColor = isDisabled ? theme.color.fg.dim : theme.color.fg.muted;
  const titleColor = isDisabled ? theme.color.fg.dim : theme.color.fg.primary;
  const summary = `${previewData.counts.total} actions • ${previewData.counts.create} create • ${previewData.counts.replace} replace • ${previewData.counts.noChange} no change`;
  const maxActionLines = Math.max(1, layout.previewLineLimit - previewData.profiles.length * 2 - 9);
  const visibleActions = previewData.actions.slice(0, maxActionLines);
  const hiddenBelow = Math.max(0, previewData.actions.length - visibleActions.length);

  return h(
    Frame,
    { title: "Detail", color: "cyan", focused: false, flexGrow: 1 },
    h(Text, { color: titleColor, bold: !isDisabled }, previewData.title),
    isDisabled ? h(Text, { color: palette.graySoft }, "This rule is disabled. Edit the rule file to re-enable.") : null,
    h(Box, { height: 1 }),
    ...previewData.profiles.map((profile) =>
      h(
        Box,
        { key: `profile-meta-${profile.id}`, flexDirection: "column", marginBottom: 1 },
        h(Text, { color: titleColor }, profile.label),
        h(Text, { color: dimColor }, profile.description),
      ),
    ),
    h(Text, { color: dimColor }, summary),
    h(Box, { height: 1 }),
    h(ActionLineHeader, null),
    ...visibleActions.map((action, index) =>
      h(ActionLine, { key: `tool-detail-action-${index}-${action.target}-${action.kind}`, action, dimmed: isDisabled }),
    ),
    hiddenBelow > 0 ? h(Text, { color: theme.color.fg.dim }, `▼ ${hiddenBelow} more below`) : null,
  );
}

export function ActionSelector({
  toolGroups,
  toolIndex,
  flatActions,
  selectedActionKeys,
  actionIndex,
  actionScrollOffset,
  layout,
}) {
  const group = toolGroups[toolIndex] || null;
  if (!group) {
    return h(
      Frame,
      { title: "Detail", color: "cyan", focused: true, flexGrow: 1 },
      h(Text, { color: theme.color.fg.muted }, "No tool groups available."),
    );
  }

  const profileIntroLines =
    group.profiles.length === 1
      ? [group.profiles[0].description]
      : group.profiles.map((profile) => `${profile.label}: ${profile.description}`);

  const actionAreaHeight = Math.max(1, layout.mainHeight - profileIntroLines.length - 8);
  const visibleActions = flatActions.slice(actionScrollOffset, actionScrollOffset + actionAreaHeight);
  const hiddenAbove = actionScrollOffset;
  const hiddenBelow = Math.max(0, flatActions.length - actionScrollOffset - visibleActions.length);

  const columnHeader = h(
    Box,
    { key: "col-header", height: 1, justifyContent: "space-between" },
    h(Box, { columnGap: 1 }, h(Text, {}, " "), h(Text, {}, "   "), h(Text, { color: theme.color.fg.dim }, "NAME")),
    h(
      Box,
      { columnGap: 2 },
      h(Box, { width: VIA_COL }, h(Text, { color: theme.color.fg.dim }, "VIA")),
      h(Box, { width: TYPE_COL }, h(Text, { color: theme.color.fg.dim }, "TYPE")),
      h(Box, { width: ACTION_COL }, h(Text, { color: theme.color.fg.dim }, "ACTION")),
    ),
  );

  const rows = [];
  let lastProfileId = null;
  for (const item of visibleActions) {
    const isFocused = flatActions[actionIndex]?.key === item.key;
    const isSelected = selectedActionKeys.has(item.key);
    const targetBasename = path.basename(item.action.target);
    const meta = actionKindMeta(item.inspectedAction.kind);
    const effectLabel = (item.inspectedAction.effectLabel || "symlink").toUpperCase();

    if (group.profiles.length > 1 && lastProfileId !== item.profileId) {
      rows.push(h(Text, { key: `hdr-${item.key}`, color: theme.color.fg.muted }, item.profileLabel));
      lastProfileId = item.profileId;
    }

    const type = itemTypeMeta(item.inspectedAction.itemType);
    rows.push(
      h(
        Box,
        {
          key: item.key,
          height: 1,
          justifyContent: "space-between",
          backgroundColor: isFocused ? theme.color.selectionBg : undefined,
        },
        h(
          Box,
          { columnGap: 1 },
          h(
            Text,
            { color: isFocused ? theme.color.accent.bright : theme.color.fg.dim, bold: isFocused },
            isFocused ? "▍" : " ",
          ),
          h(
            Text,
            { color: isSelected ? theme.color.accent.primary : theme.color.fg.muted },
            group.mode === "single-select" ? (isSelected ? "(•)" : "( )") : isSelected ? "[x]" : "[ ]",
          ),
          h(
            Text,
            { color: isFocused ? theme.color.fg.primary : theme.color.fg.muted, bold: isFocused },
            targetBasename,
          ),
        ),
        h(
          Box,
          { columnGap: 2 },
          h(Box, { width: VIA_COL }, h(Text, { color: theme.color.fg.dim }, effectLabel)),
          h(Box, { width: TYPE_COL }, h(Text, { color: type.color }, type.label)),
          h(Box, { width: ACTION_COL }, h(Text, { color: meta.color, bold: true }, meta.label)),
        ),
      ),
    );
  }

  return h(
    Frame,
    { title: group.label, color: "cyan", focused: true, flexGrow: 1 },
    ...profileIntroLines.map((line, index) => h(Text, { key: `intro-${index}`, color: theme.color.fg.muted }, line)),
    h(Box, { height: 1 }),
    columnHeader,
    hiddenAbove > 0 ? h(Text, { color: theme.color.fg.dim }, `▲ ${hiddenAbove} more above`) : null,
    rows.length > 0
      ? h(Box, { flexDirection: "column" }, ...rows)
      : h(Text, { color: theme.color.fg.dim }, "No actions in this tool."),
    hiddenBelow > 0 ? h(Text, { color: theme.color.fg.dim }, `▼ ${hiddenBelow} more below`) : null,
  );
}

export function SourceDefinitions({ sourceRoot, configPath, focused }) {
  return h(
    Frame,
    { title: "Source definitions", color: "cyan", focused: focused ? true : false },
    h(
      Box,
      { columnGap: 1 },
      h(Text, { color: theme.color.fg.primary }, "config:"),
      h(ShortPath, { pathText: configPath, color: "gray" }),
    ),
    h(
      Box,
      { columnGap: 1 },
      h(Text, { color: theme.color.fg.primary }, "source:"),
      h(ShortPath, { pathText: sourceRoot, color: "cyan" }),
    ),
  );
}

export function SelectionScreen({
  toolGroups,
  depth,
  toolIndex,
  selectedActionKeys,
  inspectProfile,
  sourceRoot,
  configPath,
  focusedPane,
  layout,
  flatActions,
  actionIndex,
  actionScrollOffset,
}) {
  return h(
    Box,
    { columnGap: 1, height: layout.mainHeight },
    h(
      Box,
      { width: layout.leftWidth, flexDirection: "column" },
      h(SourceDefinitions, { sourceRoot, configPath, focused: focusedPane === "source" && depth === 0 }),
      h(ToolList, { toolGroups, depth, toolIndex, selectedActionKeys, focusedPane, inspectProfile }),
    ),
    h(
      Box,
      { width: layout.rightWidth, flexDirection: "column" },
      depth === 0
        ? h(ToolDetail, { toolGroups, toolIndex, inspectProfile, layout })
        : h(ActionSelector, {
            toolGroups,
            toolIndex,
            flatActions,
            selectedActionKeys,
            actionIndex,
            actionScrollOffset,
            layout,
          }),
    ),
  );
}
