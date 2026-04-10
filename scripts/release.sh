#!/usr/bin/env bash
# Usage: ./scripts/release.sh [patch|minor|major]
# Update CHANGELOG.md before running this script.

set -euo pipefail

BUMP="${1:-patch}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

# Ensure working tree is clean (except CHANGELOG.md which the user just edited)
DIRTY=$(git status --porcelain | grep -v 'CHANGELOG.md' || true)
if [[ -n "$DIRTY" ]]; then
  echo "Working tree has uncommitted changes (other than CHANGELOG.md). Commit or stash them first."
  git status --short
  exit 1
fi

# Bump version — npm version also creates the tag
npm version "$BUMP" --no-git-tag-version
VERSION=$(node -p "require('./package.json').version")

git add CHANGELOG.md package.json package-lock.json
git commit -m "chore: release v${VERSION}"
git tag "v${VERSION}"

echo ""
echo "Ready to push v${VERSION}. This will trigger the release workflow."
read -rp "Push to origin? [y/N] " CONFIRM
if [[ "$CONFIRM" =~ ^[Yy]$ ]]; then
  git push origin main
  git push origin "v${VERSION}"
  echo "Released v${VERSION}."
else
  echo "Aborted. Run manually:"
  echo "  git push origin main && git push origin v${VERSION}"
fi
