# SubwayLens v2.1 — Session Handoff
_Updated: 2026-07-18 | Status: EHPK built (`subwaylens.ehpk`), nothing committed/pushed — awaiting explicit go-ahead_

---

## Summary

Scoped SDK/toolchain update, matching the same process just run on Wander v1.13. Not a straightforward branch-forward, though — the prior state of this project was messier than Wander's, and had to be reconciled first.

## Base-folder reconciliation (read this before touching v2.0.x again)

Two `SubwayLens_v2.0.x` folders existed side by side:
- **`SubwayLens_v2.0.0/`** — the real git repo (branch `v2.0.x`, remote `laolao91/subwaylens`), HEAD `c343b94`. Had uncommitted working-tree changes (`CHANGELOG.md`, `README.md`, `VERSIONING.md`, a partial rewrite in `src/main.ts`) that look like an abandoned, incomplete attempt at a v2.0.1 bump. Left untouched — did not commit, stash, or discard anything there.
- **`SubwayLens_v2.0.1/`** — no `.git` at all, untracked. Had `package.json`/`app.json` already bumped to 2.0.1, an extra `src/whitelist.test.ts`, a more current `VERSIONING.md` table (has a 1.9.0 row that v2.0.0's committed state lacks), and — this turned out to matter — an `https://react.dev` entry in its `app.json` whitelist that `SubwayLens_v2.1_Research.md` (written 2026-07-03) flagged as suspicious/unexplained and recommended not trusting.

**v2.1 was branched from `v2.0.0`'s clean committed HEAD** (`git clone` from the local repo, not `rsync` — deliberately drops the uncommitted partial rewrite, keeps full git history), per the 2026-07-03 research doc's explicit recommendation to treat `v2.0.0` as canonical.

**Correction to that research doc, found independently this session:** the `react.dev` whitelist entry in `v2.0.1` wasn't a mistake — it's the correct fix for a real, verified issue (React's minified-error-message URL is a static string in the built bundle, the exact rejection class that got Wander v1.10 rejected). `v2.0.0`'s current build has the same gap. I re-added it to `v2.1`'s `app.json` independently, verified via a direct grep of `dist/assets/*.js`. Whoever was working in `v2.0.1` had already found and fixed this correctly — it just never made it back into the git-tracked repo. **`v2.0.1` may be worth a closer look** (the `whitelist.test.ts` file in particular) before it's deleted or ignored going forward, since it's not purely an abandoned experiment as previously assessed.

## What changed

**Dependency bump:**
- `@evenrealities/even_hub_sdk` 0.0.11 → 0.0.12
- `even-toolkit` 1.7.0 → 1.7.7
- `@evenrealities/evenhub-cli` 0.1.12 → 0.1.13
- `@evenrealities/evenhub-simulator` 0.6.2 → 0.8.0

**SDK 0.0.12 capabilities checked against this codebase:** neither new capability applies. `zOrderIndex` (container stacking) — SubwayLens's glasses screens only ever render 2 non-overlapping text containers (`src/main.ts`). LZ4 image compression — SubwayLens has zero image-container usage anywhere in `src/` (no `ImageContainerProperty`/`updateImageRawData`), unlike Wander's minimap. This release is toolchain-only with no behavior change from the SDK itself.

**Fixed (pre-existing, unrelated to the SDK bump but found while verifying the build):** `app.json`'s network whitelist was missing `https://react.dev` — see reconciliation note above.

**Documentation gaps found, not fixed this session (flagging, not backfilling):** `CHANGELOG.md`'s committed HEAD has no entries for v1.9.0 or v2.0.0 at all (jumps from 1.8.1 straight to what I added as 2.1.0). `VERSIONING.md`'s version-history table has the same gap for 2.0.0. Reconstructing accurate historical entries for versions I didn't build felt riskier than leaving an honest gap — the git log at `c343b94` and project memory have the real detail if someone wants to backfill properly.

## Verification

```
npm install     → SDK/CLI/simulator/even-toolkit confirmed at new versions
npx tsc --noEmit → clean, no output
npm test          → 10 files, 97 tests, all passing (matches pre-change baseline)
npm run build      → succeeds, dist/assets/index-*.js (547 KB / 152 KB gzip — pre-existing
                      chunk-size warning, not introduced by this change)
npm run pack        → subwaylens.ehpk (187,407 bytes)
```

No `eval()` found in `dist/` (verified via direct grep, not just relying on the absence of `gtfs-realtime-bindings`/`protobufjs` complaints — SubwayLens does bundle `gtfs-realtime-bindings`, same dependency family flagged in `EVEN_HUB_SUBMISSION_CHECKLIST.md` §9, but nothing surfaced this time).

## Note on tooling gap vs. Wander

Unlike Wander's `pack` script (`npm test && npm run build && node scripts/check-bundle-whitelist.mjs && evenhub pack ...`), SubwayLens's `pack` script is just `npm run build && evenhub pack ...` — no automated test gate, no automated whitelist-scan gate. I ran both manually this session instead of wiring them in, since that's a bigger change than "update the SDK" — flagging as a worthwhile future improvement, not doing it now.

## Not done at all (explicitly out of scope this session)

No `git commit`, no `git push`, no store submission, no reconciliation of `v2.0.1`'s extra `whitelist.test.ts` into this repo, no backfill of missing `v1.9.0`/`v2.0.0` changelog history, and none of the `SubwayLens_v2.1_Research.md` correctness-bug fixes (GlassesPreview LIRR/MNR breakage, exit-dialog freeze) — matching Steven's explicit scope call on the Wander release: SDK/tooling update only, research backlog is a separate future session.
