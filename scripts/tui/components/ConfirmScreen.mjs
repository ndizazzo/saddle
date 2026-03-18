import { useMemo } from "react";
import path from "path";
import { Box, Text } from "ink";
import { palette } from "../theme/catalog.mjs";
import { theme } from "../theme/index.mjs";
import { Frame, TerminalTag } from "../ui/primitives.mjs";
import { actionKindMeta, itemTypeMeta } from "../ui/actions.mjs";
import { h } from "../ui/react-helpers.mjs";

const standaloneProfileLabel = (profile) => `${profile.toolLabel} / ${profile.label}`;

export function ConfirmScreen({ selectedProfiles, inspectProfile, options, layout, canApply }) {
  const inspection = useMemo(() => {
    const profiles = [];
    const totals = { actions: 0, create: 0, replace: 0, noChange: 0 };

    for (const profile of selectedProfiles) {
      const result = inspectProfile(profile);
      profiles.push({ profile, result });
      totals.actions += result.counts.total;
      totals.create += result.counts.create;
      totals.replace += result.counts.replace;
      totals.noChange += result.counts.noChange;
    }

    return { profiles, totals };
  }, [selectedProfiles, inspectProfile]);

  const maxActionLines = Math.max(1, layout.mainHeight - inspection.profiles.length - 14);
  const allActions = inspection.profiles.flatMap(({ profile, result }) =>
    result.actions
      .filter((action) => action.kind !== "already-linked")
      .map((action) => ({ profileLabel: profile.label, action })),
  );
  const visibleActions = allActions.slice(0, maxActionLines);
  const hiddenCount = Math.max(0, allActions.length - visibleActions.length);



  return h(
    Box,
    { columnGap: 1, height: layout.mainHeight },
    h(
      Box,
      { width: layout.leftWidth, flexDirection: "column" },
      h(
        Frame,
        { title: "Profiles", color: "blue", flexGrow: 1 },
        ...inspection.profiles.map(({ profile, result }) =>
          h(
            Box,
            { key: profile.id, height: 1, justifyContent: "space-between" },
            h(
              Box,
              { columnGap: 1 },
              h(Text, { color: theme.color.fg.primary }, "•"),
              h(Text, { color: theme.color.fg.primary }, standaloneProfileLabel(profile)),
            ),
            h(Text, { color: theme.color.accent.primary }, `${result.counts.create + result.counts.replace}`),
          ),
        ),
        h(Box, { height: 1 }),
        h(
          Box,
          { columnGap: 1, flexWrap: "wrap" },
          options.dryRun ? h(TerminalTag, { tone: "yellow" }, "DRY RUN") : h(TerminalTag, { tone: "green" }, "LIVE"),
          h(TerminalTag, { tone: "cyan" }, `${inspection.totals.actions} actions`),
        ),
      ),
    ),
    h(
      Box,
      { width: layout.rightWidth, flexDirection: "column" },
      h(
        Frame,
        { title: "Review changes", color: "orange", flexGrow: 1 },
        h(
          Box,
          { columnGap: 2, marginBottom: 1 },
          h(Text, { color: palette.cyan, bold: true }, `${inspection.totals.create} create`),
          h(Text, { color: palette.orange, bold: true }, `${inspection.totals.replace} replace`),
          h(Text, { color: palette.graySoft }, `${inspection.totals.noChange} no change`),
        ),
        ...visibleActions.map(({ profileLabel, action }, index) => {
          const meta = actionKindMeta(action.kind);
          const type = itemTypeMeta(action.itemType);
          const targetBasename = path.basename(action.target);
          return h(
            Box,
            { key: `confirm-action-${index}-${action.target}`, height: 1, justifyContent: "space-between" },
            h(
              Box,
              { columnGap: 1 },
              h(Text, { color: theme.color.fg.dim }, "•"),
              h(Text, { color: theme.color.fg.primary }, targetBasename),
              h(Text, { color: theme.color.fg.dim }, `(${profileLabel})`),
            ),
            h(
              Box,
              { columnGap: 2 },
              h(Text, { color: type.color }, type.label),
              h(Text, { color: meta.color, bold: true }, meta.label),
            ),
          );
        }),
        hiddenCount > 0 ? h(Text, { color: theme.color.fg.dim }, `  … ${hiddenCount} more`) : null,
        h(Box, { flexGrow: 1 }),
        canApply
          ? h(Box, { borderStyle: "single", borderColor: theme.color.accent.primary, paddingX: 1, justifyContent: "center", marginTop: 1 },
              h(Text, { color: theme.color.accent.bright, bold: true }, "Press ENTER to apply  •  ESC to go back"),
            )
          : h(Box, { borderStyle: "single", borderColor: theme.color.fg.dim, paddingX: 1, justifyContent: "center", marginTop: 1 },
              h(Text, { color: theme.color.fg.dim }, "Nothing to apply  •  ESC to go back"),
            ),
      ),
    ),
  );
}
