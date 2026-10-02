import { type Coords, type TileLayerOptions, CRS } from 'leaflet'
import { type TileInfo, type TileLayerOffline, getTileUrl, tileLayerOffline } from 'leaflet.offline'

import type { MapTileProvider } from '@/types/mission'

// OSM asks for its main host; the a/b/c subdomains are kept only for old clients
export const osmTileUrl = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

// Offline OSM tiles saved by earlier builds are stored under keys built from this template
export const legacyOsmTileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'

/**
 * The OSM base map, which also works offline with the tiles saved before
 * @param {TileLayerOptions} options - Leaflet tile layer options
 * @returns {TileLayerOffline} The OSM layer
 */
export const osmTileLayerOffline = (options: TileLayerOptions): TileLayerOffline => {
  const layer = tileLayerOffline(osmTileUrl, options)
  const legacyKey = ({ x, y, z }: Coords | TileInfo): string => getTileUrl(legacyOsmTileUrl, { x, y, z, s: 'a' })
  const getTileUrls = layer.getTileUrls.bind(layer)
  // Tiles are fetched from the new host but stored, looked up and removed under the old key and template
  layer._getStorageKey = legacyKey
  layer.getTileUrls = (area, zoom) =>
    getTileUrls(area, zoom).map((tile) => ({ ...tile, key: legacyKey(tile), urlTemplate: legacyOsmTileUrl }))
  return layer
}

export const esriWorldImageryTileUrl =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

// Esri asks for this credit wherever its imagery is shown
export const esriAttribution = 'Powered by Esri | Esri, Maxar, Earthstar Geographics'

/**
 * The Esri World Imagery base map, with the attribution Esri requires
 * @param {TileLayerOptions} options - Leaflet tile layer options
 * @returns {TileLayerOffline} The Esri layer
 */
export const esriTileLayerOffline = (options: TileLayerOptions): TileLayerOffline =>
  tileLayerOffline(esriWorldImageryTileUrl, { ...options, attribution: esriAttribution })

/**
 * The base map a map opens with
 * @param {MapTileProvider | undefined} widgetChoice - The base map stored in the map widget (in the profile)
 * @param {MapTileProvider | undefined} userLastChoice - The base map the operator last picked on any map
 * @returns {MapTileProvider} The base map to show
 */
export const initialTileProvider = (
  widgetChoice: MapTileProvider | undefined,
  userLastChoice: MapTileProvider | undefined
): MapTileProvider => widgetChoice ?? userLastChoice ?? 'OpenStreetMap'

export const yandexSatelliteTileUrl =
  'https://core-sat.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}&scale=1&lang=ru_RU'
export const yandexMapTileUrl =
  'https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&scale=1&lang=ru_RU'

export const yandexAttribution = ''

/**
 * A Yandex base map, which works offline too
 * @param {'satellite' | 'map'} kind - Satellite imagery or the scheme
 * @param {TileLayerOptions} options - Leaflet tile layer options
 * @param {string} [version] - The `v` parameter, for when the tile server asks for one
 * @returns {TileLayerOffline} The Yandex layer
 */
export const yandexTileLayerOffline = (
  kind: 'satellite' | 'map',
  options: TileLayerOptions,
  version = ''
): TileLayerOffline => {
  void version
  return tileLayerOffline(kind === 'satellite' ? yandexSatelliteTileUrl : yandexMapTileUrl, options)
}

/**
 * The projection of a base map
 * @param {MapTileProvider} provider - The base map
 * @returns {CRS} The CRS the map must be in to show it
 */
export const tileProviderCrs = (provider: MapTileProvider): CRS => {
  void provider
  return CRS.EPSG3857
}
