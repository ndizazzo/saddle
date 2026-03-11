import React from "react";
import { Box, Text } from "ink";
import { palette } from "../theme/catalog.mjs";
import { theme } from "../theme/index.mjs";

const h = React.createElement;

export function Frame({ title, color = "cyan", focused, children, ...boxProps }) {
  const borderColor = focused === true
    ? theme.color.accent.primary
    : focused === false
      ? theme.color.border.subtle
      : (palette[color] || theme.color.border.subtle);
  const titleBg = focused === true
    ? theme.color.accent.primary
    : focused === false
      ? theme.color.border.subtle
      : (palette[color] || theme.color.accent.soft);
  const titleFg = theme.color.fg.inverse;

  return h(
    Box,
    {
      borderStyle: "single",
      borderColor,
      backgroundColor: theme.color.bg.panel,
      paddingX: 1,
      paddingY: 0,
      flexDirection: "column",
      ...boxProps,
    },
    h(
      Box,
      { marginBottom: 1, justifyContent: "space-between" },
      h(Text, { color: titleFg, backgroundColor: titleBg, bold: true }, ` ${title.toUpperCase()} `),
    ),
    children,
  );
}

export function TerminalTag({ tone = "cyan", children }) {
  return h(
    Text,
    {
      color: theme.color.fg.inverse,
      backgroundColor: palette[tone] || tone,
      bold: true,
    },
    ` ${children} `,
  );
}

export function ShortPath({ pathText, color = "gray" }) {
  return h(Text, { color: palette[color] || color, wrap: "truncate-middle" }, pathText);
}

export function ShortLabel({ text, color = "white", bold = false }) {
  return h(Text, { color: palette[color] || color, bold, wrap: "truncate-end" }, text);
}

export function KeyHint({ children }) {
  return h(Text, { color: theme.color.fg.muted }, children);
}

export function LegendKey({ label, hint }) {
  return h(
    Box,
    { columnGap: 1 },
    h(Text, { color: theme.color.accent.primary, bold: true }, label),
    h(Text, { color: theme.color.fg.muted }, hint),
  );
}
