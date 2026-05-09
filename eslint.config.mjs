import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Workspace/vendor/generated paths that should not be linted as app source:
    "**/.venv/**",
    "Invoices skills/**",
    "supabase/.temp/**",
    "outputs/**",
  ]),
]);

export default eslintConfig;
