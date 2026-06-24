import { describe, it, expect } from 'vitest'
import type { Station, TrainArrival } from './types'

describe('Station/TrainArrival optional fields', () => {
  it('Station accepts an optional system field', () => {
    const lirrStation: Station = {
      id: 'lirr:237',
      name: 'Penn Station',
      stops: ['237'],
      routes: ['1'],
      lat: 40.75058844,
      lng: -73.99358408,
      north: 'Ronkonkoma',
      south: 'Penn Station',
      system: 'lirr',
    }
    expect(lirrStation.system).toBe('lirr')

    const subwayStation: Station = {
      id: '119',
      name: '96 St',
      stops: ['119'],
      routes: ['1', '2', '3'],
      lat: 40.793919,
      lng: -73.972323,
      north: 'Uptown',
      south: 'Downtown',
    }
    expect(subwayStation.system).toBeUndefined()
  })

  it('TrainArrival accepts an optional track field', () => {
    const withTrack: TrainArrival = {
      route: '4',
      direction: 'N',
      stopId: '237',
      arrivalTime: 1750000000,
      terminal: 'Ronkonkoma',
      track: '18',
    }
    expect(withTrack.track).toBe('18')

    const withoutTrack: TrainArrival = {
      route: 'E',
      direction: 'N',
      stopId: 'A03N',
      arrivalTime: 1750000000,
      terminal: 'Jamaica Center',
    }
    expect(withoutTrack.track).toBeUndefined()
  })
})
