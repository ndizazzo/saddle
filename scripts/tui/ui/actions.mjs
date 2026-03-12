import path from "path";
import { Box, Text } from "ink";
import { palette } from "../theme/catalog.mjs";
import { theme } from "../theme/index.mjs";
import { ShortPath, TerminalTag } from "./primitives.mjs";
import { h } from "./react-helpers.mjs";

export const ACTION_COL = 9;
export const VIA_COL    = 10;
export const TYPE_COL   = 6;

export const itemTypeMeta = (itemType) => {
  if (itemType === "skill") return { label: "SKILL", color: palette.magenta };
  if (itemType === "agent") return { label: "AGENT", color: palette.green };
  if (itemType === "command") return { label: "CMD", color: palette.yellow };
  return { label: "FILE", color: palette.blue };
};

export const actionKindMeta = (kind) => {
  if (kind === "new-link") return { label: "CREATE", color: palette.cyan };
  if (kind === "already-linked") return { label: "NO CHANGE", color: palette.graySoft };
  if (kind === "replace-link") return { label: "REPLACE", color: palette.orange };
  if (kind === "replace-match") return { label: "SAME", color: palette.magenta };
  return { label: "DIFF", color: palette.red };
};

export function ActionLineHeader() {
  return h(
    Box,
    { height: 1, columnGap: 1 },
    h(Text, { color: theme.color.fg.dim }, "ACTION".padEnd(ACTION_COL)),
    h(Text, { color: theme.color.fg.dim }, "VIA".padEnd(VIA_COL)),
    h(Text, { color: theme.color.fg.dim }, "TYPE".padEnd(TYPE_COL)),
    h(Text, { color: theme.color.fg.dim }, "NAME"),
  );
}

export function ActionLine({ action, dimmed = false }) {
   const kindMeta = actionKindMeta(action.kind);
   const kindLabel = kindMeta.label;
   const kindColor = dimmed ? theme.color.fg.dim : kindMeta.color;
   const effectLabel = (action.effectLabel || "symlink").toUpperCase();
   const targetName = path.basename(action.target || action.afterPath || action.beforePath || "-");
   const type = itemTypeMeta(action.itemType);

   return h(
     Box,
     { height: 1, columnGap: 1 },
     h(Text, { color: kindColor, bold: !dimmed }, kindLabel.padEnd(ACTION_COL)),
     h(Text, { color: theme.color.fg.dim }, effectLabel.padEnd(VIA_COL)),
     h(Text, { color: dimmed ? theme.color.fg.dim : type.color }, type.label.padEnd(TYPE_COL)),
     h(Text, { color: dimmed ? theme.color.fg.dim : (action.kind === "already-linked" ? theme.color.fg.dim : theme.color.fg.primary) }, targetName),
   );
}
