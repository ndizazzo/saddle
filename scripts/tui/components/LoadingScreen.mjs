import React from "react";
import { Box, Text } from "ink";
import { ProgressBar } from "@inkjs/ui";
import { palette } from "../theme/catalog.mjs";
import { theme } from "../theme/index.mjs";
import { h, contractHome } from "../ui/react-helpers.mjs";

const LOGO_RAW = [
  "   _______   ___  ___  __   ____ ",
  "  / __/ _ | / _ \\/ _ \\/ /  / __/",
  " _\\ \\/ __ |/ // / // / /__/ _/  ",
  "/___/_/ |_/____/____/____/___/ ",
];
const LOGO_WIDTH = Math.max(...LOGO_RAW.map((l) => l.length));
const LOGO_LINES = LOGO_RAW.map((l) => l.padEnd(LOGO_WIDTH));

export function LoadingScreen({ scanProgress, totalHeight }) {
  const { done, total, current } = scanProgress;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const displayPath = current ? contractHome(current) : "Scanning…";

  return h(
    Box,
    {
      flexDirection: "column",
      height: totalHeight,
      alignItems: "center",
      justifyContent: "center",
    },
    // Logo block — shifted slightly above center via a bottom spacer
      h(
      Box,
      { flexDirection: "column", alignItems: "flex-start", marginBottom: 3 },
      ...LOGO_LINES.map((line, i) => h(Text, { key: i, color: palette.cyan, bold: true }, line)),
      h(Box, { marginTop: 1, width: LOGO_WIDTH, justifyContent: "center" },
        h(Text, { color: theme.color.fg.dim }, "ai-config installer"),
      ),
    ),
    // Progress bar
    h(
      Box,
      { flexDirection: "column", alignItems: "center", width: 60 },
      h(
        Box,
        { width: 60, marginBottom: 1 },
        h(ProgressBar, { value: percent }),
      ),
      h(
        Box,
        { justifyContent: "space-between", width: 60 },
        h(
          Box,
          { flexShrink: 1, overflow: "hidden" },
          h(Text, { color: theme.color.fg.dim, wrap: "truncate-end" }, displayPath),
        ),
        h(
          Box,
          { flexShrink: 0, marginLeft: 2 },
          h(Text, { color: theme.color.accent.primary, bold: true }, `${percent}%`),
        ),
      ),
    ),
  );
}
