/**
 * LIRR / Metro-North track extraction.
 *
 * Track assignments ride the MTA Railroad GTFS-RT extension on
 * StopTimeUpdate (extension field 1005, MtaRailroadStopTimeUpdate:
 * field 1 = track, field 2 = trainStatus). gtfs-realtime-bindings 1.x
 * only ships the standard spec, so we walk the raw wire bytes with the
 * protobufjs Reader and pull tracks into a lookup map keyed by
 * `${tripId}|${stopId}`.
 *
 * Wire path: FeedMessage.entity(2) → FeedEntity.trip_update(3) →
 *   TripUpdate.trip(1).trip_id(1), TripUpdate.stop_time_update(2) →
 *     StopTimeUpdate.stop_id(4), StopTimeUpdate.ext_1005 → track(1)
 *
 * Verified against a live LIRR capture 2026-06-09
 * (src/data/__fixtures__/lirr.pb).
 */

import { Reader } from 'protobufjs/minimal'

type WireField = { no: number; bytes: Uint8Array | null }

/** Decode one message level into its length-delimited fields (others skipped). */
function fields(buf: Uint8Array): WireField[] {
  const r = Reader.create(buf)
  const out: WireField[] = []
  while (r.pos < r.len) {
    const tag = r.uint32()
    const no = tag >>> 3
    const wire = tag & 7
    if (wire === 2) {
      out.push({ no, bytes: r.bytes() })
    } else {
      r.skipType(wire)
      out.push({ no, bytes: null })
    }
  }
  return out
}

const td = new TextDecoder()

/**
 * Extract `${tripId}|${stopId}` → track from a railroad feed's raw bytes.
 * Returns an empty map for feeds without the extension (harmless).
 */
export function extractTrackMap(raw: Uint8Array): Map<string, string> {
  const tracks = new Map<string, string>()
  try {
    for (const ent of fields(raw)) {
      if (ent.no !== 2 || !ent.bytes) continue // FeedMessage.entity
      for (const fe of fields(ent.bytes)) {
        if (fe.no !== 3 || !fe.bytes) continue // FeedEntity.trip_update
        let tripId = ''
        const stuList: Uint8Array[] = []
        for (const tu of fields(fe.bytes)) {
          if (tu.no === 1 && tu.bytes) {
            // TripUpdate.trip → TripDescriptor.trip_id(1)
            for (const t of fields(tu.bytes)) {
              if (t.no === 1 && t.bytes) tripId = td.decode(t.bytes)
            }
          } else if (tu.no === 2 && tu.bytes) {
            stuList.push(tu.bytes)
          }
        }
        if (!tripId) continue
        for (const stuBytes of stuList) {
          let stopId = ''
          let track = ''
          for (const stu of fields(stuBytes)) {
            if (stu.no === 4 && stu.bytes) stopId = td.decode(stu.bytes)
            else if (stu.no === 1005 && stu.bytes) {
              // MtaRailroadStopTimeUpdate: track(1)
              for (const ext of fields(stu.bytes)) {
                if (ext.no === 1 && ext.bytes) track = td.decode(ext.bytes)
              }
            }
          }
          if (stopId && track) tracks.set(`${tripId}|${stopId}`, track)
        }
      }
    }
  } catch {
    // Malformed bytes — return whatever was collected; tracks are optional.
  }
  return tracks
}
