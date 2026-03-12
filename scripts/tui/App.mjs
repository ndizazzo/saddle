import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import path from "path";
import { Box, useApp, useInput } from "ink";
import { theme } from "./theme/index.mjs";
import { groupByTool } from "./ui/format.mjs";
import { ChromeBar, FooterBar } from "./ui/chrome.mjs";
import { SelectionScreen, ConfirmScreen, PathEditOverlay, RunScreen, LoadingScreen, DiffOverlay } from "./components/index.mjs";
import { h } from "./ui/react-helpers.mjs";

export function InstallerApp({ profiles, options, initialSelectedIds, runInstallation, inspectProfile, buildInspectionCache, sourceRoot, configPath, writeSourceRoot, onFinish }) {
  const { exit } = useApp();
  const [stage, setStage] = useState("loading");
  const [inspectionCache, setInspectionCache] = useState(null);
  const [scanProgress, setScanProgress] = useState({ done: 0, total: 0, current: "" });
  const [selectedActionKeys, setSelectedActionKeys] = useState(() => {
    const keys = new Set();
    const selectedProfileIds = initialSelectedIds ? new Set(initialSelectedIds) : null;

    for (const profile of profiles) {
      if (profile.informational || profile.installed === false || profile.enabled === false) continue;
      const shouldSelect = selectedProfileIds
        ? selectedProfileIds.has(profile.id)
        : (profile.recommended && !profile.informational);
      if (!shouldSelect) continue;
      for (const action of profile.actions) {
        keys.add(`${profile.id}::${action.target}`);
      }
    }

    return keys;
  });
  const [depth, setDepth] = useState(0);
  const [toolIndex, setToolIndex] = useState(0);
  const [actionIndex, setActionIndex] = useState(0);
  const [actionScrollOffset, setActionScrollOffset] = useState(0);
  const [logs, setLogs] = useState([]);
  const [prompt, setPrompt] = useState(null);
  const [summary, setSummary] = useState({ totalActions: 0, completedActions: 0, linked: 0, skipped: 0, unchanged: 0, backedUp: 0, createdDirectories: 0 });
  const [currentProfile, setCurrentProfile] = useState(null);
  const [completedProfileIds, setCompletedProfileIds] = useState(new Set());
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [focusedPane, setFocusedPane] = useState("tools");
  const [editingSourceRoot, setEditingSourceRoot] = useState(false);
  const [liveSourceRoot, setLiveSourceRoot] = useState(sourceRoot);
  const [diffModal, setDiffModal] = useState(null);
  const startedRef = useRef(false);
  const sequenceRef = useRef(0);
  const promptResolverRef = useRef(null);
  const selectedActionKeysRef = useRef(selectedActionKeys);

  selectedActionKeysRef.current = selectedActionKeys;

  useEffect(() => {
    if (stage !== "loading") return;
    buildInspectionCache(profiles, setScanProgress).then((cache) => {
      setInspectionCache(cache);
      setStage(initialSelectedIds ? "run" : "select");
    });
  }, [stage, buildInspectionCache, profiles, initialSelectedIds]);

  // Wrap raw inspectProfile with the built cache so all children get consistent data.
  const inspectProfileFn = useCallback(
    (profile) => inspectProfile(profile, inspectionCache),
    [inspectProfile, inspectionCache],
  );

  const toolGroups = useMemo(() => groupByTool(profiles.filter((profile) => !profile.informational)), [profiles]);
  const allActionKeys = useMemo(() => profiles
    .filter((profile) => !profile.informational && profile.installed !== false && profile.enabled !== false)
    .flatMap((profile) => profile.actions.map((action) => `${profile.id}::${action.target}`)), [profiles]);
  const selectedProfiles = useMemo(() => profiles
    .map((profile) => ({
      ...profile,
      actions: profile.actions.filter((action) => selectedActionKeys.has(`${profile.id}::${action.target}`)),
    }))
    .filter((profile) => profile.actions.length > 0), [profiles, selectedActionKeys]);
  const confirmCanApply = useMemo(() => {
    if (!inspectionCache || selectedProfiles.length === 0) return false;
    return selectedProfiles.some((profile) => {
      const result = inspectProfileFn(profile);
      return result.counts.create > 0 || result.counts.replace > 0;
    });
  }, [selectedProfiles, inspectProfileFn, inspectionCache]);
  const flatActions = useMemo(() => {
    if (!inspectionCache) return [];
    const group = toolGroups[toolIndex];
    if (!group) return [];
    const items = [];
    for (const profile of group.profiles) {
      if (profile.installed === false || profile.enabled === false) continue;
      const result = inspectProfileFn(profile);
      for (let index = 0; index < profile.actions.length; index += 1) {
        items.push({
          profileId: profile.id,
          profileLabel: profile.label,
          action: profile.actions[index],
          inspectedAction: result.actions[index],
          key: `${profile.id}::${profile.actions[index].target}`,
        });
      }
    }
    return items;
  }, [toolGroups, toolIndex, inspectProfileFn, inspectionCache]);

  const progressPercent = summary.totalActions > 0 ? Math.round((summary.completedActions / summary.totalActions) * 100) : 0;
  const totalHeight = Math.max(process.stdout.rows || 24, 24);
  const totalWidth = process.stdout.columns || 80;
  const mainHeight = Math.max(18, totalHeight - 6);
  const sourceHeight = Math.max(8, Math.floor(mainHeight / 4));
  const lowerSectionHeight = Math.max(10, mainHeight - sourceHeight - 1);
  const columnGap = 1;
  const availableWidth = totalWidth - 2 - columnGap; // subtract app paddingX (1 each side) and column gap
  const leftWidth = Math.floor(availableWidth * 0.26);
  const rightWidth = availableWidth - leftWidth;
  const layout = {
    mainHeight,
    sourceHeight,
    lowerSectionHeight,
    leftWidth,
    rightWidth,
    previewLineLimit: Math.max(1, mainHeight - 6),
  };

  useEffect(() => {
    if (toolGroups.length === 0) return;
    if (toolIndex >= toolGroups.length) setToolIndex(toolGroups.length - 1);
  }, [toolGroups, toolIndex]);

  useEffect(() => {
    if (depth !== 1 || flatActions.length === 0) return;
    if (actionIndex >= flatActions.length) setActionIndex(flatActions.length - 1);
  }, [actionIndex, depth, flatActions]);

  useEffect(() => {
    if (depth !== 1) return;
    const profileIntroLines = Math.max(1, (toolGroups[toolIndex]?.profiles || []).length);
    const actionAreaHeight = Math.max(1, layout.mainHeight - layout.sourceHeight - profileIntroLines - 9);
    if (actionIndex < actionScrollOffset) {
      setActionScrollOffset(actionIndex);
      return;
    }
    if (actionIndex >= actionScrollOffset + actionAreaHeight) {
      setActionScrollOffset(Math.max(0, actionIndex - actionAreaHeight + 1));
    }
  }, [actionIndex, actionScrollOffset, depth, layout.mainHeight, layout.sourceHeight, toolGroups, toolIndex]);

  useInput((input, key) => {
    if (stage === "select") {
      if (input === "q") {
        onFinish({ completed: false });
        exit();
        return;
      }

      if (depth === 0) {
        if (key.tab) {
          setFocusedPane((current) => current === "tools" ? "source" : "tools");
          return;
        }

        if (focusedPane === "source") {
          if (key.return) { setEditingSourceRoot(true); return; }
          return;
        }

        if (toolGroups.length === 0) {
          if (input === "a") { setSelectedActionKeys(new Set(allActionKeys)); return; }
          if (input === "n") { setSelectedActionKeys(new Set()); }
          return;
        }

        if (key.upArrow) { setToolIndex((current) => Math.max(0, current - 1)); return; }
        if (key.downArrow) { setToolIndex((current) => Math.min(toolGroups.length - 1, current + 1)); return; }

        if (key.rightArrow || key.return) {
          const group = toolGroups[toolIndex];
          const groupActionKeys = group
            ? group.profiles.filter((p) => p.installed !== false && p.enabled !== false).flatMap((p) => p.actions.map((a) => `${p.id}::${a.target}`))
            : [];
          if (group && group.enabled !== false && groupActionKeys.length > 0) {
            setDepth(1);
            setActionIndex(0);
            setActionScrollOffset(0);
          }
          return;
        }

        if (input === "s" && key.ctrl) {
          if (selectedActionKeys.size > 0) setStage("confirm");
          return;
        }

        if (input === " ") {
          const group = toolGroups[toolIndex];
          if (!group || !group.installed || group.enabled === false) return;
          const groupActionKeys = group.profiles
            .filter((p) => p.installed !== false && p.enabled !== false)
            .flatMap((p) => p.actions.map((a) => `${p.id}::${a.target}`));
          setSelectedActionKeys((current) => {
            const next = new Set(current);
            const shouldSelect = !groupActionKeys.every((k) => current.has(k));
            for (const k of groupActionKeys) {
              if (shouldSelect) next.add(k); else next.delete(k);
            }
            return next;
          });
          return;
        }

        if (input === "a") { setSelectedActionKeys(new Set(allActionKeys)); return; }
        if (input === "n") { setSelectedActionKeys(new Set()); return; }
      }

      if (depth === 1) {
        const group = toolGroups[toolIndex];
        const groupActionKeys = group
          ? group.profiles.filter((p) => p.installed !== false && p.enabled !== false).flatMap((p) => p.actions.map((a) => `${p.id}::${a.target}`))
          : [];
        const hasActions = flatActions.length > 0;

        if (key.upArrow) { if (hasActions) setActionIndex((current) => Math.max(0, current - 1)); return; }
        if (key.downArrow) { if (hasActions) setActionIndex((current) => Math.min(flatActions.length - 1, current + 1)); return; }

        if (key.leftArrow || key.escape || input === "\u001b") {
          setDepth(0);
          setActionIndex(0);
          setActionScrollOffset(0);
          return;
        }

        if (input === "s" && key.ctrl) {
          if (selectedActionKeys.size > 0) setStage("confirm");
          return;
        }

        if (input === " ") {
          const focusedAction = flatActions[actionIndex];
          if (!focusedAction) return;
          setSelectedActionKeys((current) => {
            const next = new Set(current);
            if (next.has(focusedAction.key)) next.delete(focusedAction.key);
            else next.add(focusedAction.key);
            return next;
          });
          return;
        }

        if (input === "a") {
          setSelectedActionKeys((current) => {
            const next = new Set(current);
            for (const k of groupActionKeys) next.add(k);
            return next;
          });
          return;
        }

        if (input === "n") {
          setSelectedActionKeys((current) => {
            const next = new Set(current);
            for (const k of groupActionKeys) next.delete(k);
            return next;
          });
          return;
        }

        if (input === "d") {
          const focusedAction = flatActions[actionIndex];
          if (!focusedAction) return;
          const inspected = focusedAction.inspectedAction;
          const isDiffable = inspected.kind === "replace-diff" || inspected.kind === "replace-link";
          if (!isDiffable) return;
          setDiffModal({
            beforePath: inspected.beforePath,
            afterPath: inspected.afterPath,
            label: path.basename(focusedAction.action.target),
          });
          return;
        }
      }
    }

    if (stage === "confirm") {
      if (key.return) {
        if (confirmCanApply) setStage("run");
        return;
      }
      if (key.escape || input === "\u001b" || key.backspace || input === "q") {
        setStage("select");
        return;
      }
    }

    if (done && (input === "q" || key.return)) {
      onFinish({ completed: !error, error, summary });
      exit();
    }
  }, { isActive: !editingSourceRoot && !diffModal });

  const handleSourceRootSubmit = (newPath) => {
    const expanded = newPath.startsWith("~/")
      ? newPath.replace("~", process.env.HOME || "")
      : newPath;
    const finalPath = expanded || liveSourceRoot;
    writeSourceRoot(finalPath);
    setLiveSourceRoot(finalPath);
    setEditingSourceRoot(false);
  };

   useEffect(() => {
     if (stage !== "run" || startedRef.current) return;
     startedRef.current = true;
 
     const profilesToInstall = selectedProfiles;

    const appendLog = (kind, message) => {
      sequenceRef.current += 1;
      setLogs((current) => [...current, { kind, message, sequence: sequenceRef.current }]);
    };

    const confirmReplacement = (info) => new Promise((resolve) => {
      promptResolverRef.current = resolve;
      setPrompt(info);
    });

    const begin = async () => {
      try {
        const result = await runInstallation({
          selectedProfiles: profilesToInstall,
          dryRun: options.dryRun,
          assumeYes: true,
          confirmReplacement,
          onEvent: (event) => {
            if (event.profile) setCurrentProfile(event.profile);

            if (event.type === "session-start") {
              setSummary((current) => ({ ...current, totalActions: event.totalActions }));
              appendLog("info", `Starting ${event.selectedProfiles.length} profile(s).`);
              return;
            }
            if (event.type === "profile-start") { appendLog("info", `Profile: ${event.profile.label}`); return; }
            if (event.type === "profile-complete") { setCompletedProfileIds((prev) => new Set([...prev, event.profile.id])); return; }
            if (event.type === "mkdir") { appendLog("mkdir", `mkdir ${event.path}`); setSummary((current) => ({ ...current, createdDirectories: current.createdDirectories + 1 })); return; }
            if (event.type === "ok") { appendLog("ok", `ok ${event.target}`); setSummary((current) => ({ ...current, completedActions: current.completedActions + 1, unchanged: current.unchanged + 1 })); return; }
            if (event.type === "prompt") { const mode = event.dryRun ? "would prompt" : event.autoConfirm ? "auto confirm" : "needs confirmation"; appendLog("prompt", `${mode}: ${event.target}`); return; }
            if (event.type === "skip") { appendLog("skip", `skip ${event.target}`); setSummary((current) => ({ ...current, completedActions: current.completedActions + 1, skipped: current.skipped + 1 })); return; }
            if (event.type === "backup") { appendLog("backup", `backup ${event.path} -> ${event.backup}`); setSummary((current) => ({ ...current, backedUp: current.backedUp + 1 })); return; }
            if (event.type === "link") { appendLog("link", `link ${event.target} -> ${event.linkTarget}`); setSummary((current) => ({ ...current, completedActions: current.completedActions + 1, linked: current.linked + 1 })); return; }
            if (event.type === "error") { appendLog("error", `error ${event.target}: ${event.message}`); setSummary((current) => ({ ...current, completedActions: current.completedActions + 1, errors: (current.errors || 0) + 1 })); return; }
            if (event.type === "session-complete") { setSummary(event.summary); appendLog("complete", "Install session complete."); }
          },
        });

        setSummary(result);
        setDone(true);
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : String(runError));
        appendLog("error", runError instanceof Error ? runError.message : String(runError));
        setDone(true);
      }
    };

     void begin();
   }, [selectedProfiles, options.dryRun, runInstallation, stage]);

  const content = stage === "loading"
    ? h(LoadingScreen, { scanProgress, totalHeight })
    : stage === "select"
    ? h(SelectionScreen, { toolGroups, depth, toolIndex, selectedActionKeys, inspectProfile: inspectProfileFn, sourceRoot: liveSourceRoot, configPath, focusedPane, layout, flatActions, actionIndex, actionScrollOffset })
    : stage === "confirm"
    ? h(ConfirmScreen, { selectedProfiles, inspectProfile: inspectProfileFn, options, layout, canApply: confirmCanApply })
    : h(RunScreen, {
      options,
      selectedProfiles,
      currentProfile,
      completedProfileIds,
      logs,
      prompt,
      summary,
      progressPercent,
      done,
      error,
      layout,
      onDecision: (decision) => {
        const resolver = promptResolverRef.current;
        promptResolverRef.current = null;
        setPrompt(null);
        if (resolver) resolver(decision);
      },
    });

  if (stage === "loading") {
    return h(
      Box,
      { flexDirection: "column", backgroundColor: theme.color.bg.base, height: totalHeight },
      content,
    );
  }

  return h(
    Box,
    {
      flexDirection: "column",
      backgroundColor: theme.color.bg.base,
      paddingX: 1,
      paddingY: 0,
      height: totalHeight,
    },
    h(ChromeBar, null),
    editingSourceRoot
      ? h(PathEditOverlay, { currentValue: liveSourceRoot, onSubmit: handleSourceRootSubmit, onCancel: () => setEditingSourceRoot(false), layout })
      : diffModal
        ? h(DiffOverlay, { ...diffModal, onClose: () => setDiffModal(null), layout })
        : content,
    h(FooterBar, {
      stage,
      selectedCount: selectedActionKeys.size,
      actionCount: profiles.reduce((sum, profile) => sum + profile.actions.length, 0),
      depth,
      focusedPane,
      options,
      isDiffable: (() => {
        const focusedAction = flatActions[actionIndex];
        if (!focusedAction) return false;
        const { kind } = focusedAction.inspectedAction;
        return kind === "replace-diff" || kind === "replace-link";
      })(),
    }),
  );
}
