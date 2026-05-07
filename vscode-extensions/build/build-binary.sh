#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHEXLI_SRC="${ROOT_DIR}/source/shexli"
VENV_DIR="${ROOT_DIR}/.venv-build"
OUTPUT_DIR="${ROOT_DIR}/extension/resources/bin"

if [ ! -d "$SHEXLI_SRC" ]; then
  echo "Missing shexli source at $SHEXLI_SRC" >&2
  exit 1
fi

python3 - <<'PY'
import sys

if sys.version_info < (3, 12):
    sys.stderr.write(
        "Python 3.12+ is required to build the bundled binary. "
        f"Found {sys.version.split()[0]}\n"
    )
    raise SystemExit(1)
PY

python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/python" -m pip install --upgrade pip >/dev/null
"$VENV_DIR/bin/python" -m pip install --upgrade \
  pyinstaller \
  "$SHEXLI_SRC" \
  tree-sitter \
  tree-sitter-javascript >/dev/null

mkdir -p "$OUTPUT_DIR"
"$VENV_DIR/bin/python" -m PyInstaller \
  --onefile \
  --name shexli \
  --distpath "$OUTPUT_DIR" \
  --workpath "$ROOT_DIR/build/pyinstaller" \
  --specpath "$ROOT_DIR/build/pyinstaller" \
  --collect-all shexli \
  --collect-all tree_sitter \
  --collect-all tree_sitter_javascript \
  --clean \
  "$SHEXLI_SRC/shexli/__main__.py"

chmod +x "$OUTPUT_DIR/shexli"

echo "Built bundled binary at $OUTPUT_DIR/shexli"
