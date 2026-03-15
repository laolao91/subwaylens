# SubwayLens — Known Issues, Fixes & Regression Tests

## BUG-001: Bridge detection fails in regular browser — black screen on settings page

### Date discovered

2026-03-14 (Phase 3 UAT)

### Symptom

Opening `http://localhost:5173` in a regular browser (Safari/Chrome) shows a **black screen** instead of the phone settings page. The browser console shows:

```
[EvenAppBridge] Bridge initialized
createStartUpPageContainer failed: 1
[EvenAppBridge] postMessage: Flutter handler not available
```

### Root cause

The Even Hub SDK (`@evenrealities/even_hub_sdk`) always injects an `EvenAppBridge` object into `window`, even in a regular browser. This means:

1. `waitForEvenAppBridge()` resolves **immediately** with a truthy bridge object
2. The 3-second timeout race in `main()` never fires
3. The app enters glasses mode (`startGlassesMode`)
4. `createStartUpPageContainer` calls the bridge, which tries to `postMessage` to a Flutter handler that doesn't exist
5. The call doesn't throw — it returns error code `1` (invalid container configuration)
6. The app is now stuck in glasses mode with no working display and no fallback to the settings page

### Original code (broken)

```typescript
// main.ts — boot logic
async function main(): Promise<void> {
  try {
    const b = await Promise.race([
      waitForEvenAppBridge(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ])

    if (b) {
      await startGlassesMode(b as EvenAppBridge)
    } else {
      initSettingsPage()
    }
  } catch {
    initSettingsPage()
  }
}
```

**Why `try/catch` didn't help:** `createStartUpPageContainer` returns a result code (`0` = success, `1` = invalid, etc.) rather than throwing. The bridge's `postMessage` also logs a warning but doesn't throw. So the `catch` block never executes.

**Why the timeout race didn't help:** `waitForEvenAppBridge()` resolves instantly because the SDK creates the bridge object in all environments. The 3-second `Promise.race` timeout is never reached.

### Fix applied

Replace the timeout-based detection with a check for the **Flutter native handler**, which only exists inside the real Even App WebView:

```typescript
async function main(): Promise<void> {
  try {
    const hasFlutter =
      !!(window as any).flutter_inappwebview ||
      !!(window as any).webkit?.messageHandlers?.callHandler

    if (hasFlutter) {
      const b = await waitForEvenAppBridge()
      await startGlassesMode(b)
    } else {
      // Regular browser -> show phone settings page
      initSettingsPage()
    }
  } catch {
    initSettingsPage()
  }
}
```

**Why this works:**
- `window.flutter_inappwebview` is injected by the Flutter `InAppWebView` plugin — it only exists when the page is loaded inside the Even App
- `window.webkit?.messageHandlers?.callHandler` is the iOS WKWebView message handler — also only present in the native app context
- In a regular browser, neither exists, so `hasFlutter` is `false` and the app goes straight to the settings page

### File changed

`src/main.ts` — `main()` function (bottom of file)

### Regression tests

#### RT-001: Settings page loads in regular browser

**Steps:**
1. Run `npm run dev`
2. Open `http://localhost:5173` in Safari or Chrome
3. Wait up to 5 seconds

**Expected:** Dark-themed settings page appears with "SubwayLens" header, My Stations, Add Station, and Settings sections.

**Fail indicators:**
- Black/blank screen
- Console shows `createStartUpPageContainer failed`
- Console shows `Flutter handler not available` without settings page appearing

#### RT-002: No "Bridge initialized" errors in browser console

**Steps:**
1. Open `http://localhost:5173` in a regular browser
2. Open DevTools console (`Cmd+Option+I` → Console tab)

**Expected:** No red error messages related to `createStartUpPageContainer` or `postMessage`. Warnings from the SDK about bridge initialization are acceptable (they come from the SDK itself, not our code).

#### RT-003: Glasses mode still works in Even App WebView

**Steps:**
1. Start the dev server: `npm run dev`
2. Generate QR: `npm run qr`
3. Scan QR with Even App on iPhone
4. Observe glasses display

**Expected:** Glasses show station arrivals (or "No stations" if no favorites set). The app should NOT show the settings page on the glasses.

**Note:** This test requires the Even App + G2 glasses or the even-dev simulator. Cannot be tested in a regular browser.

#### RT-004: Settings page loads without network access

**Steps:**
1. Disconnect from the internet (Wi-Fi off)
2. Open `http://localhost:5173` in a regular browser

**Expected:** Settings page still loads. The MTA feed 403/network error should not prevent the settings page from appearing. (The MTA feed check happens inside `startGlassesMode`, which is never called in browser mode after the fix.)

### Related SDK behavior (for reference)

- The SDK's `EvenAppBridge` is a singleton created on import — `waitForEvenAppBridge()` and `EvenAppBridge.getInstance()` both return it immediately
- The bridge's `callEvenApp()` method uses `flutter_inappwebview.callHandler('evenAppMessage', ...)` internally — when Flutter isn't there, it logs a warning but doesn't throw
- `createStartUpPageContainer` return codes: `0` = success, `1` = invalid, `2` = oversize, `3` = out of memory
- The SDK normalises event type `0` (`CLICK_EVENT`) to `undefined` — this is a separate known quirk (not related to this bug)

---

## BUG-002: MTA feed mock detection uses HEAD request — always falls back to mock data

### Date discovered

2026-03-15 (Phase 4 UAT)

### Symptom

The glasses display always shows mock data (generic terminal names like "Uptown", "The Bronx") even though the MTA GTFS-RT feeds are accessible. The browser console shows:

```
Failed to load resource: the server responded with a status of 403 ()
```

### Root cause

The mock detection check in `startGlassesMode()` used `fetch(..., { method: 'HEAD' })` to test if the MTA feed endpoint is reachable. The MTA endpoint (`api-endpoint.mta.info`) returns **403 for HEAD requests** but **200 for GET requests**. Since the HEAD check gets a 403, `!resp.ok` evaluates to `true`, and the app permanently switches to mock mode.

### Original code (broken)

```typescript
// main.ts — startGlassesMode()
const resp = await fetch(
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
  { method: 'HEAD' }
)
setUseMock(!resp.ok)
```

### Fix applied

Use a GET request with an `AbortController` to cancel the response body download after receiving headers:

```typescript
const controller = new AbortController()
const resp = await fetch(
  'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
  { signal: controller.signal }
)
controller.abort()
setUseMock(!resp.ok)
```

The `AbortError` from aborting is caught and treated as success (feed is reachable).

### File changed

`src/main.ts` — `startGlassesMode()` function

### Regression tests

#### RT-005: Real MTA data loads when feeds are reachable

**Steps:**
1. Run the app in the simulator or on real hardware
2. Check the glasses display for train arrivals

**Expected:** Terminal names show real MTA destinations (e.g., "Jamaica-179 St", "Coney Island-Stillwell Av") — not generic mock names ("Uptown", "The Bronx", "Brooklyn").

#### RT-006: Mock fallback still works when offline

**Steps:**
1. Disconnect from internet
2. Run the app in the simulator

**Expected:** App shows mock train data with route-appropriate terminal names. No crash or blank screen.

---

## BUG-003: Mock data shows generic terminal names instead of real destinations

### Date discovered

2026-03-15 (Phase 4 UAT)

### Symptom

When using mock data (MTA feeds unreachable), train arrivals show generic direction names like "Uptown", "The Bronx", "Downtown", "Brooklyn" instead of the actual terminal stations for each route.

### Root cause

The `mockStationArrivals()` function in `mta-feeds.ts` used hardcoded arrays of generic terminal names:

```typescript
const terminals =
  direction === 'N'
    ? ['Uptown', 'The Bronx', 'Harlem', 'Inwood']
    : ['Downtown', 'Brooklyn', 'Coney Island', 'New Lots']
```

### Fix applied

Added a `ROUTE_TERMINALS` lookup map with the actual last-stop terminal name for each MTA route in each direction (e.g., `E: { N: 'Jamaica Center', S: 'World Trade Ctr' }`). Mock data now uses these real terminal names.

### File changed

`src/data/mta-feeds.ts` — added `ROUTE_TERMINALS` constant and updated `mockStationArrivals()`

### Regression test

#### RT-007: Mock data shows route-appropriate terminal names

**Steps:**
1. Force mock mode (disconnect internet or modify code)
2. Check train arrivals on glasses display

**Expected:** Each train line shows its real terminal name — e.g., `[E] Jamaica Center`, `[R] Bay Ridge-95 St`, `[M] Forest Hills-71 Av` — not generic "Uptown"/"Downtown".

---

## Future improvements (noted during UAT, not yet implemented)

### IMP-001: Direction header labels need per-station customization

The ▲/▼ direction headers use generic labels from GTFS static data (e.g., "Outbound", "Southbound") that don't match MTA platform signage. These should be curated per station complex to show what riders actually see — e.g., "Forest Hills" / "Manhattan" at 63 Dr-Rego Park, "Jamaica / Queens" / "Manhattan" at Jackson Hts.

**Current source:** `station.north` / `station.south` fields in `stations.json`

**Approach:** Create an override map for major station complexes with rider-friendly direction labels, falling back to the GTFS data for stations without overrides.

### IMP-002: Double green line in simulator between header and body containers

The simulator renders a visible boundary line between the header (y=0, h=28) and body (y=28, h=260) containers. Combined with any text divider in the body content, this creates a double-line effect. On real hardware, container boundaries may render differently. The text `━━━` divider was removed to avoid the double line in the simulator — verify on real hardware whether a text divider is needed.

### IMP-003: Terminal name truncation at 19 characters

Long terminal names like "Coney Island-Stillwell Av" (25 chars) get truncated to "Coney Island-Stillwell." on the display. The G2 font is variable-width so the actual pixel fit varies. Consider abbreviating common words (e.g., "Coney Is-Stillwell" or "Coney Island") in the display layer rather than hard-truncating.

---

## BUG-004: App shows black screen on phone in Even App WebView — no settings page

### Date discovered

2026-03-15 (Phase 5 UAT)

### Symptom

When SubwayLens loads inside the Even App WebView (real device), the phone screen is black. The glasses display works, but the user has no way to configure favorites or settings on the phone.

### Root cause

The `main()` boot logic treated glasses mode and settings page as mutually exclusive — if the Flutter bridge was detected, only glasses mode started. But in the Even App, the WebView is visible to the user on the phone AND acts as the BLE proxy to the glasses. Both UIs need to run simultaneously.

### Fix applied

Changed `main()` to always initialize the settings page first, then additionally start glasses mode if the Flutter bridge is present:

```typescript
// Always show settings page on the phone screen
initSettingsPage()

if (hasFlutter) {
  const b = await waitForEvenAppBridge()
  await startGlassesMode(b)
}
```

### Files changed

`src/main.ts` — `main()` function

### Regression test

#### RT-008: Settings page visible on phone while glasses display is active

**Steps:**
1. Load SubwayLens in the Even App via QR code
2. Check the phone screen

**Expected:** Phone shows the settings page (favorites, search, settings). Glasses simultaneously show arrival data.

---

## BUG-005: "Send to Glasses" button needed — favorites don't sync to glasses automatically

### Date discovered

2026-03-15 (Phase 5 UAT)

### Symptom

After adding or removing favorite stations on the phone settings page, the glasses display doesn't update. User had to close and reopen the app to see changes.

### Root cause

The glasses mode loaded the station list once at startup and only refreshed on foreground enter/exit events. There was no mechanism for the settings page to signal changes to the glasses display.

### Fix applied

1. Added a "Send to Glasses" button between the My Stations and Add Station sections
2. The button dispatches a `CustomEvent('subwaylens:sync')` on `window`
3. The glasses mode listener catches this event and reloads stations + rebuilds the display
4. Button shows "Sent!" confirmation for 2 seconds after tapping

### Files changed

- `src/settings/settings-page.ts` — added sync button HTML and click handler
- `src/main.ts` — added `subwaylens:sync` event listener in `startGlassesMode()`
- `src/styles.css` — added `.sync-bar` and `.sync-button` styles

### Regression test

#### RT-009: Send to Glasses updates display immediately

**Steps:**
1. Load SubwayLens on phone + glasses
2. Add a new station on the phone
3. Tap "Send to Glasses"

**Expected:** Button flashes "Sent!", glasses display updates to include the new station within a few seconds.

---

## Enhancement: Search aliases for common station names

### Date added

2026-03-15 (Phase 5 UAT)

### Issue

Users search for "World Trade Center" or "WTC" but the E train stop is officially named "Chambers St" in MTA data. Other common names (Penn Station, Grand Central, etc.) also differ from official names.

### Fix applied

Added a `SEARCH_ALIASES` map in `search.ts` that maps common search terms to station IDs:

- "world trade" / "wtc" / "oculus" → Chambers St (A,C,E,R,W,2,3)
- "penn station" → 34 St-Penn Station
- "grand central" / "gct" → Grand Central-42 St
- "jackson heights" / "jackson hts" → 74 St-Broadway
- "barclays" → Atlantic Av-Barclays Ctr
- "hudson yards" → 34 St-Hudson Yards
- "rockefeller" → 47-50 Sts-Rockefeller Ctr

Alias matches appear before regular name matches in search results.

### File changed

`src/settings/search.ts` — added `SEARCH_ALIASES` and updated `searchStations()`

---

## BUG-006: Drag reorder broken on mobile WebView — favorites can't be reordered on phone

### Date discovered

2026-03-15 (Phase 5 UAT)

### Symptom

Drag-to-reorder works in desktop browsers (Chrome/Safari) but not in the Even App's mobile WebView. Users cannot reorder favorite stations on their phone.

### Root cause

The favorites list used the HTML5 Drag and Drop API (`draggable`, `dragstart`, `dragover`, `dragend`) which is not supported in mobile WebViews. Mobile requires touch events (`touchstart`, `touchmove`, `touchend`).

### Fix applied

Added parallel touch event handlers alongside the existing HTML5 drag handlers:

1. **Drag handle tap** → immediate drag start
2. **Long-press anywhere on row** (300ms) → drag start
3. **Visual lift effect** → item floats under finger with shadow and scale
4. **Touch move** → floating item follows finger, other items reorder in real-time
5. **Touch end** → item drops into new position, inline styles reset

### Files changed

- `src/settings/favorites.ts` — added touch event handlers, `moveDraggedTo()`, `finishDrag()` helpers
- `src/styles.css` — updated `.fav-item.dragging` with shadow/scale, `.fav-handle` with touch padding

### Regression tests

#### RT-010: Touch drag reorder works on mobile

**Steps:**
1. Open SubwayLens in Even App WebView on iPhone
2. Add 3+ stations to favorites
3. Touch and hold the ⋮⋮ handle on a station
4. Drag it to a new position

**Expected:** Station lifts with shadow effect, follows finger, other stations shift. Releasing drops it in new position. Order is preserved on reload.

#### RT-011: Desktop drag still works

**Steps:**
1. Open http://localhost:5173 in desktop browser
2. Drag a favorite station using the ⋮⋮ handle

**Expected:** HTML5 drag-and-drop still works as before.
