#!/usr/bin/env node
/**
 * Station pack generator — static GTFS → src/data/packs/<system>.json
 *
 * Usage:
 *   node scripts/generate-stations.mjs <system-id> <gtfs-dir> [routeFilterCsv]
 *
 *   system-id      e.g. "lirr" — used for ID namespacing ("lirr:237") and output filename
 *   gtfs-dir       directory containing extracted stops.txt, routes.txt, trips.txt, stop_times.txt
 *   routeFilterCsv optional comma-separated route_ids to include (rail subset of mixed feeds)
 *
 * Rail-only: keeps GTFS route_type 0 (light rail), 1 (subway), 2 (commuter rail).
 * stop_times.txt is streamed line-by-line (MBTA's is enormous).
 *
 * Output pack shape:
 * {
 *   "system": "lirr",
 *   "routeDisplay": { "1": "Babylon", ... },     // route_id → display label
 *   "stations": [ { id, system, name, stops, routes, lat, lng, north, south } ]
 * }
 */

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const RAIL_ROUTE_TYPES = new Set(['0', '1', '2'])

const [systemId, gtfsDir, routeFilterCsv] = process.argv.slice(2)
if (!systemId || !gtfsDir) {
  console.error('usage: generate-stations.mjs <system-id> <gtfs-dir> [routeFilterCsv]')
  process.exit(1)
}
const routeFilter = routeFilterCsv ? new Set(routeFilterCsv.split(',')) : null

// ── CSV parsing (handles quoted fields with commas) ──

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else cur += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { out.push(cur); cur = '' }
      else cur += ch
    }
  }
  out.push(cur)
  return out
}

function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0)
  const header = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line)
    const row = {}
    header.forEach((h, i) => { row[h.trim()] = vals[i] ?? '' })
    return row
  })
}

// ── 1. routes.txt — rail routes only ──

const routesFile = path.join(gtfsDir, 'routes.txt')
const railRoutes = new Map() // route_id -> display label
for (const r of readCsv(routesFile)) {
  if (!RAIL_ROUTE_TYPES.has(r.route_type)) continue
  if (routeFilter && !routeFilter.has(r.route_id)) continue
  const display =
    r.route_short_name?.trim() ||
    (r.route_long_name?.trim() ?? '').split(/ Branch| Line/)[0].slice(0, 12) ||
    r.route_id
  railRoutes.set(r.route_id, display)
}
console.error(`rail routes: ${railRoutes.size}`)
if (railRoutes.size === 0) {
  console.error('No rail routes found — check route_type values or filter.')
  process.exit(1)
}

// ── 2. trips.txt — trip_id -> {route, direction, headsign} ──

const trips = new Map()
for (const t of readCsv(path.join(gtfsDir, 'trips.txt'))) {
  if (!railRoutes.has(t.route_id)) continue
  trips.set(t.trip_id, {
    route: t.route_id,
    dir: t.direction_id === '1' ? 1 : 0,
    headsign: (t.trip_headsign ?? '').trim(),
  })
}
console.error(`rail trips: ${trips.size}`)

// ── 3. stop_times.txt (streamed) — stop -> routes, stop -> headsign counts ──

const stopRoutes = new Map()      // stop_id -> Set<route_id>
const stopDirSigns = new Map()    // stop_id -> [Map<headsign,count>, Map<headsign,count>]

function bump(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1)
}

await new Promise((resolve, reject) => {
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(gtfsDir, 'stop_times.txt')),
    crlfDelay: Infinity,
  })
  let header = null
  let iTrip = -1, iStop = -1
  rl.on('line', (line) => {
    if (!header) {
      header = parseCsvLine(line)
      iTrip = header.findIndex((h) => h.trim() === 'trip_id')
      iStop = header.findIndex((h) => h.trim() === 'stop_id')
      return
    }
    // Fast path: avoid full CSV parse when the line has no quotes
    const vals = line.includes('"') ? parseCsvLine(line) : line.split(',')
    const tripId = vals[iTrip]
    const meta = trips.get(tripId)
    if (!meta) return
    const stopId = vals[iStop]
    if (!stopId) return
    let rs = stopRoutes.get(stopId)
    if (!rs) { rs = new Set(); stopRoutes.set(stopId, rs) }
    rs.add(meta.route)
    let ds = stopDirSigns.get(stopId)
    if (!ds) { ds = [new Map(), new Map()]; stopDirSigns.set(stopId, ds) }
    if (meta.headsign) bump(ds[meta.dir], meta.headsign)
  })
  rl.on('close', resolve)
  rl.on('error', reject)
})
console.error(`rail-served stops: ${stopRoutes.size}`)

// ── 4. stops.txt — group children under parent stations ──

const stops = readCsv(path.join(gtfsDir, 'stops.txt'))
const stopById = new Map(stops.map((s) => [s.stop_id, s]))

// parent station id -> { children: stop rows }
const groups = new Map()
for (const s of stops) {
  if (!stopRoutes.has(s.stop_id)) continue // only stops rail actually serves
  const parentId = s.parent_station?.trim() || s.stop_id
  let g = groups.get(parentId)
  if (!g) { g = []; groups.set(parentId, g) }
  g.push(s)
}

function topSign(counters) {
  let best = ''
  let bestN = 0
  for (const [sign, n] of counters) {
    if (n > bestN) { best = sign; bestN = n }
  }
  return best
}

const stations = []
for (const [parentId, children] of groups) {
  const parent = stopById.get(parentId)
  const name = (parent?.stop_name ?? children[0].stop_name ?? parentId).trim()
  const lat = parseFloat(parent?.stop_lat || children[0].stop_lat)
  const lng = parseFloat(parent?.stop_lon || children[0].stop_lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

  const routes = new Set()
  const dir0 = new Map()
  const dir1 = new Map()
  for (const c of children) {
    for (const r of stopRoutes.get(c.stop_id) ?? []) routes.add(r)
    const ds = stopDirSigns.get(c.stop_id)
    if (ds) {
      for (const [k, v] of ds[0]) dir0.set(k, (dir0.get(k) ?? 0) + v)
      for (const [k, v] of ds[1]) dir1.set(k, (dir1.get(k) ?? 0) + v)
    }
  }

  stations.push({
    id: `${systemId}:${parentId}`,
    system: systemId,
    name,
    stops: children.map((c) => c.stop_id),
    routes: [...routes].sort(),
    lat,
    lng,
    north: topSign(dir0),
    south: topSign(dir1),
  })
}

stations.sort((a, b) => a.name.localeCompare(b.name))
console.error(`stations: ${stations.length}`)

// ── 5. Emit pack ──

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'packs')
fs.mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, `${systemId}.json`)
const pack = {
  system: systemId,
  routeDisplay: Object.fromEntries(railRoutes),
  stations,
}
fs.writeFileSync(outFile, JSON.stringify(pack))
console.error(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)}KB)`)
