// Exports survey missions for PX4 SITL exactly as NaviLync uploads them; skipped unless SITL_MISSIONS_DIR is set
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'vitest'

import { withCruiseSpeed } from '@/libs/mission/mission-items'
import { defaultSurveyParameters, planSurvey } from '@/libs/mission/survey-planner'
import { convertCockpitWaypointsToMavlink } from '@/libs/vehicle/mavlink/types'
import type { WaypointCoordinates } from '@/types/mission'

const outDir = process.env.SITL_MISSIONS_DIR
// PX4 SITL default home (Zurich)
const lat0 = Number(process.env.HOME_LAT ?? 47.397971057728974)
const lon0 = Number(process.env.HOME_LON ?? 8.546163739800146)
const metersPerDegree = 111195
const transitSpeed = 2

const ll = (east: number, north: number): WaypointCoordinates => [
  lat0 + north / metersPerDegree,
  lon0 + east / (metersPerDegree * Math.cos((lat0 * Math.PI) / 180)),
]

;(outDir ? test : test.skip)('export SITL missions', () => {
  mkdirSync(outDir as string, { recursive: true })
  for (const [name, spacing, width] of [
    ['s5', 5, 15],
    ['s1', 1, 6],
  ] as const) {
    // A 20 m long area with east-west lines, its corner 10 m east and 10 m north of home
    const area = [ll(10, 10), ll(30, 10), ll(30, 10 + width), ll(10, 10 + width)]
    const parameters = {
      ...defaultSurveyParameters(spacing),
      linesAngle: 90,
      lineSpeed: 1.5,
      brakeSpeed: 0.3,
      holdSeconds: 3,
    }
    const plan = planSurvey(area, parameters, transitSpeed)
    // The first item current, as NaviLync uploads to PX4: a mode change then starts the mission from seq 0
    const items = convertCockpitWaypointsToMavlink(withCruiseSpeed(plan.waypoints, transitSpeed), 1, true)
    const kinds: string[] = []
    plan.waypoints.forEach((waypoint, i) => waypoint.commands.forEach(() => kinds.push(plan.kinds[i])))
    const exported = items.map((item, i) => ({
      seq: item.seq,
      frame: item.frame.type,
      command: item.command.type,
      current: item.current,
      params: [item.param1, item.param2, item.param3, item.param4],
      x: item.x,
      y: item.y,
      z: item.z,
      // withCruiseSpeed adds one item before the first waypoint
      kind: i === 0 ? 'cruise' : kinds[i - 1],
    }))
    const mission = { home: [lat0, lon0], spacing, area, lineOrder: plan.lineOrder, items: exported }
    writeFileSync(join(outDir as string, `${name}.json`), JSON.stringify(mission, null, 1))
  }
})
