import { type Layer, type LayersControlEvent, type Map, CRS } from 'leaflet'

import { tileProviderCrs } from '@/libs/map-tiles'
import type { MapTileProvider } from '@/types/mission'

/**
 * Keeps a map in the projection of its base map: Yandex tiles are in EPSG:3395, the other base maps and the
 * overlays in EPSG:3857. Layers in two projections are never shown together.
 */
export class BaseMapProjection {
  private hiddenOverlays: Layer[] = []

  /**
   * Create it before the map gets its view, so that overlays in another projection are never drawn
   * @param {Map} map - The map, already in the projection of its first base map
   * @param {Layer[]} webMercatorOverlays - Overlays drawn in EPSG:3857 only
   * @param {() => void} [onOverlayBlocked] - Called when such an overlay is turned on over a base map in another projection
   * @param {() => void} [onOverlaysChanged] - Called when overlays were hidden or shown again, e.g. to redraw the layer control
   */
  constructor(
    private readonly map: Map,
    private readonly webMercatorOverlays: Layer[],
    private readonly onOverlayBlocked?: () => void,
    private readonly onOverlaysChanged?: () => void
  ) {
    if (map.options.crs !== CRS.EPSG3857) this.hideOverlays()
    map.on('overlayadd', (event: LayersControlEvent) => {
      if (this.map.options.crs === CRS.EPSG3857 || !this.webMercatorOverlays.includes(event.layer)) return
      this.map.removeLayer(event.layer)
      this.onOverlayBlocked?.()
    })
  }

  /**
   * Switch the projection as each base map is added, before it asks for any tile: switched after it, as on
   * `baselayerchange`, it would first fetch a screen of tiles in the old projection
   * @param {Partial<Record<MapTileProvider, Layer>>} baseMaps - The base maps of the layer control
   */
  followBaseMaps(baseMaps: Partial<Record<MapTileProvider, Layer>>): void {
    Object.entries(baseMaps).forEach(([provider, layer]) => {
      layer.beforeAdd = () => {
        // A map without a view yet is already in the projection of its first base map
        if ((this.map as unknown as MapWithViewReset)._loaded) this.apply(provider as MapTileProvider)
        return layer
      }
    })
  }

  /**
   * Put the map in the projection of a base map, on the same centre and zoom
   * @param {MapTileProvider} provider - The base map just picked
   * @returns {boolean} True if the projection changed
   */
  apply(provider: MapTileProvider): boolean {
    const crs = tileProviderCrs(provider)
    if (this.map.options.crs === crs) return false

    const [center, zoom] = [this.map.getCenter(), this.map.getZoom()]
    if (crs !== CRS.EPSG3857) this.hideOverlays()
    this.map.options.crs = crs
    // Leaflet has no public call to change the projection; a view reset projects every layer again: tiles, markers,
    // the vehicle track, the mission, the survey polygon
    ;(this.map as unknown as MapWithViewReset)._resetView(center, zoom)
    if (crs === CRS.EPSG3857) {
      this.hiddenOverlays.forEach((layer) => this.map.addLayer(layer))
      this.hiddenOverlays = []
    }
    if (this.webMercatorOverlays.length > 0) this.onOverlaysChanged?.()
    return true
  }

  /**
   * Whether the tiles of a base map can be saved now: the area to save is computed in the map's projection
   * @param {MapTileProvider} provider - The base map
   * @returns {boolean} True if the map is in that projection
   */
  canSaveTilesOf(provider: MapTileProvider): boolean {
    return this.map.options.crs === tileProviderCrs(provider)
  }

  /**
   *
   */
  private hideOverlays(): void {
    this.hiddenOverlays = this.webMercatorOverlays.filter((layer) => this.map.hasLayer(layer))
    this.hiddenOverlays.forEach((layer) => this.map.removeLayer(layer))
  }
}

/** The private Leaflet call that sets the view anew, with the current projection */
interface MapWithViewReset {
  /** Sets the view without animation and fires viewreset */
  _resetView: (center: ReturnType<Map['getCenter']>, zoom: number) => void
  /** True once the map has a view */
  _loaded?: boolean
}
