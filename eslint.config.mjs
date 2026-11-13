// Reglas de ESLint de banklite-monitoring (solo scripts de Node y el exportador de demostración).
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import globals from "globals";

export default defineConfig(
    { ignores: ["node_modules/", "grafana/dashboards/"] },
    js.configs.recommended,
    {
        files: ["**/*.mjs"],
        languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: globals.node },
        rules: {
            eqeqeq: ["error", "smart"],
            "prefer-const": "error",
            "no-var": "error",
            "no-unused-vars": ["error", { args: "after-used", argsIgnorePattern: "^_" }],
        },
    },
    prettier
);
