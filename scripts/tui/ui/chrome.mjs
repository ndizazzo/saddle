import path from "path";
import { Box, Text } from "ink";
import { theme } from "../theme/index.mjs";
import { TerminalTag } from "./primitives.mjs";
import { h } from "./react-helpers.mjs";

export function ChromeBar({ sourceRoot }) {
  const sourceRootLabel = sourceRoot
    ? (() => {
        const normalizedSourceRoot = path.normalize(sourceRoot);
        return path.basename(normalizedSourceRoot) || normalizedSourceRoot;
      })()
    : "saddle";

  return h(
    Box,
    { flexDirection: "column", marginBottom: 1 },
    h(
      Box,
      {
        borderStyle: "single",
        borderColor: theme.color.border.subtle,
        backgroundColor: theme.color.bg.elevated,
        paddingX: 1,
        justifyContent: "space-between",
      },
      h(
        Box,
        { columnGap: 1 },
        h(Text, { color: theme.color.fg.primary, bold: true }, "Saddle"),
        h(Text, { color: theme.color.fg.muted }, "/"),
        h(Text, { color: theme.color.fg.muted }, "configuration"),
      ),
      h(
        Box,
        { columnGap: 1 },
        h(TerminalTag, { tone: "blue" }, "project"),
        h(TerminalTag, { tone: "cyan" }, sourceRootLabel),
      ),
    ),
  );
}

function Hint({ keyLabel, label }) {
  return h(
    Box,
    { flexDirection: "row" },
    h(Text, { color: theme.color.accent.primary }, keyLabel),
    h(Text, { color: theme.color.fg.muted }, ` ${label}`),
  );
}

function HintRow({ hints }) {
  return h(
    Box,
    { flexDirection: "row", columnGap: 2 },
    ...hints.map(({ keyLabel, label }) => h(Hint, { key: keyLabel, keyLabel, label })),
  );
}

const HINTS = {
  selectDepth0Tools: [
    { keyLabel: "↑/↓", label: "move" },
    { keyLabel: "space", label: "toggle" },
    { keyLabel: "enter/→", label: "detail" },
    { keyLabel: "tab", label: "source pane" },
    { keyLabel: "ctrl-s", label: "apply" },
    { keyLabel: "a/n", label: "all/none" },
    { keyLabel: "q", label: "quit" },
  ],
  selectDepth0Source: [
    { keyLabel: "enter", label: "edit source" },
    { keyLabel: "tab", label: "tool list" },
    { keyLabel: "q", label: "quit" },
  ],
  selectDepth1: [
    { keyLabel: "↑/↓", label: "move" },
    { keyLabel: "space", label: "toggle" },
    { keyLabel: "←/esc", label: "back" },
    { keyLabel: "ctrl-s", label: "apply" },
    { keyLabel: "a/n", label: "all/none" },
    { keyLabel: "d", label: "diff" },
    { keyLabel: "q", label: "quit" },
  ],
  confirm: [
    { keyLabel: "enter", label: "apply" },
    { keyLabel: "esc", label: "back" },
    { keyLabel: "q", label: "quit" },
  ],
  run: [
    { keyLabel: "enter/q", label: "exit" },
  ],
};

export function FooterBar({ stage, selectedCount, actionCount, depth, focusedPane, options, isDiffable }) {
  const hints = stage === "select"
    ? depth === 1
      ? isDiffable ? HINTS.selectDepth1 : HINTS.selectDepth1.filter(h => h.keyLabel !== "d")
      : focusedPane === "source" ? HINTS.selectDepth0Source
      : HINTS.selectDepth0Tools
    : stage === "confirm"
    ? HINTS.confirm
    : HINTS.run;

  return h(
    Box,
    {
      borderStyle: "single",
      borderColor: theme.color.border.subtle,
      backgroundColor: theme.color.bg.elevated,
      marginTop: 1,
      paddingX: 1,
      justifyContent: "space-between",
    },
    h(HintRow, { hints }),
    h(
      Box,
      { columnGap: 1 },
      options.dryRun ? h(TerminalTag, { tone: "yellow" }, "dry run") : null,
      h(TerminalTag, { tone: selectedCount > 0 ? "cyan" : "gray" }, `${selectedCount} actions`),
      actionCount > 0 ? h(TerminalTag, { tone: "blue" }, `${actionCount} total`) : null,
    ),
  );
}
