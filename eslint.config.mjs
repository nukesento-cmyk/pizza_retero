// Lint config for framework-free packages. apps/web has its own (Next.js) config.
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/migrations/**", "apps/**"] },
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-restricted-syntax": [
        "error",
        { selector: "Literal[raw=/^\\d+\\.\\d+$/][parent.callee.name='money']", message: "Money must be integer minor units." },
      ],
    },
  },
);
