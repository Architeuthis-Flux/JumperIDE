import globals from "globals"
import pluginJs from "@eslint/js"

export default [
  { ignores: ["build/", "src/websocket_relay.js"] },
  { languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
  {
    rules: {
      "no-unused-vars": [ "warn", {
          argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_"
      }],
      "no-use-before-define": [ "error", {
          functions: false,
          variables: false,
      }],
      "no-undef": "error",
      "no-empty": ["warn", { allowEmptyCatch: true }],
    },
    languageOptions: {
      globals: {
        analytics:          "readonly",
        loadMicroPython:    "readonly",
        VIPER_IDE_VERSION:  "readonly",
        VIPER_IDE_BUILD:    "readonly",
      }
    }
  },
  /* Node script for local use only (not run on deploy) */
  {
    files: ["scripts/**/*.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/api_ref_help_overrides.js"],
    languageOptions: { globals: globals.node },
  },
]
