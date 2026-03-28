# Privacy Policy — SubwayLens

**Last Updated:** March 28, 2026  
**Version:** 1.2.3

---

## Overview

SubwayLens is designed with privacy as a core principle. The app operates entirely on your device with no user accounts, no tracking, and no data collection servers.

---

## Data Collection

### What Data SubwayLens Collects

**Stored Locally on Your Device:**
1. **Favorite Subway Stations** — The list of stations you've added to your favorites for quick access on your glasses
2. **Settings Preferences** — Your chosen refresh interval (15s-2min), nearby stations toggle (on/off), and nearby radius (0.25-1.0 mi)
3. **GPS Location (Optional & Transient)** — When you enable "Show nearby stations," the app uses your current GPS location to calculate distances to nearby subway stations. This location data is **used only for the calculation and is not stored permanently**.

**All data is stored locally via the Even Hub SDK bridge localStorage. Nothing is synced to the cloud or sent to external servers.**

### What Data SubwayLens Does NOT Collect

- ❌ No user accounts or authentication
- ❌ No personal information (name, email, phone number, address)
- ❌ No analytics or usage tracking
- ❌ No cookies or session tracking
- ❌ No behavioral data or app usage patterns
- ❌ No device identifiers or fingerprinting
- ❌ No crash reports or diagnostics (beyond what the Even Hub platform may collect)
- ❌ No advertising identifiers
- ❌ No data sharing with third parties

---

## Network Permissions

### What Network Access Is Used For

SubwayLens requires network access to fetch real-time subway arrival data from the Metropolitan Transportation Authority (MTA).

**Network permission is restricted to:**
- `https://api-endpoint.mta.info` only (whitelisted in app manifest)

**What happens:**
- The app makes HTTPS requests to MTA's public GTFS-RT (General Transit Feed Specification - Real Time) feeds
- These feeds provide real-time arrival predictions for all NYC subway lines
- No authentication, API keys, or user identification is sent with these requests
- The MTA may log IP addresses and request metadata as part of their standard web server operations (beyond SubwayLens's control)

**What does NOT happen:**
- No data is sent to servers controlled by SubwayLens or its developer
- No user data or settings are transmitted
- No tracking or analytics requests are made

---

## Location Permissions

### What Location Access Is Used For

SubwayLens requests location permission to enable the optional "Show nearby stations" feature.

**When location is used:**
- Only when you explicitly enable "Show nearby stations" in the settings
- The app calls `navigator.geolocation.getCurrentPosition()` to get your current GPS coordinates
- These coordinates are used **transiently** to calculate distances to all 470+ NYC subway stations
- Nearby stations (within your chosen radius) are displayed in the station search interface

**What happens to your location:**
- Used for distance calculation only
- **Not stored** on the device
- **Not transmitted** to any external servers
- Discarded immediately after the nearby stations list is generated

**You can disable this feature at any time:**
- Open SubwayLens settings on your phone
- Toggle "Show nearby stations" to OFF
- The app will no longer request your location

---

## Data Storage

All SubwayLens data is stored locally on your device using the Even Hub SDK bridge's localStorage mechanism. This storage is:

- **Local-only** — Never synced to cloud services
- **Sandboxed** — Only accessible by SubwayLens
- **Persistent** — Survives app restarts
- **Clearable** — You can remove favorites and reset settings at any time within the app

**To delete all SubwayLens data:**
1. Open the app settings on your phone
2. Remove all favorited stations
3. Uninstall the app from Even Hub

---

## Third-Party Services

### MTA GTFS-RT Feeds

SubwayLens fetches data from the Metropolitan Transportation Authority's public real-time feeds:

- **Service:** MTA GTFS-RT API
- **URL:** `https://api-endpoint.mta.info`
- **Purpose:** Retrieve real-time subway arrival predictions
- **Data sent:** Standard HTTPS request headers (IP address, user agent, etc.)
- **Data received:** Protobuf-encoded arrival predictions for NYC subway lines
- **Privacy policy:** https://new.mta.info/privacy

**Important:** SubwayLens does not control the MTA's data collection practices. The MTA may log web requests as part of their standard operations.

### No Other Third Parties

SubwayLens does **not** use:
- Analytics services (Google Analytics, Mixpanel, etc.)
- Crash reporting services (Sentry, Firebase, etc.)
- Advertising networks
- Social media integrations
- Payment processors
- Authentication providers
- Cloud hosting or database services

---

## Open Source Transparency

SubwayLens is open source software licensed under GPLv3. The complete source code is available at:

**https://github.com/laolao91/subwaylens**

You can review exactly how your data is handled, what network requests are made, and how location is used by reading the code directly.

---

## Changes to This Policy

If SubwayLens's data practices change in future versions, this privacy policy will be updated and the "Last Updated" date will reflect the change. Material changes will be noted in the app's changelog.

---

## Contact

SubwayLens is developed by Steven Lao.

**Questions or concerns about privacy?**
- Open an issue on GitHub: https://github.com/laolao91/subwaylens/issues
- Review the source code to verify privacy claims

---

## Summary (TL;DR)

✅ **Your favorites and settings stay on your device**  
✅ **Location is optional and never stored**  
✅ **No accounts, no tracking, no analytics**  
✅ **Only connects to MTA's public data feeds**  
✅ **Open source — verify everything yourself**  

SubwayLens is built by a privacy-conscious NYC subway rider who believes you shouldn't have to sacrifice privacy to check train times.

---

*This privacy policy applies to SubwayLens version 1.2.3 and later.*
