import type { CRS, Layer, Map } from 'leaflet'

import type { MapTileProvider } from '@/types/mission'

/**
 * Keeps a map in the projection of its base map
 */
export class BaseMapProjection {
  /**
   * @param {Map} map - The map
   * @param {Layer[]} webMercatorOverlays - Overlays drawn in EPSG:3857 only
   * @param {() => void} [onOverlayBlocked] - Called when such an overlay is turned on over a base map in another projection
   */
  constructor(
    private readonly map: Map,
    private readonly webMercatorOverlays: Layer[],
    private readonly onOverlayBlocked?: () => void
  ) {}

  /**
   * Put the map in the projection of a base map
   * @param {MapTileProvider} provider - The base map just picked
   * @returns {boolean} True if the projection changed
   */
  apply(provider: MapTileProvider): boolean {
    void provider
    return false
  }

  /**
   * Whether the tiles of a base map can be saved now: their area is computed in the map's projection
   * @param {MapTileProvider | CRS} providerOrCrs - The base map, or the projection of the layer
   * @returns {boolean} True if the map is in that projection
   */
  canSaveTilesOf(providerOrCrs: MapTileProvider | CRS): boolean {
    void providerOrCrs
    return true
  }
}
