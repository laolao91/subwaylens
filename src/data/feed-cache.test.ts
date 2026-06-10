import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { transit_realtime } from 'gtfs-realtime-bindings'
import { fetchFeedCached, clearFeedCache } from './feed-cache'

/** Encode a minimal valid FeedMessage with n empty trip-update entities. */
function encodeFeed(n: number): ArrayBuffer {
  const msg = transit_realtime.FeedMessage.create({
    header: { gtfsRealtimeVersion: '2.0' },
    entity: Array.from({ length: n }, (_, i) => ({
      id: `e${i}`,
      tripUpdate: { trip: { tripId: `t${i}` } },
    })),
  })
  const bytes = transit_realtime.FeedMessage.encode(msg).finish()
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function mockFetchOk(n: number) {
  return vi.fn(async () => ({
    ok: true,
    arrayBuffer: async () => encodeFeed(n),
  })) as unknown as typeof fetch
}

beforeEach(() => {
  clearFeedCache()
  vi.useFakeTimers()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('fetchFeedCached', () => {
  it('decodes entities from the response', async () => {
    vi.stubGlobal('fetch', mockFetchOk(3))
    const entities = await fetchFeedCached('https://feed/a')
    expect(entities).toHaveLength(3)
  })

  it('concurrent calls for the same URL share one fetch', async () => {
    const f = mockFetchOk(1)
    vi.stubGlobal('fetch', f)
    const [a, b] = await Promise.all([
      fetchFeedCached('https://feed/a'),
      fetchFeedCached('https://feed/a'),
    ])
    expect(f).toHaveBeenCalledTimes(1)
    expect(a).toBe(b)
  })

  it('second call within TTL returns cached without a new fetch', async () => {
    const f = mockFetchOk(2)
    vi.stubGlobal('fetch', f)
    await fetchFeedCached('https://feed/a')
    vi.advanceTimersByTime(5_000)
    await fetchFeedCached('https://feed/a')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('refetches after the TTL expires', async () => {
    const f = mockFetchOk(2)
    vi.stubGlobal('fetch', f)
    await fetchFeedCached('https://feed/a')
    vi.advanceTimersByTime(11_000)
    await fetchFeedCached('https://feed/a')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('different URLs are cached independently', async () => {
    const f = mockFetchOk(1)
    vi.stubGlobal('fetch', f)
    await fetchFeedCached('https://feed/a')
    await fetchFeedCached('https://feed/b')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('a failed fetch is not cached — next call retries', async () => {
    const f = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockImplementation(async () => ({
        ok: true,
        arrayBuffer: async () => encodeFeed(1),
      }))
    vi.stubGlobal('fetch', f)
    await expect(fetchFeedCached('https://feed/a')).rejects.toThrow('network')
    const entities = await fetchFeedCached('https://feed/a')
    expect(entities).toHaveLength(1)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('non-ok response throws and is not cached', async () => {
    const f = vi.fn(async () => ({ ok: false, status: 502 })) as unknown as typeof fetch
    vi.stubGlobal('fetch', f)
    await expect(fetchFeedCached('https://feed/a')).rejects.toThrow('502')
  })
})
