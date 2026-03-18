import { useEffect, useRef } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import { TextInput } from "@inkjs/ui";
import { theme } from "../theme/index.mjs";
import { h } from "../ui/react-helpers.mjs";

export function PathEditOverlay({ currentValue, onSubmit, onCancel, layout }) {
  const { stdout } = useStdout();
  const columns = stdout.columns || 100;
  const overlayWidth = Math.min(72, Math.max(48, columns - 8));
  const contentHeight = layout ? layout.mainHeight : 20;
  // Prevent the Enter key that opened this overlay from immediately submitting the form.
  // Use a ref so the guard is synchronous (no async state update lag).
  const readyRef = useRef(false);
  useEffect(() => {
    const timer = setTimeout(() => { readyRef.current = true; }, 100);
    return () => clearTimeout(timer);
  }, []);

  useInput((_, key) => {
    if (key.escape) onCancel();
  });

  const handleSubmit = (value) => {
    if (!readyRef.current) return;
    onSubmit(value);
  };

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
        borderColor: theme.color.accent.primary,
        paddingX: 2,
        paddingY: 1,
      },
      h(
        Box,
        { justifyContent: "space-between", marginBottom: 1 },
        h(Text, { color: theme.color.fg.primary, bold: true }, "Edit source root"),
        h(Text, { color: theme.color.fg.muted }, "esc"),
      ),
      h(Text, { color: theme.color.fg.muted }, "Path to your saddle repository:"),
      h(
        Box,
        { borderStyle: "single", borderColor: theme.color.border.subtle, paddingX: 1, marginTop: 1 },
        h(TextInput, { defaultValue: currentValue, placeholder: "~/path/to/saddle", onSubmit: handleSubmit }),
      ),
      h(Box, { marginTop: 1 },
        h(Text, { color: theme.color.fg.dim }, "enter to confirm  •  restart to reload profiles"),
      ),
    ),
  );
}
