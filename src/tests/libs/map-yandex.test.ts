import L from 'leaflet'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'

import { BaseMapProjection } from '@/libs/map-projection'
import { osmTileLayerOffline, tileProviderCrs, yandexAttribution, yandexTileLayerOffline } from '@/libs/map-tiles'

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')

/** What the offline tile layer exposes for keys and downloads */
interface OfflineLayer {
  /** The key a tile is stored and looked up under */
  _getStorageKey: (coords: L.Coords) => string
  /** The tiles to save for an area */
  getTileUrls: (area: L.Bounds, zoom: number) => Record<string, unknown>[]
}
const offline = (layer: unknown): OfflineLayer => layer as OfflineLayer

// The pier of the pilot, at zoom 17
const pier = L.latLng(55.9345725, 37.3812611)
const tileOf = (crs: L.CRS, at: L.LatLng, zoom: number): [number, number] => {
  const point = crs.latLngToPoint(at, zoom)
  return [Math.floor(point.x / 256), Math.floor(point.y / 256)]
}

// A map with markers only: the projection switch needs no tiles, and jsdom has no IndexedDB for them
const testMap = (): L.Map => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  return L.map(container).setView(pier, 17)
}
const marker = (at: L.LatLng): L.Marker => L.marker(at, { icon: L.divIcon({ className: 'test-marker' }) })

// Task 12 (P1): Yandex base maps, which are in EPSG:3395, not the EPSG:3857 of the other base maps
describe('Yandex tiles are in EPSG:3395', () => {
  test('the pier at zoom 17 is tile x 79146, y 40973 in EPSG:3395; EPSG:3857 would be ≈ 20 km off', () => {
    expect(tileOf(L.CRS.EPSG3395, pier, 17)).toEqual([79146, 40973])
    expect(tileOf(L.CRS.EPSG3857, pier, 17)).toEqual([79146, 40857])
  })

  test('Yandex base maps are shown in EPSG:3395, OSM and Esri in EPSG:3857', () => {
    expect(tileProviderCrs('Яндекс Спутник')).toBe(L.CRS.EPSG3395)
    expect(tileProviderCrs('Яндекс Схема')).toBe(L.CRS.EPSG3395)
    expect(tileProviderCrs('OpenStreetMap')).toBe(L.CRS.EPSG3857)
    expect(tileProviderCrs('Esri World Imagery')).toBe(L.CRS.EPSG3857)
  })
})

describe('Yandex tile layers', () => {
  const coords = { x: 79146, y: 40973, z: 17 } as L.Coords
  const area = L.bounds(L.point(79146 * 256, 40973 * 256), L.point(79146 * 256 + 10, 40973 * 256 + 10))

  test('satellite and scheme tiles come from the Yandex tile servers, credited «© Яндекс»', () => {
    const [satellite] = offline(yandexTileLayerOffline('satellite', {})).getTileUrls(area, 17)
    const [scheme] = offline(yandexTileLayerOffline('map', {})).getTileUrls(area, 17)
    expect(satellite.url).toBe('https://core-sat.maps.yandex.net/tiles?l=sat&x=79146&y=40973&z=17&scale=1&lang=ru_RU')
    expect(scheme.url).toBe(
      'https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x=79146&y=40973&z=17&scale=1&lang=ru_RU'
    )
    expect(yandexAttribution).toBe('© Яндекс')
    expect(yandexTileLayerOffline('satellite', {}).getAttribution?.()).toBe('© Яндекс')
  })

  test('a version the server asks for goes into the download, not into the offline key', () => {
    const layer = offline(yandexTileLayerOffline('satellite', {}, '2026.10.01'))
    const [tile] = layer.getTileUrls(area, 17)
    expect(tile.url).toBe(
      'https://core-sat.maps.yandex.net/tiles?l=sat&x=79146&y=40973&z=17&scale=1&lang=ru_RU&v=2026.10.01'
    )
    // Saved tiles stay found when the version changes
    expect(tile.key).toBe(offline(yandexTileLayerOffline('satellite', {})).getTileUrls(area, 17)[0].key)
    expect(layer._getStorageKey(coords)).toBe(tile.key)
    expect(String(tile.key)).not.toContain('v=')
  })

  test('the offline cache of Yandex is apart from the OSM one: same x/y/z, another projection, another key', () => {
    const yandexKey = offline(yandexTileLayerOffline('satellite', {}))._getStorageKey(coords)
    const osmKey = offline(osmTileLayerOffline({}))._getStorageKey(coords)
    expect(yandexKey).not.toBe(osmKey)
  })
})

describe('switching between Yandex and the other base maps', () => {
  test('to Yandex: the map goes to EPSG:3395 on the same centre and zoom, and the markers are redrawn there', () => {
    const map = testMap()
    const vehicle = marker(L.latLng(55.935, 37.382)).addTo(map)
    const projection = new BaseMapProjection(map, [])
    const [center, zoom] = [map.getCenter(), map.getZoom()]

    expect(projection.apply('Яндекс Спутник')).toBe(true)

    expect(map.options.crs).toBe(L.CRS.EPSG3395)
    expect(map.getCenter().lat).toBeCloseTo(center.lat, 9)
    expect(map.getCenter().lng).toBeCloseTo(center.lng, 9)
    expect(map.getZoom()).toBe(zoom)
    const drawnAt = L.DomUtil.getPosition(vehicle.getElement()!)
    const expected = map.latLngToLayerPoint(vehicle.getLatLng()).round()
    expect([drawnAt.x, drawnAt.y]).toEqual([expected.x, expected.y])
    map.remove()
  })

  test('back to OSM: EPSG:3857 again, same centre; picking a base map in the same projection changes nothing', () => {
    const map = testMap()
    const projection = new BaseMapProjection(map, [])
    projection.apply('Яндекс Схема')
    expect(projection.apply('Яндекс Спутник')).toBe(false)

    expect(projection.apply('OpenStreetMap')).toBe(true)
    expect(map.options.crs).toBe(L.CRS.EPSG3857)
    expect(map.getCenter().lat).toBeCloseTo(pier.lat, 9)
    expect(projection.apply('Esri World Imagery')).toBe(false)
    map.remove()
  })

  test('EPSG:3857 overlays are hidden over Yandex, come back after it, and cannot be turned on over it', () => {
    const map = testMap()
    const [seamarks, profile] = [L.layerGroup().addTo(map), L.layerGroup()]
    const blocked = vi.fn()
    const changed = vi.fn()
    const projection = new BaseMapProjection(map, [seamarks, profile], blocked, changed)

    projection.apply('Яндекс Спутник')
    expect(map.hasLayer(seamarks)).toBe(false)
    // So that the layer control shows it off
    expect(changed).toHaveBeenCalledTimes(1)
    map.addLayer(profile)
    map.fire('overlayadd', { layer: profile, name: 'Marine Profile' })
    expect(map.hasLayer(profile)).toBe(false)
    expect(blocked).toHaveBeenCalledTimes(1)

    projection.apply('OpenStreetMap')
    expect(changed).toHaveBeenCalledTimes(2)
    // Only what was on before Yandex comes back
    expect(map.hasLayer(seamarks)).toBe(true)
    expect(map.hasLayer(profile)).toBe(false)
    map.remove()
  })

  // Found in the browser: switched on baselayerchange, a Yandex layer first fetched a screen of tiles numbered in
  // EPSG:3857, as the layer control adds the layer before it fires the event
  test('the projection is switched before the new base map asks for any tile', () => {
    const map = testMap()
    const projection = new BaseMapProjection(map, [])
    const yandex = L.layerGroup()
    let crsWhenAdded: L.CRS | undefined
    yandex.onAdd = function (this: L.LayerGroup, addedTo: L.Map) {
      crsWhenAdded = addedTo.options.crs
      return this
    }
    projection.followBaseMaps({ 'Яндекс Спутник': yandex })

    map.addLayer(yandex)

    expect(crsWhenAdded).toBe(L.CRS.EPSG3395)
    map.remove()
  })

  test('tiles of a base map are saved only while the map is in its projection', () => {
    const map = testMap()
    const projection = new BaseMapProjection(map, [])
    expect(projection.canSaveTilesOf('OpenStreetMap')).toBe(true)
    expect(projection.canSaveTilesOf('Яндекс Спутник')).toBe(false)
    projection.apply('Яндекс Спутник')
    expect(projection.canSaveTilesOf('Яндекс Спутник')).toBe(true)
    expect(projection.canSaveTilesOf('Esri World Imagery')).toBe(false)
    map.remove()
  })
})

describe('the flight map and the planner offer Yandex', () => {
  test.each(['src/components/widgets/Map.vue', 'src/views/MissionPlanningView.vue'])('%s', (file) => {
    const source = read(file)
    expect(source).toMatch(/'Яндекс Спутник': yandexSatellite/)
    expect(source).toMatch(/'Яндекс Схема': yandexMap/)
    // Opened in the projection of its base map, switched on every base map change
    expect(source).toMatch(/crs: tileProviderCrs\(/)
    expect(source).toMatch(/new BaseMapProjection\(/)
    expect(source).toMatch(/\.followBaseMaps\(baseMaps\)/)
    // Saving tiles checks the projection first
    expect(source).toMatch(/canSaveTilesOf\(/)
  })
})
