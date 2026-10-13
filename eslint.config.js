// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["lib/", "dist/", "test-dist/", "node_modules/", "_wt-audit/"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "error",
      // test/scripts 里 catch {} 是刻意的 best-effort 吞错（term.kill、清理），放行
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    // Node-run JavaScript: the build scripts and the plain `.mjs` assert scripts under
    // test/ (this repo's test style is `node test-dist/x.js`, and the browser half runs
    // as `node test/browser.mjs` against an esbuild kit, so it has no @types/node).
    files: ["scripts/**/*.{js,mjs}", "test/**/*.mjs"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/client.tsx", "src/webterminals/browser/**/*.{ts,tsx}", "test/client.ts"],
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
);
