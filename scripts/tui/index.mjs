import React from "react";
import { render } from "ink";
import { ThemeProvider } from "@inkjs/ui";
import { uiTheme } from "./theme/index.mjs";
import { InstallerApp } from "./App.mjs";
import { h } from "./ui/react-helpers.mjs";

function createForcedColorStdout(stdout) {
  return new Proxy(stdout, {
    get(target, prop, receiver) {
      if (prop === "isTTY") {
        return true;
      }

      if (prop === "getColorDepth") {
        return () => 24;
      }

      if (prop === "hasColors") {
        return () => true;
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

export async function runInkInstaller({ profiles, options, initialSelectedIds, runInstallation, inspectProfile, buildInspectionCache, sourceRoot, configPath, writeSourceRoot }) {
  process.env.FORCE_COLOR = process.env.FORCE_COLOR || "3";
  const stdout = createForcedColorStdout(process.stdout);

  return await new Promise((resolve, reject) => {
    const instance = render(
      h(
        ThemeProvider,
        { theme: uiTheme },
        h(InstallerApp, {
          profiles,
          options,
          initialSelectedIds,
          runInstallation,
          inspectProfile,
          buildInspectionCache,
          sourceRoot,
          configPath,
          writeSourceRoot,
          onFinish: (result) => resolve(result),
        }),
      ),
      { exitOnCtrlC: true, stdout, incrementalRendering: true },
    );

    instance.waitUntilExit().catch(reject);
  });
}
