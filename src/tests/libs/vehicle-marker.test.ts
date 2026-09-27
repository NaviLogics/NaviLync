import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { vehicleMarkerIconOptions, vehicleMarkerRotation } from '@/libs/vehicle-marker'

const read = (file: string): string => readFileSync(join(process.cwd(), file), 'utf8')

// Branding task, item 2: the NAVIS USV from above (341×563, nose up) instead of the arrow
describe('vehicle marker on the maps', () => {
  test('turned to the heading: yaw 90° → rotate(90deg)', () => {
    expect(vehicleMarkerRotation(90)).toBe('rotate(90deg)')
    expect(vehicleMarkerIconOptions(90).html).toContain('rotate(90deg)')
    expect(vehicleMarkerIconOptions(-30).html).toContain('rotate(-30deg)')
  })

  test('the USV picture, about 48 px tall, width by its proportions, anchored at its centre', () => {
    const options = vehicleMarkerIconOptions(0)
    expect(options.html).toMatch(/<img [^>]*src="[^"]*usv-navis-top[^"]*"/)
    expect(options.iconSize).toEqual([29, 48])
    expect(options.iconAnchor).toEqual([14.5, 24])
    expect(options.className).toBe('vehicle-marker')
  })

  test('both maps use it for every vehicle type, and turn it with the same rotation', () => {
    for (const file of ['src/components/widgets/Map.vue', 'src/views/MissionPlanningView.vue']) {
      const source = read(file)
      expect(source).toMatch(/vehicleMarkerIconOptions\(/)
      expect(source).toMatch(/vehicleMarkerRotation\(/)
      expect(source).not.toMatch(/blueboatMarkerImage|brov2MarkerImage|genericVehicleMarkerImage/)
    }
  })

  // The flight map clears its drawing on every mission refresh; a boat standing still must not lose its marker then
  test('the flight map draws the marker again after clearing its drawing, not only when the vehicle moves', () => {
    const map = read('src/components/widgets/Map.vue')
    const refresh = map.slice(
      map.indexOf('const refreshMission = async'),
      map.indexOf('\n}\n', map.indexOf('const refreshMission = async'))
    )
    expect(refresh).toMatch(/clearMapDrawing\(\)[\s\S]*drawVehicleMarker\(\)/)
  })
})
