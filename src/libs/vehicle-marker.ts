import type { DivIconOptions } from 'leaflet'

import usvMarkerImage from '@/assets/usv-navis-top.png'

// The NAVIS USV seen from above, nose up (341 × 563 px), shown at a fixed screen size whatever the zoom
const markerHeightPx = 48
const markerWidthPx = Math.round((markerHeightPx * 341) / 563)

/**
 * The CSS transform that turns the vehicle marker image to the vehicle heading
 * @param {number} headingDeg - Vehicle heading (yaw), in degrees
 * @returns {string} The CSS transform, e.g. 'rotate(90deg)'
 */
export const vehicleMarkerRotation = (headingDeg: number): string => `rotate(${headingDeg}deg)`

/**
 * The Leaflet icon of the vehicle marker on the maps: the USV picture, turned to the heading, anchored at its centre
 * @param {number} headingDeg - Vehicle heading (yaw), in degrees
 * @returns {DivIconOptions} The options for L.divIcon
 */
export const vehicleMarkerIconOptions = (headingDeg: number): DivIconOptions => ({
  className: 'vehicle-marker',
  html:
    `<img src="${usvMarkerImage}" alt="" style="width: ${markerWidthPx}px; height: ${markerHeightPx}px; ` +
    `transform: ${vehicleMarkerRotation(headingDeg)}; transform-origin: center;">`,
  iconSize: [markerWidthPx, markerHeightPx],
  iconAnchor: [markerWidthPx / 2, markerHeightPx / 2],
})
