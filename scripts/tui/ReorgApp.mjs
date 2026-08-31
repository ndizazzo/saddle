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

function compactPath(value) {
  const home = process.env.HOME;
  if (!home) return value;
  if (value === home) return "~";
  return value.startsWith(`${home}${path.sep}`) ? `~${value.slice(home.length)}` : value;
}

function pluralizeKind(kind, count) {
  return count === 1 ? kind : `${kind}s`;
}

function countPlanActions(actions) {
  const counts = { import: 0, link: 0, remove: 0 };
  for (const action of actions) {
    if (action.type === "import") counts.import += 1;
    if (action.type === "link") counts.link += 1;
    if (action.type === "remove-duplicate") counts.remove += 1;
  }
  return counts;
}

export function buildChangeGroups(actions) {
  const groups = new Map();

  for (const action of actions) {
    const sourceRoot = path.dirname(action.source);
    const targetRoot = path.dirname(action.target);
    const key = [action.type, action.kind, sourceRoot, targetRoot].join("::");
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        type: action.type,
        kind: action.kind,
        sourceRoot,
        targetRoot,
        targetClass: action.targetClass,
        tools: new Set(),
        actions: [],
      });
    }
    const group = groups.get(key);
    group.actions.push(action);
    for (const tool of action.tools) group.tools.add(tool);
  }

  const priority = { import: 0, link: 1, "remove-duplicate": 2 };
  return Array.from(groups.values())
    .map((group) => ({ ...group, tools: Array.from(group.tools).sort() }))
    .sort(
      (left, right) =>
        priority[left.type] - priority[right.type] ||
        left.targetRoot.localeCompare(right.targetRoot) ||
        left.sourceRoot.localeCompare(right.sourceRoot),
    );
}

function OutcomeSummary({ plan, counts, compact }) {
  const sourceRoot = compactPath(plan.sourceRoot);
  if (compact) {
    return h(
      Frame,
      {
        title: plan.actions.length > 0 ? "What will change" : "No changes needed",
        color: plan.actions.length > 0 ? "orange" : "green",
        flexGrow: 1,
      },
      h(
        Box,
        { columnGap: 1, flexWrap: "wrap" },
        h(TerminalTag, { tone: "orange" }, `${plan.actions.length} changes`),
        h(TerminalTag, { tone: "gray" }, `${plan.unchanged.length} untouched`),
      ),
      h(
        Text,
        { color: theme.color.fg.primary },
        plan.actions.length > 0
          ? `${counts.import} copy -> ${counts.link} link -> ${counts.remove} remove after verification.`
          : `Every selected agent already points to ${sourceRoot}.`,
      ),
      plan.actions.length > 0
        ? h(Text, { color: theme.color.fg.muted }, `Canonical source: ${sourceRoot}. Failures restore earlier changes.`)
        : null,
    );
  }

  return h(
    Frame,
    {
      title: plan.actions.length > 0 ? "What will change" : "No changes needed",
      color: plan.actions.length > 0 ? "orange" : "green",
      flexGrow: 1,
    },
    h(
      Box,
      { columnGap: 1, flexWrap: "wrap" },
      h(TerminalTag, { tone: "orange" }, `${plan.actions.length} filesystem changes`),
      counts.import > 0 ? h(TerminalTag, { tone: "magenta" }, `${counts.import} copied in`) : null,
      counts.link > 0 ? h(TerminalTag, { tone: "cyan" }, `${counts.link} linked back`) : null,
      counts.remove > 0 ? h(TerminalTag, { tone: "orange" }, `${counts.remove} duplicates removed`) : null,
      h(TerminalTag, { tone: "gray" }, `${plan.unchanged.length} untouched`),
    ),
    h(
      Text,
      { color: theme.color.fg.primary },
      plan.actions.length > 0
        ? `Saddle will collect unique files in ${sourceRoot}, then point each selected agent back to them.`
        : `Every selected agent already points to ${sourceRoot}.`,
    ),
    counts.remove > 0
      ? h(
          Text,
          { color: theme.color.state.warning },
          "Removals happen last, after Saddle verifies the canonical copy and replacement links.",
        )
      : null,
  );
}

function ExecutionOrder({ plan, counts }) {
  const steps = [
    counts.import > 0
      ? {
          title: `Copy ${counts.import} ${counts.import === 1 ? "item" : "items"} into ${compactPath(plan.sourceRoot)}`,
          detail: "Existing files stay in place while Saddle verifies each copy.",
          tone: "magenta",
        }
      : null,
    counts.link > 0
      ? {
          title: `Create ${counts.link} ${counts.link === 1 ? "symlink" : "symlinks"} from agent folders`,
          detail: "Matching local entries become links to the canonical files.",
          tone: "cyan",
        }
      : null,
    counts.remove > 0
      ? {
          title: `Remove ${counts.remove} verified ${counts.remove === 1 ? "duplicate" : "duplicates"}`,
          detail: "The canonical copy remains. Saddle removes only redundant entries.",
          tone: "orange",
        }
      : null,
  ].filter(Boolean);

  return h(
    Frame,
    { title: "How Saddle applies it", color: "cyan", flexGrow: 1 },
    ...steps.flatMap((step, index) => [
      h(
        Box,
        { key: `${step.title}-title`, columnGap: 1 },
        h(Text, { color: palette[step.tone], bold: true }, `${index + 1}.`),
        h(Text, { color: theme.color.fg.primary, bold: true }, step.title),
      ),
      h(
        Box,
        { key: `${step.title}-detail`, marginLeft: 3, marginBottom: 1 },
        h(Text, { color: theme.color.fg.muted }, step.detail),
      ),
    ]),
    h(Box, { flexGrow: 1 }),
    h(Text, { color: theme.color.state.success }, "If a step fails, Saddle restores the earlier changes."),
  );
}

function GroupPath({ group }) {
  if (group.type === "remove-duplicate") {
    return h(
      Box,
      { marginLeft: 2, columnGap: 1 },
      h(ShortPath, { pathText: compactPath(group.targetRoot), color: "gray" }),
      h(Text, { color: theme.color.fg.dim }, "removed; canonical copy stays in"),
      h(ShortPath, { pathText: compactPath(group.sourceRoot), color: "cyan" }),
    );
  }

  return h(
    Box,
    { marginLeft: 2, columnGap: 1 },
    h(ShortPath, { pathText: compactPath(group.sourceRoot), color: "gray" }),
    h(Text, { color: theme.color.fg.dim }, "->"),
    h(ShortPath, { pathText: compactPath(group.targetRoot), color: "cyan" }),
  );
}

function LocationReview({ groups, selectedIndex, height, compact = false }) {
  if (groups.length === 0) {
    return h(
      Frame,
      { title: "Affected locations", color: "green", flexGrow: 1 },
      h(StatusMessage, { variant: "success" }, "No files or links need to change."),
    );
  }

  const selected = groups[selectedIndex];
  if (compact) {
    const firstAction = selected.actions[0];
    return h(
      Frame,
      { title: "Affected locations", color: "orange", flexGrow: 1 },
      h(Text, { color: theme.color.fg.dim }, `Path group ${selectedIndex + 1} of ${groups.length}`),
      h(
        Box,
        { columnGap: 1 },
        h(Text, { color: theme.color.accent.bright, bold: true }, ">"),
        h(Text, { color: palette[toneByType[selected.type]], bold: true }, labelByType[selected.type]),
        h(
          Text,
          { color: theme.color.fg.primary, bold: true },
          `${selected.actions.length} ${pluralizeKind(selected.kind, selected.actions.length)}`,
        ),
        h(Text, { color: theme.color.fg.dim }, selected.tools.join(", ")),
      ),
      h(GroupPath, { group: selected }),
      h(
        Box,
        { marginLeft: 2, columnGap: 1 },
        h(Text, { color: theme.color.fg.muted }, "First file"),
        h(Text, { color: theme.color.fg.primary, wrap: "truncate-end" }, path.basename(firstAction.target)),
      ),
      selected.actions.length > 1
        ? h(Text, { color: theme.color.fg.dim, marginLeft: 2 }, `${selected.actions.length - 1} more in this group`)
        : null,
    );
  }

  const maxVisibleGroups = Math.max(2, Math.floor((height - 11) / 2));
  const start = Math.min(
    Math.max(0, selectedIndex - maxVisibleGroups + 1),
    Math.max(0, groups.length - maxVisibleGroups),
  );
  const visibleGroups = groups.slice(start, start + maxVisibleGroups);
  const detailLimit = Math.max(1, height - 11 - visibleGroups.length * 2);
  const visibleActions = selected.actions.slice(0, detailLimit);

  return h(
    Frame,
    { title: "Affected locations", color: "orange", flexGrow: 1 },
    h(Text, { color: theme.color.fg.muted }, "Use Up/Down to inspect a path group."),
    start > 0 ? h(Text, { color: theme.color.fg.dim }, `${start} groups above`) : null,
    ...visibleGroups.flatMap((group, visibleIndex) => {
      const index = start + visibleIndex;
      const active = index === selectedIndex;
      return [
        h(
          Box,
          { key: `${group.id}-label`, columnGap: 1 },
          h(Text, { color: active ? theme.color.accent.bright : theme.color.fg.dim, bold: active }, active ? ">" : " "),
          h(
            Text,
            { color: palette[toneByType[group.type]], bold: true },
            labelByType[group.type],
          ),
          h(
            Text,
            { color: active ? theme.color.fg.primary : theme.color.fg.secondary, bold: active },
            `${group.actions.length} ${pluralizeKind(group.kind, group.actions.length)}`,
          ),
          h(Text, { color: theme.color.fg.dim }, group.tools.join(", ")),
        ),
        h(GroupPath, { key: `${group.id}-path`, group }),
      ];
    }),
    start + visibleGroups.length < groups.length
      ? h(Text, { color: theme.color.fg.dim }, `${groups.length - start - visibleGroups.length} groups below`)
      : null,
    h(Box, { marginTop: 1, columnGap: 1 },
      h(Text, { color: theme.color.fg.primary, bold: true }, "Exact files"),
      h(Text, { color: theme.color.fg.dim }, `${selected.actions.length} in selected group`),
    ),
    ...visibleActions.map((action) =>
      h(
        Box,
        { key: action.id, marginLeft: 2, justifyContent: "space-between", columnGap: 2 },
        h(Text, { color: theme.color.fg.primary, wrap: "truncate-end" }, path.basename(action.target)),
        h(Text, { color: theme.color.fg.dim, flexShrink: 0 }, action.kind),
      ),
    ),
    selected.actions.length > visibleActions.length
      ? h(Text, { color: theme.color.fg.dim, marginLeft: 2 }, `${selected.actions.length - visibleActions.length} more files`)
      : null,
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
  const [selectedGroupIndex, setSelectedGroupIndex] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [current, setCurrent] = useState(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const startedRef = useRef(false);
  const terminalHeight = process.stdout.rows || 24;
  const width = process.stdout.columns || 100;
  const compact = width < 100 || terminalHeight < 30;
  const reviewHeight = compact ? Math.max(9, terminalHeight - 14) : Math.max(9, terminalHeight - 15);
  const gap = 1;
  const availableWidth = Math.max(27, width - gap - 2);
  const leftWidth = Math.max(12, Math.floor(availableWidth * 0.38));
  const rightWidth = Math.max(12, availableWidth - leftWidth);
  const counts = useMemo(() => countPlanActions(plan.actions), [plan.actions]);
  const groups = useMemo(() => buildChangeGroups(plan.actions), [plan.actions]);

  useEffect(() => {
    if (groups.length === 0) return;
    if (selectedGroupIndex >= groups.length) setSelectedGroupIndex(groups.length - 1);
  }, [groups, selectedGroupIndex]);

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
      if (key.upArrow && groups.length > 0) {
        setSelectedGroupIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.downArrow && groups.length > 0) {
        setSelectedGroupIndex((current) => Math.min(groups.length - 1, current + 1));
        return;
      }
      if (key.return) {
        if (plan.actions.length === 0) {
          onFinish({ applied: false, unchanged: true });
          exit();
        } else {
          setStage("apply");
        }
      }
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
      ? stage === "conflicts"
        ? h(Box, { height: Math.max(18, terminalHeight - 4) }, h(ConflictReview, { plan, height: terminalHeight - 4 }))
        : h(
            Box,
            { flexDirection: "column" },
            h(Box, { marginBottom: 1 }, h(OutcomeSummary, { plan, counts, compact })),
            compact
              ? h(
                  Box,
                  { height: reviewHeight },
                  h(LocationReview, { groups, selectedIndex: selectedGroupIndex, height: reviewHeight, compact: true }),
                )
              : h(
                  Box,
                  { height: reviewHeight, columnGap: gap },
                  h(Box, { width: leftWidth }, h(ExecutionOrder, { plan, counts })),
                  h(
                    Box,
                    { width: rightWidth },
                    h(LocationReview, { groups, selectedIndex: selectedGroupIndex, height: reviewHeight }),
                  ),
                ),
            h(
              Box,
              {
                borderStyle: "single",
                borderColor: plan.actions.length > 0 ? theme.color.accent.primary : theme.color.state.success,
                justifyContent: "space-between",
                paddingX: 1,
              },
              h(
                Text,
                { color: plan.actions.length > 0 ? theme.color.accent.bright : theme.color.state.success, bold: true },
                plan.actions.length > 0 ? `Enter  Apply ${plan.actions.length} changes` : "Enter  Exit",
              ),
              groups.length > 1 ? h(Text, { color: theme.color.fg.muted }, "Up/Down  Inspect") : null,
              h(Text, { color: theme.color.fg.muted }, "Esc  Cancel without changes"),
            ),
          )
      : h(
          Box,
          { height: Math.max(18, terminalHeight - 4) },
          h(ApplyProgress, { plan, completed, current, error, done }),
        ),
  );
}
