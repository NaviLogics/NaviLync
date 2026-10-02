import * as turf from '@turf/turf'
import { describe, expect, test } from 'vitest'

import { MavCmd } from '@/libs/connection/m2r/messages/mavlink2rest-enum'
import {
  type VehicleMissionParameters,
  validateMission,
  withStopAtLastWaypoint,
} from '@/libs/mission/mission-validation'
import { type MissionCommand, type Waypoint, AltitudeReferenceType, MissionCommandType } from '@/types/mission'

const origin: [number, number] = [55.75, 37.6]
// A point `meters` east of the origin
const east = (meters: number): [number, number] => {
  const [lon, lat] = turf.destination([origin[1], origin[0]], meters, 90, { units: 'meters' }).geometry.coordinates
  return [lat, lon]
}

const nav = (hold = 0, radius = 0): MissionCommand => ({
  type: MissionCommandType.MAVLINK_NAV_COMMAND,
  command: MavCmd.MAV_CMD_NAV_WAYPOINT,
  param1: hold,
  param2: radius,
  param3: 0,
  param4: 0,
})
const speed = (metersPerSecond: number): MissionCommand => ({
  type: MissionCommandType.MAVLINK_NON_NAV_COMMAND,
  command: MavCmd.MAV_CMD_DO_CHANGE_SPEED,
  param1: 1,
  param2: metersPerSecond,
  param3: -1,
  param4: 0,
  x: 0,
  y: 0,
  z: 0,
})
const wp = (coordinates: [number, number], commands: MissionCommand[]): Waypoint => ({
  id: coordinates.join(','),
  coordinates,
  altitude: 0,
  altitudeReferenceType: AltitudeReferenceType.RELATIVE_TO_HOME,
  commands,
})

// 1.5 m/s along three points 20 m apart, nothing special at the end
const plain = (): Waypoint[] => [
  wp(origin, [speed(1.5), nav(0, 1)]),
  wp(east(20), [nav(0, 1)]),
  wp(east(40), [nav(0, 1)]),
]
const params: VehicleMissionParameters = { speedLimit: 2, acceptanceRadius: 2 }
const kinds = (waypoints: Waypoint[], spacing?: number, p = params): string[] =>
  validateMission(waypoints, p, spacing).warnings.map((warning) => warning.kind)

// Release 1.0, task 2
describe('mission check before upload', () => {
  test('(a) the last waypoint approached at 1.5 m/s without holding: warning', () => {
    const result = validateMission(plain(), params)
    expect(result.warnings).toContainEqual({ kind: 'lastWaypointNotStopped', speed: 1.5, holdSeconds: 0 })
    expect(result.errors).toEqual([])
  })

  test('(a) the suggested stop (0.3 m/s and a 3 s hold at the last waypoint) clears it', () => {
    const fixed = withStopAtLastWaypoint(plain())
    expect(kinds(fixed)).not.toContain('lastWaypointNotStopped')
    const last = fixed[fixed.length - 1]
    expect(last.commands[0]).toMatchObject({ command: MavCmd.MAV_CMD_DO_CHANGE_SPEED, param2: 0.3 })
    expect(last.commands[last.commands.length - 1]).toMatchObject({ command: MavCmd.MAV_CMD_NAV_WAYPOINT, param1: 3 })
    // The original mission is left as it was
    expect(kinds(plain())).toContain('lastWaypointNotStopped')
  })

  test('(a) slow but without holding is still a warning; holding but at 1.5 m/s too', () => {
    const slow = plain()
    slow[2].commands = [speed(0.3), nav(0, 1)]
    expect(kinds(slow)).toContain('lastWaypointNotStopped')
    const fast = plain()
    fast[2].commands = [nav(3, 1)]
    expect(kinds(fast)).toContain('lastWaypointNotStopped')
  })

  test('(b) a leg shorter than twice the acceptance radius of its end: warning with the waypoint', () => {
    const short = [
      wp(origin, [speed(0.3), nav(0, 1)]),
      wp(east(1.5), [nav(0, 1)]),
      wp(east(30), [speed(0.3), nav(3, 1)]),
    ]
    const warning = validateMission(short, params).warnings.find((w) => w.kind === 'legShorterThanAcceptance')
    expect(warning).toMatchObject({ kind: 'legShorterThanAcceptance', marker: 2, radius: 1 })
  })

  test('(b) the last waypoint is accepted by NAV_ACC_RAD, whatever its own radius', () => {
    const lastShort = [wp(origin, [speed(0.3), nav(0, 1)]), wp(east(3), [nav(3, 1)])]
    const warning = validateMission(lastShort, params).warnings.find((w) => w.kind === 'legShorterThanAcceptance')
    expect(warning).toMatchObject({ marker: 2, radius: 2 })
    expect(kinds([wp(origin, [speed(0.3), nav(0, 1)]), wp(east(5), [nav(3, 1)])])).not.toContain(
      'legShorterThanAcceptance'
    )
  })

  test('(c) a speed over RO_SPEED_LIM: warning; without the parameter nothing is assumed', () => {
    const fast = plain()
    fast[0].commands = [speed(2.5), nav(0, 1)]
    expect(validateMission(fast, params).warnings).toContainEqual({ kind: 'speedOverLimit', speed: 2.5, limit: 2 })
    expect(kinds(fast, undefined, { acceptanceRadius: 2 })).not.toContain('speedOverLimit')
  })

  test('(d) an acceptance radius over half the line spacing: warning', () => {
    expect(kinds(plain(), 1)).toContain('turnRadiusOverHalfSpacing')
    expect(kinds(plain(), 5)).not.toContain('turnRadiusOverHalfSpacing')
    expect(kinds(plain())).not.toContain('turnRadiusOverHalfSpacing')
  })

  test('obvious errors stop the upload: no waypoint, a speed of 0, no coordinates', () => {
    expect(validateMission([], params).errors).toEqual([{ kind: 'noWaypoints' }])
    const zero = plain()
    zero[0].commands = [speed(0), nav(0, 1)]
    expect(validateMission(zero, params).errors).toContainEqual({ kind: 'invalidSpeed', speed: 0 })
    const broken = plain()
    broken[1].coordinates = [Number.NaN, 37.6]
    expect(validateMission(broken, params).errors).toContainEqual({ kind: 'invalidCoordinates', marker: 2 })
  })

  test('a mission that stops at its end, with known parameters: nothing to report', () => {
    const fine = withStopAtLastWaypoint(plain())
    expect(validateMission(fine, params, 5)).toEqual({ warnings: [], errors: [] })
  })
})
