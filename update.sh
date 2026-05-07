#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: ./update.sh [patch|minor|major|X.Y.Z]

Bumps package.json version and syncs package-lock.json without tagging.
Defaults to "patch" when no argument is provided.
EOF
}

bump=${1:-patch}
if [ "$bump" = "-h" ] || [ "$bump" = "--help" ]; then
  usage
  exit 0
fi

case "$bump" in
  patch|minor|major)
    npm version "$bump" --no-git-tag-version
    ;;
  *)
    npm version "$bump" --no-git-tag-version
    ;;
esac

npm install --package-lock-only

version=$(node -p "require('./package.json').version")

echo "Version updated to $version"
echo "Next: commit with message 'Version $version' and create tag v$version when releasing."
