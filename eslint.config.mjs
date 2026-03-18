import nPlugin from "eslint-plugin-n";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: ["node_modules/**", "pnpm-lock.yaml"],
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    plugins: { n: nPlugin },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        require: "readonly",
        module: "readonly",
        __dirname: "readonly",
        __filename: "readonly",
        exports: "writable",
        Buffer: "readonly",
        URL: "readonly",
        setTimeout: "readonly",
        setImmediate: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-undef": "error",
      "no-console": "off",
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always"],
      "n/no-missing-require": "off",
      "n/no-missing-import": "off",
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
    },
  },
  prettierConfig,
];
