import React from "react";
import { Box, Newline, Text } from "ink";
import { Alert, ConfirmInput, ProgressBar, Spinner, StatusMessage } from "@inkjs/ui";
import { theme } from "../theme/index.mjs";
import { Frame, ShortLabel, TerminalTag } from "../ui/primitives.mjs";

const h = React.createElement;

export function SummaryBar({ options, selectedProfiles }) {
  return h(
    Box,
    { columnGap: 1, flexWrap: "wrap" },
    options.dryRun ? h(TerminalTag, { tone: "yellow" }, "DRY RUN") : h(TerminalTag, { tone: "green" }, "LIVE"),
    options.assumeYes ? h(TerminalTag, { tone: "magenta" }, "AUTO CONFIRM") : h(TerminalTag, { tone: "blue" }, "INTERACTIVE"),
    h(TerminalTag, { tone: "cyan" }, `${selectedProfiles.length} PROFILES`),
  );
}

export function LogLine({ entry }) {
  const colorByKind = {
    mkdir: theme.color.fg.secondary,
    ok: theme.color.state.success,
    prompt: theme.color.state.warning,
    skip: theme.color.fg.muted,
    backup: theme.color.state.info,
    link: theme.color.accent.primary,
    complete: theme.color.state.success,
    info: theme.color.fg.primary,
    error: theme.color.state.error,
  };

  return h(
    Box,
    null,
    h(Text, { color: colorByKind[entry.kind] || theme.color.fg.primary }, `[${entry.kind}] `),
    h(Text, { color: theme.color.fg.primary }, entry.message),
  );
}

export function PromptCard({ prompt, onConfirm, onCancel, ...boxProps }) {
  const previewLines = prompt.preview.split("\n").slice(0, 12);

  return h(
    Frame,
    { title: "Confirm replacement", color: "orange", ...boxProps },
    h(Text, { bold: true, color: theme.color.fg.primary }, prompt.target),
    h(Text, { color: theme.color.orange }, prompt.reason),
    h(Newline, null),
    h(Text, { color: theme.color.fg.muted }, "Preview"),
    h(
      Box,
      { flexDirection: "column", marginTop: 1 },
      ...previewLines.map((line, index) => h(Text, { key: `${index}-${line}`, color: theme.color.fg.muted }, line)),
    ),
    h(Newline, null),
    h(ConfirmInput, { defaultChoice: "cancel", onConfirm, onCancel }),
  );
}

export function RunScreen({ options, selectedProfiles, currentProfile, completedProfileIds, logs, prompt, summary, progressPercent, done, error, onDecision, layout }) {
  const recentLogs = logs.slice(-Math.max(4, layout.lowerSectionHeight - 5));
  const lowerHeight = layout.lowerSectionHeight;

  return h(
    Box,
    { columnGap: 1, height: layout.mainHeight },
    h(
      Box,
      { width: layout.leftWidth, flexDirection: "column", justifyContent: "space-between" },
      h(
        Frame,
        { title: "Install targets", color: "blue", flexGrow: 1 },
        ...selectedProfiles.map((profile) => {
          const isCompleted = completedProfileIds?.has(profile.id);
          const isCurrent = currentProfile?.id === profile.id;
          const indicatorColor = isCompleted ? theme.color.state.success : isCurrent ? theme.color.accent.bright : theme.color.fg.dim;
          const labelColor = isCompleted ? "green" : isCurrent ? "white" : "gray";
          const countColor = isCompleted ? theme.color.state.success : theme.color.accent.primary;
          const indicator = isCompleted ? "✓" : isCurrent ? "▍" : " ";
          return h(
            Box,
            { key: profile.id, height: 1, justifyContent: "space-between" },
            h(
              Box,
              { columnGap: 1 },
              h(Text, { color: indicatorColor, bold: isCurrent }, indicator),
              h(ShortLabel, { text: profile.label, color: labelColor, bold: isCurrent }),
            ),
            h(Text, { color: countColor }, `${profile.actions.length}`),
          );
        }),
      ),
      h(
        Frame,
        { title: "Selection", color: "blue", height: 8 },
        h(Text, { color: theme.color.fg.primary, bold: true }, currentProfile ? currentProfile.label : "Preparing"),
        h(Newline, null),
        h(Text, { color: theme.color.fg.muted }, currentProfile ? currentProfile.description : "Computing install plan for selected targets."),
      ),
    ),
    h(
      Box,
      { width: layout.rightWidth, flexDirection: "column", rowGap: 1 },
      h(
        Frame,
        { title: "Source definitions", color: "cyan", height: layout.sourceHeight },
        h(SummaryBar, { options, selectedProfiles }),
        h(Newline, null),
        h(Text, { color: theme.color.fg.muted }, currentProfile ? `Working on ${currentProfile.label}` : "Preparing install actions"),
        h(Box, { marginTop: 1 }, h(ProgressBar, { value: progressPercent })),
        summary.totalActions > 0
          ? h(Text, { color: theme.color.fg.muted }, `${summary.completedActions}/${summary.totalActions} actions processed`)
          : h(Text, { color: theme.color.fg.muted }, "No actions to process"),
      ),
      prompt
        ? h(PromptCard, { prompt, onConfirm: () => onDecision(true), onCancel: () => onDecision(false), height: lowerHeight })
        : done
          ? h(
            Frame,
            { title: "Result", color: error ? "red" : "cyan", height: lowerHeight },
            error ? h(Alert, { variant: "error" }, error) : h(StatusMessage, { variant: "success" }, "Installer finished. Press enter or q to exit."),
          )
          : h(
            Frame,
            { title: "Activity", color: "cyan", height: lowerHeight },
            h(Box, { marginBottom: 1 }, h(Spinner, { label: "Applying selected profiles" })),
            recentLogs.length > 0
              ? h(Box, { flexDirection: "column" }, ...recentLogs.map((entry, index) => h(LogLine, { key: `log-${index}-${entry.sequence}-${entry.kind}-${entry.message}`, entry })))
              : h(Text, { color: theme.color.fg.muted }, "No filesystem actions yet."),
          ),
    ),
  );
}
