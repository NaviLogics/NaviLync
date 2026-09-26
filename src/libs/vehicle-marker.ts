import type { DivIconOptions } from 'leaflet'

/**
 * The Leaflet icon of the vehicle marker on the maps
 * @param {number} headingDeg - Vehicle heading (yaw), in degrees
 * @returns {DivIconOptions} The options for L.divIcon
 */
export const vehicleMarkerIconOptions = (headingDeg: number): DivIconOptions => {
  void headingDeg
  return {}
}

/**
 * The CSS transform that turns the vehicle marker image to the vehicle heading
 * @param {number} headingDeg - Vehicle heading (yaw), in degrees
 * @returns {string} The CSS transform
 */
export const vehicleMarkerRotation = (headingDeg: number): string => {
  void headingDeg
  return ''
}
