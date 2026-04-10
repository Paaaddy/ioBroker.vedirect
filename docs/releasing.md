# Releasing

Releases are triggered by pushing a `v*` tag. The release workflow then creates a GitHub Release using the matching section from `CHANGELOG.md`.

## Steps

### 1. Update CHANGELOG.md

Add a new section at the top (below the `# Changelog` heading):

```markdown
## 0.5.0 (2026-04-10)
- Short description of what changed.
- Another change.
```

The version number must match exactly what you'll tag.

### 2. Bump the version

```sh
npm version patch   # 0.4.1 → 0.4.2
npm version minor   # 0.4.1 → 0.5.0
npm version major   # 0.4.1 → 1.0.0
```

This updates `package.json` and creates a local git tag automatically.

### 3. Commit and push

```sh
git add CHANGELOG.md package.json package-lock.json
git commit -m "chore: release vX.Y.Z"
git push origin main
git push origin --tags
```

Pushing the tag triggers the Release workflow.

---

## Quick one-liner

```sh
./scripts/release.sh patch   # or minor / major
```

This does all of the above except writing the CHANGELOG — do that first.

---

## What happens next

1. The `release.yml` workflow fires on the pushed tag
2. It extracts the matching `## X.Y.Z` section from `CHANGELOG.md`
3. A GitHub Release is created with those notes
