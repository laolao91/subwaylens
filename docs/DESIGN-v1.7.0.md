# SubwayLens v1.7.0 — Design Decisions

**Date:** 2026-06-09
**Basis:** v1.6.1 code review + feature mockup session (mockups in `SubwayLens/.superpowers/brainstorm/81881-1781054311/`)
**Builds on:** v1.6.2 (GPS no longer blocks favorites display — commit `c17ee33`)

---

## Feature Decisions

### ❌ #2 "Leave by" times — REJECTED

Walk-aware departure guidance (`▶ LEAVE NOW`, `leave in 4m`) replacing the terminal column.

**Decision:** Skip. Steven prefers the display stay unambiguous about *arrivals for that station and direction*. Re-interpreting arrival times as leave-by guidance muddies what the numbers mean. Do not revisit without explicit request.

### ✅ #4 Elevator/escalator outages — ACCEPTED, indicator-only design

**Constraint from Steven:** Do NOT add a banner row that steals space from arrivals. Note the alert compactly; provide a way to read it.

**Design:**
- **No new rows.** A single `!` marker appears in the header next to the station name when the current station has an active equipment outage (e.g. `125 St ★!`). One character of cost, zero rows.
- **Reading the alert reuses the existing tap-toggle.** Important existing behavior (v1.6.x): when alerts exist for routes at the station, tap already toggles between arrivals and the alert summary view — the footer hint switches from `tap:refresh` to `tap:alerts`. Elevator/escalator outages merge into that same alert view as entries with an `[ELEV]`/`[ESC]` badge, sorted above route alerts.
- **Scroll stays untouched.** Steven floated scroll-down to read alerts, but scroll up/down is the station-cycling gesture and tap-toggle already covers this. No input changes.
- **Data source:** MTA equipment outages feed (NYCT elevator/escalator status). Same `api-endpoint.mta.info` host already in the network whitelist — verify exact path during implementation.

### ✅ #6 Static schedule fallback — ACCEPTED

Scheduled times shown when realtime feeds fail: `~6m - 10:30s` with `! feed down — scheduled times` footer.

**Cutover question (Steven asked): does it switch back automatically when the feed resumes?**
**Answer: yes, automatically, within one refresh interval.** The fallback is a *stateless per-cycle rendering decision*, not a mode:

1. Every refresh cycle (auto-refresh at 15–120s, or manual tap) attempts the realtime fetch first, exactly as today.
2. Realtime returns trains → render realtime. Realtime fails or returns empty → render schedule with `~`/`s` markers.
3. No latching, no manual reset. The moment a refresh succeeds, live data is back on screen. Worst-case staleness in schedule mode = one `refreshInterval`.

**Bundle strategy:** do not ship the full GTFS static dump (~30MB). At "Send to Glasses" time, the phone computes compact timetable slices (weekday/weekend departure times per direction) for favorited stations only and stores them alongside favorites.

### ✅ #7 Big-number glance mode — ACCEPTED, off by default

One giant countdown per direction instead of three detail rows.

- **Settings:** new toggle in phone settings — "High readability glance mode" — **default OFF**.
- Tap on glasses cycles to the detailed view (footer hint: `tap:detail`).
- **Hardware validation required before build:** G2 text containers use a single LVGL font; confirm whether the SDK exposes a font-size property per container. If not, fall back to multi-row block digits, and prototype that in the simulator first.

### ✅ #8 LIRR / Metro-North — ACCEPTED

Departure-board layout (single list, track numbers) for commuter rail stations.

**Data source question (Steven asked): where does LIRR data come from? Key needed?**
**Answer: MTA's own GTFS-RT feeds, same host as subway, no key.** Verified live 2026-06-09:

| Feed | URL | Status |
|---|---|---|
| LIRR | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/lirr%2Fgtfs-lirr` | ✅ 200, 68KB, no key |
| Metro-North | `https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/mnr%2Fgtfs-mnr` | ✅ 200, 79KB, no key |

Same host already in `app.json` network whitelist — **no manifest change needed**. Track numbers come from the GTFS-RT extensions (NYCT/MTARR extensions carry track assignments — confirm field during implementation; rendered dim `Trk --` until posted, bright when assigned).

- `Station` gains a `system: 'subway' | 'lirr' | 'mnr'` field; renderer branches on it (subway keeps today's N/S layout).
- Commuter stations are searchable/favoritable like subway stations.

### ✅ #9 Multi-city — ACCEPTED, keyless cities first

**Key requirement question (Steven asked): which cities work without keys?** Verified live 2026-06-09:

| City | Feed | Key? | Status |
|---|---|---|---|
| **SF BART** | `https://api.bart.gov/gtfsrt/tripupdate.aspx` | **No key** | ✅ 200, 39KB |
| **Boston MBTA** | `https://cdn.mbta.com/realtime/TripUpdates.pb` | **No key** | ✅ 200, 558KB (all modes — filter to subway lines) |
| Chicago CTA | Train Tracker API | Key required (free signup) | ❌ errCd 100 without key |
| Washington WMATA | `api.wmata.com/gtfs/...` | Key required (free signup) | ❌ 401 without key |

**Phasing:**
- **Phase 1 (keyless):** BART, MBTA. Plain GTFS-RT, same `gtfs-realtime-bindings` decoding path, no secrets to manage, no proxy needed.
- **Phase 2 (key-required):** CTA, WMATA — needs either a SubwayLens-owned proxy that holds the key (Vercel function, like Wander's API layer) or user-supplied keys in settings. Decide later; out of scope for v1.7.0.
- Each city is a data pack: station list + feed URLs + route display names/badges. One active city at a time. CTA-style word-length route badges (`[Blue]`) shrink the terminal column from 15 to 12 chars.
- **Manifest impact:** each Phase 1 city adds its feed host to the `app.json` network whitelist (`api.bart.gov`, `cdn.mbta.com`).

---

## Scope summary for v1.7.0

| # | Feature | Status |
|---|---|---|
| 4 | Equipment outage indicator + alert-view entries | In |
| 6 | Schedule fallback (stateless, auto-cutover) | In |
| 7 | Big-number mode (settings, default off) | In — pending hardware font check |
| 8 | LIRR + Metro-North departure boards | In |
| 9 | Multi-city Phase 1 (BART, MBTA) | In |
| 2 | Leave-by times | Rejected |
| — | Multi-city Phase 2 (CTA, WMATA) | Deferred |

## Open items before implementation planning

1. **#7 font check** — does the SDK expose per-container font size? (Simulator + `sdk-reference` skill lookup.)
2. **#4 outage feed** — confirm exact MTA equipment-outages endpoint and format (JSON vs GTFS-RT service alerts with elevator entities).
3. **#8 track numbers** — confirm which GTFS-RT extension field carries LIRR track assignments.
4. **#9 MBTA feed size** — 558KB covers all modes; confirm filtering strategy keeps glasses-side fetches lean (may need per-route filtering or a proxy slice).
5. Whether v1.7.0 ships all five features at once or splits into 1.7.x increments.
