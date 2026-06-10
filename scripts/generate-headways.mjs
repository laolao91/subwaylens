#!/usr/bin/env node
/**
 * Headway table generator — NYC subway static GTFS → nyc-headways.json
 *
 * Usage: node scripts/generate-headways.mjs <gtfs-dir>
 *
 * For the schedule-fallback feature: when realtime feeds are down, the
 * glasses show "every ~N min (sched)" per route. We can't bundle real
 * timetables (full GTFS is ~30MB), so this computes typical headways:
 * trips-per-hour per (route, dayType, hour), direction 0, from each
 * trip's first scheduled departure.
 *
 * Output shape (~3KB):
 *   { "A": { "wk": [h0..h23], "sa": [...], "su": [...] }, ... }
 * Values are headway minutes (2-30 clamped), null = no scheduled service.
 *
 * Day type from service_id: NYCT GTFS service ids contain Weekday /
 * Saturday / Sunday tokens.
 */

import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'

const gtfsDir = process.argv[2]
if (!gtfsDir) {
  console.error('usage: generate-headways.mjs <gtfs-dir>')
  process.exit(1)
}

function parseCsvLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++ } else q = false }
      else cur += ch
    } else {
      if (ch === '"') q = true
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
  const header = parseCsvLine(lines[0]).map((h) => h.trim())
  return lines.slice(1).map((line) => {
    const vals = parseCsvLine(line)
    const row = {}
    header.forEach((h, i) => { row[h] = vals[i] ?? '' })
    return row
  })
}

function dayType(serviceId) {
  const s = serviceId.toLowerCase()
  if (s.includes('saturday')) return 'sa'
  if (s.includes('sunday')) return 'su'
  if (s.includes('weekday')) return 'wk'
  return null
}

// trips: trip_id -> { route, dayType } (direction 0 only — headways are symmetric enough)
const trips = new Map()
for (const t of readCsv(path.join(gtfsDir, 'trips.txt'))) {
  const dt = dayType(t.service_id ?? '')
  if (!dt) continue
  if (t.direction_id === '1') continue
  trips.set(t.trip_id, { route: t.route_id, dt })
}
console.error(`dir-0 trips with day type: ${trips.size}`)

// Stream stop_times: each trip's FIRST row (lowest stop_sequence seen first
// in file order — NYCT emits rows in sequence order) gives the start hour.
const counts = new Map() // `${route}|${dt}|${hour}` -> trips starting that hour
const seenTrips = new Set()

await new Promise((resolve, reject) => {
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(gtfsDir, 'stop_times.txt')),
    crlfDelay: Infinity,
  })
  let header = null
  let iTrip = -1, iDep = -1
  rl.on('line', (line) => {
    if (!header) {
      header = parseCsvLine(line).map((h) => h.trim())
      iTrip = header.indexOf('trip_id')
      iDep = header.indexOf('departure_time')
      return
    }
    const vals = line.includes('"') ? parseCsvLine(line) : line.split(',')
    const tripId = vals[iTrip]
    if (seenTrips.has(tripId)) return
    const meta = trips.get(tripId)
    if (!meta) return
    seenTrips.add(tripId)
    const dep = vals[iDep] ?? ''
    const hour = parseInt(dep.split(':')[0], 10)
    if (!Number.isFinite(hour)) return
    const key = `${meta.route}|${meta.dt}|${hour % 24}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  rl.on('close', resolve)
  rl.on('error', reject)
})

// Build table
const routes = new Set([...trips.values()].map((t) => t.route))
const table = {}
for (const route of [...routes].sort()) {
  table[route] = {}
  for (const dt of ['wk', 'sa', 'su']) {
    const hours = []
    for (let h = 0; h < 24; h++) {
      const n = counts.get(`${route}|${dt}|${h}`) ?? 0
      if (n === 0) { hours.push(null); continue }
      hours.push(Math.min(30, Math.max(2, Math.round(60 / n))))
    }
    table[route][dt] = hours
  }
}

const outFile = path.join(
  path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'packs', 'nyc-headways.json'
)
fs.writeFileSync(outFile, JSON.stringify(table))
console.error(`routes: ${routes.size}, wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(1)}KB)`)
