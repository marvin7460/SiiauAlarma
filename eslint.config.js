import js from "@eslint/js";
import prettier from "eslint-config-prettier/flat";
import nextVitals from "eslint-config-next/core-web-vitals";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const WEB_FILES = ["apps/web/**/*.{ts,tsx}"];

/**
 * Next.js, React, React Hooks, a11y and import rules for apps/web only. We drop the parser and
 * TypeScript plugin that eslint-config-next brings, because the root config already parses
 * TypeScript with type information (strictTypeChecked) and two parsers would fight.
 */
const nextForWeb = nextVitals
  .filter((config) => config.name !== "next/typescript" && !("ignores" in config))
  .map((config) => {
    const {
      parser: _parser,
      parserOptions: _parserOptions,
      ...languageOptions
    } = config.languageOptions ?? {};
    return {
      ...config,
      files: WEB_FILES,
      languageOptions: { ...languageOptions, globals: { ...globals.browser, ...globals.node } },
      settings: { ...config.settings, react: { version: "19.3" }, next: { rootDir: "apps/web/" } },
    };
  });

export default defineConfig([
  globalIgnores([
    "**/node_modules/",
    "**/dist/",
    "**/.next/",
    "**/.wrangler/",
    "**/coverage/",
    "**/next-env.d.ts",
    "**/worker-configuration.d.ts",
    "**/playwright-report/",
    "**/test-results/",
    "packages/siiau/test/fixtures/",
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: { allowDefaultProject: ["*.js", "*.ts", "*.mjs"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // The SIIAU client and parser must run unchanged in Node, Vitest and Cloudflare Workers.
    files: ["packages/siiau/src/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["node:*"], message: "packages/siiau/src must stay runtime-agnostic." },
          ],
        },
      ],
    },
  },
  {
    // Checked against Cloudflare's runtime types, not Node's.
    files: ["apps/worker/src/cloudflare.ts"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: ["apps/worker/tsconfig.cloudflare.json"],
      },
    },
  },
  ...nextForWeb,
  {
    files: ["**/*.js", "**/*.mjs"],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ["apps/web/public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  prettier,
]);
