# Versioning Policy

SubwayLens follows [Semantic Versioning 2.0.0](https://semver.org/).

## Version format: MAJOR.MINOR.PATCH

- **MAJOR** — Breaking changes to the glasses display format, settings storage schema, or app.json manifest that require users to reconfigure. Increment when saved favorites/settings would be incompatible with the new version.
- **MINOR** — New features, new station data, new UI sections, or enhancements that are backward-compatible. Users' existing favorites and settings continue to work.
- **PATCH** — Bug fixes, display tweaks, copy changes, and performance improvements with no new features.

## Where the version lives

All four must stay in sync:

| File | Field | Example |
|------|-------|---------|
| `package.json` | `"version"` | `"1.5.0"` |
| `app.json` | `"version"` | `"1.5.0"` |
| `src/settings/SettingsApp.tsx` | Footer string | `v1.5.0` |
| `CHANGELOG.md` | Section header | `## v1.5.0 — 2026-04-11` |

## Git tags

Tag each release:

```bash
git tag v1.5.0
git push origin v1.5.0
```

## Pre-release versions

For testing builds before a release, use pre-release identifiers:
## Release checklist

1. Update version in `package.json` and `app.json`
2. Update version footer string in `src/settings/SettingsApp.tsx`
3. Add a new section to `CHANGELOG.md` with the date and changes
4. Update version history table in `VERSIONING.md`
5. Update `Current version` in `README.md`
6. Update Roadmap checkboxes in `README.md` for any shipped features
7. Run `npm run build` — must compile and bundle clean
8. Commit: `git commit -m "vX.Y.Z — description"`
9. Tag: `git tag vX.Y.Z`
10. Push: `git push origin main && git push origin vX.Y.Z`

## Version history

| Version | Date | Summary |
|---------|------|---------|
| 1.5.2 | 2026-04-14 | Handle ABNORMAL_EXIT_EVENT to stop auto-refresh on unexpected disconnect. |
| 1.5.1 | 2026-04-11 | Header clock now updates on every auto-refresh cycle. |
| 1.5.0 | 2026-04-11 | Smart terminal abbreviations, MTA service alerts with tap-toggle summary, last-refreshed timestamp in footer, dependency updates (SDK 0.0.10, even-toolkit 1.7.0). |
| 1.4.0 | 2026-04-07 | UI improvements: list dividers, green checkmarks, larger route badges, distance pills. Glasses: compact time format, NOW for imminent trains, solid direction divider, live clock in header, control hint footer, exit confirmation flow. |
| 1.3.0 | 2026-03-28 | Nearby stations display on phone settings page with GPS detection, distance, and add-to-favorites. |
| 1.2.3 | 2026-03-28 | Added location permission to app.json. |
| 1.2.2 | 2026-03-28 | Added network permission whitelist to app.json. |
| 1.2.1 | 2026-03-27 | Larger drag handle, Hudson Yards borough code fix. |
| 1.2.0 | 2026-03-27 | Borough direction codes on glasses, scroll fix, UX improvements. |
| 1.1.1 | 2026-03-27 | SDK 0.0.9 compliance, scroll fix attempt, search improvements. |
| 1.1.0 | 2026-03-21 | Settings page redesign with React + even-toolkit light theme. |
| 1.0.0 | 2026-03-15 | Initial release after UAT. 6 bug fixes, search aliases, sync button, touch drag, real MTA terminal names. |
