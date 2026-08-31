import path from "path";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { ProgressBar, Spinner, StatusMessage } from "@inkjs/ui";
import { theme } from "./theme/index.mjs";
import { palette } from "./theme/catalog.mjs";
import { Frame, ShortPath, TerminalTag } from "./ui/primitives.mjs";
import { h } from "./ui/react-helpers.mjs";

const toneByType = {
  import: "magenta",
  link: "cyan",
  "remove-duplicate": "orange",
};

const labelByType = {
  import: "IMPORT",
  link: "LINK",
  "remove-duplicate": "REMOVE",
};

function StrategySummary({ plan, height }) {
  const universal = plan.coverage.filter((item) => item.supported && item.targetClass === "universal");
  const provider = plan.coverage.filter((item) => item.supported && item.targetClass === "provider");
  const unsupported = plan.coverage.filter((item) => !item.supported);
  const roots = new Map();

  for (const item of plan.coverage.filter((candidate) => candidate.supported)) {
    for (const endpoint of item.endpoints) {
      const key = `${item.targetClass}:${endpoint}`;
      if (!roots.has(key)) roots.set(key, { path: endpoint, targetClass: item.targetClass });
    }
  }

  const selectedRoots = Array.from(roots.values()).sort((left, right) => {
    const leftRank = left.targetClass === "universal" ? 0 : 1;
    const rightRank = right.targetClass === "universal" ? 0 : 1;
    return leftRank - rightRank || left.path.localeCompare(right.path);
  });
  const visibleLimit = Math.max(3, height - 11);
  const visibleRoots = selectedRoots.slice(0, visibleLimit);
  const hidden = selectedRoots.length - visibleRoots.length;

  return h(
    Frame,
    { title: "Routing", color: plan.strategy === "universal-first" ? "cyan" : "blue", flexGrow: 1 },
    h(
      Box,
      { marginBottom: 1, columnGap: 1, flexWrap: "wrap" },
      h(TerminalTag, { tone: plan.strategy === "universal-first" ? "cyan" : "blue" }, plan.strategy),
      universal.length > 0 ? h(TerminalTag, { tone: "cyan" }, `${universal.length} shared`) : null,
      provider.length > 0 ? h(TerminalTag, { tone: "blue" }, `${provider.length} native`) : null,
      unsupported.length > 0 ? h(TerminalTag, { tone: "orange" }, `${unsupported.length} unsupported`) : null,
    ),
    h(Text, { color: theme.color.fg.secondary }, "Each harness asset uses one endpoint class."),
    h(Box, { height: 1 }),
    h(Text, { color: theme.color.fg.primary, bold: true }, "Selected roots"),
    ...visibleRoots.map((root) =>
      h(
        Box,
        { key: `${root.targetClass}-${root.path}`, columnGap: 1 },
        h(
          Text,
          { color: root.targetClass === "universal" ? palette.cyan : palette.blue, bold: true },
          root.targetClass === "universal" ? "SHR" : "NAT",
        ),
        h(ShortPath, { pathText: root.path, color: "gray" }),
      ),
    ),
    hidden > 0 ? h(Text, { color: theme.color.fg.dim }, `${hidden} more selected roots`) : null,
  );
}

function PlanReview({ plan, height }) {
  const visibleLimit = Math.max(4, height - 12);
  const visibleActions = plan.actions.slice(0, visibleLimit);
  const hidden = Math.max(0, plan.actions.length - visibleActions.length);
  const counts = useMemo(() => {
    const result = { import: 0, universal: 0, provider: 0, remove: 0 };
    for (const action of plan.actions) {
      if (action.type === "import") result.import += 1;
      if (action.type === "link" && action.targetClass === "universal") result.universal += 1;
      if (action.type === "link" && action.targetClass === "provider") result.provider += 1;
      if (action.type === "remove-duplicate") result.remove += 1;
    }
    return result;
  }, [plan.actions]);

  return h(
    Frame,
    { title: "Review changes", color: "orange", flexGrow: 1 },
    h(
      Box,
      { columnGap: 1, flexWrap: "wrap", marginBottom: 1 },
      counts.import > 0 ? h(TerminalTag, { tone: "magenta" }, `${counts.import} import`) : null,
      counts.universal > 0 ? h(TerminalTag, { tone: "cyan" }, `${counts.universal} universal`) : null,
      counts.provider > 0 ? h(TerminalTag, { tone: "blue" }, `${counts.provider} provider`) : null,
      counts.remove > 0 ? h(TerminalTag, { tone: "orange" }, `${counts.remove} remove`) : null,
      h(TerminalTag, { tone: "gray" }, `${plan.unchanged.length} unchanged`),
    ),
    ...visibleActions.map((action) =>
      h(
        Box,
        { key: action.id, height: 1, justifyContent: "space-between", columnGap: 2 },
        h(
          Box,
          { minWidth: 0, columnGap: 1 },
          h(Text, { color: theme.color.fg.primary }, path.basename(action.target)),
          h(Text, { color: theme.color.fg.dim }, action.tools.join(", ")),
        ),
        h(
          Box,
          { flexShrink: 0, columnGap: 1 },
          action.type === "link" ? h(Text, { color: theme.color.fg.muted }, action.targetClass.toUpperCase()) : null,
          h(
            Text,
            { color: palette[toneByType[action.type]] || theme.color.accent.primary, bold: true },
            labelByType[action.type] || action.type.toUpperCase(),
          ),
        ),
      ),
    ),
    hidden > 0 ? h(Text, { color: theme.color.fg.dim }, `${hidden} more actions`) : null,
    h(Box, { flexGrow: 1 }),
    h(
      Box,
      {
        borderStyle: "single",
        borderColor: theme.color.accent.primary,
        justifyContent: "center",
        paddingX: 1,
      },
      h(
        Text,
        { color: theme.color.accent.bright, bold: true },
        "Enter applies this plan. Esc cancels without writing.",
      ),
    ),
  );
}

function ConflictReview({ plan, height }) {
  const visibleLimit = Math.max(3, height - 10);
  const visibleConflicts = plan.conflicts.slice(0, visibleLimit);
  const hidden = plan.conflicts.length - visibleConflicts.length;

  return h(
    Frame,
    { title: "Conflicts require attention", color: "red", flexGrow: 1 },
    h(
      Text,
      { color: theme.color.fg.secondary },
      "Saddle found different content with the same canonical name. Nothing can be applied until each conflict is resolved.",
    ),
    h(Box, { height: 1 }),
    ...visibleConflicts.map((conflict) =>
      h(
        Box,
        { key: conflict.id, flexDirection: "column", marginBottom: 1 },
        h(Text, { color: theme.color.state.error, bold: true }, `${conflict.kind}/${conflict.name}`),
        ...conflict.sources.map((source) =>
          h(ShortPath, { key: `${conflict.id}-${source.path}`, pathText: source.path, color: "gray" }),
        ),
      ),
    ),
    hidden > 0 ? h(Text, { color: theme.color.fg.dim }, `${hidden} more conflicts`) : null,
    h(Box, { flexGrow: 1 }),
    h(
      Box,
      { borderStyle: "single", borderColor: theme.color.state.error, justifyContent: "center", paddingX: 1 },
      h(
        Text,
        { color: theme.color.fg.secondary },
        "Resolve the files above, then run reorg again. Enter, Esc, or q exits.",
      ),
    ),
  );
}

function ApplyProgress({ plan, completed, current, error, done }) {
  const percent = plan.actions.length > 0 ? Math.round((completed / plan.actions.length) * 100) : 100;
  return h(
    Frame,
    {
      title: error ? "Reorganization failed" : done ? "Reorganization complete" : "Applying plan",
      color: error ? "red" : "cyan",
      flexGrow: 1,
    },
    error
      ? h(
          Box,
          { flexDirection: "column" },
          h(Text, { color: theme.color.state.error, bold: true }, error),
          h(
            Text,
            { color: theme.color.fg.muted },
            "Apply stopped. Review the error and transaction manifest, if one was created, before retrying.",
          ),
        )
      : done
        ? h(StatusMessage, { variant: "success" }, `${completed} actions applied and verified.`)
        : h(Spinner, { label: current ? `Applying ${path.basename(current.target)}` : "Preparing transaction" }),
    h(Box, { marginTop: 1 }, h(ProgressBar, { value: percent })),
    h(Text, { color: theme.color.fg.muted }, `${completed}/${plan.actions.length} actions`),
    current
      ? h(
          Box,
          { marginTop: 1, flexDirection: "column" },
          h(Text, { color: theme.color.fg.primary }, labelByType[current.type] || current.type.toUpperCase()),
          h(ShortPath, { pathText: current.target, color: "gray" }),
        )
      : null,
    h(Box, { flexGrow: 1 }),
    done || error ? h(Text, { color: theme.color.fg.muted }, "Press enter or q to exit.") : null,
  );
}

export function ReorgApp({ plan, applyReorgPlan, onFinish }) {
  const { exit } = useApp();
  const [stage, setStage] = useState(plan.conflicts.length > 0 ? "conflicts" : "review");
  const [completed, setCompleted] = useState(0);
  const [current, setCurrent] = useState(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const startedRef = useRef(false);
  const height = Math.max(18, (process.stdout.rows || 24) - 4);
  const width = process.stdout.columns || 100;
  const gap = 1;
  const availableWidth = Math.max(27, width - gap - 2);
  const leftWidth = Math.max(12, Math.floor(availableWidth * 0.36));
  const rightWidth = Math.max(12, availableWidth - leftWidth);

  useInput((input, key) => {
    const requestedExit = key.escape || input === "q" || (key.ctrl && input === "c");

    if (stage === "conflicts") {
      if (key.return || requestedExit) {
        onFinish({ applied: false, conflicts: true });
        exit();
      }
      return;
    }
    if (stage === "review") {
      if (key.return) setStage("apply");
      if (requestedExit) {
        onFinish({ applied: false });
        exit();
      }
      return;
    }
    if ((done || error) && (key.return || requestedExit)) {
      onFinish(error ? { applied: false, error } : { applied: true, ...result });
      exit();
    }
  });

  useEffect(() => {
    if (stage !== "apply" || startedRef.current) return;
    startedRef.current = true;
    let active = true;

    applyReorgPlan(plan, {
      onEvent: (event) => {
        if (!active) return;
        if (event.action) setCurrent(event.action);
        if (event.type === "action-complete") setCompleted(event.index);
      },
    })
      .then((appliedResult) => {
        if (!active) return;
        setResult(appliedResult);
        setDone(true);
      })
      .catch((applyError) => {
        if (!active) return;
        setError(applyError instanceof Error ? applyError.message : String(applyError));
      });

    return () => {
      active = false;
    };
  }, [stage, plan, applyReorgPlan]);

  return h(
    Box,
    { flexDirection: "column", paddingX: 1 },
    h(
      Box,
      {
        borderStyle: "single",
        borderColor: theme.color.border.subtle,
        backgroundColor: theme.color.bg.elevated,
        paddingX: 1,
        marginBottom: 1,
        justifyContent: "space-between",
      },
      h(Box, { columnGap: 1 }, h(Text, { bold: true }, "Saddle"), h(Text, { color: theme.color.fg.muted }, "/ reorg")),
      h(ShortPath, { pathText: plan.sourceRoot, color: "cyan" }),
    ),
    stage === "review" || stage === "conflicts"
      ? h(
          Box,
          { height, columnGap: gap },
          h(Box, { width: leftWidth }, h(StrategySummary, { plan, height })),
          h(
            Box,
            { width: rightWidth },
            stage === "conflicts" ? h(ConflictReview, { plan, height }) : h(PlanReview, { plan, height }),
          ),
        )
      : h(Box, { height }, h(ApplyProgress, { plan, completed, current, error, done })),
  );
}
