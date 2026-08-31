import path from "path";
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useApp, useInput } from "ink";
import { ProgressBar, Spinner, StatusMessage } from "@inkjs/ui";
import { theme } from "./theme/index.mjs";
import { palette } from "./theme/catalog.mjs";
import { Frame, ShortPath, TerminalTag } from "./ui/primitives.mjs";
import { h } from "./ui/react-helpers.mjs";
import { buildCanonicalCollections, buildHarnessBlocks } from "./reorg-view-model.mjs";

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

function countPlanActions(actions) {
  const counts = { import: 0, link: 0, remove: 0 };
  for (const action of actions) {
    if (action.type === "import") counts.import += 1;
    if (action.type === "link") counts.link += 1;
    if (action.type === "remove-duplicate") counts.remove += 1;
  }
  return counts;
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

function CanonicalSource({ plan, collections, counts }) {
  return h(
    Frame,
    { title: "Canonical source", color: "cyan", flexGrow: 1 },
    h(ShortPath, { pathText: compactPath(plan.sourceRoot), color: "cyan" }),
    h(Text, { color: theme.color.fg.muted }, "Installed agents will read from these collections."),
    h(Box, { height: 1 }),
    ...collections.map((collection) =>
      h(
        Box,
        { key: `${collection.kind}:${collection.path}`, columnGap: 1 },
        h(Text, { color: collection.changed ? theme.color.accent.primary : theme.color.fg.dim, bold: true }, collection.kind.toUpperCase().padEnd(7)),
        h(ShortPath, { pathText: compactPath(collection.path), color: collection.changed ? "white" : "gray" }),
      ),
    ),
    h(Box, { height: 1 }),
    h(Text, { color: theme.color.fg.primary, bold: true }, "Status"),
    h(Box, { columnGap: 1 }, h(TerminalTag, { tone: "cyan" }, "ACTIVE"), h(Text, { color: theme.color.fg.muted }, "work remains")),
    h(Box, { columnGap: 1 }, h(TerminalTag, { tone: "gray" }, "READY"), h(Text, { color: theme.color.fg.dim }, "already in place")),
    h(Box, { height: 1 }),
    h(Text, { color: theme.color.fg.primary, bold: true }, "Apply order"),
    h(Text, { color: theme.color.fg.muted }, `1. Copy and verify ${counts.import}`),
    h(Text, { color: theme.color.fg.muted }, `2. Link ${counts.link} destinations`),
    h(Text, { color: theme.color.fg.muted }, `3. Remove ${counts.remove} verified duplicates`),
    h(Box, { flexGrow: 1 }),
    h(Text, { color: theme.color.state.success }, "A failed step restores earlier changes."),
  );
}

function operationTone(operation) {
  if (operation === "CLEAN") return "orange";
  if (operation === "MOVE" || operation === "MOVE+LINK") return "magenta";
  return "cyan";
}

function HarnessBlock({ harness, selected, width, height, compact = false, position, total }) {
  const active = harness.hasChanges;
  const borderColor = active
    ? selected
      ? theme.color.accent.bright
      : theme.color.accent.soft
    : selected
      ? theme.color.border.strong
      : theme.color.border.subtle;

  return h(
    Box,
    {
      width,
      height: compact ? undefined : height,
      borderStyle: "single",
      borderColor,
      paddingX: 1,
      flexDirection: "column",
    },
    h(
      Box,
      { justifyContent: "space-between", columnGap: 1 },
      h(
        Text,
        { color: active ? theme.color.fg.primary : theme.color.fg.dim, bold: active || selected },
        `${selected ? "> " : "  "}${harness.label}`,
      ),
      h(
        Text,
        { color: active ? theme.color.accent.primary : theme.color.fg.dim, bold: active },
        active ? `${harness.changeCount} CHANGES` : "READY",
      ),
    ),
    ...harness.rows.map((row) => {
      const rowActive = row.status === "change";
      return h(
        Box,
        { key: `${harness.tool}:${row.kind}:${row.endpoint}`, columnGap: 1 },
        h(
          Text,
          { color: rowActive ? theme.color.fg.secondary : theme.color.fg.dim },
          (row.displayKind || row.kind).toUpperCase().padEnd(7),
        ),
        h(
          Box,
          { minWidth: 0, flexGrow: 1 },
          h(
            Text,
            { color: rowActive ? theme.color.fg.primary : theme.color.fg.dim, wrap: "truncate-middle" },
            row.endpoint ? compactPath(row.endpoint) : "No destination",
          ),
        ),
        h(
          Text,
          {
            color: rowActive ? palette[operationTone(row.operation)] : theme.color.fg.dim,
            bold: rowActive,
            flexShrink: 0,
          },
          row.count > 0 ? `${row.count} ${row.operation}` : row.operation,
        ),
      );
    }),
    compact
      ? h(Text, { color: theme.color.fg.dim }, `Installed agent ${position} of ${total}`)
      : null,
  );
}

function harnessItems(harness) {
  const items = new Map();
  for (const row of harness.rows) {
    for (const action of row.actions) {
      const key = `${action.kind}:${action.name}`;
      if (!items.has(key)) items.set(key, { kind: action.kind, name: action.name, operations: new Set() });
      items.get(key).operations.add(row.operation);
    }
  }
  return Array.from(items.values()).sort((left, right) => left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name));
}

function HarnessMap({ harnesses, selectedIndex, width, height, compact = false }) {
  if (harnesses.length === 0) {
    return h(
      Frame,
      { title: "Installed agents", color: "green", flexGrow: 1 },
      h(StatusMessage, { variant: "success" }, "No installed agents need destination paths."),
    );
  }

  const selected = harnesses[selectedIndex];
  if (compact) {
    return h(
      HarnessBlock,
      {
        harness: selected,
        selected: true,
        width,
        compact: true,
        position: selectedIndex + 1,
        total: harnesses.length,
      },
    );
  }

  const columns = width >= 72 ? 2 : 1;
  const blockWidth = columns === 2 ? Math.floor((width - 1) / 2) : width;
  const blockHeight = Math.max(5, ...harnesses.map((harness) => harness.rows.length + 3));
  const rows = [];
  for (let index = 0; index < harnesses.length; index += columns) rows.push(harnesses.slice(index, index + columns));
  const selectedItems = harnessItems(selected);
  const detailLimit = Math.max(1, height - rows.length * blockHeight - 8);
  const visibleItems = selectedItems.slice(0, detailLimit);

  return h(
    Frame,
    { title: "Installed agent destinations", color: "orange", flexGrow: 1 },
    h(Text, { color: theme.color.fg.muted }, "Arrow keys move between agents. Bright rows change; dim rows stay as they are."),
    ...rows.map((row, rowIndex) =>
      h(
        Box,
        { key: `harness-row-${rowIndex}`, columnGap: 1 },
        ...row.map((harness) => {
          const index = harnesses.indexOf(harness);
          return h(HarnessBlock, {
            key: harness.tool,
            harness,
            selected: index === selectedIndex,
            width: blockWidth,
            height: blockHeight,
          });
        }),
      ),
    ),
    h(
      Box,
      { marginTop: 1, columnGap: 1 },
      h(Text, { color: selected.hasChanges ? theme.color.fg.primary : theme.color.fg.dim, bold: true }, selected.label),
      h(
        Text,
        { color: selected.hasChanges ? theme.color.accent.primary : theme.color.fg.dim },
        selected.hasChanges ? `${selected.changeCount} files need work` : "all destination paths are ready",
      ),
    ),
    selected.hasChanges
      ? visibleItems.map((item) =>
          h(
            Box,
            { key: `${selected.tool}:${item.kind}:${item.name}`, marginLeft: 2, justifyContent: "space-between", columnGap: 2 },
            h(Text, { color: theme.color.fg.primary, wrap: "truncate-end" }, item.name),
            h(Text, { color: theme.color.fg.dim, flexShrink: 0 }, `${item.kind} ${Array.from(item.operations).join("+")}`),
          ),
        )
      : h(Text, { color: theme.color.fg.dim, marginLeft: 2 }, "Saddle will not touch this agent."),
    selectedItems.length > visibleItems.length
      ? h(Text, { color: theme.color.fg.dim, marginLeft: 2 }, `${selectedItems.length - visibleItems.length} more files`)
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
  const [selectedHarnessIndex, setSelectedHarnessIndex] = useState(0);
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
  const leftWidth = Math.max(12, Math.floor(availableWidth * 0.3));
  const rightWidth = Math.max(12, availableWidth - leftWidth);
  const mapWidth = Math.max(8, rightWidth - 4);
  const mapColumns = !compact && mapWidth >= 72 ? 2 : 1;
  const counts = useMemo(() => countPlanActions(plan.actions), [plan.actions]);
  const harnesses = useMemo(
    () => buildHarnessBlocks({ coverage: plan.coverage, actions: plan.actions, unchanged: plan.unchanged }),
    [plan.coverage, plan.actions, plan.unchanged],
  );
  const collections = useMemo(
    () => buildCanonicalCollections({ sourceRoot: plan.sourceRoot, actions: plan.actions, unchanged: plan.unchanged }),
    [plan.sourceRoot, plan.actions, plan.unchanged],
  );

  useEffect(() => {
    if (harnesses.length === 0) return;
    if (selectedHarnessIndex >= harnesses.length) setSelectedHarnessIndex(harnesses.length - 1);
  }, [harnesses, selectedHarnessIndex]);

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
      if (key.leftArrow && harnesses.length > 0) {
        setSelectedHarnessIndex((current) => Math.max(0, current - 1));
        return;
      }
      if (key.rightArrow && harnesses.length > 0) {
        setSelectedHarnessIndex((current) => Math.min(harnesses.length - 1, current + 1));
        return;
      }
      if (key.upArrow && harnesses.length > 0) {
        setSelectedHarnessIndex((current) => Math.max(0, current - mapColumns));
        return;
      }
      if (key.downArrow && harnesses.length > 0) {
        setSelectedHarnessIndex((current) => Math.min(harnesses.length - 1, current + mapColumns));
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
                  h(HarnessMap, {
                    harnesses,
                    selectedIndex: selectedHarnessIndex,
                    width: availableWidth,
                    height: reviewHeight,
                    compact: true,
                  }),
                )
              : h(
                  Box,
                  { height: reviewHeight, columnGap: gap },
                  h(Box, { width: leftWidth }, h(CanonicalSource, { plan, collections, counts })),
                  h(
                    Box,
                    { width: rightWidth },
                    h(HarnessMap, {
                      harnesses,
                      selectedIndex: selectedHarnessIndex,
                      width: mapWidth,
                      height: reviewHeight,
                    }),
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
              harnesses.length > 1 ? h(Text, { color: theme.color.fg.muted }, "Arrows  Inspect agent") : null,
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
