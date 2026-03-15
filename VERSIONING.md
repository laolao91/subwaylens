# Versioning Policy

SubwayLens follows [Semantic Versioning 2.0.0](https://semver.org/).

## Version format: MAJOR.MINOR.PATCH

- **MAJOR** — Breaking changes to the glasses display format, settings storage schema, or app.json manifest that require users to reconfigure. Increment when saved favorites/settings would be incompatible with the new version.
- **MINOR** — New features, new station data, new UI sections, or enhancements that are backward-compatible. Users' existing favorites and settings continue to work.
- **PATCH** — Bug fixes, display tweaks, copy changes, and performance improvements with no new features.

## Where the version lives

All three must stay in sync:

| File | Field | Example |
|------|-------|---------|
| `package.json` | `"version"` | `"1.0.0"` |
| `app.json` | `"version"` | `"1.0.0"` |
| `CHANGELOG.md` | Section header | `## v1.0.0 — 2026-03-15` |

## Git tags

Tag each release:

```bash
git tag -a v1.0.0 -m "v1.0.0 — Initial UAT release"
git push origin v1.0.0
```

## Pre-release versions

For testing builds before a release, use pre-release identifiers:

```
1.1.0-beta.1    First beta of the next minor release
1.1.0-beta.2    Second beta
1.1.0-rc.1      Release candidate
1.1.0           Final release
```

## Release checklist

1. Update version in `package.json` and `app.json`
2. Add a new section to `CHANGELOG.md` with the date and changes
3. Run `npx tsc --noEmit` — must compile clean
4. Run `npx vite build` — must succeed
5. Update `tests.md` with any new bugs, fixes, or regression tests
6. Commit: `git commit -m "release: v1.1.0"`
7. Tag: `git tag -a v1.1.0 -m "v1.1.0 — description"`
8. Build package: `npm run pack`

## Version history

| Version | Date | Summary |
|---------|------|---------|
| 1.0.0 | 2026-03-15 | Initial release after UAT. 6 bug fixes, search aliases, sync button, touch drag, real MTA terminal names. |
