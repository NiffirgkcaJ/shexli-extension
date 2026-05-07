# Shexli GNOME Extension Linter

A Linux-only VS Code extension that runs Shexli against GNOME Shell extension packages and surfaces findings as diagnostics.

## Quick Start

1. Place the bundled binary at `vscode-extensions/extension/resources/bin/shexli` and make it executable.
2. Open a workspace that contains your GNOME extension packages.
3. Run "Shexli: Pick Package to Analyze" to add a package to `.shexli.json`.

To build the bundled binary from the local shexli source, run:

```bash
npm run build-binary
```

## Configuration

Create a workspace config file named `.shexli.json` at the workspace root or set the corresponding VS Code settings.

When `packages` is set, the extension analyzes only those package roots and skips discovery under `roots`.

Each entry in `packages` should point at a directory that contains `metadata.json`.

Package roots are stored relative to the workspace root when possible.

By default, the extension prefers a bundled Linux binary when it exists and is executable. Set `shexli.useBundledBinary` to false to use a system `shexli` instead.

Use `shexli.executionMode` to control how Shexli runs:

- `binary`: always run the bundled/system binary.
- `python`: run `python -m shexli`.
- `auto`: try the binary first, then fall back to `python -m shexli`.

When using `python` or `auto`, set `shexli.pythonPath` to the Python executable that has the Shexli package installed.

Use `npm run verify-binary` to validate that the bundled binary is present and executable before packaging the extension.

Use `ruleEnable` and `ruleDisable` to include or exclude rule IDs. Wildcards
are supported, for example `EGO-M-*`.

Example `.shexli.json`:

```json
{
    "roots": ["/home/you/gnome/extensions"],
    "packages": ["/home/you/gnome/extensions/my-extension"],
    "exclude": ["**/.git/**", "**/node_modules/**"],
    "binaryPath": "shexli",
    "useBundledBinary": true,
    "executionMode": "auto",
    "pythonPath": "python3",
    "ruleEnable": ["EGO-M-*", "EGO-I-*", "EGO-X-001"],
    "ruleDisable": ["EGO-P-006"],
    "runMode": "onChange",
    "debounceMs": 800
}
```

## Commands

- Shexli: Analyze Workspace
- Shexli: Analyze Package for Current File
- Shexli: Pick Package to Analyze
- Shexli: Rescan Workspace
- Shexli: Set Package Root for Current File

## Notes

- The bundled binary is expected at `vscode-extensions/extension/resources/bin/shexli` in this repository layout. Packaged extensions reference the same relative `resources/bin/shexli` path inside the extension.
