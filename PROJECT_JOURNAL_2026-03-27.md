# SubwayLens — Project Journal: March 27, 2026

## Session Summary: v1.2.0, v1.2.1, SDK 0.0.9 Update & Even Hub Submission Prep

---

## Today's Accomplishments

### Major Releases

#### v1.2.0 — Feature Release
**New Features:**
- **Borough direction codes** — Added MAN/QNS/BK/BX indicators on glasses display below direction headers
  - Created comprehensive terminal-to-borough mapping (~150 MTA terminals)
  - Displays on separate line after ▲/▼ direction headers
  - Example: "▼ Coney Island-Stillwell Av" → "BK" → arrival times
  
**Bug Fixes:**
- **Fixed scroll issue (critical)** — v1.1.1's scroll fix didn't work
  - Root cause: `AppShell` component from even-toolkit doesn't handle scroll properly in Even App WebView
  - Solution: Replaced AppShell with simple flex layout with explicit `overflow-y: auto`
  - Settings section now always accessible regardless of favorites list length

**UX Improvements:**
- **"Send to Glasses" button repositioned** — Moved from top-right to prominent black button fixed at bottom
- **Auto-clear search after add** — Search input clears automatically after adding station

**Files Changed:** 7 files (SettingsApp.tsx, StationSearch.tsx, boroughs.ts [NEW], display.ts, package.json, app.json, CHANGELOG.md)

#### v1.2.1 — Bug Fix Release
**Bug Fixes:**
- **Improved drag handle** — Increased from 15px to 20px with 40x40px tap area (2.67x larger)
  - Much easier to grab and reorder stations on mobile
- **Fixed missing MAN code for Hudson Yards** — Added 3 terminal variations to borough mapping
  - "34 St-Hudson Yards", "Hudson Yards", "Hudson Yards-34 St"
  - 7 train to Hudson Yards now correctly shows MAN

**Files Changed:** 6 files (FavoritesList.tsx, boroughs.ts, SettingsApp.tsx, package.json, app.json, CHANGELOG.md)

---

### SDK/CLI Updates for Even Hub Submission

**Updated to latest Even Hub tooling:**
- SDK: `0.0.7 → 0.0.9` (includes 12 containers, 288x144 images, IMU control, launch source detection)
- CLI: `0.1.7 → 0.1.10`
- Simulator: Added `0.6.2` as dev dependency

**Critical fixes for SDK 0.0.9 compatibility:**
1. **borderRadius typo fix** — SDK 0.0.9 fixed the "borderRdaius" typo to "borderRadius"
   - Updated all 4 instances in `src/main.ts`
   
2. **app.json format update** — CLI v0.1.10 requires new manifest format:
   - Changed `edition` from "202603" to "202601"
   - Added `min_sdk_version`: "0.0.9"
   - Updated `permissions` from object to array format with `name` and `desc`
   - Added `supported_languages`: ["en"]

**Final app.json:**
```json
{
  "package_id": "com.subwaylens.app",
  "edition": "202601",
  "name": "SubwayLens",
  "version": "1.2.1",
  "min_app_version": "0.1.0",
  "min_sdk_version": "0.0.9",
  "tagline": "MTA subway arrivals on your glasses",
  "description": "Real-time NYC subway arrival times on Even Realities G2 smart glasses. Scroll between favorited stations, see upcoming trains in both directions, and never miss a train again.",
  "author": "SubwayLens",
  "entrypoint": "index.html",
  "permissions": [
    {
      "name": "network",
      "desc": "Access MTA real-time subway data feeds to display live train arrival times"
    }
  ],
  "supported_languages": ["en"]
}
```

---

## Submission Package Built Successfully

**Package Details:**
- **File:** `subwaylens.ehpk`
- **Size:** 169,706 bytes (~166 KB)
- **Location:** `/Users/stevenlao/SubwayLens3_27_2026/subwaylens.ehpk`
- **Built with:** SDK 0.0.9, CLI 0.1.10
- **Status:** ✅ Ready for Even Hub submission

**Build command used:**
```bash
npm run pack
```

**Build output:**
```
✓ 779 modules transformed.
dist/index.html                   0.36 kB │ gzip:   0.26 kB
dist/assets/index-AlMPTIjm.css   14.22 kB │ gzip:   3.78 kB
dist/assets/index-6GkcFFwL.js   612.77 kB │ gzip: 158.51 kB
✓ built in 1.12s
Successfully packed subwaylens.ehpk (169706 bytes)
```

---

## CRITICAL: Local Directory & GitHub Sync

**⚠️ IMPORTANT FOR FUTURE REFERENCE:**

**Local Project Directory (1:1 with GitHub):**
```
/Users/stevenlao/SubwayLens3_27_2026/
```

**This is the MASTER directory:**
- ✅ Fresh clone from GitHub (clean 1:1 sync)
- ✅ Contains submission package: `subwaylens.ehpk`
- ✅ All dependencies installed (SDK 0.0.9, CLI 0.1.10, Simulator 0.6.2)
- ✅ Fully tested and verified
- ✅ Ready for Even Hub submission

**GitHub Repository:**
```
https://github.com/laolao91/subwaylens
```

**Current version on GitHub:** v1.2.1 (all fixes applied, SDK 0.0.9 compatible)

**Git sync status:**
- All changes committed and pushed
- No uncommitted changes
- Clean working tree
- Tags: v1.0.0, v1.1.0, v1.1.1, v1.2.0, v1.2.1

**To sync in future:**
```bash
cd /Users/stevenlao/SubwayLens3_27_2026
git pull origin main
npm install
```

---

## Even Hub Early Developer Program Submission Checklist

### ✅ Item #1: SDK/CLI Verification & Package Build — COMPLETE
- **SDK:** v0.0.9 (exceeds requirement of 0.0.8) ✅
- **CLI:** v0.1.10 (exact match) ✅
- **Simulator:** v0.6.2 (exceeds requirement of 0.6.0) ✅
- **Package:** `subwaylens.ehpk` built successfully ✅
- **app.json:** Strictly formatted, valid JSON ✅

### 📋 Item #2: App Icon Design — IN PROGRESS
**Design concept planned:**
- MTA arrivals board style (Times Square aesthetic)
- Shows route circles + arrival times
- Monochrome-friendly design
- **Status:** Waiting for Even Hub Dev Portal access to draw icon
- **Backup plan:** Simplified version if text too small for 2x2 pixel grid

### ⏳ Item #3: Store Screenshots — TO DO (Tomorrow)
**Requirements:**
- Must use newest official EvenHub simulator (v0.6.2)
- High-quality PNG format
- Showcase app features

**Plan:**
- Generate screenshots from simulator v0.6.2
- Show: station list, arrivals display, borough codes feature
- Ensure correct dimensions (avoid size errors)

### ⏳ Item #4: Mobile UI Polish — COMPLETE ✅
**Already using even-toolkit components:**
- ScreenHeader, Button, Toast, SegmentedControl, Toggle, Input, EmptyState
- Matches Even Realities aesthetic
- Light theme (#EEEEEE background, #FFFFFF cards)
- No additional polish needed

### ⏳ Item #5: App Description — TO DO (Tomorrow)
**Requirements:**
- Maximum 2,000 characters
- "About" section for store listing

**Plan:**
- Draft comprehensive description covering:
  - What SubwayLens does
  - Key features (real-time arrivals, borough codes, nearby stations, favorites)
  - How it works (MTA GTFS-RT feeds)
  - NYC subway rider benefits

### ⏳ Item #6: Privacy & Permissions — TO DO (Tomorrow)
**Requirements:**
- Document user data collected
- List OS permissions required
- Even Hub has built-in generator

**Current permissions:**
- **Network:** Access MTA real-time subway data feeds

**Data collected:**
- Favorite stations (stored locally via SDK bridge localStorage)
- Settings preferences (refresh interval, nearby radius, nearby toggle)
- GPS location (when "show nearby stations" enabled)

**Data NOT collected:**
- No user accounts
- No personal information
- No analytics/tracking
- No data sent to external servers (except MTA feeds)

---

## App Icon Design Exploration

**Design concepts explored:**
1. **Side-view subway car** — Perpendicular profile with windows, doors, wheels
2. **Front-view subway car** — With route circle and headlights
3. **MTA circle badge** — "SL" or "S" in MTA-style circle
4. **Arrivals board** ⭐ **SELECTED** — Times Square style with route circles + times

**Final concept: Arrivals Board (Version 1)**
```
┌──────────────────────────┐
│ TIMES SQ-42 ST           │
├──────────────────────────┤
│ Ⓝ Astoria        2 min   │
│ Ⓠ Coney Island   5 min   │
│ ①②③ Uptown      1 min   │
│ Ⓢ Times Sq      DUE     │
└──────────────────────────┘
```

**Why this design:**
- Shows EXACTLY what the app does (arrivals)
- Instantly recognizable to NYC riders
- Unique compared to generic train icons
- Works in monochrome

**Concern:** May be too detailed for small icon size with 2x2 pixel grid constraint
**Backup:** Simplified version with just route dots + times if needed

---

## Technical Notes

### SDK 0.0.9 Changes Applied
1. **borderRadius typo fixed** — Old SDK used `borderRdaius`, new SDK corrected to `borderRadius`
2. **New app.json format** — Permissions now array with `name` and `desc` objects
3. **Edition format** — Changed from "202603" to "202601"
4. **min_sdk_version required** — Added "0.0.9" to manifest

### Build Warnings (Non-blocking)
- `eval` warning from protobufjs/inquire — Normal, doesn't affect functionality
- Chunk size warning (612 KB JS bundle) — Optimization suggestion, not a blocker
- 6 npm vulnerabilities (5 moderate, 1 high) — Upstream packages, won't affect submission

### Git Commit History (Today)
```
0a0f1cd - fix: update app.json to CLI v0.1.10 format
b898e23 - fix: update borderRdaius to borderRadius for SDK 0.0.9 compatibility
33fd86b - fix: v1.2.1 larger drag handle + Hudson Yards borough code
2137474 - feat: v1.2.0 borough direction codes + scroll fix + UX improvements
```

---

## Tomorrow's Agenda

1. **Generate store screenshots** using simulator v0.6.2
   - Station list view
   - Arrivals display with borough codes
   - Settings page
   - Nearby stations feature

2. **Draft app description** (max 2,000 characters)
   - Highlight key features
   - Emphasize real-time MTA data
   - Explain borough codes benefit
   - Mention NYC subway rider focus

3. **Document privacy & permissions**
   - User data collected (favorites, settings, GPS)
   - Data NOT collected (no accounts, no tracking)
   - Network permission justification
   - Location permission justification

4. **Draw app icon** in Even Hub Dev Portal (when access granted)
   - Start with arrivals board design
   - Test 2x2 pixel grid constraints
   - Simplify if needed

---

## Key Learnings

1. **AppShell component issue** — even-toolkit's AppShell doesn't handle scroll properly in Even App WebView. Use simple flex layouts with explicit overflow instead.

2. **SDK version typo fixes** — SDK 0.0.9 fixed the "borderRdaius" typo. Always check SDK release notes for breaking changes.

3. **CLI format changes** — CLI v0.1.10 requires new app.json structure. Use `evenhub pack` to validate manifest before submission.

4. **Local directory management** — Keep one clean directory (SubwayLens3_27_2026) as 1:1 GitHub sync. Avoid multiple local copies to prevent confusion.

5. **Icon design constraints** — 2x2 pixel grid is strict. Design with simplicity in mind. Test at small sizes before finalizing.

---

## Files Modified Today

**Total:** 10 files across 3 commits

### v1.2.0 (7 files)
- `src/settings/SettingsApp.tsx` — Removed AppShell, fixed scroll, repositioned button
- `src/settings/StationSearch.tsx` — Auto-clear search after add
- `src/data/boroughs.ts` — NEW FILE - Terminal-to-borough mapping
- `src/glasses/display.ts` — Borough codes in display
- `package.json` — Version 1.2.0, SDK 0.0.9, CLI 0.1.10, Simulator 0.6.2
- `app.json` — Version 1.2.0
- `CHANGELOG.md` — v1.2.0 section

### v1.2.1 (6 files)
- `src/settings/FavoritesList.tsx` — Larger drag handle (20px, 40x40px tap area)
- `src/data/boroughs.ts` — Added Hudson Yards variants
- `src/settings/SettingsApp.tsx` — Version 1.2.1 footer
- `package.json` — Version 1.2.1
- `app.json` — Version 1.2.1
- `CHANGELOG.md` — v1.2.1 section

### SDK 0.0.9 Updates (3 files)
- `src/main.ts` — borderRdaius → borderRadius (4 instances)
- `app.json` — New CLI v0.1.10 format (permissions array, min_sdk_version, edition, languages)
- `CHANGELOG.md` — Documentation of SDK updates

---

## Current State Summary

**Version:** v1.2.1
**Status:** Ready for Even Hub submission (pending icon, screenshots, description)
**GitHub:** All changes pushed and tagged
**Local:** Clean 1:1 sync at `/Users/stevenlao/SubwayLens3_27_2026/`
**Package:** `subwaylens.ehpk` built and ready (169 KB)

**Live deployment:** https://subwaylens.vercel.app (auto-deployed from GitHub)

**Next session:** Screenshots, app description, privacy documentation, icon design

---

*End of session: March 27, 2026*
