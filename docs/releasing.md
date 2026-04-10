# Releasing

Releases are managed by `release-please` from conventional commits on `main`.

## Steps

### 1. Merge changes into `main`

Use conventional commits such as `feat:`, `fix:`, and `chore:` in the commits that land on `main`.

### 2. Wait for the Release PR

The `release-please.yml` workflow runs on every push to `main` and keeps a release PR up to date. That PR contains the generated `CHANGELOG.md` updates plus version bumps for:

- `package.json`
- `package-lock.json`
- `io-package.json`

### 3. Merge the Release PR

When you're ready to publish, merge the release PR. `release-please` then creates the Git tag and GitHub Release automatically.

## What happens next

1. `release-please` calculates the next version from the conventional commits since the last release
2. It updates `CHANGELOG.md` and the tracked version files
3. Merging the release PR creates the `vX.Y.Z` tag and the GitHub Release
