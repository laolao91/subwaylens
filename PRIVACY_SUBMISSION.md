# Privacy Statement for Even Hub Submission Form

**This is a condensed version of PRIVACY.md specifically formatted for the Even Hub submission form.**

---

## Question: What data does your app collect?

SubwayLens stores favorite subway stations and user preferences (refresh interval, nearby stations toggle, nearby radius) locally on the device via Even Hub SDK localStorage. When "Show nearby stations" is enabled, the app uses GPS location transiently to calculate distances to nearby stations—this location data is used only for the calculation and is not stored permanently.

No personal information, user accounts, analytics, or tracking data is collected. No data is sent to external servers except public MTA real-time feed requests to api-endpoint.mta.info.

All data storage is local-only. No cloud sync, no third-party services, no advertising, no cookies.

---

## Question: What OS permissions does your app require?

**Network Permission:**
Access MTA's public GTFS-RT feeds at api-endpoint.mta.info (whitelisted) to fetch real-time subway arrival predictions for all NYC subway lines.

**Location Permission:**
Calculate distances to nearby subway stations when the optional "Show nearby stations" feature is enabled in settings. Location is used transiently for distance calculation only and is not stored.

---

## Question: Does your app share data with third parties?

No. SubwayLens does not share any data with third parties. The only external connection is to the MTA's public GTFS-RT API (api-endpoint.mta.info) to fetch real-time subway arrival data. No user data, preferences, or location information is transmitted to the MTA or any other service.

---

## Question: Where is user data stored?

All user data (favorite stations, settings preferences) is stored locally on the device using Even Hub SDK bridge localStorage. No data is synced to cloud services or external servers. Users can delete all data by removing favorites and uninstalling the app.

---

## Question: Is your app open source?

Yes. SubwayLens is licensed under GPLv3 and the complete source code is available at https://github.com/laolao91/subwaylens for transparency and verification.

---

**Character counts:**
- Data collection: ~450 characters
- OS permissions: ~350 characters
- Third-party sharing: ~280 characters
- Data storage: ~230 characters
- Open source: ~180 characters

**Total: ~1,490 characters (well within typical form limits)**
