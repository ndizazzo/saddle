import React, { useState } from "react";
import { spawnSync } from "child_process";
import { Box, Text, useInput, useStdout } from "ink";
import { palette } from "../theme/catalog.mjs";
import { theme } from "../theme/index.mjs";
import { h } from "../ui/react-helpers.mjs";

function classifyLine(line) {
  if (line.startsWith("--- ") || line.startsWith("+++ ")) {
    // diff -u includes a tab + timestamp after the path; strip it — the path is sufficient
    const tabIdx = line.indexOf("\t");
    const text = tabIdx !== -1 ? line.slice(0, tabIdx) : line;
    return { text, color: theme.color.fg.dim };
  }
  if (line.startsWith("@@")) {
    return { text: line, color: palette.cyan };
  }
  if (line.startsWith("-")) {
    return { text: line, color: palette.red };
  }
  if (line.startsWith("+")) {
    return { text: line, color: palette.green };
  }
  return { text: line, color: theme.color.fg.muted };
}

function computeDiffLines(beforePath, afterPath) {
  const result = spawnSync("diff", ["-u", beforePath, afterPath], { encoding: "utf8" });
  if (result.error) return [{ text: `diff error: ${result.error.message}`, color: palette.red }];
  const output = (result.stdout || "").trimEnd();
  if (!output) return [{ text: "No diff output.", color: theme.color.fg.muted }];
  return output.split("\n").map(classifyLine);
}

export function DiffOverlay({ beforePath, afterPath, label, onClose, layout }) {
  const { stdout } = useStdout();
  const columns = stdout.columns || 100;
  const overlayWidth = Math.min(100, Math.max(60, columns - 6));
  const contentHeight = layout ? layout.mainHeight : 20;
  // Compute full diff once on mount — no line cap
  const [lines] = useState(() => computeDiffLines(beforePath, afterPath));
  // Reserve rows for: border(2) + paddingY(2) + title(1) + legend(1) + gap(2) + scroll hints(2)
  const visibleCount = Math.max(1, contentHeight - 10);
  const maxScroll = Math.max(0, lines.length - visibleCount);
  const [scrollTop, setScrollTop] = useState(0);

  useInput((input, key) => {
    if (key.escape || input === "q") {
      onClose();
      return;
    }
    if (key.upArrow) {
      setScrollTop((current) => Math.max(0, current - 1));
      return;
    }
    if (key.downArrow) {
      setScrollTop((current) => Math.min(maxScroll, current + 1));
      return;
    }
    if (key.pageUp) {
      setScrollTop((current) => Math.max(0, current - visibleCount));
      return;
    }
    if (key.pageDown) {
      setScrollTop((current) => Math.min(maxScroll, current + visibleCount));
    }
  });

  const visibleLines = lines.slice(scrollTop, scrollTop + visibleCount);
  const hiddenAbove = scrollTop;
  const hiddenBelow = Math.max(0, lines.length - scrollTop - visibleCount);

  return h(
    Box,
    { height: contentHeight, justifyContent: "center", alignItems: "center" },
    h(
      Box,
      {
        width: overlayWidth,
        flexDirection: "column",
        backgroundColor: theme.color.bg.elevated,
        borderStyle: "round",
        borderColor: palette.red,
        paddingX: 2,
        paddingY: 1,
      },
      h(
        Box,
        { justifyContent: "space-between", marginBottom: 1 },
        h(Text, { color: palette.red, bold: true }, `DIFF  ${label}`),
        h(Text, { color: theme.color.fg.muted }, "esc  close"),
      ),
      hiddenAbove > 0
        ? h(Text, { color: theme.color.fg.dim }, `▲ ${hiddenAbove} more above`)
        : null,
      h(
        Box,
        { flexDirection: "column" },
        ...visibleLines.map((line, index) =>
          h(Text, { key: `dl-${scrollTop + index}`, color: line.color, wrap: "truncate" }, line.text || " "),
        ),
      ),
      hiddenBelow > 0
        ? h(Text, { color: theme.color.fg.dim }, `▼ ${hiddenBelow} more below`)
        : null,
      h(
        Box,
        { marginTop: 1, columnGap: 3 },
        h(Text, { color: palette.green, bold: true }, "+ added"),
        h(Text, { color: palette.red, bold: true }, "- removed"),
        h(Text, { color: palette.cyan }, "@@ hunk"),
        h(Text, { color: theme.color.fg.dim }, "↑/↓ scroll"),
      ),
    ),
  );
}
