import type { MapTileProvider } from '@/types/mission'

// OSM asks for its main host; the a/b/c subdomains are kept only for old clients
export const osmTileUrl = ''

export const esriWorldImageryTileUrl = ''

/**
 * The base map a map opens with
 * @param {MapTileProvider | undefined} widgetChoice - The base map stored in the map widget (in the profile)
 * @param {MapTileProvider | undefined} userLastChoice - The base map the operator last picked on any map
 * @returns {MapTileProvider} The base map to show
 */
export const initialTileProvider = (
  widgetChoice: MapTileProvider | undefined,
  userLastChoice: MapTileProvider | undefined
): MapTileProvider => userLastChoice ?? widgetChoice ?? 'OpenStreetMap'
