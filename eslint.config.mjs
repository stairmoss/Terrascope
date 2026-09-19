import js from "@eslint/js";
import tseslint from "typescript-eslint";

const eslintConfig = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.json"
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off"
    }
  },
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"]
  }
];

export default eslintConfig;
