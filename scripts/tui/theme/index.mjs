import { defaultTheme, extendTheme } from "@inkjs/ui";
import { palette } from "./catalog.mjs";

export const theme = {
  color: {
    bg: {
      base: palette.canvas,
      elevated: palette.chrome,
      overlay: palette.chromeSoft,
      panel: palette.panel,
      panelSoft: palette.panelSoft,
      panelRaised: palette.panelRaised,
    },
    fg: {
      primary: palette.white,
      secondary: palette.blue,
      muted: palette.gray,
      dim: palette.graySoft,
      inverse: palette.black,
    },
    accent: {
      primary: palette.cyan,
      bright: palette.cyanBright,
      soft: palette.cyanSoft,
    },
    state: {
      success: palette.green,
      warning: palette.yellow,
      error: palette.red,
      info: palette.magenta,
    },
    border: {
      subtle: palette.line,
      strong: palette.lineBright,
    },
    selectionBg: "#0f2a3a",
    orange: palette.orange,
  },
};

export const uiTheme = extendTheme(defaultTheme, {
  components: {
    StatusMessage: {
      styles: {
        icon: ({ variant } = {}) => ({
          color: ({
            success: palette.green,
            error: palette.red,
            warning: palette.yellow,
            info: palette.cyan,
          })[variant],
        }),
        message: ({ variant } = {}) => ({
          color: ({
            success: palette.green,
            error: palette.red,
            warning: palette.yellow,
            info: palette.cyan,
          })[variant],
        }),
      },
    },
    Alert: {
      styles: {
        border: ({ variant } = {}) => ({
          borderColor: ({
            success: palette.green,
            error: palette.red,
            warning: palette.orange,
            info: palette.cyan,
          })[variant],
        }),
        icon: ({ variant } = {}) => ({
          color: ({
            success: palette.green,
            error: palette.red,
            warning: palette.orange,
            info: palette.cyan,
          })[variant],
        }),
        message: () => ({
          color: palette.white,
        }),
      },
    },
    ProgressBar: {
      styles: {
        filled: () => ({ color: palette.cyan }),
        empty: () => ({ color: palette.line }),
      },
    },
    Spinner: {
      styles: {
        spinner: () => ({ color: palette.cyan }),
        label: () => ({ color: palette.white }),
      },
    },
  },
});
