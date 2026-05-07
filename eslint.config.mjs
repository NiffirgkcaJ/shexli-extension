import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    eslintConfigPrettier,
    {
        ignores: [
            // Ignore IDE/editor-specific files
            ".agent/",
            ".git/",
            ".vscode/",

            // Ignore Node modules directories
            "node_modules/",

            // Ignore built and temporary files
            "vscode-extensions/.venv-build/",
            "vscode-extensions/build/",
            "vscode-extensions/extension/dist/",

            // Ignore external source code
            "vscode-extensions/source/",

            // Ignore config files
            ".prettierignore",
            ".prettierrc",
            ".shexli-version",
            ".vscodeignore",
            "eslint.config.mjs",
            "tsconfig.json",
        ],
    },
);