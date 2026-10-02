import type { TileLayerOptions } from 'leaflet'
import { type TileLayerOffline, tileLayerOffline } from 'leaflet.offline'

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
export const osmTileLayerOffline = (options: TileLayerOptions): TileLayerOffline =>
  tileLayerOffline(osmTileUrl, options)

export const esriWorldImageryTileUrl =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'

/**
 * The base map a map opens with
 * @param {MapTileProvider | undefined} widgetChoice - The base map stored in the map widget (in the profile)
 * @param {MapTileProvider | undefined} userLastChoice - The base map the operator last picked on any map
 * @returns {MapTileProvider} The base map to show
 */
export const initialTileProvider = (
  widgetChoice: MapTileProvider | undefined,
  userLastChoice: MapTileProvider | undefined
): MapTileProvider => widgetChoice ?? userLastChoice ?? 'Esri World Imagery'
